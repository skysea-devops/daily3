import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { Article, DailyArticles, Keys } from "../../../shared/types";

const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const ses     = new SESClient({ region: process.env.AWS_REGION });
const polly   = new PollyClient({ region: "us-east-1" }); // Generative engine only in us-east-1
const s3      = new S3Client({ region: process.env.AWS_REGION });

const ARTICLES_TABLE   = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE      = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL   = process.env.SES_FROM_EMAIL!;
const CORS_ORIGIN      = process.env.CORS_ORIGIN ?? "*";
const AUDIO_BUCKET     = process.env.AUDIO_BUCKET_NAME!;

// ─── RSS source map ───────────────────────────────────────────────────────────

const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {

  "Software & DevOps": [
    { name: "Stack Overflow Blog", url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",       url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",               url: "https://www.infoq.com/feed/" },
    { name: "The New Stack",       url: "https://thenewstack.io/feed/" },
    { name: "AWS Architecture",    url: "https://aws.amazon.com/blogs/architecture/feed/" },
  ],

  "Technology": [
    { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
    { name: "IEEE Spectrum",         url: "https://spectrum.ieee.org/feeds/feed.rss" },
    { name: "Ars Technica",          url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "ACM Queue",             url: "https://queue.acm.org/rss/feeds/queuecontent.xml" },
    { name: "Hacker News",           url: "https://news.ycombinator.com/rss" },
  ],

  "World Politics": [
    { name: "Chatham House",                url: "https://www.chathamhouse.org/rss.xml" },
    { name: "Foreign Affairs",              url: "https://www.foreignaffairs.com/rss.xml" },
    { name: "War on the Rocks",             url: "https://warontherocks.com/feed/" },
    { name: "Council on Foreign Relations", url: "https://feeds.cfr.org/publication/twnw" },
    { name: "Al Jazeera",                   url: "https://www.aljazeera.com/xml/rss/all.xml" },
  ],

  "Business": [
    { name: "Ness Labs",          url: "https://nesslabs.com/feed" },
    { name: "MIT Sloan Review",   url: "https://sloanreview.mit.edu/feed/" },
    { name: "Noema Magazine",     url: "https://www.noemamag.com/feed/" },
    { name: "Strategy+Business",  url: "https://www.strategy-business.com/rss" },
    { name: "First Round Review", url: "https://review.firstround.com/feed.xml" },
  ],

  "Economics": [
    { name: "VoxEU (CEPR)",       url: "https://cepr.org/feed" },
    { name: "Econlib",            url: "https://www.econlib.org/feed/" },
    { name: "Noahpinion",         url: "https://www.noahpinion.blog/feed" },
    { name: "Marginal Revolution", url: "https://marginalrevolution.com/feed" },
    { name: "IMF Blog",           url: "https://www.imf.org/en/Blogs/rss" },
  ],

  "Science": [
    { name: "Quanta Magazine", url: "https://api.quantamagazine.org/feed/" },
    { name: "Nautilus",        url: "https://nautil.us/feed/" },
    { name: "Undark",          url: "https://undark.org/feed/" },
    { name: "Aeon",            url: "https://aeon.co/feed.rss" },
    { name: "Phys.org",        url: "https://phys.org/rss-feed/" },
  ],

  "Productivity": [
    { name: "Farnam Street", url: "https://fs.blog/feed/" },
    { name: "Ness Labs",     url: "https://nesslabs.com/feed" },
    { name: "Psyche (Aeon)", url: "https://psyche.co/feed" },
    { name: "LessWrong",     url: "https://www.lesswrong.com/feed.xml" },
    { name: "Nir And Far",   url: "https://www.nirandfar.com/feed/" },
  ],

  "History": [
    { name: "Aeon",                     url: "https://aeon.co/feed.rss" },
    { name: "History Today",            url: "https://www.historytoday.com/feed/rss.xml" },
    { name: "JSTOR Daily",              url: "https://daily.jstor.org/feed/" },
    { name: "Lapham's Quarterly",       url: "https://www.laphamsquarterly.org/rss.xml" },
    { name: "The Public Domain Review", url: "https://publicdomainreview.org/rss.xml" },
  ],

  "Arts & Culture": [
    { name: "Literary Hub (Arts)",  url: "https://lithub.com/category/newsandculture/art-and-photography/feed/" },
    { name: "Literary Hub (Books)", url: "https://lithub.com/category/bookmarks/excerpts-and-writings/feed/" },
    { name: "LA Review of Books",   url: "https://lareviewofbooks.org/feed/" },
    { name: "Aeon",                 url: "https://aeon.co/feed.rss" },
    { name: "Smithsonian Magazine", url: "https://www.smithsonianmag.com/rss/latest_articles/" },
  ],

  "Military": [
    { name: "War on the Rocks",          url: "https://warontherocks.com/feed/" },
    { name: "RUSI",                      url: "https://www.rusi.org/feeds/latest" },
    { name: "Lawfare",                   url: "https://www.lawfaremedia.org/feeds/all" },
    { name: "Modern War Institute",      url: "https://mwi.westpoint.edu/feed/" },
    { name: "Inkstick Media",            url: "https://inkstickmedia.com/feed/" },
  ],

  "Health": [
    { name: "Stat News",                 url: "https://www.statnews.com/feed/" },
    { name: "Undark (Health)",           url: "https://undark.org/category/health/feed/" },
    { name: "Aeon (Psychology)",         url: "https://psyche.co/feed" },
    { name: "The BMJ",                   url: "https://www.bmj.com/rss/current.xml" },
    { name: "Knowable Magazine",         url: "https://knowablemagazine.org/rss" },
  ],

  "Environment": [
    { name: "Yale Environment 360",      url: "https://e360.yale.edu/feed.xml" },
    { name: "Carbon Brief",              url: "https://www.carbonbrief.org/feed/" },
    { name: "Ensia",                     url: "https://ensia.com/feed/" },
    { name: "Mongabay",                  url: "https://news.mongabay.com/feed/" },
    { name: "Inside Climate News",       url: "https://insideclimatenews.org/feed/" },
  ],
};

// ─── RSS fetch & parse ────────────────────────────────────────────────────────

interface RSSItem {
  title:        string;
  url:          string;
  description:  string;
  pubDate:      string;
  pubTimestamp: number;
  sourceName:   string;
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
  const segments = xml.split(`<${itemTag}`).slice(1).slice(0, 20);

  return segments
    .map((seg) => {
      const title = extractText(seg, "title")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8230;/g, "…")
        .replace(/&#\d+;/g, "")
        .replace(/&[a-z]+;/g, "")
        .replace(/<[^>]+>/g, "").trim();
      const rawUrl = extractText(seg, "link") ||
        seg.match(/<link[^>]+href="([^"]+)"/)?.[1] || "";
      // URL'deki HTML entity'leri temizle
      const url = rawUrl
        .replace(/&#038;/g, "&").replace(/&amp;/g, "&")
        .replace(/&#\d+;/g, "").trim();
      const description =
        extractText(seg, "description") ||
        extractText(seg, "summary") ||
        extractText(seg, "content");
      const pubDateRaw =
        extractText(seg, "pubDate") ||
        extractText(seg, "published") ||
        extractText(seg, "updated");
      const cleanDesc = description
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#8230;/g, "…")
        .replace(/&#\d+;/g, "")
        .replace(/&[a-z]+;/g, "")
        .replace(/The post .+ appeared( first)? on .+\./gi, "")
        .replace(/\[\s*\.\.\.\s*\]/g, "…")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);

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

// ─── DynamoDB: fetch recent article history ───────────────────────────────────

interface RecentHistory {
  seenUrls:    Set<string>;
  seenSources: Map<string, number>;
}

async function fetchRecentHistory(userId: string): Promise<RecentHistory> {
  const seenUrls    = new Set<string>();
  const seenSources = new Map<string, number>();

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
    console.warn("Failed to fetch recent history:", err);
  }

  return { seenUrls, seenSources };
}

// ─── DynamoDB: fetch user email ───────────────────────────────────────────────

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: {
          PK: Keys.userPK(userId),
          SK: "PROFILE",
        },
        ProjectionExpression: "email",
      })
    );
    return (result.Item?.email as string) ?? null;
  } catch (err) {
    console.warn("Failed to fetch user email:", err);
    return null;
  }
}

