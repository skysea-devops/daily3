import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY!;
const LS_MONTHLY_VARIANT_ID = process.env.LS_MONTHLY_VARIANT_ID ?? "";
const LS_YEARLY_VARIANT_ID = process.env.LS_YEARLY_VARIANT_ID ?? "";
const LS_TIMEOUT_MS = 8000; // LS asILIrsa Lambda kilitlenmesin (#15)

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function resolveCorsOrigin(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const requestOrigin = event.headers?.origin ?? event.headers?.Origin ?? "";
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0] ?? "*";
}

function headers(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": resolveCorsOrigin(event),
    "Vary": "Origin",
  };
}

function response(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResultV2 {
  return { statusCode, headers: headers(event), body: JSON.stringify(body) };
}

async function lemonRequest(path: string, init: RequestInit = {}): Promise<any> {
  if (!LEMONSQUEEZY_API_KEY) throw new Error("Lemon Squeezy API key is not configured");

  const result = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(LS_TIMEOUT_MS),
  });

  const payload: any = await result.json().catch(() => null);
  if (!result.ok) {
    const detail = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.title ?? `HTTP ${result.status}`;
    throw new Error(`Lemon Squeezy request failed: ${detail}`);
  }
  return payload;
}

async function getProfile(userId: string): Promise<any | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: "PROFILE" },
  }));
  return result.Item ?? null;
}

async function syncSubscription(userId: string, subscription: any): Promise<void> {
  const attrs = subscription?.data?.attributes ?? {};
  await dynamo.send(new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    UpdateExpression: [
      "SET lsSubscriptionStatus = :status",
      "lsVariantId = :variantId",
      "lsRenewsAt = :renewsAt",
      "lsEndsAt = :endsAt",
      "lsCancelled = :cancelled",
      "lsPortalUrl = :portalUrl",
      "lsUpdatePaymentUrl = :paymentUrl",
      "updatedAt = :now",
    ].join(", "),
    ExpressionAttributeValues: {
      ":status": String(attrs.status ?? ""),
      ":variantId": String(attrs.variant_id ?? ""),
      ":renewsAt": attrs.renews_at ? String(attrs.renews_at) : "",
      ":endsAt": attrs.ends_at ? String(attrs.ends_at) : "",
      ":cancelled": Boolean(attrs.cancelled),
      ":portalUrl": attrs.urls?.customer_portal ? String(attrs.urls.customer_portal) : "",
      ":paymentUrl": attrs.urls?.update_payment_method ? String(attrs.urls.update_payment_method) : "",
      ":now": new Date().toISOString(),
    },
  }));
}

// Billing cycle artık ÜRÜN/VARIANT ADINA göre TAHMİN edilmiyor. Explicit variant ID
// eşlemesiyle belirleniyor (env: LS_MONTHLY_VARIANT_ID / LS_YEARLY_VARIANT_ID).
// Bilinmeyen ID → "unknown"; UI yanlış buton göstermektense hiç göstermez.
function billingCycleForVariant(variantId: string): "monthly" | "yearly" | "unknown" {
  if (variantId && variantId === LS_YEARLY_VARIANT_ID) return "yearly";
  if (variantId && variantId === LS_MONTHLY_VARIANT_ID) return "monthly";
  return "unknown";
}

