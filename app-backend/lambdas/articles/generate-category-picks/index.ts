import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Article, Podcast, CategoryDailyPicks, Keys } from "../../../shared/types";
import { RSS_SOURCES, pickArticle, pickPodcast } from "../generate-articles";
import type { RecentHistory } from "../generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;

// ─── Ensure semantiği ─────────────────────────────────────────────────────────
// Bu Lambda "üret" değil "hazır olduğundan emin ol" fonksiyonudur. Bölgesel
// cron'lar (EU 04:00, US_EAST 11:00, US_WEST 14:00, ASIA 23:00 UTC) hepsi bunu
// çağırır; günün ilk çağrısı üretir, sonrakiler ready-check'ten anında döner.
// Aynı ana denk gelen çağrılar DynamoDB conditional-write lock ile tekilleşir
// (get-articles'daki generation lock pattern'inin kategori seviyesine taşınmış
// hali). Kilit sahibi crash ederse STALE_MS sonra bir sonraki çağrı devralır.

const STALE_MS         = 5 * 60 * 1000;  // kilit bayatlığı — generate ~30 sn sürer, 5 dk bol pay
const POLL_INTERVAL_MS = 5 * 1000;       // başkası üretiyorsa bekleme aralığı
const POLL_MAX_MS      = 100 * 1000;     // toplam bekleme (Lambda timeout 150 sn'nin altında)
const PLACEHOLDER_TTL  = 6 * 60 * 60;    // her ihtimale karşı placeholder 6 saatte TTL ile silinir

interface EnsureEvent {
  category: string;
}

interface EnsureResult {
  status:    "ready" | "failed";
  category:  string;
  /** true → içerik bu invocation'da üretildi; false → hazır bulundu */
  generated: boolean;
}

// ─── Lock helpers ─────────────────────────────────────────────────────────────

/** Placeholder yaz — item hiç yoksa kilit bizde. */
async function acquireLock(pk: string, sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: {
        PK:           pk,
        SK:           sk,
        status:       "generating",
        generatingAt: Date.now(),
        ttl:          Math.floor(Date.now() / 1000) + PLACEHOLDER_TTL,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/** Bayat kilidi devral — generatingAt hâlâ eski değerse tek çağrı kazanır. */
async function takeoverStaleLock(pk: string, sk: string, previousGeneratingAt: number): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression:          "SET generatingAt = :now",
      ConditionExpression:       "#s = :generating AND generatingAt = :prev",
      ExpressionAttributeNames:  { "#s": "status" },
      ExpressionAttributeValues: {
        ":now":        Date.now(),
        ":generating": "generating",
        ":prev":       previousGeneratingAt,
      },
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

// ─── Kategori geçmişi ─────────────────────────────────────────────────────────
// Tekrar önleme kategori seviyesinde: son 7 günün CATEGORY# seçimleri prompt'a
// girer. Havuzlu bir free kullanıcının geçmişi kategori geçmişinin alt kümesi
// olduğundan kullanıcı bazlı ayrıca kontrol gerekmez.

async function fetchCategoryHistory(category: string): Promise<RecentHistory> {
  const seenUrls    = new Set<string>();
  const seenSources = new Map<string, number>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const skStart      = `DATE#${sevenDaysAgo.toISOString().slice(0, 10)}`;

  try {
    const result = await dynamo.send(new QueryCommand({
      TableName:                 ARTICLES_TABLE,
      KeyConditionExpression:    "PK = :pk AND SK >= :skStart",
      ExpressionAttributeValues: { ":pk": Keys.categoryPK(category), ":skStart": skStart },
      ProjectionExpression:      "articles, podcasts",
    }));

    for (const item of result.Items ?? []) {
      for (const a of (item.articles ?? []) as Article[]) {
        if (a.url)    seenUrls.add(a.url);
        if (a.source) seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }
      for (const p of (item.podcasts ?? []) as Podcast[]) {
        if (p.url)    seenUrls.add(p.url);
        if (p.source) seenSources.set(p.source, (seenSources.get(p.source) ?? 0) + 1);
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch category history for ${category}:`, err);
  }

  return { seenUrls, seenSources };
}

// ─── Üretim ───────────────────────────────────────────────────────────────────

async function generatePicks(category: string, pk: string, sk: string): Promise<void> {
  const history = await fetchCategoryHistory(category);
  console.log(`Category=${category}: history ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`);

  // Havuz seçimi kişisel bağlam taşımaz: sub-topic Pro'ya özel olduğundan
  // subTopicContext boş, exclude seti tek seçimde gereksiz.
  const article = await pickArticle([category], history, "", new Set());
  const podcast = await pickPodcast([category], history, "", new Set());

  const now  = new Date();
  const item: CategoryDailyPicks = {
    PK:          pk,
    SK:          sk,
    articles:    [article],
    podcast:     podcast ?? null,
    podcasts:    podcast ? [podcast] : [],
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  // Koşulsuz Put: placeholder'ın üstüne gerçek içerik yazılır
  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Category pick written — category=${category} date=${sk} article="${article.title}" podcast=${podcast ? `"${podcast.title}"` : "none"}`);
}

// ─── Bekleme (başka invocation üretiyorsa) ────────────────────────────────────

async function waitForPick(pk: string, sk: string, category: string): Promise<EnsureResult> {
  const deadline = Date.now() + POLL_MAX_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res  = await dynamo.send(new GetCommand({ TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk } }));
    const item = res.Item as CategoryDailyPicks | undefined;

    if (item?.articles?.length) {
      console.log(`Category pick became ready while waiting — category=${category}`);
      return { status: "ready", category, generated: false };
    }
  }

  console.warn(`Category pick wait timed out — category=${category}. Another invocation may have stalled; stale takeover happens after ${STALE_MS / 60000} min.`);
  return { status: "failed", category, generated: false };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event: EnsureEvent): Promise<EnsureResult> => {
  const category = event.category;

  if (!category || !RSS_SOURCES[category]) {
    console.warn(`Unknown category requested: "${category}"`);
    return { status: "failed", category: category ?? "", generated: false };
  }

  const pk = Keys.categoryPK(category);
  const sk = Keys.dateSK(new Date());

  // 1) Ready-check: günün ilk cron'undan sonraki tüm çağrılar buradan döner
  const existing = await dynamo.send(new GetCommand({ TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk } }));
  const item     = existing.Item as CategoryDailyPicks | undefined;

  if (item?.articles?.length) {
    console.log(`Category pick already ready — category=${category} date=${sk}`);
    return { status: "ready", category, generated: false };
  }

  // 2) Kilidi almayı dene
  let holdLock = false;

  if (!item) {
    holdLock = await acquireLock(pk, sk);
  } else if (item.status === "generating") {
    const generatingAt = typeof item.generatingAt === "number" ? item.generatingAt : 0;
    if (Date.now() - generatingAt > STALE_MS) {
      holdLock = await takeoverStaleLock(pk, sk, generatingAt);
      if (holdLock) console.warn(`Took over stale lock — category=${category} (generatingAt=${generatingAt})`);
    }
  }

  // 3) Kilit başkasında → hazır olmasını bekle
  if (!holdLock) {
    console.log(`Another invocation is generating — category=${category}, waiting`);
    return waitForPick(pk, sk, category);
  }

  // 4) Kilit bizde → üret
  try {
    await generatePicks(category, pk, sk);
    return { status: "ready", category, generated: true };
  } catch (err) {
    console.error(`Category pick generation failed — category=${category}:`, err);
    // Placeholder yerinde kalır; STALE_MS sonra bir sonraki çağrı devralır
    return { status: "failed", category, generated: false };
  }
};
