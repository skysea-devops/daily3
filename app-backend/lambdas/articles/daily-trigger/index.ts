import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { RSS_SOURCES } from "../generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE                     = process.env.USERS_TABLE_NAME!;
const GENERATE_ARTICLES_FUNCTION      = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const GENERATE_CATEGORY_PICKS_FUNCTION = process.env.GENERATE_CATEGORY_PICKS_FUNCTION_NAME!;
const DELIVER_DAILY_FUNCTION          = process.env.DELIVER_DAILY_FUNCTION_NAME!;

// ─── İki fazlı orkestrasyon ───────────────────────────────────────────────────
// Faz A — kategori havuzu: bölgedeki havuzlu free kullanıcıların kategorileri
//   için generate-category-picks SENKRON (RequestResponse) paralel çağrılır.
//   EU günün ilk cron'u olduğundan 15 kategorinin TAMAMINI üretir; sonraki
//   bölgeler kendi kategorilerini ensure eder ve ready-check'ten anında döner
//   (EU cron'u çökmüşse üretimi devralırlar — güvenlik ağı).
// Faz B — teslimat fan-out'u: havuzlu free kullanıcılar deliver-daily'ye
//   (Bedrock'suz kopyala+e-postala), Pro ve legacy free (2-3 interest)
//   kullanıcılar eskisi gibi generate-articles'a async gönderilir.
// Teslimat üretim bittikten sonra başladığı için "seçim henüz yok" durumu
// yapısal olarak oluşmaz.

interface TriggerUser {
  userId:     string;
  interests:  string[];
  subTopics:  Record<string, string[]>;
  email?:     string;
  plan:       string;
}

interface EnsureResult {
  status:    "ready" | "failed";
  category:  string;
  generated: boolean;
}

// ─── Faz A: kategori havuzunu hazırla ─────────────────────────────────────────

async function ensureCategoryPick(category: string): Promise<EnsureResult> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName:   GENERATE_CATEGORY_PICKS_FUNCTION,
    InvocationType: "RequestResponse",
    Payload:        Buffer.from(JSON.stringify({ category })),
  }));

  if (res.FunctionError) {
    throw new Error(`generate-category-picks errored for "${category}": ${res.FunctionError}`);
  }

  const payload = res.Payload ? JSON.parse(new TextDecoder().decode(res.Payload)) : null;
  return (payload ?? { status: "failed", category, generated: false }) as EnsureResult;
}

async function ensureCategoryPicks(categories: string[]): Promise<void> {
  if (categories.length === 0) return;

  console.log(`Phase A: ensuring ${categories.length} category pick(s): ${categories.join(", ")}`);

  const results = await Promise.allSettled(categories.map(ensureCategoryPick));

  let ready = 0, generated = 0, failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.status === "ready") {
      ready++;
      if (r.value.generated) generated++;
    } else {
      failed++;
      const reason = r.status === "rejected" ? r.reason : `status=${r.value.status}`;
      console.warn(`Category pick not ready: "${categories[i]}" —`, reason);
    }
  });

  console.log(`Phase A complete: ${ready}/${categories.length} ready (${generated} freshly generated, ${failed} failed)`);
}

// ─── Faz B: fan-out ───────────────────────────────────────────────────────────

async function fanOut(
  invocations: { functionName: string; payload: Record<string, unknown>; label: string }[]
): Promise<void> {
  const BATCH_SIZE = 10;

  for (let i = 0; i < invocations.length; i += BATCH_SIZE) {
    const batch = invocations.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(({ functionName, payload, label }) =>
        lambda.send(
          new InvokeCommand({
            FunctionName:   functionName,
            InvocationType: "Event", // fire-and-forget
            Payload:        Buffer.from(JSON.stringify(payload)),
          })
        ).then(() => {
          console.log(`Triggered ${label}`);
        }).catch((err) => {
          console.error(`Failed to trigger ${label}:`, err);
        })
      )
    );

    // Batch'ler arası 500ms bekle
    if (i + BATCH_SIZE < invocations.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event: { region?: string } = {}): Promise<void> => {
  const region = event.region ?? "EU"; // EventBridge her bölge için ayrı cron ile region geçer
  console.log(`Daily trigger started — region=${region} —`, new Date().toISOString());

  // ── Kullanıcıları tara ──────────────────────────────────────────────────────
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const users: TriggerUser[] = [];

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

      // Free plan 1, Pro plan 3 interest kullanır — 1..3 aralığındaki herkesi işle.
      if (Array.isArray(interests) && interests.length >= 1 && interests.length <= 3) {
        const userId = (item.PK as string).replace("USER#", "");
        users.push({
          userId,
          interests,
          subTopics: (item.subTopics as Record<string, string[]> | undefined) ?? {},
          email:     (item.email as string | undefined),
          plan:      (item.plan as string | undefined) ?? "free",
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  // ── Kullanıcıları yollara ayır ──────────────────────────────────────────────
  // Havuz: free + tam 1 interest + kategori RSS_SOURCES'ta tanımlı.
  // Legacy: free ama hâlâ 2-3 interest taşıyan eski kayıtlar → eski per-user
  //   yol. Migration tamamlanınca bu sayaç sıfırlanmalı ve yol kaldırılabilir.
  const pooledFree: TriggerUser[] = [];
  const perUser:    TriggerUser[] = []; // Pro + legacy free

  for (const u of users) {
    const isFree = u.plan.toLowerCase() !== "pro";
    if (isFree && u.interests.length === 1 && RSS_SOURCES[u.interests[0]]) {
      pooledFree.push(u);
    } else {
      if (isFree) console.warn(`Legacy multi-interest free user routed to per-user generate — user=${u.userId} interests=${u.interests.length}`);
      perUser.push(u);
    }
  }

  console.log(`Found ${users.length} users in region=${region} — pooled-free=${pooledFree.length}, per-user=${perUser.length}`);

  // ── Faz A ───────────────────────────────────────────────────────────────────
  // EU günün ilk cron'u: tüm kategorileri üret (kategori başına günde 1 kez).
  // Diğer bölgeler yalnızca kendi havuz kategorilerini ensure eder.
  const categories = region === "EU"
    ? Object.keys(RSS_SOURCES)
    : [...new Set(pooledFree.map(u => u.interests[0]))];

  await ensureCategoryPicks(categories);

  // ── Faz B ───────────────────────────────────────────────────────────────────
  const invocations = [
    ...pooledFree.map(u => ({
      functionName: DELIVER_DAILY_FUNCTION,
      payload:      { userId: u.userId, category: u.interests[0], email: u.email },
      label:        `deliver for user=${u.userId}`,
    })),
    ...perUser.map(u => ({
      functionName: GENERATE_ARTICLES_FUNCTION,
      payload:      { userId: u.userId, interests: u.interests, subTopics: u.subTopics, email: u.email, plan: u.plan },
      label:        `generate for user=${u.userId}`,
    })),
  ];

  await fanOut(invocations);

  console.log(`Daily trigger complete — region=${region}, ${pooledFree.length} delivered (pooled), ${perUser.length} generated (per-user)`);
};
