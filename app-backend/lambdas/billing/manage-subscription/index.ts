// app-backend/lambdas/billing/manage-subscription/index.ts
//
// /me/subscription
//   GET    → abonelik durumu + kısa ömürlü Polar müşteri portalı linki
//   PATCH  { interval: "monthly"|"yearly" } → periyot değişimi (aynı abonelik, proration)
//   PATCH  { action: "resume" }             → dönem sonu iptalini geri al
//   DELETE                                  → dönem sonunda iptal (erişim dönem sonuna kadar sürer)
//
// Yanıt şekli frontend'deki BillingSubscription ile aynı tutuldu.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  polarRequest,
  PolarError,
  getSubscription,
  listActiveSubscriptions,
  productIdForCycle,
  subscriptionProfileFields,
  subscriptionView,
  POLAR_MONTHLY_PRODUCT_ID,
  POLAR_YEARLY_PRODUCT_ID,
} from "../../../shared/polar";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;

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

async function getProfile(userId: string): Promise<any | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    ProjectionExpression: "subscriptionId",
  }));
  return result.Item ?? null;
}

/**
 * Polar'dan okunan anlık durumu profile yansıt (görüntüleme alanları).
 * plan/planSource'a DOKUNMAZ: erişim kararı yalnızca webhook'ta verilir.
 * Profil yoksa yazmaz (attribute_exists).
 */
