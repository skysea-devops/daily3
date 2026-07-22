import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY!;
const LS_STORE_ID = process.env.LS_STORE_ID!;
const LS_MONTHLY_VARIANT_ID = process.env.LS_MONTHLY_VARIANT_ID!;
const LS_YEARLY_VARIANT_ID = process.env.LS_YEARLY_VARIANT_ID!;
// Ödeme sonrası dönüş adresinin kökü (ör. https://cogletta.com). CORS listesinin
// ilk origin'inden türetilir; terraform env olarak geçer.
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

function lemonHeaders() {
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
  };
}

// Mükerrer abonelik guard'ı. Profildeki lsSubscriptionId'yi LS'ten CANLI doğrular
// (DynamoDB'deki durum bayat olabilir). Yalnızca "expired" veya artık-yok (404)
// aboneliğin üstüne yeni checkout açılmasına izin verilir; aksi halde kullanıcının
// zaten canlı bir aboneliği var demektir ve yeni bir checkout ikinci bir aktif
// abonelik (çift ücretlendirme) yaratır.
//
// Dönüş: "allow" | "block" | "unverifiable"
type GuardResult = "allow" | "block" | "unverifiable";

async function checkExistingSubscription(subscriptionId: string): Promise<GuardResult> {
  let res: Response;
  try {
    res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
      method: "GET",
      headers: lemonHeaders(),
    });
  } catch {
    return "unverifiable";
  }

  if (res.status === 404) return "allow"; // LS'te yok → yeni checkout güvenli
  if (!res.ok) return "unverifiable";

  const payload: any = await res.json().catch(() => null);
  const status = String(payload?.data?.attributes?.status ?? "").toLowerCase();
  // expired dışındaki her durum (active/on_trial/past_due/paused/unpaid/cancelled)
  // = hâlâ canlı/erişimli bir abonelik → yeni checkout engelle.
  return status === "expired" ? "allow" : "block";
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

    // Gövdeyi çöz (HTTP API v2 base64 encode edebilir)
    const rawBody = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, "base64").toString("utf8")
      : (event.body ?? "");
    let parsed: any = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return response(event, 400, { message: "Invalid request body" });
    }

    const interval = String(parsed?.interval ?? "").toLowerCase();
    if (interval !== "monthly" && interval !== "yearly") {
      return response(event, 400, { message: "interval must be 'monthly' or 'yearly'" });
    }

    if (!LEMONSQUEEZY_API_KEY || !LS_STORE_ID || !LS_MONTHLY_VARIANT_ID || !LS_YEARLY_VARIANT_ID) {
      console.error("create-checkout: Lemon Squeezy env not fully configured");
      return response(event, 500, { message: "Checkout is not configured" });
    }

    const variantId = interval === "yearly" ? LS_YEARLY_VARIANT_ID : LS_MONTHLY_VARIANT_ID;

    const profile = await getProfile(userId);
    const email = profile?.email ? String(profile.email) : "";
    const existingSubId = profile?.lsSubscriptionId ? String(profile.lsSubscriptionId) : "";

    // ── Mükerrer abonelik guard'ı ────────────────────────────────────────────
    if (existingSubId) {
      const guard = await checkExistingSubscription(existingSubId);
      if (guard === "block") {
        return response(event, 409, {
          message:
            "You already have an active Cogletta Pro subscription. You can manage or change it from Settings.",
          code: "already_subscribed",
        });
      }
      if (guard === "unverifiable") {
        // Emniyetli taraf: doğrulayamıyorsak çift abonelik riskini almayıp reddet.
        return response(event, 503, {
          message: "We couldn't verify your current subscription status. Please try again in a moment.",
          code: "verification_failed",
        });
      }
      // guard === "allow" → expired/yok, yeni checkout serbest
    }

    // ── LS Checkouts API ile TEK variant'lı, kullanıcıya bağlı checkout üret ──
    const redirectUrl = `${APP_BASE_URL}/checkout-complete?plan=${interval}&paid=1`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 dk

    const checkoutBody = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: email || undefined,
            custom: { user_id: userId },
          },
          product_options: {
            // Sadece seçilen periyodu göster (diğer variant checkout'ta gizli)
            enabled_variants: [Number(variantId)],
            redirect_url: redirectUrl,
          },
          checkout_options: {
            embed: false,
          },
          expires_at: expiresAt,
        },
        relationships: {
          store: { data: { type: "stores", id: String(LS_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    };

    let lsRes: Response;
    try {
      lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
        method: "POST",
        headers: lemonHeaders(),
        body: JSON.stringify(checkoutBody),
      });
    } catch (e: any) {
      console.error("create-checkout: LS network error", e);
      return response(event, 502, { message: "Could not reach the payment provider. Please try again." });
    }

    const lsPayload: any = await lsRes.json().catch(() => null);
    if (!lsRes.ok) {
      const detail =
        lsPayload?.errors?.[0]?.detail ?? lsPayload?.errors?.[0]?.title ?? `HTTP ${lsRes.status}`;
      console.error("create-checkout: LS checkout failed:", detail);
      return response(event, 502, { message: "Could not create checkout. Please try again." });
    }

    const url = lsPayload?.data?.attributes?.url;
    if (!url) {
      console.error("create-checkout: LS response missing url", JSON.stringify(lsPayload)?.slice(0, 500));
      return response(event, 502, { message: "Could not create checkout. Please try again." });
    }

    console.log(`create-checkout: user=${userId} interval=${interval} variant=${variantId} ok`);
    return response(event, 200, { url, interval });
  } catch (error: any) {
    console.error("create-checkout error:", error);
    return response(event, 500, { message: "Internal server error" });
  }
};
