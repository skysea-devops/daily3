// app-backend/lambdas/articles/get-articles/index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { Keys } from "../../../shared/types";
import type { Article, Podcast } from "../../../shared/types";
import { isCategoryId, rotationCategoryFor } from "../../../shared/categories";
import {
  resolveEntitlement,
  expireTrialIfDue,
  ENTITLEMENT_PROJECTION,
  ENTITLEMENT_NAMES,
} from "../../../shared/entitlements";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const ARTICLES_TABLE            = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE               = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const DELIVER_DAILY_FUNCTION     = process.env.DELIVER_DAILY_FUNCTION_NAME ?? "";
const CORS_ORIGIN               = process.env.CORS_ORIGIN ?? "*";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

/**
 * Rezervasyonun bayat sayılma eşiği.
 *
 * Bu Lambda üretimi BAŞLATMAZ, yalnızca rezerve eder (`generatingAt`) ve
 * generate-articles'ı çağırır. Üretici kendi sahiplenmesini `claimedAt` ile
 * yapar — iki alan bilinçli olarak ayrı. Tek alan kullanıldığında üretici bu
 * Lambda'nın rezervasyonunu "başkası çalışıyor" sanıp hemen çıkıyor ve hiç
 * kimse üretmiyordu (2026-08-17 deadlock'u).
 */
const STALE_RESERVATION_MS = 3 * 60 * 1000;
const PLACEHOLDER_TTL_SEC  = 6 * 60 * 60;

interface GeneratePayload {
  userId:        string;
  interests:     string[];
  subTopics:     Record<string, string[]>;
  email?:        string;
  plan:          string;
  /** Sahiplik jetonu — generate-articles retry'da kendi kilidine takılmasın. */
  generationId?: string;
}

// ── Lambda çağrıları ──────────────────────────────────────────────────────────

async function invokeGenerate(payload: GeneratePayload): Promise<void> {
  // Jeton BURADA üretiliyor: AWS async retry'da aynı payload'ı tekrar
  // gönderdiği için jeton da aynı kalır ve worker kendi kilidini tanıyabilir.
  const withToken = { ...payload, generationId: payload.generationId ?? randomUUID() };
  await lambda.send(new InvokeCommand({
    FunctionName:   GENERATE_ARTICLES_FUNCTION,
    InvocationType: "Event",
    Payload:        Buffer.from(JSON.stringify(withToken)),
  }));
}

async function invokeDeliver(payload: Record<string, unknown>): Promise<void> {
  await lambda.send(new InvokeCommand({
    FunctionName:   DELIVER_DAILY_FUNCTION,
    InvocationType: "Event",
    Payload:        Buffer.from(JSON.stringify(payload)),
  }));
}

// ── Havuz ─────────────────────────────────────────────────────────────────────

/**
 * O günün kategori havuzu hazır mı?
 *
 * Havuz hazırsa teslimat Bedrock'a hiç gitmez — aynı içerik zaten üretilmiş
 * durumda. Bu kontrol olmadan her dashboard açılışı kullanıcıya özel üretim
 * tetikliyordu (Pro'da 5 Bedrock çağrısı).
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
    // "generating" placeholder hazır sayılmaz — içerik henüz yazılmadı.
    return Boolean(item && item.status !== "generating" && (item.articles as unknown[] | undefined)?.length);
  } catch (err) {
    console.warn(`Pool check failed for ${categoryId}:`, err);
    return false;
  }
}

/**
 * Havuz hazırsa deliver-daily'ye (Bedrock YOK), değilse generate-articles'a
 * (Bedrock VAR) yönlendirir. daily-trigger'daki yönlendirmenin aynı mantığı:
 * Pro kullanıcıda TÜM kategorilerin havuzu hazır olmalı, aksi halde kısmi
 * teslimat oluşur.
 */