// ─── SES: send daily digest email ─────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  "Software & DevOps": "🛠️",
  "Technology":        "💡",
  "World Politics":    "🌍",
  "Business":         "📈",
  "Economics":        "💰",
  "Science":          "🔬",
  "Productivity":     "⚡",
  "History":          "🏛️",
  "Arts & Culture":   "🎭",
  "Military":         "⚔️",
  "Health":           "🧬",
  "Environment":      "🌿",
};

function buildEmailHtml(articles: Article[]): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const articleCards = articles
    .filter((a) => a.url && a.url !== "https://news.ycombinator.com")
    .map((a) => {
      const emoji = CATEGORY_EMOJI[a.category] ?? "📄";
      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px;background:#ffffff;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">
              ${emoji} ${a.category}
            </p>
            <p style="margin:0 0 2px 0;font-size:12px;color:#9ca3af;">
              ${a.source} · ${a.readingTime}
            </p>
            <h2 style="margin:12px 0 8px 0;font-size:18px;line-height:1.4;color:#111827;">
              ${a.title}
            </h2>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#4b5563;">
              ${a.summary}
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;background:#f9fafb;border-radius:10px;">
              <tr>
                <td style="padding:12px 16px;">
                  <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Why this article?</p>
                  <p style="margin:0;font-size:13px;color:#374151;">${a.reason}</p>
                </td>
              </tr>
            </table>
            <a href="${a.url}" style="display:inline-block;padding:10px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">
              Read article →
            </a>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;">
              <h1 style="margin:0 0 4px 0;font-size:28px;font-weight:700;color:#111827;">Daily3</h1>
              <p style="margin:0;font-size:14px;color:#6b7280;">${today}</p>
              <p style="margin:8px 0 0 0;font-size:15px;color:#374151;">
                Your three carefully selected articles for today are ready.
              </p>
            </td>
          </tr>

          <!-- Articles -->
          <tr>
            <td>${articleCards}</td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                Daily3 · Your daily reading digest<br>
                New articles arrive every morning at 07:00.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(articles: Article[]): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  const lines = articles
    .filter((a) => a.url && a.url !== "https://news.ycombinator.com")
    .map((a) =>
      `${a.category} — ${a.source}\n${a.title}\n${a.reason}\n${a.url}`
    )
    .join("\n\n---\n\n");

  return `Daily3 — ${today}\n\nYour three articles for today:\n\n${lines}\n\nNew articles arrive every morning at 07:00.`;
}

async function sendDailyEmail(toEmail: string, articles: Article[]): Promise<void> {
  const realArticles = articles.filter(
    (a) => a.url && a.url !== "https://news.ycombinator.com"
  );

  // Tüm makaleler fallback ise email gönderme
  if (realArticles.length === 0) {
    console.warn(`No real articles to email for ${toEmail}, skipping`);
    return;
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long",
  });

  await ses.send(
    new SendEmailCommand({
      Source:      SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data:    `Your Daily3 for ${today} is ready`,
          Charset: "UTF-8",
        },
        Body: {
          Html: { Data: buildEmailHtml(articles), Charset: "UTF-8" },
          Text: { Data: buildEmailText(articles), Charset: "UTF-8" },
        },
      },
    })
  );

  console.log(`Email sent to ${toEmail}`);
}

