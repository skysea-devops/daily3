// app-backend/lambdas/billing/polar-webhook/index.ts
//
// Polar abonelik webhook'u. URL API Gateway'e gider (ASLA Next.js frontend'e değil:
// frontend HTML + 200 döndüğü için Polar teslim edildi sanır).
//
// Polar davranışı (önemli):
//  - 2xx dışı yanıt ya da 10 sn'den uzun süre → retry (üstel bekleme, en fazla 10 kez).
//  - 10 ARDIŞIK başarısız teslimatta endpoint OTOMATİK KAPATILIR.
//    Bu yüzden 500 yalnızca kullanıcı eşlemesi çözülemediğinde dönülür; geri kalan
//    her şey (yoksayılan, eski, silinmiş kullanıcı) 200.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { verifyStandardWebhook } from "../../../shared/webhook-signature";
import { hasAccessForStatus, subscriptionProfileFields, SUBMAP_PREFIX } from "../../../shared/polar";
import { getPolarWebhookSecret } from "../../../shared/polar-secrets";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;

type ExtraValue = string | boolean;

// modified_at karşılaştırması: candidate, baseline'dan KESİN daha yeni mi?
function isStrictlyNewer(candidate: string, baseline: string): boolean {
  const c = Date.parse(candidate);
  const b = Date.parse(baseline);
  if (!isNaN(c) && !isNaN(b)) return c > b;
  return candidate > baseline;
}

function isOlder(candidate: string, baseline: string): boolean {
  const c = Date.parse(candidate);
  const b = Date.parse(baseline);
  if (!isNaN(c) && !isNaN(b)) return c < b;
  return candidate < baseline;
}

// "plan" DynamoDB reserved word → ExpressionAttributeNames şart
async function setPlan(
  userId: string,
  plan: "free" | "pro",
  extra: Record<string, ExtraValue> = {}
): Promise<void> {
  const names: Record<string, string> = { "#plan": "plan" };
  const values: Record<string, unknown> = { ":plan": plan, ":now": new Date().toISOString() };
  const sets = ["#plan = :plan", "updatedAt = :now"];

  for (const [key, val] of Object.entries(extra)) {
    sets.push(`${key} = :${key}`);
    values[`:${key}`] = val;
  }

  // Free'ye düşüşte konu seçimleri TEMİZLENİR: Free planda konu seçimi yok, kayıtta
  // kalan seçimler Interests sayfasında "seçili ama işlevsiz" görünüyordu.
  //
  // Ödeme yapan kullanıcı artık "trial" değil: CANLI deneme alanları temizlenir,
  // böylece daily-trigger onu 14. günde düşürmeye çalışmaz.
  // `trialStartedAt` ve `trialConsumedAt` KALICI (deneme GEÇMİŞİ, canlı durum değil).
  // trialEndedEmailPending de temizlenir: ödeme yapmış kullanıcıya "deneme bitti"
  // e-postası gitmesin.
  const removals = plan === "free"
    ? ["interests", "subTopics", "planSource", "trialEndsAt"]
    : ["trialEndsAt", "trialEndedEmailPending"];

  if (plan === "pro") {
    sets.push("planSource = :paid");
    values[":paid"] = "paid";
    // Ödemeye geçen kullanıcı deneme hakkını tüketmiş sayılır.
    sets.push("trialConsumedAt = if_not_exists(trialConsumedAt, :now)");
  }

  const updateExpression = `SET ${sets.join(", ")} REMOVE ${removals.join(", ")}`;

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression: updateExpression,
        // PROFİL YOKSA OLUŞTURMA: silinmiş hesaba gelen gecikmeli webhook hayalet
        // kullanıcı diriltmesin. Tombstone kontrolünün arkasındaki son savunma hattı.
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      console.warn(`Polar webhook: profile USER#${userId} does not exist; ignoring (deleted account?)`);
      return;
    }
    throw err;
  }
}

