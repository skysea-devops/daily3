import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { createHash } from "crypto";
import { Article, Podcast, DailyArticles, Keys } from "../../../shared/types";

const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const ses     = new SESClient({ region: process.env.AWS_REGION });

const ARTICLES_TABLE   = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE      = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL   = process.env.SES_FROM_EMAIL!;

// ─── Article RSS source map ───────────────────────────────────────────────────

const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {

  "Software & DevOps": [
    { name: "Stack Overflow Blog",    url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",          url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",                  url: "https://www.infoq.com/feed/" },
    { name: "The New Stack",          url: "https://thenewstack.io/feed/" },
    { name: "AWS Architecture",       url: "https://aws.amazon.com/blogs/architecture/feed/" },
    { name: "The Conversation (Tech)",url: "https://theconversation.com/technology/articles.atom" },
    { name: "ACM Queue",              url: "https://queue.acm.org/rss/feeds/queuecontent.xml" },
  ],

  "Technology": [
    { name: "MIT Technology Review",  url: "https://www.technologyreview.com/feed/" },
    { name: "IEEE Spectrum",          url: "https://spectrum.ieee.org/feeds/feed.rss" },
    { name: "Ars Technica",           url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Stanford HAI",           url: "https://hai.stanford.edu/news/feed" },
    { name: "The Conversation (Tech)",url: "https://theconversation.com/technology/articles.atom" },
    { name: "Eurozine",               url: "https://www.eurozine.com/feed/" },
    { name: "Rest of World",           url: "https://restofworld.org/feed/" },
  ],

  "World Politics": [
    { name: "Chatham House",          url: "https://www.chathamhouse.org/rss.xml" },
    { name: "Foreign Affairs",        url: "https://www.foreignaffairs.com/rss.xml" },
    { name: "War on the Rocks",       url: "https://warontherocks.com/feed/" },
    { name: "Carnegie Endowment",     url: "https://carnegieendowment.org/rss/solr/articles" },
    { name: "Brookings",              url: "https://www.brookings.edu/feed/" },
    { name: "Atlantic Council",       url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Wilson Center",          url: "https://www.wilsoncenter.org/rss.xml" },
    { name: "The Conversation (Pol)", url: "https://theconversation.com/politics/articles.atom" },
    { name: "Le Monde Diplomatique",  url: "https://mondediplo.com/spip.php?page=backend" },
    { name: "The Diplomat",           url: "https://thediplomat.com/feed/" },
  ],

  "Business": [
    { name: "MIT Sloan Review",       url: "https://sloanreview.mit.edu/feed/" },
    { name: "Noema Magazine",         url: "https://www.noemamag.com/feed/" },
    { name: "Strategy+Business",      url: "https://www.strategy-business.com/rss" },
    { name: "First Round Review",     url: "https://review.firstround.com/feed.xml" },
    { name: "The Conversation (Bus)", url: "https://theconversation.com/business/articles.atom" },
    { name: "Longreads",              url: "https://longreads.com/feed/" },
    { name: "Ness Labs",              url: "https://nesslabs.com/feed" },
  ],

  "Economics": [
    { name: "VoxEU (CEPR)",           url: "https://cepr.org/feed" },
    { name: "Econlib",                url: "https://www.econlib.org/feed/" },
    { name: "Noahpinion",             url: "https://www.noahpinion.blog/feed" },
    { name: "Marginal Revolution",    url: "https://marginalrevolution.com/feed" },
    { name: "IMF Blog",               url: "https://www.imf.org/en/Blogs/rss" },
    { name: "NY Fed Liberty Street",  url: "https://libertystreeteconomics.newyorkfed.org/feed.xml" },
    { name: "The Conversation (Eco)", url: "https://theconversation.com/economy/articles.atom" },
    { name: "RAND Economics",         url: "https://www.rand.org/feeds/research.xml" },
  ],

  "Science": [
    { name: "Quanta Magazine",        url: "https://api.quantamagazine.org/feed/" },
    { name: "Nautilus",               url: "https://nautil.us/feed/" },
    { name: "Undark",                 url: "https://undark.org/feed/" },
    { name: "Aeon",                   url: "https://aeon.co/feed.rss" },
    { name: "The Conversation (Sci)", url: "https://theconversation.com/science/articles.atom" },
    { name: "Knowable Magazine",      url: "https://knowablemagazine.org/rss" },
    { name: "PLOS Blogs",             url: "https://plos.org/feed/" },
  ],

  "Productivity": [
    { name: "Farnam Street",          url: "https://fs.blog/feed/" },
    { name: "Ness Labs",              url: "https://nesslabs.com/feed" },
    { name: "Psyche (Aeon)",          url: "https://psyche.co/feed" },
    { name: "LessWrong",              url: "https://www.lesswrong.com/feed.xml" },
    { name: "Nir And Far",            url: "https://www.nirandfar.com/feed/" },
    { name: "Longreads",              url: "https://longreads.com/feed/" },
  ],

  "History": [
    { name: "Aeon",                   url: "https://aeon.co/feed.rss" },
    { name: "History Today",          url: "https://www.historytoday.com/feed/rss.xml" },
    { name: "JSTOR Daily",            url: "https://daily.jstor.org/feed/" },
    { name: "Lapham's Quarterly",     url: "https://www.laphamsquarterly.org/rss.xml" },
    { name: "The Public Domain Review", url: "https://publicdomainreview.org/rss.xml" },
    { name: "The Conversation (His)", url: "https://theconversation.com/history/articles.atom" },
    { name: "Eurozine",               url: "https://www.eurozine.com/feed/" },
    { name: "Wilson Center",          url: "https://www.wilsoncenter.org/rss.xml" },
  ],

  "Arts & Culture": [
    { name: "Literary Hub (Arts)",    url: "https://lithub.com/category/newsandculture/art-and-photography/feed/" },
    { name: "Literary Hub (Books)",   url: "https://lithub.com/category/bookmarks/excerpts-and-writings/feed/" },
    { name: "LA Review of Books",     url: "https://lareviewofbooks.org/feed/" },
    { name: "Aeon",                   url: "https://aeon.co/feed.rss" },
    { name: "Smithsonian Magazine",   url: "https://www.smithsonianmag.com/rss/latest_articles/" },
    { name: "Public Books",           url: "https://www.publicbooks.org/feed/" },
    { name: "JSTOR Daily",            url: "https://daily.jstor.org/feed/" },
    { name: "Eurozine",               url: "https://www.eurozine.com/feed/" },
    { name: "Longreads",              url: "https://longreads.com/feed/" },
  ],

  "Military": [
    { name: "War on the Rocks",       url: "https://warontherocks.com/feed/" },
    { name: "RUSI",                   url: "https://www.rusi.org/feeds/latest" },
    { name: "Lawfare",                url: "https://www.lawfaremedia.org/feeds/all" },
    { name: "Modern War Institute",   url: "https://mwi.westpoint.edu/feed/" },
    { name: "Inkstick Media",         url: "https://inkstickmedia.com/feed/" },
    { name: "RAND Security",          url: "https://www.rand.org/feeds/research.xml" },
    { name: "CSIS",                   url: "https://www.csis.org/analysis/feed" },
    { name: "Atlantic Council",       url: "https://www.atlanticcouncil.org/feed/" },
  ],

  "Health": [
    { name: "Stat News",              url: "https://www.statnews.com/feed/" },
    { name: "Undark (Health)",        url: "https://undark.org/category/health/feed/" },
    { name: "Psyche (Aeon)",          url: "https://psyche.co/feed" },
    { name: "The BMJ",                url: "https://www.bmj.com/rss/current.xml" },
    { name: "Knowable Magazine",      url: "https://knowablemagazine.org/rss" },
    { name: "The Conversation (Hlt)", url: "https://theconversation.com/health/articles.atom" },
    { name: "STAT News",              url: "https://www.statnews.com/feed/" },
  ],

  "Environment": [
    { name: "Yale Environment 360",   url: "https://e360.yale.edu/feed.xml" },
    { name: "Carbon Brief",           url: "https://www.carbonbrief.org/feed/" },
    { name: "Ensia",                  url: "https://ensia.com/feed/" },
    { name: "Mongabay",               url: "https://news.mongabay.com/feed/" },
    { name: "Inside Climate News",    url: "https://insideclimatenews.org/feed/" },
    { name: "The Conversation (Env)", url: "https://theconversation.com/environment/articles.atom" },
    { name: "RAND Environment",       url: "https://www.rand.org/feeds/research.xml" },
  ],

  "Philosophy & Ethics": [
    { name: "Aeon",                   url: "https://aeon.co/feed.rss" },
    { name: "Psyche (Aeon)",          url: "https://psyche.co/feed" },
    { name: "The Stone (NY Times)",   url: "https://rss.nytimes.com/services/xml/rss/nyt/Philosophy.xml" },
    { name: "Philosophy Now",         url: "https://philosophynow.org/rss" },
    { name: "IAI News",               url: "https://iai.tv/articles/rss" },
    { name: "The Conversation (Phil)",url: "https://theconversation.com/us/articles.atom" },
  ],

  "Fashion & Style": [
    { name: "The Fashion Law",        url: "https://www.thefashionlaw.com/feed" },
    { name: "The Conversation (Arts)",url: "https://theconversation.com/arts/articles.atom" },
    { name: "WWD Fashion",            url: "https://wwd.com/fashion-news/feed" },
    { name: "Vogue Business",         url: "https://www.voguebusiness.com/rss" },
    { name: "Eurozine",               url: "https://www.eurozine.com/feed/" },
    { name: "Longreads",              url: "https://longreads.com/feed/" },
  ],

  "Life & Relationships": [
    { name: "Greater Good Science Center", url: "https://greatergood.berkeley.edu/feeds/1" },
    { name: "Psyche (Aeon)",          url: "https://psyche.co/feed" },
    { name: "The Atlantic (Family)",  url: "https://www.theatlantic.com/family/feed/" },
    { name: "The Conversation (Rel)", url: "https://theconversation.com/relationships/articles.atom" },
    { name: "Aeon",                   url: "https://aeon.co/feed.rss" },
    { name: "Ness Labs",              url: "https://nesslabs.com/feed" },
  ],
};

// ─── Podcast RSS source map ───────────────────────────────────────────────────

const PODCAST_SOURCES: Record<string, { name: string; url: string }[]> = {

  "Software & DevOps": [
    { name: "Software Engineering Daily",  url: "https://softwareengineeringdaily.com/feed/podcast/" },
    { name: "The Changelog",               url: "https://changelog.com/podcast/feed" },
    { name: "Darknet Diaries",             url: "https://feeds.megaphone.fm/darknetdiaries" },
    { name: "Hanselminutes",               url: "https://feeds.simplecast.com/gvtxUiIf" },
    { name: "CoRecursive",                 url: "https://corecursive.com/feed" },
  ],

  "Technology": [
    { name: "Lex Fridman Podcast",         url: "https://lexfridman.com/feed/podcast/" },
    { name: "Hard Fork",                   url: "https://feeds.simplecast.com/l2i9YnTd" },
    { name: "StarTalk Radio",              url: "https://feeds.simplecast.com/4T39_jAj" },
    { name: "Wired Podcast",               url: "https://www.wired.com/feed/podcast/wired-podcast/rss" },
    { name: "MIT Technology Review",       url: "https://www.technologyreview.com/feed/podcast/" },
  ],

  "World Politics": [
    { name: "War on the Rocks",            url: "https://warontherocks.com/feed/podcast/" },
    { name: "Foreign Policy Podcast",      url: "https://foreignpolicy.com/podcasts/feed/" },
    { name: "BBC Global News Podcast",     url: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss" },
    { name: "The Take (Al Jazeera)",       url: "https://feeds.megaphone.fm/aljazeera-the-take" },
    { name: "From Our Own Correspondent",  url: "https://podcasts.files.bbci.co.uk/b006qjlq.rss" },
  ],

  "Business": [
    { name: "The Tim Ferriss Show",        url: "https://rss.art19.com/tim-ferriss-show" },
    { name: "How I Built This",            url: "https://feeds.npr.org/510313/podcast.xml" },
    { name: "Masters of Scale",            url: "https://rss.art19.com/masters-of-scale" },
    { name: "Invest Like the Best",        url: "https://feeds.megaphone.fm/investlikethebest" },
    { name: "The Knowledge Project",       url: "https://fs.blog/knowledge-project-podcast/feed/" },
  ],

  "Economics": [
    { name: "Planet Money",                url: "https://feeds.npr.org/510289/podcast.xml" },
    { name: "EconTalk",                    url: "https://feeds.simplecast.com/wgl4xEgL" },
    { name: "The Indicator",               url: "https://feeds.npr.org/510325/podcast.xml" },
    { name: "Freakonomics Radio",          url: "https://feeds.simplecast.com/Y8lFbOT4" },
    { name: "Fresh Air (Economics)",       url: "https://feeds.npr.org/381444908/podcast.xml" },
  ],

  "Science": [
    { name: "In Our Time",                 url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",              url: "https://feeds.feedburner.com/sciencefriday" },
    { name: "Huberman Lab",                url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Fresh Air (Science)",         url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Lex Fridman Podcast",         url: "https://lexfridman.com/feed/podcast/" },
  ],

  "Productivity": [
    { name: "Huberman Lab",                url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "The Tim Ferriss Show",        url: "https://rss.art19.com/tim-ferriss-show" },
    { name: "The Knowledge Project",       url: "https://fs.blog/knowledge-project-podcast/feed/" },
    { name: "Fresh Air",                   url: "https://feeds.npr.org/381444908/podcast.xml" },
  ],

  "History": [
    { name: "Hardcore History",            url: "https://feeds.feedburner.com/dancarlin/history" },
    { name: "In Our Time",                 url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Throughline",                 url: "https://feeds.npr.org/510333/podcast.xml" },
    { name: "American History Tellers",    url: "https://rss.art19.com/american-history-tellers" },
    { name: "Fresh Air (History)",         url: "https://feeds.npr.org/381444908/podcast.xml" },
  ],

  "Arts & Culture": [
    { name: "Switched on Pop",             url: "https://feeds.megaphone.fm/switchedonpop" },
    { name: "99% Invisible",               url: "https://feeds.simplecast.com/BqbsxVfO" },
    { name: "TED Talks Daily",             url: "https://feeds.megaphone.fm/TED9718394730" },
    { name: "Fresh Air (Arts)",            url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Friday Night Comedy (BBC)",   url: "https://podcasts.files.bbci.co.uk/p02pc9pj.rss" },
  ],

  "Military": [
    { name: "War on the Rocks",            url: "https://warontherocks.com/feed/podcast/" },
    { name: "Modern War Institute",        url: "https://mwi.westpoint.edu/category/podcasts/feed/" },
    { name: "BBC Global News Podcast",     url: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss" },
    { name: "Foreign Policy Podcast",      url: "https://foreignpolicy.com/podcasts/feed/" },
    { name: "Throughline",                 url: "https://feeds.npr.org/510333/podcast.xml" },
  ],

  "Health": [
    { name: "Huberman Lab",                url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "Fresh Air (Health)",          url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "In Our Time (Medicine)",      url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",              url: "https://feeds.feedburner.com/sciencefriday" },
  ],

  "Environment": [
    { name: "How to Save a Planet",        url: "https://feeds.megaphone.fm/howtosaveaplanet" },
    { name: "Costing the Earth",           url: "https://podcasts.files.bbci.co.uk/b006r4wn.rss" },
    { name: "Fresh Air (Environment)",     url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "BBC Global News Podcast",     url: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss" },
    { name: "Throughline",                 url: "https://feeds.npr.org/510333/podcast.xml" },
  ],

  "Philosophy & Ethics": [
    { name: "Philosophy Bites",            url: "https://philosophybites.com/atom.xml" },
    { name: "In Our Time (Philosophy)",    url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Philosophize This!",          url: "https://feeds.feedburner.com/philosophizethis" },
    { name: "The Partially Examined Life", url: "https://partiallyexaminedlife.com/feed/podcast/" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
  ],

  "Fashion & Style": [
    { name: "Dressed: History of Fashion", url: "https://feeds.simplecast.com/dressedpodcast" },
    { name: "TED Talks Daily",             url: "https://feeds.megaphone.fm/TED9718394730" },
    { name: "Fresh Air (Arts)",            url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "99% Invisible",               url: "https://feeds.simplecast.com/BqbsxVfO" },
    { name: "Switched on Pop",             url: "https://feeds.megaphone.fm/switchedonpop" },
  ],

  "Life & Relationships": [
    { name: "Where Should We Begin?",      url: "https://feeds.simplecast.com/nxb_YAnl" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "Unlocking Us (Brené Brown)",  url: "https://feeds.simplecast.com/pKJL3yC9" },
    { name: "On Being with Krista Tippett",url: "https://feeds.feedburner.com/onbeing/rss" },
    { name: "Fresh Air",                   url: "https://feeds.npr.org/381444908/podcast.xml" },
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
  duration?:    string;
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
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&#8230;/g, "…")
        .replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "").replace(/<[^>]+>/g, "").trim();

      const rawUrl = extractText(seg, "link") ||
        seg.match(/<link[^>]+href="([^"]+)"/)?.[1] || "";
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

      const durationRaw =
        extractText(seg, "itunes:duration") ||
        extractText(seg, "duration") || "";
      const duration = durationRaw ? formatDuration(durationRaw) : "";

      const cleanDesc = description
        .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#8230;/g, "…")
        .replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
        .replace(/The post .+ appeared( first)? on .+\./gi, "")
        .replace(/\[\s*\.\.\.\s*\]/g, "…").replace(/\s+/g, " ").trim().slice(0, 1200);

      return {
        title, url,
        description:  cleanDesc,
        pubDate:      pubDateRaw,
        pubTimestamp: parsePubDate(pubDateRaw),
        sourceName,
        duration,
      };
    })
    .filter((i) => i.title && i.url);
}

function formatDuration(raw: string): string {
  const parts = raw.split(":").map(Number);
  let minutes = 0;
  if (parts.length === 1)      minutes = Math.round(parts[0] / 60);
  else if (parts.length === 2) minutes = parts[0] * 60 + parts[1];
  else if (parts.length === 3) minutes = parts[0] * 60 + parts[1];
  return minutes > 0 ? `${minutes} min` : "";
}

async function fetchRSSFeed(source: { name: string; url: string }): Promise<RSSItem[]> {
  const res = await fetch(source.url, {
    headers: {
      "User-Agent": "CoglettaBot/1.0 (RSS Reader; +https://cogletta.com)",
      Accept:       "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.url}`);
  const xml = await res.text();
  return extractItems(xml, source.name);
}

// ─── DynamoDB helpers ─────────────────────────────────────────────────────────

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
    const result = await dynamo.send(new QueryCommand({
      TableName:                 ARTICLES_TABLE,
      KeyConditionExpression:    "PK = :pk AND SK >= :skStart",
      ExpressionAttributeValues: { ":pk": Keys.userPK(userId), ":skStart": skStart },
      ProjectionExpression:      "articles, podcast",
    }));

    for (const item of result.Items ?? []) {
      const articles = (item.articles ?? []) as Article[];
      for (const a of articles) {
        if (a.url)    seenUrls.add(a.url);
        if (a.source) seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }
      const podcast = item.podcast as Podcast | null;
      if (podcast?.url)    seenUrls.add(podcast.url);
      if (podcast?.source) seenSources.set(podcast.source, (seenSources.get(podcast.source) ?? 0) + 1);
    }
  } catch (err) {
    console.warn("Failed to fetch recent history:", err);
  }

  return { seenUrls, seenSources };
}

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { PK: Keys.userPK(userId), SK: "PROFILE" },
      ProjectionExpression: "email",
    }));
    return (result.Item?.email as string) ?? null;
  } catch (err) {
    console.warn("Failed to fetch user email:", err);
    return null;
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  "Software & DevOps":  "🛠️",
  "Technology":         "💡",
  "World Politics":     "🌍",
  "Business":           "📈",
  "Economics":          "💰",
  "Science":            "🔬",
  "Productivity":       "⚡",
  "History":            "🏛️",
  "Arts & Culture":     "🎭",
  "Military":           "⚔️",
  "Health":             "🧬",
  "Environment":        "🌿",
  "Philosophy & Ethics": "🧠",
  "Fashion & Style":    "👗",
  "Life & Relationships": "💛",
};

function buildEmailHtml(article: Article, podcast: Podcast | null): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const emoji = CATEGORY_EMOJI[article.category] ?? "📄";

  const podcastBlock = podcast ? `
        <tr>
          <td style="padding:32px 0 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;padding-top:24px;">
              <tr>
                <td>
                  <span style="font-size:11px;font-weight:700;color:#d1d5db;margin-right:8px;">🎙</span>
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Podcast · ${podcast.category}</span>
                </td>
              </tr>
            </table>
            <h2 style="margin:10px 0 4px 0;font-size:18px;font-weight:700;line-height:1.3;color:#111827;">
              <a href="${podcast.url}" style="color:#111827;text-decoration:none;">${podcast.title}</a>
            </h2>
            <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-weight:500;">
              ${podcast.source} &nbsp;·&nbsp; ${podcast.duration}
            </p>
            <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
              ${podcast.summary} <a href="${podcast.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Listen &rarr;</a>
            </p>
          </td>
        </tr>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Cogletta</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;">
    <tr><td style="padding:32px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="padding:32px 36px 24px 36px;border-bottom:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
                <p style="margin:4px 0 0 0;font-size:13px;color:#9ca3af;">${today}</p></td>
                <td align="right" valign="top"><span style="font-size:12px;color:#9ca3af;">Your daily read</span></td>
              </tr>
            </table>
            <p style="margin:16px 0 12px 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">Your article for today is ready.</p>
            <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:#f3f4f6;border-radius:20px;font-size:11px;color:#6b7280;font-weight:500;">${emoji} ${article.category}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:32px 0;">
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${emoji} ${article.category}</span>
                  <h2 style="margin:10px 0 4px 0;font-size:21px;font-weight:700;line-height:1.3;color:#111827;">
                    <a href="${article.url}" style="color:#111827;text-decoration:none;">${article.title}</a>
                  </h2>
                  <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-weight:500;">${article.source} &nbsp;·&nbsp; ${article.readingTime}</p>
                  <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                    ${article.summary} <a href="${article.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Read full article &rarr;</a>
                  </p>
                  ${podcastBlock}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              Cogletta &nbsp;·&nbsp; Curated by AI, delivered every morning at 07:00.<br>
              <a href="#" style="color:#9ca3af;">Unsubscribe</a> &nbsp;·&nbsp; <a href="#" style="color:#9ca3af;">View in browser</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(article: Article, podcast: Podcast | null): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const podcastLine = podcast
    ? `\n\n---\n\n🎙 Podcast · ${podcast.category} — ${podcast.source}\n${podcast.title}\n${podcast.reason}\n${podcast.url}`
    : "";
  return `Cogletta — ${today}\n\nYour article for today:\n\n${article.category} — ${article.source}\n${article.title}\n${article.reason}\n${article.url}${podcastLine}\n\nNew content arrives every morning at 07:00.`;
}

async function sendDailyEmail(toEmail: string, article: Article, podcast: Podcast | null): Promise<void> {
  if (!article.url || article.url === "https://news.ycombinator.com") {
    console.warn(`No real article to email for ${toEmail}, skipping`);
    return;
  }
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  await ses.send(new SendEmailCommand({
    Source:      SES_FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Your Cogletta for ${today} is ready`, Charset: "UTF-8" },
      Body: {
        Html: { Data: buildEmailHtml(article, podcast), Charset: "UTF-8" },
        Text: { Data: buildEmailText(article, podcast), Charset: "UTF-8" },
      },
    },
  }));
  console.log(`Email sent to ${toEmail}`);
}

