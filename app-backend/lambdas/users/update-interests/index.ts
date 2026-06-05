import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;

export const handler = async (event: any) => {
  try {
    const claims = event.requestContext?.authorizer?.jwt?.claims;

    if (!claims?.sub) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const interests = body.interests;

    if (!Array.isArray(interests) || interests.length !== 3) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Exactly 3 interests must be selected.",
        }),
      };
    }

    const now = new Date().toISOString();

    await dynamo.send(
      new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: {
          PK: `USER#${claims.sub}`,
          SK: "PROFILE",
          email: claims.email ?? null,
          interests,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Interests updated successfully.",
        interests,
      }),
    };
  } catch (error) {
    console.error("update-interests error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};