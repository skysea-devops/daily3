// app-backend/lambdas/essays/get-body/index.ts
//
// GET /essays/{slug}/body — API Gateway v2, AUTH OPSİYONEL.
//
// Route'a API Gateway JWT authorizer BAĞLANMAZ: authorizer token'ı zorunlu kılar,
// oysa free / 7 günlük penceredeki denemeler misafire de açılır. Token varsa
// burada aws-jwt-verify ile (Cognito JWKS, imza + süre + client_id) doğrulanır.
//
// Kilitli gövdeler PRIVATE S3 bucket'ında: s3://$ESSAYS_BUCKET/essays/<slug>.json
// (deploy workflow'u app-frontend/.essays-private/ klasörünü buraya senkronlar).

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { ENTITLEMENT_NAMES, ENTITLEMENT_PROJECTION, expireTrialIfDue } from "../../../shared/entitlements";
import { createHandler, type EssayBodyRecord } from "./core";

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const ESSAYS_BUCKET = process.env.ESSAYS_BUCKET!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

/** Konteyner başına gövde önbelleği: yeni deploy en geç bu süre sonra görünür. */
const BODY_CACHE_MS = 5 * 60 * 1000;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: "access",
  clientId: USER_POOL_CLIENT_ID,
});

const cache = new Map<string, { value: EssayBodyRecord | null; expires: number }>();

async function loadBody(slug: string): Promise<EssayBodyRecord | null> {
  const hit = cache.get(slug);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value: EssayBodyRecord | null = null;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: ESSAYS_BUCKET, Key: `essays/${slug}.json` }));
    const text = await res.Body!.transformToString("utf-8");
    const parsed = JSON.parse(text);
    if (parsed?.slug !== slug || (parsed.access !== "free" && parsed.access !== "pro") || !Array.isArray(parsed.blocks)) {
      throw new Error(`malformed essay body for ${slug}`);
    }
    value = parsed as EssayBodyRecord;
  } catch (err: any) {
    // Bucket'ta olmayan slug: 404. (ListBucket izni olmadan S3 bunu AccessDenied olarak döner.)
    if (err?.name !== "NoSuchKey" && err?.name !== "AccessDenied" && err?.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
    // Yanlış yapılandırılmış IAM de AccessDenied döner: log'da görünsün.
    if (err?.name === "AccessDenied") console.warn(`essay-body: AccessDenied for essays/${slug}.json (missing object or IAM)`);
  }
  cache.set(slug, { value, expires: Date.now() + (value ? BODY_CACHE_MS : 60_000) });
  return value;
}

async function verifyToken(token: string): Promise<string> {
  const payload = await verifier.verify(token);
  return String(payload.sub);
}

async function loadProfile(userId: string) {
  const res = await dynamo.send(
    new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      ProjectionExpression: ENTITLEMENT_PROJECTION,
      ExpressionAttributeNames: ENTITLEMENT_NAMES,
    }),
  );
  return res.Item ?? null;
}

export const handler = createHandler({
  loadBody,
  verifyToken,
  loadProfile,
  expireTrial: async (userId, entitlement) => {
    await expireTrialIfDue({ dynamo, UpdateCommand, tableName: USERS_TABLE_NAME, userId, entitlement });
  },
  now: () => Date.now(),
});
