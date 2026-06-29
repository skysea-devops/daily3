import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const ARTICLES_TABLE_NAME = process.env.ARTICLES_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
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

    // 1. DynamoDB users tablosundan profili sil
    await dynamo.send(
      new DeleteCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      })
    );

    // 2. DynamoDB articles tablosundan kullanıcının makalelerini sil
    const articlesResult = await dynamo.send(
      new QueryCommand({
        TableName: ARTICLES_TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
        },
      })
    );

    if (articlesResult.Items && articlesResult.Items.length > 0) {
      await Promise.all(
        articlesResult.Items.map((item) =>
          dynamo.send(
            new DeleteCommand({
              TableName: ARTICLES_TABLE_NAME,
              Key: { PK: item.PK, SK: item.SK },
            })
          )
        )
      );
    }

    // 3. Cognito'dan kullanıcıyı sil
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Account deleted successfully" }),
    };
  } catch (error) {
    console.error("delete-account error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