// ─── Filter & rank ────────────────────────────────────────────────────────────

interface ScoredCandidate extends RSSItem {
  freshness: "today" | "recent" | "older";
  penalised: boolean;
}

const ROUNDUP_PATTERNS    = /\b(weekly|roundup|link list|best of|this week in|top \d+)\b/i;
const PODCAST_PATTERNS    = /\b(podcast|transcript|episode|listen now|audio|ep\.|ep \d+)\b/i;
const VIDEO_PATTERNS      = /\b(video|watch|newsfeed|news feed)\b/i;
const VIDEO_URL_PATTERN   = /\/(video|videos|watch)\//i;
const BREAKING_PATTERNS   = /\b(breaking|live|live blog|live updates|live coverage|as it happened|in pictures|in maps)\b/i;
const LIVEBLOG_URL_PATTERN = /\/(liveblog|live-blog|live_blog|breaking|live\/)\//i;

function scoreAndFilter(items: RSSItem[], history: RecentHistory, isPodcast = false): ScoredCandidate[] {
  const now       = Date.now();
  const oneDayMs  = 24 * 60 * 60 * 1000;
  const twoDaysMs = 48 * 60 * 60 * 1000;

  return items
    .map((item): ScoredCandidate => {
      const age       = now - item.pubTimestamp;
      const freshness = age <= oneDayMs ? "today" : age <= twoDaysMs ? "recent" : "older";
      const penalised = history.seenUrls.has(item.url) || (history.seenSources.get(item.sourceName) ?? 0) >= 3;
      return { ...item, freshness, penalised };
    })
    .filter((item) => !history.seenUrls.has(item.url))
    .filter((item) => !ROUNDUP_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_URL_PATTERN.test(item.url))
    .filter((item) => !BREAKING_PATTERNS.test(item.title))
    .filter((item) => !LIVEBLOG_URL_PATTERN.test(item.url))
    .filter((item) => isPodcast || !PODCAST_PATTERNS.test(item.title))
    .sort((a, b) => {
      const freshnessScore = (f: string) => f === "today" ? 2 : f === "recent" ? 1 : 0;
      const diff = freshnessScore(b.freshness) - freshnessScore(a.freshness);
      if (diff !== 0) return diff;
      if (a.penalised !== b.penalised) return a.penalised ? 1 : -1;
      return b.pubTimestamp - a.pubTimestamp;
    });
}

