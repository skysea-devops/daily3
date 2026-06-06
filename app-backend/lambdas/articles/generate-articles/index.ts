import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Article, DailyArticles, Keys } from "../../../shared/types";

const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const CORS_ORIGIN    = process.env.CORS_ORIGIN ?? "*";

// ─── RSS source map ───────────────────────────────────────────────────────────

const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {
  "Cloud & DevOps": [
    { name: "AWS DevOps Blog",  url: "https://aws.amazon.com/blogs/devops/feed/" },
    { name: "AWS Architecture", url: "https://aws.amazon.com/blogs/architecture/feed/" },
    { name: "The New Stack",    url: "https://thenewstack.io/feed/" },
    { name: "Azure Blog",       url: "https://azure.microsoft.com/en-us/blog/feed/" },
    { name: "GCP Blog",         url: "https://cloudblog.withgoogle.com/rss/" },
  ],
  "Software Engineering": [
    { name: "Stack Overflow Blog", url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",       url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",               url: "https://www.infoq.com/feed/" },
    { name: "Dev.to",              url: "https://dev.to/feed" },
  ],
  "Cyber Security": [
    { name: "The Hacker News",      url: "https://feeds.feedburner.com/TheHackersNews" },
    { name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/" },
    { name: "Krebs on Security",    url: "https://krebsonsecurity.com/feed/" },
    { name: "Dark Reading",         url: "https://www.darkreading.com/rss.xml" },
  ],
  "Technology": [
    { name: "Hacker News",  url: "https://news.ycombinator.com/rss" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Wired",        url: "https://www.wired.com/feed/rss" },
    { name: "The Next Web", url: "https://thenextweb.com/feed/" },
  ],
  "World Politics": [
    { name: "BBC World",  url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
    { name: "Reuters",    url: "https://feeds.reuters.com/reuters/worldNews" },
  ],
  "Business": [
    { name: "Harvard Business Review", url: "https://hbr.org/feed" },
    { name: "MIT Sloan Review",        url: "https://sloanreview.mit.edu/feed/" },
    { name: "McKinsey Insights",       url: "https://www.mckinsey.com/rss" },
  ],
  "Economics": [
    { name: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews" },
    { name: "The Economist",    url: "https://www.economist.com/finance-and-economics/rss.xml" },
    { name: "Freakonomics",     url: "https://freakonomics.com/feed/" },
  ],
  "Science": [
    { name: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/" },
    { name: "Phys.org",        url: "https://phys.org/rss-feed/" },
    { name: "Science Daily",   url: "https://www.sciencedaily.com/rss/all.xml" },
  ],
  "Productivity": [
    { name: "Farnam Street", url: "https://fs.blog/feed/" },
    { name: "James Clear",   url: "https://jamesclear.com/feed" },
    { name: "Ness Labs",     url: "https://nesslabs.com/feed" },
    { name: "Nir And Far",   url: "https://www.nirandfar.com/feed/" },
  ],
};

// ─── RSS fetch & parse ────────────────────────────────────────────────────────

interface RSSItem {
  title:       string;
  url:         string;
  description: string;
  pubDate:     string;
  pubTimestamp: number; // Unix ms — for recency sorting
  sourceName:  string;
}

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "i"
  );
  const match = xml.match(re);
  return match ? match[1].trim() : "";
}

function parsePubDate(raw: string): number {
  if (!raw) return 0;
  const ts = Date.parse(raw);
  return isNaN(ts) ? 0 : ts;
}

function extractItems(xml: string, sourceName: string): RSSItem[] {
  const itemTag  = xml.includes("<entry") ? "entry" : "item";
  const segments = xml.split(`<${itemTag}`).slice(1).slice(0, 20); // fetch up to 20

  return segments
    .map((seg) => {
      const title = extractText(seg, "title")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/<[^>]+>/g, "").trim();
      const url = extractText(seg, "link") ||
        seg.match(/<link[^>]+href="([^"]+)"/)?.[1] || "";
      const description =
        extractText(seg, "description") ||
        extractText(seg, "summary") ||
        extractText(seg, "content");
      const pubDateRaw =
        extractText(seg, "pubDate") ||
        extractText(seg, "published") ||
        extractText(seg, "updated");
      const cleanDesc = description
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);

      return {
        title,
        url,
        description:  cleanDesc,
        pubDate:      pubDateRaw,
        pubTimestamp: parsePubDate(pubDateRaw),
        sourceName,
      };
    })
    .filter((i) => i.title && i.url);
}