// subscriptionId → userId eşlemesi. external_id her event'te gelse de, eşleme
// tombstone'u (silinmiş hesap) için ve yedek çözüm yolu olarak tutuluyor.
async function saveSubMap(subscriptionId: string, userId: string): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: { PK: `${SUBMAP_PREFIX}${subscriptionId}`, SK: "MAP", userId, updatedAt: new Date().toISOString() },
      // Tombstone'u ezme: silinmiş hesabın eşlemesi "deleted" olarak kalmalı.
      ConditionExpression: "attribute_not_exists(deleted)",
    })
  ).catch((err: any) => {
    if (err?.name === "ConditionalCheckFailedException") return;
    throw err;
  });
}

async function getSubMapping(subscriptionId: string): Promise<{ userId?: string; deleted: boolean } | null> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `${SUBMAP_PREFIX}${subscriptionId}`, SK: "MAP" },
    })
  );
  if (!res.Item) return null;
  return {
    userId: res.Item.userId ? String(res.Item.userId) : undefined,
    deleted: res.Item.deleted === true,
  };
}

interface SubState {
  exists: boolean;
  currentSubId?: string;
  lastEventAt?: string;
  createdAt?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}

async function readSubState(userId: string): Promise<SubState> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      ProjectionExpression:
        "PK, subscriptionId, subscriptionLastEventAt, subscriptionCreatedAt, subscriptionStatus, cancelAtPeriodEnd",
    })
  );
  const item = res.Item;
  return {
    exists: Boolean(item),
    currentSubId: item?.subscriptionId ? String(item.subscriptionId) : undefined,
    lastEventAt: item?.subscriptionLastEventAt ? String(item.subscriptionLastEventAt) : undefined,
    createdAt: item?.subscriptionCreatedAt ? String(item.subscriptionCreatedAt) : undefined,
    status: item?.subscriptionStatus ? String(item.subscriptionStatus) : undefined,
    cancelAtPeriodEnd: item?.cancelAtPeriodEnd === true,
  };
}

