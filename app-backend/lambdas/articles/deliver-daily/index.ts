import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Article, Podcast, CategoryDailyPicks, DailyArticles, Keys } from "../../../shared/types";
import { canonicalizeUrl, sendDailyEmail } from "../generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";

const MAX_PRO_PODCASTS = 2;

// ─── deliver-daily ────────────────────────────────────────────────────────────
// Free: ortak topic havuzundan ilk makale + ilk podcast teslim edilir.
// Pro: her ana topic havuzundan, kullanıcının alt-topic tercihleri ve son 7 günlük
// geçmişi dikkate alınarak bir makale seçilir; toplam en fazla iki podcast seçilir.
// Bu Lambda Bedrock veya RSS çağrısı yapmaz.

interface DeliverEvent {
  userId:       string;
  /** Geriye uyumlu free event alanı. */
  category?:    string;
  /** Pro veya yeni format için ana topic listesi. */
  interests?:   string[];
  subTopics?:   Record<string, string[]>;
  plan?:        string;
  email?:       string;
  userEmail?:   string;
}

interface RecentHistory {
  seenUrls: Set<string>;
  seenSources: Map<string, number>;
}

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName:            USERS_TABLE,
      Key:                  { PK: Keys.userPK(userId), SK: "PROFILE" },
      ProjectionExpression: "email",
    }));
    return (result.Item?.email as string) ?? null;
  } catch (err) {
    console.warn("Failed to fetch user email:", err);
    return null;
  }
}

async function fetchRecentHistory(userId: string): Promise<RecentHistory> {
  const seenUrls = new Set<string>();
  const seenSources = new Map<string, number>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: ARTICLES_TABLE,
      KeyConditionExpression: "PK = :pk AND SK >= :skStart",
      ExpressionAttributeValues: {
        ":pk": Keys.userPK(userId),
        ":skStart": `DATE#${sevenDaysAgo.toISOString().slice(0, 10)}`,
      },
      ProjectionExpression: "articles, podcast, podcasts",
    }));

    for (const item of result.Items ?? []) {
      for (const article of (item.articles ?? []) as Article[]) {
        if (article.url) seenUrls.add(canonicalizeUrl(article.url));
        if (article.source) seenSources.set(article.source, (seenSources.get(article.source) ?? 0) + 1);
      }

      const storedPodcasts = Array.isArray(item.podcasts)
        ? item.podcasts as Podcast[]
        : item.podcast
          ? [item.podcast as Podcast]
          : [];

      for (const podcast of storedPodcasts) {
        if (podcast.url) seenUrls.add(canonicalizeUrl(podcast.url));
        if (podcast.source) seenSources.set(podcast.source, (seenSources.get(podcast.source) ?? 0) + 1);
      }
    }
  } catch (err) {
    // Havuz dağıtımı geçmiş okunamadığı için tamamen durmamalı.
    console.warn("Failed to fetch recent history; continuing without it:", err);
  }

  return { seenUrls, seenSources };
}

function normaliseLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subTopicMatchCount(contentSubTopics: string[] | undefined, selectedSubTopics: string[]): number {
  if (!contentSubTopics?.length || selectedSubTopics.length === 0) return 0;
  const selected = new Set(selectedSubTopics.map(normaliseLabel).filter(Boolean));
  return contentSubTopics.reduce((count, subTopic) =>
    count + (selected.has(normaliseLabel(subTopic)) ? 1 : 0), 0);
}

function articleScore(
  article: Article,
  index: number,
  selectedSubTopics: string[],
  history: RecentHistory,
  usedSources: Map<string, number>,
): number {
  const matchCount = subTopicMatchCount(article.subTopics, selectedSubTopics);
  const quality = Number.isFinite(article.qualityScore) ? article.qualityScore! : 0;
  const rank = Number.isFinite(article.poolRank) ? article.poolRank! : index + 1;
  const recentSourceCount = history.seenSources.get(article.source) ?? 0;
  const currentSourceCount = usedSources.get(article.source) ?? 0;

  return (
    matchCount * 1000 +
    quality * 5 -
    rank * 10 -
    recentSourceCount * 60 -
    currentSourceCount * 250
  );
}