async function syncSubscription(userId: string, sub: any): Promise<void> {
  const fields = subscriptionProfileFields(sub);
  const sets: string[] = ["updatedAt = :now"];
  const values: Record<string, unknown> = { ":now": new Date().toISOString() };
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = :${key}`);
    values[`:${key}`] = val;
  }
  try {
    await dynamo.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: values,
    }));
  } catch (err: any) {
    // Görüntüleme senkronu best-effort; asıl gerçek webhook ile gelir.
    console.warn(`manage-subscription: sync failed for user=${userId}:`, err?.name ?? err);
  }
}

/** Kısa ömürlü müşteri portalı linki (kart güncelleme, faturalar, iptal). */
async function createPortalUrl(userId: string): Promise<string | null> {
  try {
    const session = await polarRequest<any>("/v1/customer-sessions/", {
      method: "POST",
      body: JSON.stringify({ external_customer_id: userId }),
    });
    return session?.customer_portal_url ? String(session.customer_portal_url) : null;
  } catch (err: any) {
    console.warn(`manage-subscription: customer session failed for user=${userId}:`, err?.message ?? err);
    return null;
  }
}

/**
 * Kullanıcının yönetilecek aboneliği. Önce profildeki ID; yoksa (webhook henüz
 * gelmediyse) Polar'da external_customer_id ile aktif abonelik.
 */
async function resolveSubscription(userId: string): Promise<any | null> {
  const profile = await getProfile(userId);
  const subscriptionId = profile?.subscriptionId ? String(profile.subscriptionId) : "";
  if (subscriptionId) {
    const sub = await getSubscription(subscriptionId);
    if (sub) return sub;
  }
  const active = await listActiveSubscriptions(userId);
  return active[0] ?? null;
}

function polarErrorResponse(event: APIGatewayProxyEventV2WithJWTAuthorizer, err: unknown): APIGatewayProxyResultV2 | null {
  if (!(err instanceof PolarError)) return null;
  if (err.status === 402) {
    return response(event, 402, {
      message: "The payment for this change couldn't be completed. Please update your payment method in the billing portal and try again.",
      code: "payment_failed",
    });
  }
  if (err.status === 403 || err.type === "AlreadyCanceledSubscription" || err.type === "InactiveSubscription") {
    return response(event, 409, {
      message: "This subscription has ended and can't be changed. Please start a new subscription.",
      code: "expired",
    });
  }
  if (err.status === 409) {
    return response(event, 409, {
      message: "A change to this subscription is already pending. Please try again in a moment.",
      code: "locked",
    });
  }
  return null;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims["sub"] as string | undefined;
    if (!userId) return response(event, 401, { message: "Unauthorized" });

    const method = event.requestContext.http.method.toUpperCase();
    if (!["GET", "PATCH", "DELETE"].includes(method)) {
      return response(event, 405, { message: "Method not allowed" });
    }

    const sub = await resolveSubscription(userId);
    if (!sub) {
      return response(event, 404, { message: "No subscription found for this account" });
    }
    const subscriptionId = String(sub.id);

    if (method === "GET") {
      await syncSubscription(userId, sub);
      const portalUrl = await createPortalUrl(userId);
      return response(event, 200, {
        ...subscriptionView(sub),
        portalUrl,
        updatePaymentUrl: portalUrl,
      });
    }

    if (method === "PATCH") {
      const rawBody = event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64").toString("utf8")
        : (event.body ?? "");
      let parsed: any = {};
      try { parsed = rawBody ? JSON.parse(rawBody) : {}; }
      catch { return response(event, 400, { message: "Invalid request body" }); }

      const action = String(parsed?.action ?? "").toLowerCase();
      const status = String(sub.status ?? "").toLowerCase();

      // ── Resume: dönem sonu iptalini geri al ──
      if (action === "resume") {
        if (status === "canceled") {
          return response(event, 409, {
            message: "This subscription has expired and can't be resumed. Please start a new subscription.",
            code: "expired",
          });
        }
        if (!sub.cancel_at_period_end) {
          await syncSubscription(userId, sub);
          return response(event, 200, { message: "Subscription is active", ...subscriptionView(sub) });
        }
        try {
          const resumed = await polarRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
            method: "PATCH",
            body: JSON.stringify({ cancel_at_period_end: false }),
          });
          await syncSubscription(userId, resumed);
          return response(event, 200, { message: "Subscription resumed", ...subscriptionView(resumed) });
        } catch (err) {
          const mapped = polarErrorResponse(event, err);
          if (mapped) return mapped;
          throw err;
        }
      }

      // ── Aylık ↔ Yıllık geçiş: aynı abonelik, ürün değişimi ──
      if (!POLAR_MONTHLY_PRODUCT_ID || !POLAR_YEARLY_PRODUCT_ID) {
        return response(event, 500, { message: "Billing products are not configured" });
      }
      const interval = String(parsed?.interval ?? "").toLowerCase();
      if (interval !== "monthly" && interval !== "yearly") {
        return response(event, 400, { message: "interval must be 'monthly' or 'yearly'" });
      }

      if (status === "canceled" || sub.cancel_at_period_end) {
        return response(event, 409, {
          message: "Your subscription is set to cancel, so its plan can't be changed. Resume it first, then switch.",
          code: "not_switchable",
        });
      }

      const targetProduct = productIdForCycle(interval);
      if (String(sub.product_id ?? "") === targetProduct) {
        return response(event, 200, { message: "Already on this plan", ...subscriptionView(sub) });
      }

      try {
        // "invoice": fark hemen tahsil edilir, plan hemen değişir (legal §7 ile uyumlu).
        const updated = await polarRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          method: "PATCH",
          body: JSON.stringify({ product_id: targetProduct, proration_behavior: "invoice" }),
        });
        await syncSubscription(userId, updated);
        return response(event, 200, { message: "Billing cycle updated", ...subscriptionView(updated) });
      } catch (err) {
        const mapped = polarErrorResponse(event, err);
        if (mapped) return mapped;
        throw err;
      }
    }

    // DELETE → dönem sonunda iptal. Erişimi webhook (subscription.revoked) kapatır.
    try {
      const cancelled = await polarRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ cancel_at_period_end: true }),
      });
      await syncSubscription(userId, cancelled);
      const view = subscriptionView(cancelled);
      return response(event, 200, { message: "Subscription cancelled", status: view.status, endsAt: view.endsAt });
    } catch (err) {
      const mapped = polarErrorResponse(event, err);
      if (mapped) return mapped;
      throw err;
    }
  } catch (error: any) {
    console.error("manage-subscription error:", error);
    return response(event, 500, { message: "Something went wrong. Please try again." });
  }
};
