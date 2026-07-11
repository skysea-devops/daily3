import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Article, Podcast, CategoryDailyPicks, Keys } from "../../../shared/types";
import { RSS_SOURCES, canonicalizeUrl, pickArticlePool, pickPodcastPool } from "../generate-articles";
import type { RecentHistory } from "../generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const STALE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5 * 1000;
const POLL_MAX_MS = 100 * 1000;
const PLACEHOLDER_TTL = 6 * 60 * 60;

interface EnsureEvent { category: string; activeSubTopics?: string[]; }
interface EnsureResult { status: "ready" | "failed"; category: string; generated: boolean; }

async function acquireLock(pk: string, sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: { PK: pk, SK: sk, status: "generating", generatingAt: Date.now(), ttl: Math.floor(Date.now() / 1000) + PLACEHOLDER_TTL },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function takeoverStaleLock(pk: string, sk: string, previousGeneratingAt: number): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: "SET generatingAt = :now",
      ConditionExpression: "#s = :generating AND generatingAt = :prev",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":now": Date.now(), ":generating": "generating", ":prev": previousGeneratingAt },
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function fetchCategoryHistory(category: string): Promise<RecentHistory> {
  const seenUrls = new Set<string>();
  const seenSources = new Map<string, number>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: ARTICLES_TABLE,
      KeyConditionExpression: "PK = :pk AND SK >= :skStart",
      ExpressionAttributeValues: { ":pk": Keys.categoryPK(category), ":skStart": `DATE#${sevenDaysAgo.toISOString().slice(0, 10)}` },
      ProjectionExpression: "articles, podcasts",
    }));
    for (const item of result.Items ?? []) {
      for (const a of (item.articles ?? []) as Article[]) {
        if (a.url) seenUrls.add(canonicalizeUrl(a.url));
        if (a.source) seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }
      for (const p of (item.podcasts ?? []) as Podcast[]) {
        if (p.url) seenUrls.add(canonicalizeUrl(p.url));
        if (p.source) seenSources.set(p.source, (seenSources.get(p.source) ?? 0) + 1);
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch category history for ${category}:`, err);
  }
  return { seenUrls, seenSources };
}

async function generatePicks(category: string, activeSubTopics: string[], pk: string, sk: string): Promise<void> {
  const history = await fetchCategoryHistory(category);
  const [articlePool, podcastPool] = await Promise.all([
    pickArticlePool(category, history, { activeSubTopics, minSize: 10, maxSize: 20 }),
    pickPodcastPool(category, history, { activeSubTopics }),
  ]);
  const now = new Date();
  const unrepresented = [...new Set([...articlePool.unrepresentedSubTopics, ...podcastPool.unrepresentedSubTopics])];
  const item: CategoryDailyPicks = {
    PK: pk,
    SK: sk,
    articles: articlePool.articles,
    podcast: podcastPool.podcasts[0] ?? null,
    podcasts: podcastPool.podcasts,
    generatedAt: now.toISOString(),
    ttl: Keys.ttl30Days(),
    activeSubTopics,
    unrepresentedSubTopics: unrepresented,
    poolVersion: 2,
  };
  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Category pool written category=${category} articles=${item.articles.length} podcasts=${item.podcasts.length} activeSubTopics=${activeSubTopics.length}`);
}

async function waitForPick(pk: string, sk: string, category: string): Promise<EnsureResult> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await dynamo.send(new GetCommand({ TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk } }));
    const item = res.Item as CategoryDailyPicks | undefined;
    if (item?.articles?.length) return { status: "ready", category, generated: false };
  }
  return { status: "failed", category, generated: false };
}

export const handler = async (event: EnsureEvent): Promise<EnsureResult> => {
  const category = event.category;
  const activeSubTopics = [...new Set((event.activeSubTopics ?? []).map(s => s.trim()).filter(Boolean))];
  if (!category || !RSS_SOURCES[category]) return { status: "failed", category: category ?? "", generated: false };
  const pk = Keys.categoryPK(category);
  const sk = Keys.dateSK(new Date());
  const existing = await dynamo.send(new GetCommand({ TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk } }));
  const item = existing.Item as CategoryDailyPicks | undefined;
  if (item?.articles?.length) return { status: "ready", category, generated: false };

  let holdLock = false;
  if (!item) holdLock = await acquireLock(pk, sk);
  else if (item.status === "generating") {
    const generatingAt = typeof item.generatingAt === "number" ? item.generatingAt : 0;
    if (Date.now() - generatingAt > STALE_MS) holdLock = await takeoverStaleLock(pk, sk, generatingAt);
  }
  if (!holdLock) return waitForPick(pk, sk, category);
  try {
    await generatePicks(category, activeSubTopics, pk, sk);
    return { status: "ready", category, generated: true };
  } catch (err) {
    console.error(`Category pool generation failed category=${category}:`, err);
    return { status: "failed", category, generated: false };
  }
};
