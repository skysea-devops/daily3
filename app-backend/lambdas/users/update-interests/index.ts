import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE_NAME        = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FN    = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const CORS_ORIGIN             = process.env.CORS_ORIGIN ?? "*";

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
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
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

    // Save interests to users table
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression:
          "SET interests = :interests, updatedAt = :now, email = if_not_exists(email, :email)",
        ExpressionAttributeValues: {
          ":interests": interests,
          ":now":       now,
          ":email":     (claims["email"] as string | undefined) ?? null,
        },
      })
    );

    // Async-invoke generate-articles so the user doesn't wait for Bedrock
    await lambda.send(
      new InvokeCommand({
        FunctionName:   GENERATE_ARTICLES_FN,
        InvocationType: "Event", // fire-and-forget
        Payload:        Buffer.from(JSON.stringify({ userId, interests })),
      })
    );

    console.log(`Triggered generate-articles for user ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Interests updated. Articles are being generated.",
        interests,
      }),
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