// ─── Bedrock ──────────────────────────────────────────────────────────────────

interface BedrockSelection {
  selectedIndex: number;
  summary:       string;
  reason:        string;
  readingTime:   string;
}

async function selectBestArticle(candidates: ScoredCandidate[], interest: string, history: RecentHistory): Promise<BedrockSelection> {
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2).map(([src]) => src).join(", ");

  const candidateList = candidates
    .map((c, i) => `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    ${c.description.slice(0, 400)}`)
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen articles from: ${recentSourcesList}. Prefer a different source today if possible.`
    : "";

  const prompt = `You are an editorial assistant for Cogletta, a daily long-form article curation app for professionals who want to learn deeply.

User interest: "${interest}"
${diversityNote}

Select the single best LONG-FORM ARTICLE from the candidates below. Strictly prioritise:
1. DEPTH — prefer essays, research summaries, analysis pieces, think-tank reports. Reject short news items.
2. NO breaking news, liveblogs, or news dispatches — only analytical pieces.
3. SUBSTANCE — original analysis, research findings, or expert insight.
4. FORMAT — reject podcast transcripts, episode summaries, video reports. Only written long-form articles.
5. Freshness — prefer articles published TODAY or recently.
6. Source variety — avoid sources marked "[source shown recently]" unless clearly superior.
7. Strong relevance to "${interest}".

