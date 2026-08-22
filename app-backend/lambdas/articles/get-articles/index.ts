import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { randomUUID } from "crypto";
import { Keys } from "../../../shared/types";
import { isCategoryId, rotationCategoryFor } from "../../../shared/categories";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const ARTICLES_TABLE             = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE                = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const DELIVER_DAILY_FUNCTION     = process.env.DELIVER_DAILY_FUNCTION_NAME ?? "";

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

// Generate ~10 sn sürüyor; frontend 5 sn'de bir poll ettiği için kilit olmadan
// aynı kullanıcı için 2-3 paralel invocation oluşuyordu (3x Bedrock maliyeti).
// Kilit: gerçek içerik yazılmadan önce ConditionExpression ile "generating"
// placeholder item'ı yazılır; koşul başarısızsa üretim zaten sürüyordur.
// generate-articles gerçek içeriği koşulsuz PutCommand ile üstüne yazar.
const GENERATING_STALE_MS = 3 * 60 * 1000; // generate crash ederse 3 dk sonra yeniden tetiklenebilir
const PLACEHOLDER_TTL_SEC = 6 * 60 * 60;   // her ihtimale karşı placeholder 6 saatte TTL ile silinir

interface GeneratePayload {
  userId: string;
  /** Sahiplik jetonu — generate-articles retry'da kendi kilidine takilmasin. */
  generationId?: string;
  interests: string[];
  subTopics: Record<string, string[]>;
  email?: string;
  plan: string;
}

/**
 * O gunun kategori havuzu hazir mi?
 *
 * Bu kontrol 2026-08-09'da eklendi. Havuz mimarisi daily-trigger'a eklenirken
 * get-articles guncellenmemisti: kayit yoksa kosulsuz generate-articles
 * cagriliyordu, yani feed'ler bastan cekilip Bedrock'a gidiliyordu — oysa ayni
 * icerik havuzda hazir bekliyordu. Prod'da 10 gunde ~1.2M gereksiz input token
 * bunun sonucuydu (Pro kullanici basina gunde 3 pickArticle + 2 pickPodcast).
 */
async function poolReady(categoryId: string, sk: string): Promise<boolean> {
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.categoryPK(categoryId), SK: sk },
      ProjectionExpression: "articles, #s",
      ExpressionAttributeNames: { "#s": "status" },
    }));
    const item = res.Item;
    // "generating" placeholder hazir sayilmaz — icerik henuz yazilmadi.
    return Boolean(item && item.status !== "generating" && (item.articles as unknown[] | undefined)?.length);
  } catch (err) {
    console.warn(`Pool check failed for ${categoryId}:`, err);
    return false;
  }
}

