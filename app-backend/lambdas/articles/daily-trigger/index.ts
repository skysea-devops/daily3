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

async function ensureCategoryPick(category: string, activeSubTopics: string[]): Promise<EnsureResult> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName:   GENERATE_CATEGORY_PICKS_FUNCTION,
    InvocationType: "RequestResponse",
    Payload:        Buffer.from(JSON.stringify({ category, activeSubTopics })),
  }));

  if (res.FunctionError) {
    throw new Error(`generate-category-picks errored for "${category}": ${res.FunctionError}`);
  }

  const payload = res.Payload ? JSON.parse(new TextDecoder().decode(res.Payload)) : null;
  return (payload ?? { status: "failed", category, generated: false }) as EnsureResult;
}

// Hesabın eşzamanlı Lambda limiti düşük olabilir (yeni hesaplarda varsayılan 10).
// 15 senkron invoke'u tek seferde atmak ConcurrentInvocationLimitExceeded (429)
// üretir — 2026-07-11 prod'da 6/15 kategori tam bu sebeple üretilemedi. Çözüm:
// sınırlı paralellik (1 trigger + 4 invoke = 5 eşzamanlı) + throttle'da retry.
const PHASE_A_PARALLELISM    = 4;
const PHASE_A_MAX_ATTEMPTS   = 3;
const PHASE_A_RETRY_DELAY_MS = 8_000; // bir üretim dalgası ~10 sn — retry anına kadar kapasite boşalır