async function fetchRSSFeed(source: { name: string; url: string }): Promise<RSSItem[]> {
  const res = await fetch(source.url, {
    headers: {
      "User-Agent": "Daily3Bot/1.0 (RSS Reader; +https://daily3.io)",
      Accept:       "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.url}`);
  const xml = await res.text();
  return extractItems(xml, source.name);
}

// ─── DynamoDB: fetch recent article history (last 7 days) ────────────────────

interface RecentHistory {
  seenUrls:    Set<string>;  // URLs shown in last 7 days
  seenSources: Map<string, number>; // sourceName → how many times shown in last 7 days
}

async function fetchRecentHistory(userId: string): Promise<RecentHistory> {
  const seenUrls    = new Set<string>();
  const seenSources = new Map<string, number>();

  // Query last 7 days of article records for this user
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const skStart      = `DATE#${sevenDaysAgo.toISOString().slice(0, 10)}`;

  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName:                 ARTICLES_TABLE,
        KeyConditionExpression:    "PK = :pk AND SK >= :skStart",
        ExpressionAttributeValues: {
          ":pk":      Keys.userPK(userId),
          ":skStart": skStart,
        },
        ProjectionExpression: "articles",
      })
    );

    for (const item of result.Items ?? []) {
      const articles = (item.articles ?? []) as Article[];
      for (const a of articles) {
        if (a.url)    seenUrls.add(a.url);
        if (a.source) seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }
    }
  } catch (err) {
    // Non-fatal — degrade gracefully
    console.warn("Failed to fetch recent history:", err);
  }

  return { seenUrls, seenSources };
}

// ─── Filter & rank candidates ─────────────────────────────────────────────────

interface ScoredCandidate extends RSSItem {
  freshness: "today" | "recent" | "older";
  penalised: boolean; // true if URL or source was recently shown
}

function scoreAndFilter(
  items: RSSItem[],
  history: RecentHistory
): ScoredCandidate[] {
  const now     = Date.now();
  const oneDayMs  = 24 * 60 * 60 * 1000;
  const twoDaysMs = 48 * 60 * 60 * 1000;

  return items
    .map((item): ScoredCandidate => {
      const age       = now - item.pubTimestamp;
      const freshness = age <= oneDayMs  ? "today"
                      : age <= twoDaysMs ? "recent"
                      : "older";
      const penalised =
        history.seenUrls.has(item.url) ||
        (history.seenSources.get(item.sourceName) ?? 0) >= 3;

      return { ...item, freshness, penalised };
    })
    .filter((item) => !history.seenUrls.has(item.url)) // hard exclude seen URLs
    .sort((a, b) => {
      // Priority: today > recent > older, then penalised sources last
      const freshnessScore = (f: string) => f === "today" ? 2 : f === "recent" ? 1 : 0;
      const diff = freshnessScore(b.freshness) - freshnessScore(a.freshness);
      if (diff !== 0) return diff;
      if (a.penalised !== b.penalised) return a.penalised ? 1 : -1;
      return b.pubTimestamp - a.pubTimestamp; // newer first within same tier
    });
}

// ─── Bedrock: pick best article ───────────────────────────────────────────────

interface BedrockSelection {
  selectedIndex: number;
  reason:        string;
  readingTime:   string;
}

async function selectBestArticle(
  candidates: ScoredCandidate[],
  interest:   string,
  history:    RecentHistory
): Promise<BedrockSelection> {
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2)
    .map(([src]) => src)
    .join(", ");

  const candidateList = candidates
    .map(
      (c, i) =>
        `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    ${c.description.slice(0, 150)}`
    )
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen articles from: ${recentSourcesList}. Prefer a different source today if possible.`
    : "";

  const prompt = `You are an editorial assistant for Daily3, a daily article curation app.

