import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import crypto from "crypto";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const WEBHOOK_SECRET   = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;

// HTTP API v2 başlıkları küçük harfe çevirir; yine de case-insensitive ara
function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

// LS abonelik statüsü → bizim plan alanı
function planForStatus(status: string): "free" | "pro" {
  switch (status) {
    case "active":
    case "on_trial":
    case "past_due":   // ödeme gecikti ama erişim korunur (grace)
    case "cancelled":  // iptal edildi ama dönem sonuna kadar erişim var; expired gelince düşer
      return "pro";
    case "paused":
    case "unpaid":
    case "expired":
    default:
      return "free";
  }
}

const NON_ACTIVE_STATUSES = ["paused", "unpaid", "expired", "cancelled", "past_due"];

// updated_at karşılaştırması: candidate, baseline'dan KESİN daha yeni mi?
// (eşit → yeni değil → tekrar/idempotency: işleme). LS timestamp'leri tek formatta
// UTC geldiği için önce Date.parse, olmazsa leksikografik string karşılaştırması.
function isStrictlyNewer(candidate: string, baseline: string): boolean {
  const c = Date.parse(candidate);
  const b = Date.parse(baseline);
  if (!isNaN(c) && !isNaN(b)) return c > b;
  return candidate > baseline;
}

// "plan" DynamoDB reserved word → ExpressionAttributeNames şart
async function setPlan(
  userId: string,
  plan: "free" | "pro",
  extra: Record<string, string> = {}
): Promise<void> {
  const names: Record<string, string> = { "#plan": "plan" };
  const values: Record<string, unknown> = { ":plan": plan, ":now": new Date().toISOString() };
  const sets = ["#plan = :plan", "updatedAt = :now"];

  for (const [key, val] of Object.entries(extra)) {
    sets.push(`${key} = :${key}`);
    values[`:${key}`] = val;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

// subscription_created'da subscriptionId → userId eşlemesini sakla; sonraki
// event'lerde custom_data gelmezse buradan userId'yi buluruz.
async function saveSubMap(subscriptionId: string, userId: string): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: { PK: `LSSUB#${subscriptionId}`, SK: "MAP", userId, updatedAt: new Date().toISOString() },
    })
  );
}

async function userIdForSub(subscriptionId: string): Promise<string | undefined> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `LSSUB#${subscriptionId}`, SK: "MAP" },
    })
  );
  return res.Item?.userId as string | undefined;
}

// Profilden mevcut abonelik ID'si ve en son işlenen event'in updated_at'ı
async function readSubState(userId: string): Promise<{ currentSubId?: string; lastEventAt?: string }> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      ProjectionExpression: "lsSubscriptionId, lsLastEventAt",
    })
  );
  return {
    currentSubId: res.Item?.lsSubscriptionId ? String(res.Item.lsSubscriptionId) : undefined,
    lastEventAt: res.Item?.lsLastEventAt ? String(res.Item.lsLastEventAt) : undefined,
  };
}

