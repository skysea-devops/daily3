import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { Keys } from "../../../shared/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const ARTICLES_TABLE               = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE                  = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION   = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const CORS_ORIGIN                  = process.env.CORS_ORIGIN ?? "*";

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

    const dateParam = event.queryStringParameters?.date as string | undefined;
    const date      = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? new Date(dateParam)
      : new Date();

    // Kullanıcı profilini çek — interests updatedAt için
    const userResult = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: {
          PK: Keys.userPK(userId),
          SK: "PROFILE",
        },
        ProjectionExpression: "interests, updatedAt",
      })
    );

    const userUpdatedAt  = userResult.Item?.updatedAt as string | undefined;
    const userInterests  = userResult.Item?.interests as string[] | undefined;

    // Bugünkü makale kaydını çek
    const articleResult = await dynamo.send(
      new GetCommand({
        TableName: ARTICLES_TABLE,
        Key: {
          PK: Keys.userPK(userId),
          SK: Keys.dateSK(date),
        },
      })
    );

    const item          = articleResult.Item;
    const generatedAt   = item?.generatedAt as string | undefined;

    // Stale kontrolü: makale kaydı yok VEYA interests değişikliğinden önce generate edilmiş
    const isStale =
      !item ||
      (userUpdatedAt && generatedAt && generatedAt < userUpdatedAt);

    if (isStale) {
      // Yeniden generate tetikle (fire-and-forget)
      if (userInterests && userInterests.length === 3) {
        await lambda.send(
          new InvokeCommand({
            FunctionName:   GENERATE_ARTICLES_FUNCTION,
            InvocationType: "Event",
            Payload:        Buffer.from(
              JSON.stringify({ userId, interests: userInterests })
            ),
          })
        );
        console.log(`Triggered re-generate for user=${userId} (stale articles)`);
      }

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
        articles:    item.articles ?? [],
        generatedAt: item.generatedAt ?? null,
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