function variantIdForInterval(interval: "monthly" | "yearly"): string {
  return interval === "yearly" ? LS_YEARLY_VARIANT_ID : LS_MONTHLY_VARIANT_ID;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims["sub"] as string | undefined;
    if (!userId) return response(event, 401, { message: "Unauthorized" });

    const profile = await getProfile(userId);
    const subscriptionId = profile?.lsSubscriptionId ? String(profile.lsSubscriptionId) : "";
    if (!subscriptionId) {
      return response(event, 404, { message: "No subscription found for this account" });
    }

    const method = event.requestContext.http.method.toUpperCase();

    if (method === "GET") {
      const subscription = await lemonRequest(`/subscriptions/${subscriptionId}`);
      await syncSubscription(userId, subscription);
      const attrs = subscription.data.attributes;
      return response(event, 200, {
        status: attrs.status,
        cancelled: Boolean(attrs.cancelled),
        renewsAt: attrs.renews_at ?? null,
        endsAt: attrs.ends_at ?? null,
        productId: String(attrs.product_id ?? ""),
        variantId: String(attrs.variant_id ?? ""),
        billingCycle: billingCycleForVariant(String(attrs.variant_id ?? "")),
        portalUrl: attrs.urls?.customer_portal ?? null,
        updatePaymentUrl: attrs.urls?.update_payment_method ?? null,
      });
    }

    // ── Aylık↔Yıllık geçiş: variant-swap (aynı abonelik ID, proration LS'te otomatik) ──
    // ── VE Resume (uncancel): iptal edilmiş ama henüz expired olmamış aboneliği geri al ──
    if (method === "PATCH") {
      const rawBody = event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64").toString("utf8")
        : (event.body ?? "");
      let parsed: any = {};
      try { parsed = rawBody ? JSON.parse(rawBody) : {}; }
      catch { return response(event, 400, { message: "Invalid request body" }); }

      const action = String(parsed?.action ?? "").toLowerCase();

      // Resume: cancelled → active. LS'te ends_at'a ulaşıp expired olduysa artık
      // resume edilemez (kullanıcı yeniden abone olmalı).
      if (action === "resume") {
        const current = await lemonRequest(`/subscriptions/${subscriptionId}`);
        const curAttrs = current.data.attributes;
        const curStatus = String(curAttrs.status ?? "").toLowerCase();
        if (curStatus === "expired") {
          return response(event, 409, {
            message: "This subscription has expired and can't be resumed. Please start a new subscription.",
            code: "expired",
          });
        }
        if (!curAttrs.cancelled) {
          await syncSubscription(userId, current);
          return response(event, 200, {
            message: "Subscription is active",
            status: curAttrs.status,
            cancelled: false,
            renewsAt: curAttrs.renews_at ?? null,
            endsAt: curAttrs.ends_at ?? null,
          });
        }
        const resumed = await lemonRequest(`/subscriptions/${subscriptionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            data: { type: "subscriptions", id: subscriptionId, attributes: { cancelled: false } },
          }),
        });
        await syncSubscription(userId, resumed);
        const rAttrs = resumed.data.attributes;
        return response(event, 200, {
          message: "Subscription resumed",
          status: rAttrs.status,
          cancelled: Boolean(rAttrs.cancelled),
          renewsAt: rAttrs.renews_at ?? null,
          endsAt: rAttrs.ends_at ?? null,
        });
      }

      // Switch (variant-swap)
      if (!LS_MONTHLY_VARIANT_ID || !LS_YEARLY_VARIANT_ID) {
        return response(event, 500, { message: "Billing variants are not configured" });
      }

      const interval = String(parsed?.interval ?? "").toLowerCase();
      if (interval !== "monthly" && interval !== "yearly") {
        return response(event, 400, { message: "interval must be 'monthly' or 'yearly'" });
      }
      const targetVariant = variantIdForInterval(interval);

      // Mevcut aboneliği doğrula
      const current = await lemonRequest(`/subscriptions/${subscriptionId}`);
      const curAttrs = current.data.attributes;
      const curVariant = String(curAttrs.variant_id ?? "");
      const curStatus = String(curAttrs.status ?? "").toLowerCase();

      // İptal/expired aboneliğin planı değiştirilemez → önce yeniden aboneliğe yönlendir
      if (["expired", "cancelled"].includes(curStatus) || Boolean(curAttrs.cancelled)) {
        return response(event, 409, {
          message: "Your subscription is set to cancel, so its plan can't be changed. Resume it first, then switch.",
          code: "not_switchable",
        });
      }

      // Zaten hedef plandaysa no-op
      if (curVariant === targetVariant) {
        return response(event, 200, {
          message: "Already on this plan",
          status: curAttrs.status,
          billingCycle: interval,
          renewsAt: curAttrs.renews_at ?? null,
          endsAt: curAttrs.ends_at ?? null,
        });
      }

      // Variant-swap: proration LS varsayılanı olarak uygulanır.
      const updated = await lemonRequest(`/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "subscriptions",
            id: subscriptionId,
            attributes: { variant_id: Number(targetVariant) },
          },
        }),
      });
      await syncSubscription(userId, updated);
      const upAttrs = updated.data.attributes;
      return response(event, 200, {
        message: "Billing cycle updated",
        status: upAttrs.status,
        billingCycle: billingCycleForVariant(String(upAttrs.variant_id ?? "")),
        renewsAt: upAttrs.renews_at ?? null,
        endsAt: upAttrs.ends_at ?? null,
      });
    }

    if (method === "DELETE") {
      const subscription = await lemonRequest(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
      await syncSubscription(userId, subscription);
      const attrs = subscription.data.attributes;
      return response(event, 200, {
        message: "Subscription cancelled",
        status: attrs.status,
        endsAt: attrs.ends_at ?? null,
      });
    }

    return response(event, 405, { message: "Method not allowed" });
  } catch (error: any) {
    console.error("manage-subscription error:", error);
    return response(event, 500, { message: error?.message || "Internal server error" });
  }
};