function podcastScore(
  podcast: Podcast,
  index: number,
  selectedSubTopics: string[],
  history: RecentHistory,
  usedSources: Map<string, number>,
): number {
  const matchCount = subTopicMatchCount(podcast.subTopics, selectedSubTopics);
  const quality = Number.isFinite(podcast.qualityScore) ? podcast.qualityScore! : 0;
  const rank = Number.isFinite(podcast.poolRank) ? podcast.poolRank! : index + 1;
  const recentSourceCount = history.seenSources.get(podcast.source) ?? 0;
  const currentSourceCount = usedSources.get(podcast.source) ?? 0;

  return (
    matchCount * 1000 +
    quality * 5 -
    rank * 10 -
    recentSourceCount * 60 -
    currentSourceCount * 250
  );
}

function selectArticleFromPool(
  pool: Article[],
  selectedSubTopics: string[],
  history: RecentHistory,
  usedUrls: Set<string>,
  usedSources: Map<string, number>,
): Article | null {
  const available = pool
    .map((article, index) => ({ article, index, url: canonicalizeUrl(article.url) }))
    .filter(({ article, url }) => article.url && !usedUrls.has(url) && !history.seenUrls.has(url));

  // Büyük havuzda normalde görülmemiş içerik bulunur. Tamamı daha önce görüldüyse
  // günlük teslimatı boş bırakmamak için yalnızca bu kullanıcı koşusunda tekrar
  // edilmeyen en iyi havuz öğesine kontrollü fallback yapılır.
  const candidates = available.length > 0
    ? available
    : pool
        .map((article, index) => ({ article, index, url: canonicalizeUrl(article.url) }))
        .filter(({ article, url }) => article.url && !usedUrls.has(url));

  candidates.sort((a, b) =>
    articleScore(b.article, b.index, selectedSubTopics, history, usedSources) -
    articleScore(a.article, a.index, selectedSubTopics, history, usedSources));

  return candidates[0]?.article ?? null;
}

function selectPodcastFromPool(
  pool: Podcast[],
  selectedSubTopics: string[],
  history: RecentHistory,
  usedUrls: Set<string>,
  usedSources: Map<string, number>,
): Podcast | null {
  const available = pool
    .map((podcast, index) => ({ podcast, index, url: canonicalizeUrl(podcast.url) }))
    .filter(({ podcast, url }) => podcast.url && !usedUrls.has(url) && !history.seenUrls.has(url));

  const candidates = available.length > 0
    ? available
    : pool
        .map((podcast, index) => ({ podcast, index, url: canonicalizeUrl(podcast.url) }))
        .filter(({ podcast, url }) => podcast.url && !usedUrls.has(url));

  candidates.sort((a, b) =>
    podcastScore(b.podcast, b.index, selectedSubTopics, history, usedSources) -
    podcastScore(a.podcast, a.index, selectedSubTopics, history, usedSources));

  return candidates[0]?.podcast ?? null;
}

async function fetchCategoryPool(category: string, dateSK: string): Promise<CategoryDailyPicks | null> {
  const result = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE,
    Key: { PK: Keys.categoryPK(category), SK: dateSK },
  }));
  const pool = result.Item as CategoryDailyPicks | undefined;
  return pool?.articles?.length ? pool : null;
}