Candidates:
${candidateList}

Respond ONLY with valid JSON (no markdown):
{
  "selectedIndex": <0-${candidates.length - 1}>,
  "summary": "<3-4 sentences (~75 words). Recommend as if to a smart friend. Direct, curious, specific. No jargon. Don't start with 'This article'. Don't use 'delve', 'explore', 'unpack', 'shed light on'.>",
  "reason": "<One short sentence, max 20 words. Say specifically why THIS article is worth reading today.>",
  "readingTime": "<estimated reading time e.g. '8 min read'>"
}`;

  const command = new InvokeModelCommand({
    modelId:     "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept:      "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens:        400,
      messages:          [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw      = JSON.parse(new TextDecoder().decode(response.body));
  const text     = raw.content[0].text.trim()
    .replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ");

  let parsed: BedrockSelection;
  try {
    parsed = JSON.parse(text) as BedrockSelection;
  } catch {
    console.warn("Bedrock JSON parse failed, using index 0. Raw:", text.slice(0, 200));
    parsed = { selectedIndex: 0, summary: "", reason: "", readingTime: "~5 min read" };
  }

  if (typeof parsed.selectedIndex !== "number" || isNaN(parsed.selectedIndex)) parsed.selectedIndex = 0;

  const cleanStr = (s: string) => s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#\d+;/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  return { ...parsed, summary: cleanStr(parsed.summary ?? ""), reason: cleanStr(parsed.reason ?? "") };
}

interface BedrockPodcastSelection {
  selectedIndex: number;
  summary:       string;
  reason:        string;
  duration:      string;
}

async function selectBestPodcast(candidates: ScoredCandidate[], interest: string, history: RecentHistory): Promise<BedrockPodcastSelection> {
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2).map(([src]) => src).join(", ");

  const candidateList = candidates
    .map((c, i) => `[${i}] "${c.title}" — ${c.sourceName}${c.duration ? ` (${c.duration})` : ""} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    ${c.description.slice(0, 300)}`)
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen content from: ${recentSourcesList}. Prefer a different podcast show today if possible.`
    : "";

  const prompt = `You are an editorial assistant for Cogletta, a daily content curation app.

User interest: "${interest}"
${diversityNote}

Select the single best PODCAST EPISODE from the candidates below. Prioritise:
1. RELEVANCE — must directly address the user's interest area.
2. DEPTH — prefer substantive interviews, investigations, long-form analysis. STRICTLY AVOID daily news bulletins and breaking news recaps.
3. Freshness — prefer recent episodes but older landmark episodes are fine if clearly superior.
4. Source variety — avoid shows marked "[source shown recently]" unless clearly superior.

Candidates:
${candidateList}

Respond ONLY with valid JSON (no markdown):
{
  "selectedIndex": <0-${candidates.length - 1}>,
  "summary": "<2-3 sentences (~50 words). Say what the episode is actually about and why it's worth listening to.>",
  "reason": "<One short sentence, max 20 words. Say specifically why THIS episode is worth listening to today.>",
  "duration": "<episode duration e.g. '45 min', or estimate>"
}`;

  const command = new InvokeModelCommand({
    modelId:     "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept:      "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens:        300,
      messages:          [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw      = JSON.parse(new TextDecoder().decode(response.body));
  const text     = raw.content[0].text.trim()
    .replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ");

  let parsed: BedrockPodcastSelection;
  try {
    parsed = JSON.parse(text) as BedrockPodcastSelection;
  } catch {
    console.warn("Podcast Bedrock JSON parse failed, using index 0. Raw:", text.slice(0, 200));
    parsed = { selectedIndex: 0, summary: "", reason: "", duration: "" };
  }

  if (typeof parsed.selectedIndex !== "number" || isNaN(parsed.selectedIndex)) parsed.selectedIndex = 0;

  const cleanStr = (s: string) => s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#\d+;/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  return { ...parsed, summary: cleanStr(parsed.summary ?? ""), reason: cleanStr(parsed.reason ?? "") };
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
  userId:     string;
  interests:  string[];
  userEmail?: string;
}

export const handler = async (event: GenerateEvent): Promise<void> => {
  const { userId, interests } = event;

  if (!userId || !Array.isArray(interests) || interests.length < 1) {
    throw new Error("userId and at least 1 interest are required.");
  }

  const interestsLabel = interests.join(", ");
  console.log(`Generating for user=${userId} interests=${interestsLabel}`);

  const history = await fetchRecentHistory(userId);
  console.log(`History: ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`);

  // ── Article ───────────────────────────────────────────────────────────────
  let article: Article;
  try {
    const allSources = interests.flatMap(i => RSS_SOURCES[i] ?? []);
    if (allSources.length === 0) throw new Error(`No RSS sources for interests: ${interestsLabel}`);

    const feedResults = await Promise.allSettled(allSources.map(fetchRSSFeed));
    const allItems: RSSItem[] = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else console.warn(`Article feed failed: ${allSources[i].url}`, r.reason);
    });

    if (allItems.length === 0) throw new Error(`All article feeds failed for: ${interestsLabel}`);

    const candidates = scoreAndFilter(allItems, history, false);
    if (candidates.length === 0) throw new Error(`No fresh articles for: ${interestsLabel}`);

    console.log(`${interestsLabel}: ${allItems.length} raw → ${candidates.length} article candidates`);

    const top10     = candidates.slice(0, 10);
    const selection = await selectBestArticle(top10, interestsLabel, history);
    const idx       = typeof selection.selectedIndex === "number" && !isNaN(selection.selectedIndex)
                      ? Math.max(0, Math.min(selection.selectedIndex, top10.length - 1))
                      : 0;
    const chosen    = top10[idx] ?? top10[0];
    if (!chosen) throw new Error(`No candidate available after selection for: ${interestsLabel}`);

    const articleCategory = interests.find(i =>
      (RSS_SOURCES[i] ?? []).some(s => s.name === chosen.sourceName)
    ) ?? interests[0];

    article = {
      category:    articleCategory,
      title:       chosen.title,
      summary:     selection.summary || chosen.description || "Click to read the full article.",
      reason:      selection.reason,
      url:         chosen.url,
      source:      chosen.sourceName,
      readingTime: selection.readingTime || "~5 min read",
      publishedAt: chosen.pubDate || new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Article generation failed for "${interestsLabel}":`, err);
    article = fallbackArticle(interests[0]);
  }

  // ── Podcast ───────────────────────────────────────────────────────────────
  let podcast: Podcast | null = null;
  try {
    const allPodSources = interests.flatMap(i => PODCAST_SOURCES[i] ?? []);
    if (allPodSources.length === 0) throw new Error(`No podcast sources for: ${interestsLabel}`);

    const podFeedResults = await Promise.allSettled(allPodSources.map(fetchRSSFeed));
    const podItems: RSSItem[] = [];
    podFeedResults.forEach((r, i) => {
      if (r.status === "fulfilled") podItems.push(...r.value);
      else console.warn(`Podcast feed failed: ${allPodSources[i].url}`, r.reason);
    });

    if (podItems.length === 0) throw new Error(`All podcast feeds failed for: ${interestsLabel}`);

    const podCandidates = scoreAndFilter(podItems, history, true);
    if (podCandidates.length === 0) throw new Error(`No fresh podcast episodes for: ${interestsLabel}`);

    console.log(`${interestsLabel}: ${podItems.length} raw → ${podCandidates.length} podcast candidates`);

    const top10pod     = podCandidates.slice(0, 10);
    const podSelection = await selectBestPodcast(top10pod, interestsLabel, history);
    const podIdx       = typeof podSelection.selectedIndex === "number" && !isNaN(podSelection.selectedIndex)
                         ? Math.max(0, Math.min(podSelection.selectedIndex, top10pod.length - 1))
                         : 0;
    const chosenPod    = top10pod[podIdx] ?? top10pod[0];
    if (!chosenPod) throw new Error(`No podcast candidate after selection for: ${interestsLabel}`);

    const podCategory = interests.find(i =>
      (PODCAST_SOURCES[i] ?? []).some(s => s.name === chosenPod.sourceName)
    ) ?? interests[0];

    podcast = {
      category:    podCategory,
      title:       chosenPod.title,
      summary:     podSelection.summary || chosenPod.description || "Click to listen.",
      reason:      podSelection.reason,
      url:         chosenPod.url,
      source:      chosenPod.sourceName,
      duration:    podSelection.duration || chosenPod.duration || "—",
      publishedAt: chosenPod.pubDate || new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`Podcast generation failed for "${interestsLabel}":`, err);
  }

  // ── DynamoDB'e yaz ────────────────────────────────────────────────────────
  const now  = new Date();
  const item: DailyArticles = {
    PK:          Keys.userPK(userId),
    SK:          Keys.dateSK(now),
    articles:    [article],
    podcast:     podcast,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Wrote article + podcast for user=${userId} date=${Keys.dateSK(now)}`);

  // ── Email ─────────────────────────────────────────────────────────────────
  if (SES_FROM_EMAIL) {
    const userEmail = event.userEmail ?? await fetchUserEmail(userId);
    if (userEmail) {
      try {
        await sendDailyEmail(userEmail, article, podcast);
      } catch (err) {
        console.error("Failed to send email notification:", err);
      }
    } else {
      console.warn(`No email found for user=${userId}, skipping notification`);
    }
  }
};
