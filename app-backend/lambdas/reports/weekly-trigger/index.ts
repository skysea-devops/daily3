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
        // NOT: Pro filtresi bilinçli olarak kodda (plan !== "pro" → continue).
        // Expression'da kullanılmayan değer bırakmak ValidationException üretir —
        // 2026-07-12'de tüm Pro trend raporlarının atlanmasının nedeni buydu.
        ExpressionAttributeValues: { ":profile": "PROFILE" },
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

// SES gonderim hizi tavani: Frankfurt'ta 14 e-posta/saniye.
//
// Fan-out "Event" invoke oldugu icin tetiklenen her Lambda hemen basliyor ve
// sonunda bir SES cagrisi yapiyor — yani e-posta hizi, dagitim hizini takip
// ediyor. Onceki ayar (10 invoke / 500ms) saniyede 20 gonderim demekti ve tek
// batch'i asan her calistirmada SES limitini asiyordu. Asim sessizdi: throttling
// hatasi deliver-daily icinde yakalanip loglaniyor, kullanici mail almiyordu.
//
// 10 invoke / 1000ms = saniyede 10 gonderim; 14'un altinda emniyet payi birakir.
// Limit artarsa (SES konsolundan quota yukseltilirse) BATCH_SIZE degil,
// BATCH_DELAY_MS asagi cekilmelidir.
const BATCH_SIZE     = 10;
const BATCH_DELAY_MS = 1000;

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
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`Weekly trigger complete — region=${region}, ${users.length} Pro users`);
};
