import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { Keys } from "../../../shared/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const CORS_ORIGIN    = process.env.CORS_ORIGIN ?? "*";

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

    // Optional ?date=YYYY-MM-DD query param — defaults to today
    const dateParam = (event.queryStringParameters?.date as string | undefined);
    const date      = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? new Date(dateParam)
      : new Date();

    const result = await dynamo.send(
      new GetCommand({
        TableName: ARTICLES_TABLE,
        Key: {
          PK: Keys.userPK(userId),
          SK: Keys.dateSK(date),
        },
      })
    );

    if (!result.Item) {
      // Articles not generated yet for today
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status:      "ready",
        articles:    result.Item.articles ?? [],
        generatedAt: result.Item.generatedAt ?? null,
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