const ok  = (msg = "ok"): APIGatewayProxyResultV2 => ({ statusCode: 200, body: msg });
const bad = (code: number, msg: string): APIGatewayProxyResultV2 => ({ statusCode: code, body: msg });

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // 1) Ham gövde. İmza bu string üzerinden doğrulanır; parse edip yeniden serialize ETME.
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, "base64").toString("utf8")
    : (event.body ?? "");

  // 2) İmza (Standard Webhooks: webhook-id / webhook-timestamp / webhook-signature)
  let secret = "";
  try {
    secret = await getPolarWebhookSecret();
  } catch (err) {
    // SSM okunamadı: retry iste (geçici olabilir).
    console.error("Polar webhook: could not load webhook secret", err);
    return bad(500, "secret unavailable");
  }
  const verified = verifyStandardWebhook(rawBody, event.headers ?? {}, secret);
  if (!verified.ok) {
    if (verified.reason === "signature mismatch" || verified.reason === "secret not configured") {
      // Başlıklar tam ama imza tutmuyor → büyük olasılıkla SSM'deki secret yanlış.
      // Polar 10 ardışık hatada endpoint'i kapatır: bu log alarm üretir.
      console.error(`Polar webhook: SIGNATURE_MISMATCH (${verified.reason})`);
    } else {
      // Eksik başlık / zaman aşımı: rastgele istek ya da replay → alarm değil.
      console.warn(`Polar webhook: signature rejected (${verified.reason})`);
    }
    return bad(401, "invalid signature");
  }

  // 3) Parse
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return bad(400, "invalid json");
  }

  const eventType: string = String(payload?.type ?? "");
  console.log(`Polar webhook: type=${eventType} id=${verified.id}`);

  // Yalnızca abonelik event'leri. Diğerleri (order.*, checkout.*, customer.*) 200/ignore.
  if (!eventType.startsWith("subscription.")) return ok("ignored");

  const sub = payload?.data ?? {};
  const subscriptionId: string = String(sub?.id ?? "");
  if (!subscriptionId) return ok("no subscription id, ignored");

  const status: string = String(sub?.status ?? "");
  const hasAccess = hasAccessForStatus(status);
  const plan: "free" | "pro" = hasAccess ? "pro" : "free";
  const eventModifiedAt: string = String(sub?.modified_at ?? sub?.created_at ?? payload?.timestamp ?? new Date().toISOString());
  const eventCreatedAt: string = sub?.created_at ? String(sub.created_at) : "";
  const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end);

  // 4) Tombstone: hesap silinmişse 200/ignore (retry fırtınası ve diriltme olmasın)
  const mapping = await getSubMapping(subscriptionId);
  if (mapping?.deleted) {
    console.log(`Polar webhook: subscription ${subscriptionId} belongs to a deleted account, ignoring (type=${eventType})`);
    return ok("deleted user, ignored");
  }

  // 5) userId: customer.external_id (= Cognito sub) → metadata.user_id → eşleme kaydı
  const candidates = [sub?.customer?.external_id, sub?.metadata?.user_id, mapping?.userId];
  const userId = candidates.map((v) => (v == null ? "" : String(v).trim())).find(Boolean);
  if (!userId) {
    // 200 ile yutmak ödeme yapmış kullanıcıyı kalıcı olarak Free'de bırakır → retry iste.
    // DİKKAT: 10 ardışık hata endpoint'i kapatır; CloudWatch alarmı bunun için var.
    console.error(`Polar webhook: USER_MAPPING_FAILED sub=${subscriptionId} type=${eventType}`);
    return bad(500, "user mapping unavailable");
  }

  // 6) Sıralama + idempotency
  const state = await readSubState(userId);
  if (!state.exists) {
    console.warn(`Polar webhook: profile USER#${userId} does not exist; ignoring (type=${eventType})`);
    return ok("no profile, ignored");
  }

  if (state.currentSubId && state.currentSubId === subscriptionId) {
    if (state.lastEventAt) {
      if (isOlder(eventModifiedAt, state.lastEventAt)) {
        console.log(`Polar webhook: stale event ignored (sub=${subscriptionId}, eventAt=${eventModifiedAt}, lastAt=${state.lastEventAt})`);
        return ok("stale event ignored");
      }
      // Aynı zaman damgası: aynı anlık görüntüyse tekrar (redelivery) → atla.
      // Farklıysa (aynı işlemde üretilmiş ardışık event'ler) uygula.
      if (
        !isStrictlyNewer(eventModifiedAt, state.lastEventAt) &&
        state.status === status &&
        state.cancelAtPeriodEnd === cancelAtPeriodEnd
      ) {
        console.log(`Polar webhook: duplicate event ignored (sub=${subscriptionId}, eventAt=${eventModifiedAt})`);
        return ok("duplicate event ignored");
      }
    }
  } else {
    // Farklı (ya da ilk) abonelik
    if (!hasAccess) {
      // Erişim vermeyen bir aboneliğin event'i, mevcut durumu (deneme dahil) EZMESİN:
      // ör. yarım kalmış checkout'tan "incomplete", ya da eski aboneliğin "canceled"ı.
      console.log(`Polar webhook: non-access event for non-current subscription ignored (current=${state.currentSubId ?? "none"}, eventSub=${subscriptionId}, status=${status})`);
      return ok("non-current subscription ignored");
    }
    if (state.currentSubId && state.createdAt && eventCreatedAt && !isStrictlyNewer(eventCreatedAt, state.createdAt)) {
      // Eski bir aboneliğin gecikmiş "active" event'i yeni aboneliği ezmesin.
      console.log(`Polar webhook: delayed event from older subscription ignored (current=${state.currentSubId}@${state.createdAt}, eventSub=${subscriptionId}@${eventCreatedAt})`);
      return ok("older subscription ignored");
    }
  }

  // 7) Yaz: önce eşleme, sonra profil
  const extra: Record<string, ExtraValue> = {
    subscriptionId,
    subscriptionLastEventAt: eventModifiedAt,
    ...subscriptionProfileFields(sub),
  };
  if (eventCreatedAt) extra.subscriptionCreatedAt = eventCreatedAt;

  await saveSubMap(subscriptionId, userId);
  await setPlan(userId, plan, extra);

  console.log(`Polar webhook: user=${userId} sub=${subscriptionId} status=${status} cancelAtPeriodEnd=${cancelAtPeriodEnd} → plan=${plan} (eventAt=${eventModifiedAt})`);
  return ok();
};
