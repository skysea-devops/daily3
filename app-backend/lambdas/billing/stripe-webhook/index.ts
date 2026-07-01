import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import Stripe from "stripe";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET!;

// HTTP API v2 header'ları küçük harfe çevirir, ama garanti için case-insensitive ara
function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

// "plan" DynamoDB reserved word → ExpressionAttributeNames şart
async function setPlan(
  userId: string,
  plan: "free" | "pro",
  extra: Record<string, string> = {}
): Promise<void> {
  const names: Record<string, string> = { "#plan": "plan" };
  const values: Record<string, unknown> = { ":plan": plan, ":now": new Date().toISOString() };
  const sets = ["#plan = :plan", "updatedAt = :now"];

  for (const [key, val] of Object.entries(extra)) {
    sets.push(`${key} = :${key}`);
    values[`:${key}`] = val;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // KRİTİK: imza doğrulaması EXACT ham gövdeye göre yapılır — asla parse etme
    const rawBody =
      event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64")
        : event.body ?? "";

    const sig = getHeader(event, "stripe-signature");
    if (!sig) {
      return { statusCode: 400, body: "Missing stripe-signature header" };
    }

    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("Signature verification failed:", message);
      return { statusCode: 400, body: `Webhook Error: ${message}` };
    }

    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const s = stripeEvent.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id ?? s.metadata?.userId;
        if (userId) {
          const extra: Record<string, string> = {};
          if (typeof s.customer === "string") extra.stripeCustomerId = s.customer;
          else if (s.customer && "id" in s.customer) extra.stripeCustomerId = s.customer.id;
          if (typeof s.subscription === "string") extra.stripeSubscriptionId = s.subscription;
          else if (s.subscription && "id" in s.subscription) extra.stripeSubscriptionId = s.subscription.id;
          await setPlan(userId, "pro", extra);
        } else {
          console.warn("checkout.session.completed without userId:", s.id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (userId) {
          // active / trialing / past_due → Pro kalsın (yeniden deneme şansı); diğerleri → free
          const stillPro = ["active", "trialing", "past_due"].includes(sub.status);
          await setPlan(userId, stillPro ? "pro" : "free", { stripeSubscriptionId: sub.id });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (userId) {
          await setPlan(userId, "free");
        }
        break;
      }

      default:
        // Diğer event'leri onayla ki Stripe tekrar denemesin
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (error) {
    console.error("stripe-webhook error:", error);
    // 500 → Stripe geçici hatalarda tekrar dener
    return { statusCode: 500, body: "Internal server error" };
  }
};
