import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import Stripe from "stripe";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const PRICE_ID         = process.env.STRIPE_PRICE_ID!;
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

    // email JWT access token'ında yok — body'den al (yoksa id-token claim'ine düş)
    const body = JSON.parse(event.body ?? "{}") as { email?: unknown };
    const email =
      typeof body.email === "string"
        ? body.email
        : (claims["email"] as string | undefined);

    // Bu kullanıcı için daha önce Stripe customer oluşturulduysa yeniden kullan
    const existing = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        ProjectionExpression: "stripeCustomerId",
      })
    );

    let customerId = existing.Item?.stripeCustomerId as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;

      await dynamo.send(
        new UpdateCommand({
          TableName: USERS_TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: "PROFILE" },
          UpdateExpression: "SET stripeCustomerId = :c",
          ExpressionAttributeValues: { ":c": customerId },
        })
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      // subscription.updated / .deleted webhook'larında userId'yi geri bulmak için
      subscription_data: { metadata: { userId } },
      success_url: `${APP_URL}/settings?checkout=success`,
      cancel_url: `${APP_URL}/settings?checkout=cancel`,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (error) {
    console.error("create-checkout error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
