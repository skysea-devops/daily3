import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
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
        body: JSON.stringify({ interests: [], plan: "free" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        interests:  result.Item.interests ?? [],
        email:      result.Item.email ?? null,
        plan:       result.Item.plan ?? "free",
        subTopics:  result.Item.subTopics ?? {},
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
