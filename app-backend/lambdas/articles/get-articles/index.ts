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
import { Keys } from "../../../shared/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const ARTICLES_TABLE             = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE                = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const CORS_ORIGIN                = process.env.CORS_ORIGIN ?? "*";

// Generate ~10 sn sürüyor; frontend 5 sn'de bir poll ettiği için kilit olmadan
// aynı kullanıcı için 2-3 paralel invocation oluşuyordu (3x Bedrock maliyeti).
// Kilit: gerçek içerik yazılmadan önce ConditionExpression ile "generating"
// placeholder item'ı yazılır; koşul başarısızsa üretim zaten sürüyordur.
// generate-articles gerçek içeriği koşulsuz PutCommand ile üstüne yazar.
const GENERATING_STALE_MS = 3 * 60 * 1000; // generate crash ederse 3 dk sonra yeniden tetiklenebilir
const PLACEHOLDER_TTL_SEC = 6 * 60 * 60;   // her ihtimale karşı placeholder 6 saatte TTL ile silinir

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

interface GeneratePayload {
  userId: string;
  interests: string[];
  subTopics: Record<string, string[]>;
  email?: string;
  plan: string;
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
  await lambda.send(
    new InvokeCommand({
      FunctionName:   GENERATE_ARTICLES_FUNCTION,
      InvocationType: "Event",
      Payload:        Buffer.from(JSON.stringify(payload)),
    })
  );
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
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
        // plan/region rezerve kelime → alias; on-demand generate için plan+subTopics+email de lazım
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
      interests: userInterests ?? [],
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
    // (interests değişikliği artık stale sayılmıyor — ertesi gün yansır)
    if (!item) {
      if (isToday && userInterests && userInterests.length >= 1) {
        const locked = await acquireGenerationLock(pk, todaySK);
        if (locked) {
          await invokeGenerate(generatePayload);
          console.log(`Triggered generate for user=${userId} (no articles today, lock acquired)`);
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
          await invokeGenerate(generatePayload);
          console.log(`Re-triggered generate for user=${userId} (stale lock, generatingAt=${generatingAt})`);
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
    // interests değişmiş olsa bile bugün yeni generate yok
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