// ─── Filter & rank candidates ─────────────────────────────────────────────────

interface ScoredCandidate extends RSSItem {
  freshness: "today" | "recent" | "older";
  penalised: boolean;
}

const ROUNDUP_PATTERNS  = /\b(weekly|roundup|link list|best of|this week in|top \d+)\b/i;
const PODCAST_PATTERNS  = /\b(podcast|transcript|episode|listen now|audio|ep\.|ep \d+)\b/i;

function scoreAndFilter(
  items: RSSItem[],
  history: RecentHistory
): ScoredCandidate[] {
  const now       = Date.now();
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
    .filter((item) => !history.seenUrls.has(item.url))
    .filter((item) => !ROUNDUP_PATTERNS.test(item.title))
    .filter((item) => !PODCAST_PATTERNS.test(item.title))
    .sort((a, b) => {
      const freshnessScore = (f: string) => f === "today" ? 2 : f === "recent" ? 1 : 0;
      const diff = freshnessScore(b.freshness) - freshnessScore(a.freshness);
      if (diff !== 0) return diff;
      if (a.penalised !== b.penalised) return a.penalised ? 1 : -1;
      return b.pubTimestamp - a.pubTimestamp;
    });
}

// ─── Jina AI Reader: fetch full article text ──────────────────────────────────

async function fetchFullText(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "Accept":     "text/plain",
        "User-Agent": "Daily3Bot/1.0",
        "X-No-Cache": "true",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // İlk 6000 karakteri al — Bedrock context için yeterli
    return text.slice(0, 6000).trim() || null;
  } catch {
    return null;
  }
}

