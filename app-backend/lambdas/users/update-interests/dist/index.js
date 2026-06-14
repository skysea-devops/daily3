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
var CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
var DEVELOPER_USER_IDS = new Set(
  (process.env.DEVELOPER_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);
var headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN
};
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
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"];
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }
    const body = JSON.parse(event.body ?? "{}");
    const { interests } = body;
    if (!Array.isArray(interests) || interests.length !== 3 || !interests.every((i) => typeof i === "string" && i.trim().length > 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Exactly 3 non-empty interest strings are required." })
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const isDeveloper = DEVELOPER_USER_IDS.has(userId);
    const alreadyGenerated = !isDeveloper && await articlesExistToday(userId);
    await dynamo.send(
      new import_lib_dynamodb.UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression: "SET interests = :interests, updatedAt = :now, email = :email",
        ExpressionAttributeValues: {
          ":interests": interests,
          ":now": now,
          ":email": claims["email"] ?? null
        }
      })
    );
    if (alreadyGenerated) {
      console.log(`Articles already exist today for user=${userId}, skipping generate`);
      ;
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
        Payload: Buffer.from(JSON.stringify({ userId, interests }))
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