async function ensureCategoryPickWithRetry(category: string, activeSubTopics: string[]): Promise<EnsureResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ensureCategoryPick(category, activeSubTopics);
    } catch (err: any) {
      const throttled = err?.name === "TooManyRequestsException" || err?.$metadata?.httpStatusCode === 429;
      if (throttled && attempt < PHASE_A_MAX_ATTEMPTS) {
        console.warn(`Throttled ensuring "${category}" (attempt ${attempt}/${PHASE_A_MAX_ATTEMPTS}), retrying in ${PHASE_A_RETRY_DELAY_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, PHASE_A_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
}

async function ensureCategoryPicks(categories: string[], activeSubTopicsByCategory: Map<string, Set<string>>): Promise<Set<string>> {
  const readyCategories = new Set<string>();
  if (categories.length === 0) return readyCategories;

  console.log(`Phase A: ensuring ${categories.length} category pick(s): ${categories.join(", ")}`);

  let ready = 0, generated = 0, failed = 0;

  for (let i = 0; i < categories.length; i += PHASE_A_PARALLELISM) {
    const wave    = categories.slice(i, i + PHASE_A_PARALLELISM);
    const results = await Promise.allSettled(
      wave.map(category => ensureCategoryPickWithRetry(category, [...(activeSubTopicsByCategory.get(category) ?? new Set<string>())]))
    );

    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value.status === "ready") {
        ready++;
        readyCategories.add(r.value.category);
        if (r.value.generated) generated++;
      } else {
        failed++;
        const reason = r.status === "rejected" ? r.reason : `status=${r.value.status}`;
        console.warn(`Category pick not ready: "${wave[j]}" —`, reason);
      }
    });
  }

  console.log(`Phase A complete: ${ready}/${categories.length} ready (${generated} freshly generated, ${failed} failed)`);
  return readyCategories;
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
  // Tek scan ile iki veri seti çıkarılır:
  // 1) Bu cron bölgesinde teslimat yapılacak kullanıcılar.
  // 2) Tüm bölgelerde seçilmiş topic/alt-topic kapsamı. EU ilk cron olduğundan
  //    küresel kapsamı kullanarak günün havuzlarını bir kez üretir.
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const users: TriggerUser[] = [];
  const activeSubTopicsByCategory = new Map<string, Set<string>>();
  const activeCategories = new Set<string>();

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName:                 USERS_TABLE,
        FilterExpression:          "SK = :profile AND attribute_exists(interests)",
        ExpressionAttributeValues: { ":profile": "PROFILE" },
        ExpressionAttributeNames:  { "#plan": "plan", "#region": "region" },
        ProjectionExpression:      "PK, interests, subTopics, email, #plan, #region",
        ExclusiveStartKey:         lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      const interests = item.interests as string[] | undefined;
      if (!Array.isArray(interests) || interests.length < 1 || interests.length > 3) continue;

      const subTopics = (item.subTopics as Record<string, string[]> | undefined) ?? {};

      // Havuz kapsamı bölgeden bağımsızdır. Yalnızca tanımlı ana topic'ler eklenir.
      for (const category of interests) {
        if (!RSS_SOURCES[category]) continue;
        activeCategories.add(category);
        const set = activeSubTopicsByCategory.get(category) ?? new Set<string>();
        for (const subTopic of subTopics[category] ?? []) {
          const clean = typeof subTopic === "string" ? subTopic.trim() : "";
          if (clean) set.add(clean);
        }
        activeSubTopicsByCategory.set(category, set);
      }

      // Teslimat yalnızca bu cron'un bölgesindeki kullanıcılar için yapılır.
      const userRegion = (item.region as string | undefined) ?? "EU";
      if (userRegion !== region) continue;

      const userId = (item.PK as string).replace("USER#", "");
      users.push({
        userId,
        interests,
        subTopics,
        email: (item.email as string | undefined),
        plan:  (item.plan as string | undefined) ?? "free",
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  // ── Kullanıcıları yollara ayır ──────────────────────────────────────────────
  const pooledFree: TriggerUser[] = [];
  const pooledPro:  TriggerUser[] = [];
  const legacy:     TriggerUser[] = [];

  for (const user of users) {
    const validInterests = user.interests.every(category => Boolean(RSS_SOURCES[category]));
    const isPro = user.plan.toLowerCase() === "pro";

    if (isPro && validInterests) {
      pooledPro.push(user);
    } else if (!isPro && user.interests.length === 1 && validInterests) {
      pooledFree.push(user);
    } else {
      legacy.push(user);
      console.warn(
        `Legacy/fallback route user=${user.userId} plan=${user.plan} interests=${user.interests.join(", ")}`
      );
    }
  }

  console.log(
    `Found ${users.length} users in region=${region} — pooled-free=${pooledFree.length}, pooled-pro=${pooledPro.length}, legacy=${legacy.length}`
  );

  // ── Faz A ───────────────────────────────────────────────────────────────────
  // Yalnızca gerçekten seçilmiş topic'ler için havuz oluşturulur. EU ilk cron
  // olduğundan tüm bölgelerin aktif topic ve alt-topic kapsamını kullanır.
  // Sonraki bölge cron'ları aynı kayıtları ready-check ile tekrar üretmez.
  const categories = [...activeCategories].sort();
  const readyCategories = await ensureCategoryPicks(categories, activeSubTopicsByCategory);

  // ── Faz B ───────────────────────────────────────────────────────────────────
  // A user is sent to pool delivery only when every required topic pool is ready.
  // If one or more pools failed, the whole user is routed to the legacy generator.
  // This avoids partial Pro deliveries and guarantees exactly one delivery path.
  const deliveryInvocations: { functionName: string; payload: Record<string, unknown>; label: string }[] = [];
  const fallbackUsers: TriggerUser[] = [...legacy];

  for (const user of pooledFree) {
    const category = user.interests[0];
    if (!readyCategories.has(category)) {
      console.warn(`Pool unavailable; routing free user=${user.userId} to legacy generation — category=${category}`);
      fallbackUsers.push(user);
      continue;
    }

    deliveryInvocations.push({
      functionName: DELIVER_DAILY_FUNCTION,
      payload: {
        userId: user.userId,
        category,
        email: user.email,
        plan: "free",
      },
      label: `deliver free user=${user.userId}`,
    });
  }

  for (const user of pooledPro) {
    const missingCategories = user.interests.filter(category => !readyCategories.has(category));
    if (missingCategories.length > 0) {
      console.warn(
        `Pool unavailable; routing pro user=${user.userId} to legacy generation — missing=${missingCategories.join(", ")}`
      );
      fallbackUsers.push(user);
      continue;
    }

    deliveryInvocations.push({
      functionName: DELIVER_DAILY_FUNCTION,
      payload: {
        userId: user.userId,
        interests: user.interests,
        subTopics: user.subTopics,
        email: user.email,
        plan: "pro",
      },
      label: `deliver pro user=${user.userId}`,
    });
  }

  const fallbackInvocations = fallbackUsers.map(user => ({
    functionName: GENERATE_ARTICLES_FUNCTION,
    payload: {
      userId: user.userId,
      interests: user.interests,
      subTopics: user.subTopics,
      email: user.email,
      plan: user.plan,
    },
    label: `fallback generate user=${user.userId}`,
  }));

  await fanOut([...deliveryInvocations, ...fallbackInvocations]);

  console.log(
    `Daily trigger complete — region=${region}, pool-delivery=${deliveryInvocations.length}, fallback=${fallbackInvocations.length}`
  );
};