User interest: "${interest}"
${diversityNote}

Select the single best article from the candidates below. Prioritise:
1. Published TODAY or very recently (marked "today" or "recent") — freshness is critical
2. A substantive long-form article with depth and insight, not a press release or short news blurb
3. Source variety — avoid sources marked "[source shown recently]" unless clearly superior
4. Strong relevance to "${interest}"

Candidates:
${candidateList}

Respond ONLY with valid JSON (no markdown):
{
  "selectedIndex": <0-${candidates.length - 1}>,
  "reason": "<one sentence: why this article is valuable for someone interested in ${interest}>",
  "readingTime": "<estimated reading time e.g. '6 min read'>"
}`;

  const command = new InvokeModelCommand({
    modelId:     "anthropic.claude-haiku-4-5",
    contentType: "application/json",
    accept:      "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens:        256,
      messages:          [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw      = JSON.parse(new TextDecoder().decode(response.body));
  const text     = raw.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(text) as BedrockSelection;
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function fallbackArticle(interest: string): Article {
  return {
    category:    interest,
    title:       `Today's ${interest} digest`,
    summary:     "We couldn't find a fresh matching article today. Check back tomorrow!",
    reason:      `Selected for your interest in ${interest}.`,
    url:         "https://news.ycombinator.com",
    source:      "Hacker News",
    readingTime: "—",
    publishedAt: new Date().toISOString(),
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

interface GenerateEvent {
  userId:    string;
  interests: string[];
}

export const handler = async (event: GenerateEvent): Promise<void> => {
  const { userId, interests } = event;

  if (!userId || !Array.isArray(interests) || interests.length !== 3) {
    throw new Error("userId and exactly 3 interests are required.");
  }

  console.log(`Generating for user=${userId} interests=${interests.join(", ")}`);

  // Fetch seen URLs + source usage for the last 7 days (single DynamoDB query)
  const history = await fetchRecentHistory(userId);
  console.log(`History: ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`);

  // Process all 3 interests in parallel
  const articleResults = await Promise.allSettled(
    interests.map(async (interest): Promise<Article> => {
      const sources = RSS_SOURCES[interest];
      if (!sources) throw new Error(`No RSS sources for interest: ${interest}`);

      // Fetch all sources in parallel
      const feedResults = await Promise.allSettled(sources.map(fetchRSSFeed));

      const allItems: RSSItem[] = [];
      feedResults.forEach((r, i) => {
        if (r.status === "fulfilled") {
          allItems.push(...r.value);
        } else {
          console.warn(`Feed failed: ${sources[i].url}`, r.reason);
        }
      });

      if (allItems.length === 0) {
        throw new Error(`All feeds failed for interest: ${interest}`);
      }

      // Score, deduplicate, and sort by freshness + diversity
      const candidates = scoreAndFilter(allItems, history);

      if (candidates.length === 0) {
        throw new Error(`No fresh unseen articles for interest: ${interest}`);
      }

      console.log(
        `${interest}: ${allItems.length} raw → ${candidates.length} candidates ` +
        `(today: ${candidates.filter(c => c.freshness === "today").length})`
      );

      // Bedrock picks the best one
      const top10      = candidates.slice(0, 10); // send top 10 to Bedrock
      const selection  = await selectBestArticle(top10, interest, history);
      const chosen     = top10[Math.min(selection.selectedIndex, top10.length - 1)];

      return {
        category:    interest,
        title:       chosen.title,
        summary:     chosen.description || "Click to read the full article.",
        reason:      selection.reason,
        url:         chosen.url,
        source:      chosen.sourceName,
        readingTime: selection.readingTime,
        publishedAt: chosen.pubDate || new Date().toISOString(),
      };
    })
  );

  const articles: Article[] = articleResults.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`Failed for "${interests[i]}":`, result.reason);
    return fallbackArticle(interests[i]);
  });

  const now  = new Date();
  const item: DailyArticles = {
    PK:          Keys.userPK(userId),
    SK:          Keys.dateSK(now),
    articles,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Wrote ${articles.length} articles for user=${userId} date=${Keys.dateSK(now)}`);
};
