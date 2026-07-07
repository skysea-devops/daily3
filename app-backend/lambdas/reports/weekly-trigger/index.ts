import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE                    = process.env.USERS_TABLE_NAME!;
const GENERATE_TREND_REPORT_FUNCTION = process.env.GENERATE_TREND_REPORT_FUNCTION_NAME!;

// Her Pazar sabahı bölgesel cron ile çalışır; SADECE Pro kullanıcılar için
// haftalık trend raporu üretimini tetikler.
export const handler = async (event: { region?: string } = {}): Promise<void> => {
  const region = event.region ?? "EU";
  console.log(`Weekly trigger started — region=${region} —`, new Date().toISOString());

  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const users: { userId: string; interests: string[]; email?: string }[] = [];

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName:                 USERS_TABLE,
        FilterExpression:          "SK = :profile AND attribute_exists(interests)",
        ExpressionAttributeValues: { ":profile": "PROFILE", ":pro": "pro" },
        ExpressionAttributeNames:  { "#plan": "plan", "#region": "region" },
        ProjectionExpression:      "PK, interests, email, #plan, #region",
        ExclusiveStartKey:         lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      const interests  = item.interests as string[] | undefined;
      const userRegion = (item.region as string | undefined) ?? "EU";
      const plan       = (item.plan as string | undefined) ?? "free";

      // Sadece bu bölgedeki PRO kullanıcılar
      if (userRegion !== region) continue;
      if (plan !== "pro") continue;

      if (Array.isArray(interests) && interests.length >= 1) {
        const userId = (item.PK as string).replace("USER#", "");
        users.push({ userId, interests, email: item.email as string | undefined });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(`Found ${users.length} Pro users in region=${region}`);

  const BATCH_SIZE = 10;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(({ userId, interests, email }) =>
        lambda.send(
          new InvokeCommand({
            FunctionName:   GENERATE_TREND_REPORT_FUNCTION,
            InvocationType: "Event",
            Payload:        Buffer.from(JSON.stringify({ userId, interests, email, plan: "pro" })),
          })
        ).then(() => console.log(`Triggered trend report for user=${userId}`))
         .catch((err) => console.error(`Failed trend trigger for user=${userId}:`, err))
      )
    );
    if (i + BATCH_SIZE < users.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`Weekly trigger complete — region=${region}, ${users.length} Pro users`);
};
