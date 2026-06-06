import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
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

    const body = JSON.parse(event.body ?? "{}") as { interests?: unknown };
    const { interests } = body;

    if (
      !Array.isArray(interests) ||
      interests.length !== 3 ||
      !interests.every((i) => typeof i === "string" && i.trim().length > 0)
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Exactly 3 non-empty interest strings are required." }),
      };
    }

    const now = new Date().toISOString();

    // UpdateCommand (not PutCommand) so we never accidentally overwrite
    // fields like createdAt that were set on first registration.
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression:
          "SET interests = :interests, updatedAt = :now, email = if_not_exists(email, :email)",
        ExpressionAttributeValues: {
          ":interests": interests,
          ":now": now,
          ":email": (claims["email"] as string | undefined) ?? null,
        },
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Interests updated successfully.", interests }),
    };
  } catch (error) {
    console.error("update-interests error:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