async function invokeDeliver(payload: Record<string, unknown>): Promise<void> {
  await lambda.send(
    new InvokeCommand({
      FunctionName:   DELIVER_DAILY_FUNCTION,
      InvocationType: "Event",
      Payload:        Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Kilidi almayı dener: item henüz yoksa "generating" placeholder'ını yazar.
 * true dönerse kilit bizde, generate tetiklenmeli.
 * false dönerse başka bir invocation zaten üretiyor (ya da içerik az önce yazıldı).
 */
async function acquireGenerationLock(pk: string, sk: string): Promise<boolean> {
  try {
    await dynamo.send(
      new PutCommand({
        TableName: ARTICLES_TABLE,
        Item: {
          PK:           pk,
          SK:           sk,
          status:       "generating",
          generatingAt: Date.now(),
          ttl:          Math.floor(Date.now() / 1000) + PLACEHOLDER_TTL_SEC,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/**
 * Bayat kilidi tazelemeyi dener (generate crash ettiyse). generatingAt hâlâ
 * eski değerse timestamp'i günceller ve true döner — sadece bir poll kazanır,
 * böylece yeniden tetikleme de tekilleşir.
 */
async function refreshStaleLock(pk: string, sk: string, previousGeneratingAt: number): Promise<boolean> {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: ARTICLES_TABLE,
        Key: { PK: pk, SK: sk },
        UpdateExpression:          "SET generatingAt = :now",
        ConditionExpression:       "#s = :generating AND generatingAt = :prev",
        ExpressionAttributeNames:  { "#s": "status" },
        ExpressionAttributeValues: {
          ":now":        Date.now(),
          ":generating": "generating",
          ":prev":       previousGeneratingAt,
        },
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function invokeGenerate(payload: GeneratePayload): Promise<void> {
  // Jeton BURADA uretiliyor: AWS async retry'da ayni payload'i tekrar
  // gonderdigi icin jeton da ayni kalir ve worker kendi kilidini taniyabilir.
  payload = { ...payload, generationId: payload.generationId ?? randomUUID() };
  await lambda.send(
    new InvokeCommand({
      FunctionName:   GENERATE_ARTICLES_FUNCTION,
      InvocationType: "Event",
      Payload:        Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Havuz hazirsa deliver-daily'ye (Bedrock YOK), degilse generate-articles'a
 * (Bedrock VAR) yonlendirir. daily-trigger'daki yonlendirmenin ayni mantigi:
 * Pro kullanicida TUM kategorilerin havuzu hazir olmali, aksi halde kismi
 * teslimat olusur.
 */
async function routeGeneration(payload: GeneratePayload, sk: string): Promise<void> {
  const { userId, plan } = payload;
  const isPro = plan.toLowerCase() === "pro";

  // Free planda konu seçimi yok: o günün rotasyon kategorisi kullanılır.
  // daily-trigger ile AYNI fonksiyon çağrılıyor, yani cron'dan önce dashboard
  // açan kullanıcı da cron'un üreteceği içeriğin aynısını alır.
  const needed = isPro ? payload.interests : [rotationCategoryFor(new Date())];

  if (DELIVER_DAILY_FUNCTION && needed.length > 0 && needed.every(isCategoryId)) {
    const readiness = await Promise.all(needed.map((c) => poolReady(c, sk)));
    const missing = needed.filter((_, i) => !readiness[i]);

    if (missing.length === 0) {
      await invokeDeliver(
        isPro
          ? { userId, interests: needed, subTopics: payload.subTopics, email: payload.email, plan: "pro" }
          : { userId, category: needed[0], email: payload.email, plan: "free" },
      );
      console.log(`Routed user=${userId} to pool delivery (${needed.join(", ")})`);
      return;
    }
    console.warn(`Pool unavailable for user=${userId}; falling back to generation — missing=${missing.join(", ")}`);
  }

  await invokeGenerate(payload);
  console.log(`Triggered generate for user=${userId} (no pool available)`);
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

    const dateParam = event.queryStringParameters?.date as string | undefined;
    const date      = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? new Date(dateParam)
      : new Date();

    // Kullanıcı profilini çek
    const userResult = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: {
          PK: Keys.userPK(userId),
          SK: "PROFILE",
        },
        // plan rezerve kelime → alias; on-demand generate için plan+subTopics+email de lazım
        ExpressionAttributeNames: { "#plan": "plan" },
        ProjectionExpression: "interests, updatedAt, subTopics, email, #plan",
      })
    );

    const userInterests = userResult.Item?.interests as string[] | undefined;
    const userPlan      = (userResult.Item?.plan as string | undefined) ?? "free";
    const userSubTopics = (userResult.Item?.subTopics as Record<string, string[]> | undefined) ?? {};
    const userEmail     = userResult.Item?.email as string | undefined;

    const pk          = Keys.userPK(userId);
    const requestedSK = Keys.dateSK(date);
    const todaySK     = Keys.dateSK(new Date());
    const isToday     = requestedSK === todaySK;

    const generatePayload: GeneratePayload = {
      userId,
      // Free'de kayitli interests teslimatta kullanilmaz; legacy uretim yoluna
      // dusulurse de rotasyon kategorisi gecerli olmali.
      interests: userPlan.toLowerCase() === "pro"
        ? (userInterests ?? [])
        : [rotationCategoryFor(new Date())],
      subTopics: userSubTopics,
      email:     userEmail,
      plan:      userPlan,
    };

    // Bugünkü makale kaydını çek
    const articleResult = await dynamo.send(
      new GetCommand({
        TableName: ARTICLES_TABLE,
        Key: { PK: pk, SK: requestedSK },
      })
    );

    const item = articleResult.Item;

    // Hiç kayıt yok — kilidi alan tek invocation generate tetikler
    if (!item) {
      if (isToday && userInterests && userInterests.length >= 1) {
        const locked = await acquireGenerationLock(pk, todaySK);
        if (locked) {
          await routeGeneration(generatePayload, todaySK);
        } else {
          console.log(`Skipped generate for user=${userId} (already in progress)`);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status:      "pending",
          articles:    [],
          generatedAt: null,
        }),
      };
    }

    // Placeholder — üretim sürüyor. Bayatladıysa (generate crash) bir poll
    // kilidi tazeleyip yeniden tetikler; diğerleri sadece pending döner.
    if (item.status === "generating" && !(item.articles?.length)) {
      const generatingAt = typeof item.generatingAt === "number" ? item.generatingAt : 0;
      const isStale      = Date.now() - generatingAt > GENERATING_STALE_MS;

      if (isToday && isStale && userInterests && userInterests.length >= 1) {
        const refreshed = await refreshStaleLock(pk, requestedSK, generatingAt);
        if (refreshed) {
          console.log(`Stale lock for user=${userId} (generatingAt=${generatingAt}); re-routing`);
          await routeGeneration(generatePayload, requestedSK);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status:      "pending",
          articles:    [],
          generatedAt: null,
        }),
      };
    }

    // Makale var — mevcut makaleleri dön
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status:      "ready",
        articles:    item.articles ?? [],
        podcast:     item.podcast ?? null,
        podcasts:    item.podcasts ?? (item.podcast ? [item.podcast] : []),
        generatedAt: item.generatedAt ?? null,
      }),
    };
  } catch (error) {
    console.error("get-articles error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
