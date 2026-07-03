import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE                = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;

export const handler = async (event: { region?: string } = {}): Promise<void> => {
  const region = event.region ?? "EU"; // EventBridge her bölge için ayrı cron ile region geçer
  console.log(`Daily trigger started — region=${region} —`, new Date().toISOString());

  // Tüm kullanıcıları tara — interests olan kayıtları çek
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const users: { userId: string; interests: string[]; subTopics?: Record<string, string[]>; email?: string; plan?: string }[] = [];

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName:                 USERS_TABLE,
        FilterExpression:          "SK = :profile AND attribute_exists(interests)",
        ExpressionAttributeValues: { ":profile": "PROFILE" },
        ExpressionAttributeNames:  { "#plan": "plan", "#region": "region" }, // plan/region rezerve kelime olabilir
        ProjectionExpression:      "PK, interests, subTopics, email, #plan, #region",
        ExclusiveStartKey:         lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      const interests = item.interests as string[] | undefined;
      // Sadece bu cron'un bölgesindeki kullanıcılar — region yoksa EU varsay
      const userRegion = (item.region as string | undefined) ?? "EU";
      if (userRegion !== region) continue;

      if (Array.isArray(interests) && interests.length === 3) {
        // PK formatı: USER#<cognito-sub>
        const userId = (item.PK as string).replace("USER#", "");
        users.push({
          userId,
          interests,
          subTopics: (item.subTopics as Record<string, string[]> | undefined) ?? {},
          email: (item.email as string | undefined),
          plan:  (item.plan as string | undefined) ?? "free",
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(`Found ${users.length} users in region=${region}`);

  // Her kullanıcı için generate-articles'ı paralel invoke et
  // 10'arlı batch — Lambda concurrency limitini aşmamak için
  const BATCH_SIZE = 10;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(({ userId, interests, subTopics, email, plan }) =>
        lambda.send(
          new InvokeCommand({
            FunctionName:   GENERATE_ARTICLES_FUNCTION,
            InvocationType: "Event", // fire-and-forget
            Payload:        Buffer.from(
              JSON.stringify({ userId, interests, subTopics, email, plan })
            ),
          })
        ).then(() => {
          console.log(`Triggered generate for user=${userId}`);
        }).catch((err) => {
          console.error(`Failed to trigger for user=${userId}:`, err);
        })
      )
    );

    // Batch'ler arası 500ms bekle
    if (i + BATCH_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`Daily trigger complete — region=${region}, ${users.length} users triggered`);
};