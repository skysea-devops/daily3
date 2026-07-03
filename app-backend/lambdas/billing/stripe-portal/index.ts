import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import Stripe from "stripe";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const APP_URL          = process.env.APP_URL!;
const CORS_ORIGIN      = process.env.CORS_ORIGIN ?? "*";

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

    const result = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        ProjectionExpression: "stripeCustomerId",
      })
    );

    const customerId = result.Item?.stripeCustomerId as string | undefined;
    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "No billing account found for this user" }),
      };
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings`,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: portal.url }) };
  } catch (error) {
    console.error("stripe-portal error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