async function routeGeneration(payload: GeneratePayload, sk: string): Promise<void> {
  const { userId, plan } = payload;
  const isPro = plan.toLowerCase() === "pro";

  // Free planda konu seçimi YOK: o günün rotasyon kategorisi kullanılır.
  // daily-trigger ile AYNI fonksiyon çağrılıyor, yani cron'dan önce dashboard
  // açan kullanıcı da cron'un üreteceği içeriğin aynısını alır.
  const needed = isPro ? payload.interests : [rotationCategoryFor(new Date())];

  if (DELIVER_DAILY_FUNCTION && needed.length > 0 && needed.every(isCategoryId)) {
    const readiness = await Promise.all(needed.map(c => poolReady(c, sk)));
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

  // Legacy üretim: Free'de kayıtlı interests kullanılmaz, rotasyon geçerli.
  await invokeGenerate({ ...payload, interests: needed });
  console.log(`Triggered generate for user=${userId} (no pool available)`);
}

// ── Üretim rezervasyonu ───────────────────────────────────────────────────────

/** İlk isteğin üretimi başlatmasını, sonrakilerin beklemesini sağlar. */
async function reserveGeneration(userId: string, sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: {
        PK: Keys.userPK(userId), SK: sk,
        status: "generating", generatingAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + PLACEHOLDER_TTL_SEC,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/** Üretici çöktüyse bayat rezervasyonu tazeleyip yeniden tetiklemeyi dener. */
async function refreshStaleReservation(userId: string, sk: string, previous: number): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.userPK(userId), SK: sk },
      UpdateExpression: "SET generatingAt = :now",
      ConditionExpression: "#s = :generating AND generatingAt = :prev",
      ExpressionAttributeNames:  { "#s": "status" },
      ExpressionAttributeValues: { ":now": Date.now(), ":generating": "generating", ":prev": previous },
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.["sub"] as string | undefined;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    const requestedDate = event.queryStringParameters?.date;
    const todaySK       = Keys.dateSK(new Date());
    const sk            = requestedDate ? `DATE#${requestedDate}` : todaySK;

    const result = await dynamo.send(new GetCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.userPK(userId), SK: sk },
    }));
    const item = result.Item;

    // İçerik hazır: doğrudan döndür.
    const articles = (item?.articles ?? []) as Article[];
    if (item && item.status !== "generating" && articles.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status:      "ready",
          articles,
          podcast:     (item.podcast ?? null) as Podcast | null,
          podcasts:    (item.podcasts ?? []) as Podcast[],
          generatedAt: (item.generatedAt ?? null) as string | null,
        }),
      };
    }

    // Geçmiş bir tarih isteniyorsa üretim yapma — o gün neyse odur.
    if (sk !== todaySK) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "pending", articles: [], podcast: null, podcasts: [], generatedAt: null }),
      };
    }

    // Profili oku: üretim için plan, ilgi alanları ve e-posta lazım.
    //
    // Plan alanı TEK BAŞINA okunmuyor: denemesi dolmuş ama cron'un henüz
    // düşürmediği kullanıcı burada "pro" görünüp Pro teslimat (3 makale + 2
    // podcast) alıyordu. Yetkilendirme cron'a bırakılamaz.
    const profileResult = await dynamo.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { PK: Keys.userPK(userId), SK: "PROFILE" },
      // "plan" DynamoDB rezerve kelime → alias şart.
      ProjectionExpression: `interests, subTopics, email, ${ENTITLEMENT_PROJECTION}`,
      ExpressionAttributeNames: ENTITLEMENT_NAMES,
    }));

    const entitlement = resolveEntitlement(profileResult.Item);
    const isPro       = entitlement.isPro;
    const userPlan    = entitlement.plan;

    // Self-healing: kaydı gerçeğe hizala (best-effort). Düşürme başarılı olursa
    // interests silinmiş olur, o yüzden aşağıda Free yoluna zaten gidiyoruz.
    if (entitlement.needsExpiry) {
      await expireTrialIfDue({
        dynamo,
        UpdateCommand,
        tableName: USERS_TABLE,
        userId,
        entitlement,
      });
    }

    const userInterests = isPro
      ? ((profileResult.Item?.interests as string[] | undefined) ?? [])
      : [];

    const generatePayload: GeneratePayload = {
      userId,
      // Free'de kayıtlı interests teslimatta kullanılmaz; rotasyon geçerli.
      interests: isPro ? userInterests : [rotationCategoryFor(new Date())],
      subTopics: isPro
        ? ((profileResult.Item?.subTopics as Record<string, string[]> | undefined) ?? {})
        : {},
      email:     profileResult.Item?.email as string | undefined,
      plan:      userPlan,
    };

    if (!item) {
      // Bugün için hiç kayıt yok: üretimi rezerve eden İLK istek tetikler.
      if (await reserveGeneration(userId, todaySK)) {
        await routeGeneration(generatePayload, todaySK);
      } else {
        console.log(`Generation already reserved for user=${userId} ${todaySK}`);
      }
    } else if (item.status === "generating") {
      // Üretim sürüyor. Rezervasyon bayatladıysa üretici çökmüş olabilir —
      // tazeleyip yeniden tetikle. Tazeleme koşullu olduğu için eşzamanlı
      // isteklerden yalnızca biri yeniden tetikler.
      const startedAt = Number(item.generatingAt ?? 0);
      if (Date.now() - startedAt > STALE_RESERVATION_MS) {
        if (await refreshStaleReservation(userId, todaySK, startedAt)) {
          console.warn(`Stale reservation for user=${userId} (generatingAt=${startedAt}); re-routing`);
          await routeGeneration(generatePayload, todaySK);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "pending", articles: [], podcast: null, podcasts: [], generatedAt: null }),
    };
  } catch (error) {
    console.error("get-articles failed:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
