// app-backend/lambdas/users/get-profile/index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { resolveEntitlement, trialResponse, expireTrialIfDue } from "../../../shared/entitlements";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;

// CORS_ORIGIN virgülle ayrılmış birden çok origin içerebilir
// (ör. "https://cogletta.com,https://www.cogletta.com").
// İsteğin Origin header'ı listede varsa onu yansıtırız; yoksa ilk origin'e düşeriz.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function resolveCorsOrigin(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const reqOrigin =
    event.headers?.origin ?? event.headers?.Origin ?? "";
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

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const headers = buildHeaders(event);
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"] as string | undefined;

    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: "Unauthorized" }),
      };
    }

    const result = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          interests: [],
          plan: "free",
          planSource: null,
          trialEndsAt: null,
          trial: { status: "none", eligible: true, endsAt: null, startedAt: null, consumedAt: null, daysLeft: null },
        }),
      };
    }

    // EFEKTİF plan. Kayıtta "pro" yazıyor olabilir ama denemesi bittiyse
    // (cron henüz çalışmamış olsa da) burada Free döneriz — arayüz ve backend
    // aynı gerçeği görsün.
    const entitlement = resolveEntitlement(result.Item);

    // Self-healing: süresi dolmuş denemeyi hemen veritabanına yansıt. Best-effort;
    // başarısız olsa bile yukarıdaki efektif plan zaten doğru.
    let expired = false;
    if (entitlement.needsExpiry) {
      expired = await expireTrialIfDue({
        dynamo,
        UpdateCommand,
        tableName:   USERS_TABLE_NAME,
        userId,
        entitlement,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        // Deneme düştüyse interests/subTopics de silindi — arayüze eski değeri gönderme.
        interests:   expired ? [] : (result.Item.interests ?? []),
        subTopics:   expired ? {} : (result.Item.subTopics ?? {}),
        email:       result.Item.email ?? null,
        plan:        entitlement.plan,
        lsPortalUrl: result.Item.lsPortalUrl ?? null,
        lsVariantId: result.Item.lsVariantId ?? null,
        // Deneme durumu: arayuz kalan gunu gosterebilsin.
        planSource:  entitlement.source,
        trialEndsAt: entitlement.trial.status === "active" ? entitlement.trial.endsAt : null,
        // /register sayfasının 4 durumu bu blok üzerinden ayrılıyor.
        trial:       trialResponse(entitlement),
      }),
    };
  } catch (error) {
    console.error("get-profile error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
