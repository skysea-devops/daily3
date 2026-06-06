// lambdas/users/update-interests/index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
var dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
var USERS_TABLE_NAME = process.env.USERS_TABLE_NAME;
var CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
var headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN
};
var handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"];
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: "Unauthorized" })
      };
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
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression: "SET interests = :interests, updatedAt = :now, email = if_not_exists(email, :email)",
        ExpressionAttributeValues: {
          ":interests": interests,
          ":now": now,
          ":email": claims["email"] ?? null
        }
      })
    );
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Interests updated successfully.", interests })
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
export {
  handler
};
//# sourceMappingURL=index.js.map
