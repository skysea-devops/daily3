// app-backend/lambdas/billing/create-checkout/index.ts
//
// POST /me/checkout { interval?: "yearly" } → { url, interval }
//
// Tek plan: Cogletta Pro yıllık. `interval` gönderilmezse yıllık kabul edilir;
// "monthly" artık yok → 400 (eski bir sekmeden gelen istek sessizce yıllığa çevrilmesin).
//
// Polar Checkout Session üretir:
//  - external_customer_id = Cognito sub (webhook'ta kullanıcı eşlemesinin ana yolu)
//  - metadata.user_id     = Cognito sub (aboneliğe kopyalanır, yedek eşleme yolu)
//  - allow_trial = false  → 14 günlük deneme TAMAMEN bizde; Polar'da trial yok
//  - Mükerrer abonelik guard'ı: Polar'da bu kullanıcıya ait aktif abonelik varsa 409
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { polarRequest, listActiveSubscriptions, POLAR_PRODUCT_ID } from "../../../shared/polar";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function resolveCorsOrigin(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const reqOrigin = event.headers?.origin ?? event.headers?.Origin ?? "";
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
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

async function getProfile(userId: string): Promise<Record<string, any> | null> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    })
  );
  return res.Item ?? null;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims["sub"] as string | undefined;
    if (!userId) return response(event, 401, { message: "Unauthorized" });

    if (event.requestContext.http.method.toUpperCase() !== "POST") {
      return response(event, 405, { message: "Method not allowed" });
    }

    const rawBody = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, "base64").toString("utf8")
      : (event.body ?? "");
    let parsed: any = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return response(event, 400, { message: "Invalid request body" });
    }

    const interval = String(parsed?.interval ?? "yearly").toLowerCase();
    if (interval !== "yearly") {
      return response(event, 400, {
        message: "Cogletta Pro is available as a yearly plan only.",
        code: "yearly_only",
      });
    }

    if (!POLAR_PRODUCT_ID || !APP_BASE_URL) {
      console.error("create-checkout: Polar env not fully configured");
      return response(event, 500, { message: "Checkout is not configured" });
    }

    const productId = POLAR_PRODUCT_ID;
    const profile = await getProfile(userId);
    const email = profile?.email ? String(profile.email) : "";

    // ── Mükerrer abonelik guard'ı ──
    // Profildeki alana değil Polar'ın kendisine soruyoruz: webhook gecikse bile
    // (ödeme yeni yapıldı, profil henüz güncellenmedi) ikinci abonelik açılmaz.
    let active: any[];
    try {
      active = await listActiveSubscriptions(userId);
    } catch (err) {
      console.error("create-checkout: active subscription check failed", err);
      return response(event, 503, {
        message: "We couldn't verify your current subscription status. Please try again in a moment.",
        code: "verification_failed",
      });
    }
    if (active.length > 0) {
      return response(event, 409, {
        message:
          "You already have an active Cogletta Pro subscription. You can manage or change it from Settings.",
        code: "already_subscribed",
      });
    }

    // ── Checkout Session ──
    const successUrl = `${APP_BASE_URL}/checkout-complete?plan=${interval}&paid=1&checkout_id={CHECKOUT_ID}`;
    const returnUrl = `${APP_BASE_URL}/settings?checkout=cancel`;

    let checkout: any;
    try {
      checkout = await polarRequest("/v1/checkouts/", {
        method: "POST",
        body: JSON.stringify({
          products: [productId],
          external_customer_id: userId,
          customer_email: email || undefined,
          metadata: { user_id: userId, interval },
          success_url: successUrl,
          return_url: returnUrl,
          allow_trial: false,
        }),
      });
    } catch (err: any) {
      console.error("create-checkout: Polar checkout failed:", err?.message ?? err);
      return response(event, 502, { message: "Could not create checkout. Please try again." });
    }

    const url = checkout?.url;
    if (!url) {
      console.error("create-checkout: Polar response missing url", JSON.stringify(checkout)?.slice(0, 500));
      return response(event, 502, { message: "Could not create checkout. Please try again." });
    }

    console.log(`create-checkout: user=${userId} interval=${interval} product=${productId} checkout=${checkout?.id} ok`);
    return response(event, 200, { url, interval });
  } catch (error: any) {
    console.error("create-checkout error:", error);
    return response(event, 500, { message: "Internal server error" });
  }
};
