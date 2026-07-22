import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const ARTICLES_TABLE_NAME = process.env.ARTICLES_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY ?? "";
const LS_TIMEOUT_MS = 8000; // LS asILIrsa Lambda kilitlenmesin (#15)

// CORS_ORIGIN virgülle ayrılmış birden çok origin içerebilir
// (ör. "https://cogletta.com,https://www.cogletta.com").
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

function buildHeaders(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": resolveCorsOrigin(event),
    "Vary": "Origin",
  };
}

// ─── Lemon Squeezy abonelik iptali ────────────────────────────────────────────
// LS "DELETE subscription" = dönem sonunda yenilemeyi durdur (cancel-at-period-end),
// anında sonlandırma/iade DEĞİL. Hesap silme için doğru davranış budur: kullanıcı
// bir daha ücretlendirilmez, ödediği dönem sonuna kadar teknik olarak "cancelled"
// kalır ama Cogletta hesabı zaten silinmiş olur.
//
// Dönüş:
//   "cancelled" → LS aboneliği iptal edildi (veya zaten iptalliydi)
//   "gone"      → abonelik LS'te bulunamadı (404) — silmeye devam güvenli
// Gerçek bir hata (auth, 5xx, ağ) durumunda EXCEPTION fırlatır; çağıran hesabı
// silmeyi durdurmalıdır — aksi halde "silindi ama LS'te aktif" durumu doğar.
type CancelResult = "cancelled" | "gone";

async function cancelLemonSubscription(subscriptionId: string): Promise<CancelResult> {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error("LEMONSQUEEZY_API_KEY is not configured; refusing to delete account with an active subscription");
  }

  const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
    signal: AbortSignal.timeout(LS_TIMEOUT_MS),
  });

  if (res.ok) return "cancelled";
  if (res.status === 404) return "gone";

  const payload: any = await res.json().catch(() => null);
  const detail = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.title ?? `HTTP ${res.status}`;
  throw new Error(`Lemon Squeezy cancel failed: ${detail}`);
}

// ─── DynamoDB yardımcıları ────────────────────────────────────────────────────

async function getProfile(userId: string): Promise<Record<string, any> | null> {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    })
  );
  return res.Item ?? null;
}

// Kullanıcının tüm makalelerini sayfa sayfa oku (1 MB sınırını LastEvaluatedKey ile
// aş) ve 25'lik BatchWrite gruplarıyla sil. UnprocessedItems için basit retry.
async function deleteAllArticles(userId: string): Promise<number> {
  let deleted = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    const page = await dynamo.send(
      new QueryCommand({
        TableName: ARTICLES_TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: lastKey,
      })
    );

    const items = page.Items ?? [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      let requestItems: Record<string, any> = {
        [ARTICLES_TABLE_NAME]: chunk.map((it: Record<string, any>) => ({
          DeleteRequest: { Key: { PK: it.PK, SK: it.SK } },
        })),
      };

      // BatchWrite throttling'te bazı item'ları işlemeyebilir → geri kalanları tekrar dene
      for (let attempt = 0; attempt < 5; attempt++) {
        const resp = await dynamo.send(new BatchWriteCommand({ RequestItems: requestItems }));
        const unprocessed = resp.UnprocessedItems ?? {};
        if (!unprocessed[ARTICLES_TABLE_NAME] || unprocessed[ARTICLES_TABLE_NAME].length === 0) break;
        requestItems = unprocessed as Record<string, any>;
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }

      deleted += chunk.length;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return deleted;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const headers = buildHeaders(event);
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"] as string | undefined;

    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    // 1. Profili oku (silmeden ÖNCE — lsSubscriptionId'ye ihtiyacımız var)
    const profile = await getProfile(userId);
    const subscriptionId = profile?.lsSubscriptionId ? String(profile.lsSubscriptionId) : "";

    // 2. Abonelik ID'si varsa HER ZAMAN LS'te iptal etmeyi dene. Yerel status
    //    (lsSubscriptionStatus) webhook gecikmesi yüzünden BAYAT olabilir; ona güvenip
    //    iptali atlarsak "silindi ama LS'te aktif → tekrar ücretlendirildi" riski doğar.
    //    cancelLemonSubscription zaten idempotent: zaten iptal/expired → 200, yok → 404.
    //    Gerçek hata (auth/5xx/ağ/timeout) → hesabı SİLME, 502 dön.
    if (subscriptionId) {
      try {
        await cancelLemonSubscription(subscriptionId);
      } catch (cancelErr: any) {
        console.error("delete-account: LS cancel failed, aborting deletion:", cancelErr);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({
            message:
              "We could not cancel your subscription with the payment provider, so your account was not deleted. Please try again shortly or contact support.",
          }),
        };
      }
    }

    // 3. subscriptionId → userId eşlemesini TOMBSTONE'a çevir (tamamen silme).
    //    Tamamen silersek, silinen kullanıcıya gelen gecikmeli bir webhook userId'yi
    //    çözemeyip 500 döner → LS aynı webhook'u tekrar tekrar dener (retry storm).
    //    Tombstone ile webhook "silinmiş kullanıcı" olduğunu görüp 200/ignore döner;
    //    ayrıca hayalet kullanıcı diriltmesi de engellenir. Kayıt ~90 gün sonra TTL
    //    ile temizlenir.
    if (subscriptionId) {
      const TTL_90_DAYS = 90 * 24 * 60 * 60;
      await dynamo.send(
        new PutCommand({
          TableName: USERS_TABLE_NAME,
          Item: {
            PK: `LSSUB#${subscriptionId}`,
            SK: "MAP",
            deleted: true,
            deletedAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + TTL_90_DAYS,
          },
        })
      );
    }

    // 4. Kullanıcının makalelerini sayfalı + batch'li sil
    const deletedArticles = await deleteAllArticles(userId);

    // 5. Kullanıcı profilini sil
    await dynamo.send(
      new DeleteCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      })
    );

    // 6. Cognito kullanıcısını sil (kimlik en son gitsin; buraya kadar her şey bittiyse
    //    kullanıcı zaten erişemez hale gelmiştir)
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      })
    );

    console.log(
      `delete-account: user=${userId} sub=${subscriptionId || "none"} cancelled=${!!subscriptionId} articles=${deletedArticles}`
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Account deleted successfully" }),
    };
  } catch (error) {
    console.error("delete-account error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