export const handler = async (event: DeliverEvent): Promise<void> => {
  const userId = event.userId;
  const isPro = (event.plan ?? "free").toLowerCase() === "pro";
  const interests = Array.isArray(event.interests) && event.interests.length > 0
    ? event.interests
    : event.category
      ? [event.category]
      : [];
  const subTopics = event.subTopics ?? {};

  if (!userId || interests.length === 0) {
    throw new Error("userId and at least one category/interest are required.");
  }

  const userPK = Keys.userPK(userId);
  const dateSK = Keys.dateSK(new Date());
  console.log(`Delivering for user=${userId} plan=${isPro ? "pro" : "free"} interests=${interests.join(", ")} date=${dateSK}`);

  // Erken on-demand üretim varsa üzerine yazma ve çift e-posta gönderme.
  const existingRes = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE,
    Key: { PK: userPK, SK: dateSK },
  }));
  const existing = existingRes.Item as DailyArticles | undefined;
  if (Array.isArray(existing?.articles) && existing.articles.length > 0) {
    console.log(`User already has content today — user=${userId}, skipping pool delivery and email`);
    return;
  }

  const history = isPro
    ? await fetchRecentHistory(userId)
    : { seenUrls: new Set<string>(), seenSources: new Map<string, number>() };

  const articles: Article[] = [];
  const podcasts: Podcast[] = [];
  const usedUrls = new Set<string>();
  const usedSources = new Map<string, number>();

  if (isPro) {
    for (const category of interests) {
      const pool = await fetchCategoryPool(category, dateSK);
      if (!pool) {
        console.warn(`Category pool missing — category=${category} date=${dateSK}, user=${userId}. No real article to email, skipping.`);
        continue;
      }

      const selectedForCategory = subTopics[category] ?? [];
      const article = selectArticleFromPool(
        pool.articles,
        selectedForCategory,
        history,
        usedUrls,
        usedSources,
      );

      if (article) {
        articles.push(article);
        usedUrls.add(canonicalizeUrl(article.url));
        usedSources.set(article.source, (usedSources.get(article.source) ?? 0) + 1);
      } else {
        console.warn(`No article available in pool — category=${category}, user=${userId}`);
      }

      if (podcasts.length < MAX_PRO_PODCASTS) {
        const podcastPool = pool.podcasts ?? (pool.podcast ? [pool.podcast] : []);
        const podcast = selectPodcastFromPool(
          podcastPool,
          selectedForCategory,
          history,
          usedUrls,
          usedSources,
        );
        if (podcast) {
          podcasts.push(podcast);
          usedUrls.add(canonicalizeUrl(podcast.url));
          usedSources.set(podcast.source, (usedSources.get(podcast.source) ?? 0) + 1);
        }
      }
    }
  } else {
    // Free geriye uyumluluğu: PR-1 havuzu 10–20 öğe olsa da kullanıcıya yalnızca
    // tek makale ve tek podcast teslim edilir.
    const category = interests[0];
    const pool = await fetchCategoryPool(category, dateSK);
    if (!pool) {
      console.warn(`Category pool missing — category=${category} date=${dateSK}, user=${userId}. No real article to email, skipping.`);
      return;
    }

    const article = pool.articles[0];
    if (article) articles.push(article);
    const firstPodcast = pool.podcasts?.[0] ?? pool.podcast ?? null;
    if (firstPodcast) podcasts.push(firstPodcast);
  }

  if (articles.length === 0) {
    console.warn(`No articles selected for user=${userId} — no real article to email, skipping user write and email`);
    return;
  }

  const now = new Date();
  const userItem: DailyArticles = {
    PK: userPK,
    SK: dateSK,
    articles,
    podcast: podcasts[0] ?? null,
    podcasts,
    generatedAt: now.toISOString(),
    ttl: Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: userItem }));
  console.log(`Delivered pool selection to user=${userId} (${articles.length} article(s), ${podcasts.length} podcast(s))`);

  if (SES_FROM_EMAIL) {
    const userEmail = event.email ?? event.userEmail ?? await fetchUserEmail(userId);
    if (userEmail) {
      try {
        await sendDailyEmail(userEmail, articles, podcasts);
      } catch (err) {
        console.error("Failed to send email notification:", err);
      }
    } else {
      console.warn(`No email found for user=${userId}, skipping notification`);
    }
  }
};