const ok  = (msg = "ok"): APIGatewayProxyResultV2 => ({ statusCode: 200, body: msg });
const bad = (code: number, msg: string): APIGatewayProxyResultV2 => ({ statusCode: code, body: msg });

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // 1) Ham gövde (imza doğrulaması için yeniden serialize ETME)
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, "base64").toString("utf8")
    : (event.body ?? "");

  // 2) İmza doğrula: HMAC-SHA256 hex(signing_secret, rawBody) == X-Signature
  const signature = getHeader(event, "x-signature");
  if (!signature || !WEBHOOK_SECRET) {
    console.warn("LS webhook: missing signature or secret");
    return bad(401, "no signature");
  }
  const digest = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature, "utf8");
  const digBuf = Buffer.from(digest, "utf8");
  if (sigBuf.length !== digBuf.length || !crypto.timingSafeEqual(sigBuf, digBuf)) {
    console.warn("LS webhook: signature mismatch");
    return bad(401, "invalid signature");
  }

  // 3) Parse
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return bad(400, "invalid json");
  }

  const eventName: string = getHeader(event, "x-event-name") ?? payload?.meta?.event_name ?? "";
  const dataType: string  = payload?.data?.type ?? "";
  console.log(`LS webhook: event=${eventName} type=${dataType}`);

  // Sadece abonelik event'leriyle ilgileniyoruz
  if (!eventName.startsWith("subscription_") || dataType !== "subscriptions") {
    return ok("ignored");
  }

  const attrs = payload?.data?.attributes ?? {};
  const subscriptionId: string = String(payload?.data?.id ?? "");
  const status: string = attrs?.status ?? "";
  const plan = planForStatus(status);
  // Event'in "yaşı": aboneliğin updated_at'i. Sıralama + idempotency bunun üstünden.
  const eventUpdatedAt: string = String(attrs?.updated_at ?? new Date().toISOString());

  // 4) userId'yi bul: önce checkout custom_data.user_id, yoksa eşleme tablosundan
  const rawUserId =
    payload?.meta?.custom_data?.user_id ??
    payload?.meta?.custom_data?.userId;

  let userId = rawUserId == null ? undefined : String(rawUserId).trim();
  if (!userId && subscriptionId) {
    userId = await userIdForSub(subscriptionId);
  }
  if (!userId) {
    // Bu event'i 200 ile yutmak ödeme alınmış kullanıcıyı kalıcı olarak Free'de
    // bırakır. 500 dönerek Lemon Squeezy'nin webhook retry mekanizmasını çalıştır.
    console.error(
      `LS webhook: userId çözülemedi; retry gerekli (sub=${subscriptionId}, event=${eventName}, customData=${JSON.stringify(payload?.meta?.custom_data ?? null)})`
    );
    return bad(500, "user mapping unavailable");
  }

  // 5) Sıralama + idempotency guard'ı
  //
  // İki senaryo:
  //  (a) Event MEVCUT aboneliğe ait → yalnızca event daha YENİYSE uygula.
  //      Aynı event tekrar gelirse (redelivery) updated_at eşittir → atlanır
  //      (idempotency). Gecikmiş/eski bir event daha küçük updated_at taşır → atlanır
  //      (out-of-order koruması). Böylece ayrı bir event tablosuna gerek kalmıyor.
  //  (b) Event FARKLI bir aboneliğe ait →
  //        - non-active (cancelled/expired/paused/unpaid/past_due): eski abonelik
  //          kapanıyor demektir, mevcut aboneliği EZMESİN → yoksay.
  //        - active/on_trial: yeni/geçerli bir abonelik devralıyor → uygula,
  //          profil bu yeni subscription'a geçer (lsLastEventAt sıfırlanır).
  //  currentSubId yoksa (ilk abonelik) → uygula.
  const { currentSubId, lastEventAt } = await readSubState(userId);

  if (currentSubId && currentSubId === subscriptionId) {
    if (lastEventAt && !isStrictlyNewer(eventUpdatedAt, lastEventAt)) {
      console.log(`LS webhook: stale/duplicate event ignored (sub=${subscriptionId}, eventAt=${eventUpdatedAt}, lastAt=${lastEventAt})`);
      return ok("stale or duplicate event ignored");
    }
  } else if (currentSubId && currentSubId !== subscriptionId) {
    if (NON_ACTIVE_STATUSES.includes(status)) {
      console.log(`LS webhook: stale event for other subscription ignored (current=${currentSubId}, eventSub=${subscriptionId}, status=${status})`);
      return ok("stale subscription ignored");
    }
    // active/on_trial → yeni abonelik devralıyor, uygula
  }

  // 6) Profildeki ekstra alanlar
  const extra: Record<string, string> = {
    lsSubscriptionId: subscriptionId,
    lsLastEventAt: eventUpdatedAt,
  };
  if (attrs?.customer_id != null)         extra.lsCustomerId = String(attrs.customer_id);
  if (attrs?.variant_id != null)          extra.lsVariantId  = String(attrs.variant_id);
  if (attrs?.urls?.customer_portal)       extra.lsPortalUrl          = String(attrs.urls.customer_portal);
  if (attrs?.urls?.update_payment_method) extra.lsUpdatePaymentUrl    = String(attrs.urls.update_payment_method);
  if (attrs?.status)                      extra.lsSubscriptionStatus  = String(attrs.status);
  if (attrs?.renews_at)                   extra.lsRenewsAt            = String(attrs.renews_at);
  if (attrs?.ends_at)                     extra.lsEndsAt              = String(attrs.ends_at);
  extra.lsCancelled = attrs?.cancelled ? "true" : "false";

  // Eşlemeyi profil güncellemesinden önce yaz. Böylece aynı aboneliğe ait hemen
  // arkasından gelen subscription_updated event'i custom_data içermese bile çözülür.
  if (subscriptionId) {
    await saveSubMap(subscriptionId, userId);
  }

  await setPlan(userId, plan, extra);

  console.log(`LS webhook: user=${userId} sub=${subscriptionId} status=${status} → plan=${plan} (eventAt=${eventUpdatedAt})`);
  return ok();
};
