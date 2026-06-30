import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE_NAME     = process.env.USERS_TABLE_NAME!;
const ARTICLES_TABLE_NAME  = process.env.ARTICLES_TABLE_NAME!;
const GENERATE_ARTICLES_FN = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const CORS_ORIGIN          = process.env.CORS_ORIGIN ?? "*";
const DEVELOPER_USER_IDS   = new Set(
  (process.env.DEVELOPER_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

function todaySK(): string {
  return `DATE#${new Date().toISOString().slice(0, 10)}`;
}

async function articlesExistToday(userId: string): Promise<boolean> {
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: ARTICLES_TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: todaySK(),
        },
        ProjectionExpression: "PK",
      })
    );
    return !!result.Item;
  } catch (err) {
    console.warn("Failed to check today's articles:", err);
    return false; // hata durumunda generate'e izin ver
  }
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims["sub"] as string | undefined;

    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    const body = JSON.parse(event.body ?? "{}") as { interests?: unknown; email?: unknown; subTopics?: unknown };
    const { interests } = body;
    const emailFromBody = typeof body.email === "string" ? body.email : null;
    const subTopics = body.subTopics && typeof body.subTopics === "object" ? body.subTopics : {};

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

    // Developer bypass — DEVELOPER_USER_IDS env var'ında olan kullanıcılar için limit yok
    const isDeveloper = DEVELOPER_USER_IDS.has(userId);

    // Bugün için makale zaten üretilmiş mi kontrol et (developer'lar için atla)
    const alreadyGenerated = !isDeveloper && await articlesExistToday(userId);

    // Interests'i her halükarda kaydet
    await dynamo.send(
      new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        UpdateExpression:
          "SET interests = :interests, updatedAt = :now, email = :email, subTopics = :subTopics",
        ExpressionAttributeValues: {
          ":interests":  interests,
          ":now":        now,
          ":email":      emailFromBody ?? (claims["email"] as string | undefined) ?? null,
          ":subTopics":  subTopics,
        },
      })
    );

    if (alreadyGenerated) {
      // Bugün zaten makale var — generate tetikleme
      console.log(`Articles already exist today for user=${userId}, skipping generate`);;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Interests updated. Today's articles are already ready.",
          interests,
          articlesReady: true,
        }),
      };
    }

    // Bugün makale yok — generate tetikle
    await lambda.send(
      new InvokeCommand({
        FunctionName:   GENERATE_ARTICLES_FN,
        InvocationType: "Event", // fire-and-forget
        Payload:        Buffer.from(JSON.stringify({ userId, interests })),
      })
    );

    console.log(`Triggered generate-articles for user=${userId}${isDeveloper ? " [developer]" : ""}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Interests updated. Articles are being generated.",
        interests,
        articlesReady: false,
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
