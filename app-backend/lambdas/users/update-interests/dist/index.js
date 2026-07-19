"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lambdas/users/update-interests/index.ts
var update_interests_exports = {};
__export(update_interests_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(update_interests_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_lambda = require("@aws-sdk/client-lambda");
var dynamo = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var lambda = new import_client_lambda.LambdaClient({});
var USERS_TABLE_NAME = process.env.USERS_TABLE_NAME;
var ARTICLES_TABLE_NAME = process.env.ARTICLES_TABLE_NAME;
var GENERATE_ARTICLES_FN = process.env.GENERATE_ARTICLES_FUNCTION_NAME;
var DEVELOPER_USER_IDS = new Set(
  (process.env.DEVELOPER_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);
var ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "*").split(",").map((o) => o.trim()).filter(Boolean);
function resolveCorsOrigin(event) {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const reqOrigin = event.headers?.origin ?? event.headers?.Origin ?? "";
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return ALLOWED_ORIGINS[0] ?? "*";
}
function buildHeaders(event) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": resolveCorsOrigin(event),
    "Vary": "Origin"
  };
}
function todaySK() {
  return `DATE#${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
}
async function articlesExistToday(userId) {
  try {
    const result = await dynamo.send(
      new import_lib_dynamodb.GetCommand({
        TableName: ARTICLES_TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: todaySK()
        },
        ProjectionExpression: "PK"
      })
    );
    return !!result.Item;
  } catch (err) {
    console.warn("Failed to check today's articles:", err);
    return false;
  }
}
var handler = async (event) => {
  const headers = buildHeaders(event);
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"];
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }
    const body = JSON.parse(event.body ?? "{}");
    const { interests } = body;
    const emailFromBody = typeof body.email === "string" ? body.email : null;
    const subTopics = body.subTopics && typeof body.subTopics === "object" ? body.subTopics : {};
    const ALLOWED_REGIONS = ["EU", "US_EAST", "US_WEST", "ASIA"];
    const region = typeof body.region === "string" && ALLOWED_REGIONS.includes(body.region) ? body.region : "EU";
    if (!Array.isArray(interests) || !interests.every((i) => typeof i === "string" && i.trim().length > 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "interests must be an array of non-empty strings." })
      };
    }
    const isDeveloper = DEVELOPER_USER_IDS.has(userId);
    let plan = "free";
    try {
      const profileResult = await dynamo.send(
        new import_lib_dynamodb.GetCommand({
          TableName: USERS_TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: "PROFILE" },
          ProjectionExpression: "#plan",
          ExpressionAttributeNames: { "#plan": "plan" }
        })
      );
      const rawPlan = profileResult.Item?.plan;
      plan = rawPlan?.toLowerCase() === "pro" ? "pro" : "free";
    } catch (err) {
      console.warn("Failed to read plan, defaulting to free:", err);
    }
    const requiredCount = plan === "pro" ? 3 : 1;
    const countValid = isDeveloper ? interests.length >= 1 && interests.length <= 3 : interests.length === requiredCount;
    if (!countValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: `Exactly ${requiredCount} interest${requiredCount > 1 ? "s are" : " is"} required on the ${plan} plan.`
        })
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const alreadyGenerated = !isDeveloper && await articlesExistToday(userId);
    const resolvedEmail = emailFromBody ?? claims["email"] ?? null;
    const setParts = ["interests = :interests", "updatedAt = :now", "subTopics = :subTopics", "#region = :region"];
    const exprValues = {
      ":interests": interests,
      ":now": now,
      ":subTopics": subTopics,
      ":region": region
    };
    if (resolvedEmail) {
      setParts.push("email = :email");
      exprValues[":email"] = resolvedEmail;
    }
    await dynamo.send(
      new import_lib_dynamodb.UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        ExpressionAttributeNames: { "#region": "region" },
        // region rezerve kelime olabilir
        ExpressionAttributeValues: exprValues,
        ReturnValues: "ALL_NEW"
      })
    );
    const email = emailFromBody ?? claims["email"] ?? void 0;
    if (alreadyGenerated) {
      console.log(`Articles already exist today for user=${userId}, skipping generate`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Interests updated. Today's articles are already ready.",
          interests,
          articlesReady: true
        })
      };
    }
    await lambda.send(
      new import_client_lambda.InvokeCommand({
        FunctionName: GENERATE_ARTICLES_FN,
        InvocationType: "Event",
        // fire-and-forget
        Payload: Buffer.from(JSON.stringify({ userId, interests, subTopics, email, plan }))
      })
    );
    console.log(`Triggered generate-articles for user=${userId}${isDeveloper ? " [developer]" : ""}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Interests updated. Articles are being generated.",
        interests,
        articlesReady: false
      })
    };
  } catch (error) {
    console.error("update-interests error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