// ─── Bedrock: generate rich summary from full text ────────────────────────────

async function generateRichSummary(
  title:    string,
  fullText: string,
  interest: string
): Promise<string> {
  const prompt = `You are an editorial assistant for Daily3, a daily article curation app for professionals.

Article title: "${title}"
User interest: "${interest}"

Article content:
${fullText}

Write a rich, informative summary of this article in 15-20 sentences (~500 words). Requirements:
- Convey the core argument, key evidence, and most important insight
- Make every sentence count — professionals should learn something just from reading this
- Do not start with the title, source name, or filler phrases like "this article explores" or "the author argues"
- Write in active, direct prose
- End with the most surprising or actionable insight

Respond with ONLY the summary text, no JSON, no markdown.`;

  const command = new InvokeModelCommand({
    modelId:     "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept:      "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens:        800,
      messages:          [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw      = JSON.parse(new TextDecoder().decode(response.body));
  return raw.content[0].text.trim();
}

// ─── Bedrock: pick best article ───────────────────────────────────────────────

interface BedrockSelection {
  selectedIndex: number;
  summary:       string;
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
        `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    ${c.description.slice(0, 400)}`
    )
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen articles from: ${recentSourcesList}. Prefer a different source today if possible.`
    : "";

  const prompt = `You are an editorial assistant for Daily3, a daily long-form article curation app for professionals who want to learn deeply.

User interest: "${interest}"
${diversityNote}

Select the single best LONG-FORM ARTICLE from the candidates below. You must strictly prioritise:
1. DEPTH over brevity — prefer essays, research summaries, analysis pieces, and think-tank reports. Reject short news items, press releases, and articles under ~800 words.
2. SUBSTANCE — the piece should contain original analysis, research findings, or expert insight. Not just a summary of events.
3. FORMAT — reject podcast transcripts, interview Q&A transcripts, episode summaries, and "listen now" style content. Only written articles intended to be read.
4. Freshness — prefer articles published TODAY or recently (marked "today" or "recent")
5. Source variety — avoid sources marked "[source shown recently]" unless clearly superior
6. Strong relevance to "${interest}"

Candidates:
${candidateList}

Respond ONLY with valid JSON (no markdown):
{
  "selectedIndex": <0-${candidates.length - 1}>,
  "summary": "<Write 4-5 rich, informative sentences that convey the article's core argument, key evidence, and most surprising or important insight. Use the RSS description as a starting point but expand meaningfully. Make every sentence count — professionals should feel they've learned something just from reading this. Do not start with the title or source name. Do not use filler phrases like 'this article explores' or 'the author argues'.>",
  "reason": "<one sentence: what makes this a valuable long-form read for someone interested in ${interest}>",
  "readingTime": "<estimated reading time e.g. '8 min read'>"
}`;

  const command = new InvokeModelCommand({
    modelId:     "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept:      "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens:        600,
      messages:          [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw      = JSON.parse(new TextDecoder().decode(response.body));
  const text     = raw.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(text) as BedrockSelection;

  // Bedrock çıktısındaki entity'leri temizle
  const cleanStr = (s: string) => s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#\d+;/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  return {
    ...parsed,
    summary: cleanStr(parsed.summary ?? ""),
    reason:  cleanStr(parsed.reason ?? ""),
  };
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

// ─── Audio Edition: Polly TTS + S3 shared cache ───────────────────────────────

function articleId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

async function audioExists(s3Key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: AUDIO_BUCKET, Key: s3Key }));
    return true;
  } catch {
    return false;
  }
}

async function generateAudio(article: Article): Promise<string | null> {
  if (!AUDIO_BUCKET) return null;

  const id    = articleId(article.url);
  const s3Key = `audio/${id}/en.mp3`;

  // Shared cache — başka kullanıcı için zaten üretilmişse atla
  if (await audioExists(s3Key)) {
    console.log(`Audio cache hit: ${s3Key}`);
    return `https://${AUDIO_BUCKET}.s3.amazonaws.com/${s3Key}`;
  }

  // Polly'ye gönderilecek metin: title + summary + reason
  const text = [
    article.title,
    article.summary,
    `Why this article? ${article.reason}`,
  ].join(". ");

  try {
    const response = await polly.send(
      new SynthesizeSpeechCommand({
        Text:         text,
        OutputFormat: "mp3",
        VoiceId:      "Ruth",
        Engine:       "generative",
        TextType:     "text",
      })
    );

    if (!response.AudioStream) return null;

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    await s3.send(
      new PutObjectCommand({
        Bucket:      AUDIO_BUCKET,
        Key:         s3Key,
        Body:        audioBuffer,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=86400",
      })
    );

    console.log(`Audio generated and uploaded: ${s3Key}`);
    return `https://${AUDIO_BUCKET}.s3.amazonaws.com/${s3Key}`;
  } catch (err) {
    console.error(`Polly failed for article "${article.title}":`, err);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

interface GenerateEvent {
  userId:    string;
  interests: string[];
  userEmail?: string; // daily-trigger'dan direk geçilebilir, yoksa DynamoDB'den çekilir
}

export const handler = async (event: GenerateEvent): Promise<void> => {
  const { userId, interests } = event;

  if (!userId || !Array.isArray(interests) || interests.length !== 3) {
    throw new Error("userId and exactly 3 interests are required.");
  }

  console.log(`Generating for user=${userId} interests=${interests.join(", ")}`);

  const history = await fetchRecentHistory(userId);
  console.log(`History: ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`);

  const articleResults = await Promise.allSettled(
    interests.map(async (interest): Promise<Article> => {
      const sources = RSS_SOURCES[interest];
      if (!sources) throw new Error(`No RSS sources for interest: ${interest}`);

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

      const candidates = scoreAndFilter(allItems, history);

      if (candidates.length === 0) {
        throw new Error(`No fresh unseen articles for interest: ${interest}`);
      }

      console.log(
        `${interest}: ${allItems.length} raw → ${candidates.length} candidates ` +
        `(today: ${candidates.filter(c => c.freshness === "today").length})`
      );

      const top10     = candidates.slice(0, 10);
      const selection = await selectBestArticle(top10, interest, history);
      const chosen    = top10[Math.min(selection.selectedIndex, top10.length - 1)];

      // Jina ile tam metni çek, zengin özet üret
      let summary = selection.summary || chosen.description || "Click to read the full article.";
      if (chosen.url && chosen.url !== "https://news.ycombinator.com") {
        const fullText = await fetchFullText(chosen.url);
        if (fullText && fullText.length > 500) {
          try {
            const richSummary = await generateRichSummary(chosen.title, fullText, interest);
            // Bedrock hata mesajı döndürdüyse kullanma
            const isErrorMsg = richSummary.toLowerCase().includes("unable to provide") ||
              richSummary.toLowerCase().includes("403") ||
              richSummary.toLowerCase().includes("forbidden") ||
              richSummary.toLowerCase().includes("i cannot") ||
              richSummary.toLowerCase().includes("i'm unable") ||
              richSummary.toLowerCase().includes("authentication");
            if (richSummary && richSummary.length > 100 && !isErrorMsg) {
              summary = richSummary;
            }
          } catch (err) {
            console.warn(`Rich summary failed for "${chosen.title}":`, err);
          }
        } else {
          console.log(`Jina returned no content for: ${chosen.url}`);
        }
      }

      return {
        category:    interest,
        title:       chosen.title,
        summary,
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

  // Audio Edition — Polly TTS (fire-and-forget per article, shared cache)
  const articlesWithAudio = await Promise.all(
    articles.map(async (article) => {
      if (article.url === "https://news.ycombinator.com") return article;
      const audioUrl = await generateAudio(article);
      return audioUrl ? { ...article, audioUrl } : article;
    })
  );

  // DynamoDB'e yaz
  const now  = new Date();
  const item: DailyArticles = {
    PK:          Keys.userPK(userId),
    SK:          Keys.dateSK(now),
    articles:    articlesWithAudio,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Wrote ${articlesWithAudio.length} articles for user=${userId} date=${Keys.dateSK(now)}`);

  // Email gönder — SES_FROM_EMAIL tanımlıysa
  if (SES_FROM_EMAIL) {
    const userEmail = event.userEmail ?? await fetchUserEmail(userId);
    if (userEmail) {
      try {
        await sendDailyEmail(userEmail, articlesWithAudio);
      } catch (err) {
        // Email hatası makale üretimini engellemesin
        console.error("Failed to send email notification:", err);
      }
    } else {
      console.warn(`No email found for user=${userId}, skipping notification`);
    }
  }
};
