import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY!;

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
  });

  const payload = await result.json().catch(() => null);
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

function billingCycleForSubscription(attrs: any): "monthly" | "yearly" | "unknown" {
  const productName = String(attrs?.product_name ?? "").toLowerCase();
  const variantName = String(attrs?.variant_name ?? "").toLowerCase();
  const label = `${productName} ${variantName}`;

  if (/year|annual/.test(label)) return "yearly";
  if (/month/.test(label) || productName === "cogletta proreader") return "monthly";
  return "unknown";
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
        billingCycle: billingCycleForSubscription(attrs),
        portalUrl: attrs.urls?.customer_portal ?? null,
        updatePaymentUrl: attrs.urls?.update_payment_method ?? null,
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
