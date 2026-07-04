import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
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
    const userId = event.requestContext.authorizer.jwt.claims["sub"] as string | undefined;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    // En son TREND# kaydını çek (SK ters sıralı, ilk sonuç en güncel hafta)
    const res = await dynamo.send(new QueryCommand({
      TableName: ARTICLES_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": Keys.userPK(userId), ":prefix": "TREND#" },
      ScanIndexForward: false,
      Limit: 1,
    }));

    const report = res.Items?.[0];
    if (!report) {
      return { statusCode: 200, headers, body: JSON.stringify({ report: null }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        report: {
          weekLabel:   report.weekLabel ?? "",
          interests:   report.interests ?? [],
          generatedAt: report.generatedAt ?? null,
        },
      }),
    };
  } catch (error) {
    console.error("get-trend-report error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
