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

export const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {

  "Software & DevOps": [
    { name: "Stack Overflow Blog",     url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",           url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",                   url: "https://www.infoq.com/feed/" },
    { name: "The New Stack",           url: "https://thenewstack.io/feed/" },
    { name: "AWS Architecture",        url: "https://aws.amazon.com/blogs/architecture/feed/" },
    { name: "ACM Queue",               url: "https://queue.acm.org/rss/feeds/queuecontent.xml" },
    { name: "The Pragmatic Engineer",  url: "https://blog.pragmaticengineer.com/rss/" },
    { name: "Cloudflare Blog",         url: "https://blog.cloudflare.com/rss/" },
  ],

  "Technology": [
    { name: "MIT Technology Review",   url: "https://www.technologyreview.com/feed/" },
    { name: "IEEE Spectrum",           url: "https://spectrum.ieee.org/feeds/feed.rss" },
    { name: "Ars Technica",            url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Works in Progress",       url: "https://worksinprogress.co/rss.xml" },
    { name: "Rest of World",           url: "https://restofworld.org/feed/" },
    { name: "Wired",                   url: "https://www.wired.com/feed/rss" },
    { name: "404 Media",               url: "https://www.404media.co/rss/" },
    { name: "Sentiers",               url: "https://sentiers.media/feed/" },         // [VERIFY] teknoloji/gelecek üzerine haftalık düşünsel küratörlük
    { name: "Why is this interesting?", url: "https://whyisthisinteresting.substack.com/feed" }, // günlük deneme + seçilmiş linkler
  ],

  "World Politics": [
    { name: "Foreign Affairs",         url: "https://www.foreignaffairs.com/rss.xml" },
    { name: "War on the Rocks",        url: "https://warontherocks.com/feed/" },
    { name: "Atlantic Council",        url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Le Monde Diplomatique",   url: "https://mondediplo.com/spip.php?page=backend" },
    { name: "The Diplomat",            url: "https://thediplomat.com/feed/" },
    { name: "Foreign Policy",          url: "https://foreignpolicy.com/feed/" },
    { name: "Responsible Statecraft",  url: "https://responsiblestatecraft.org/feed/" },
    { name: "Just Security",           url: "https://www.justsecurity.org/feed/" },
  ],

  "Business": [
    { name: "MIT Sloan Review",        url: "https://sloanreview.mit.edu/feed/" },
    { name: "Noema Magazine",          url: "https://www.noemamag.com/feed/" },
    { name: "Knowledge at Wharton",    url: "https://knowledge.wharton.upenn.edu/feed/" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Fast Company",            url: "https://www.fastcompany.com/latest/rss" },
    { name: "Stratechery",             url: "https://stratechery.com/feed/" },
    { name: "Not Boring",              url: "https://www.notboring.co/feed" },
    { name: "Commoncog",               url: "https://commoncog.com/rss/" },
  ],

  "Economics": [
    { name: "Econlib",                 url: "https://www.econlib.org/feed/" },
    { name: "Noahpinion",              url: "https://www.noahpinion.blog/feed" },
    { name: "Works in Progress",       url: "https://worksinprogress.co/rss.xml" },
    { name: "Conversable Economist",   url: "https://conversableeconomist.com/feed/" },
    { name: "Marginal Revolution",     url: "https://marginalrevolution.com/feed" },
    { name: "Project Syndicate",       url: "https://www.project-syndicate.org/rss" },
    { name: "VoxEU (CEPR)",            url: "https://cepr.org/rss/vox-content" },
    { name: "Knowledge at Wharton",    url: "https://knowledge.wharton.upenn.edu/feed/" },
    { name: "Econbrowser",             url: "https://econbrowser.com/feed" },
    { name: "FRED Blog",               url: "https://fredblog.stlouisfed.org/feed" },
    { name: "The Big Picture",         url: "https://ritholtz.com/feed" },
    { name: "Chris Blattman",          url: "https://chrisblattman.com/feed" },
  ],

  "Science": [
    { name: "Quanta Magazine",         url: "https://api.quantamagazine.org/feed/" },
    { name: "Nautilus",                url: "https://nautil.us/feed/" },
    { name: "Undark",                  url: "https://undark.org/feed/" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Knowable Magazine",       url: "https://knowablemagazine.org/rss" },
    { name: "Ars Technica Science",    url: "https://feeds.arstechnica.com/arstechnica/science" },
    { name: "Scientific American",     url: "http://rss.sciam.com/ScientificAmerican-Global" },
    { name: "Smithsonian (Science)",   url: "https://www.smithsonianmag.com/rss/science-nature/" },
  ],

  "Productivity": [
    { name: "Farnam Street",           url: "https://fs.blog/feed/" },
    { name: "Ness Labs",               url: "https://nesslabs.com/feed" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "LessWrong",               url: "https://www.lesswrong.com/feed.xml" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Cal Newport",             url: "https://calnewport.com/feed/" },
    { name: "Scott H. Young",          url: "https://www.scotthyoung.com/blog/feed/" },
    { name: "Raptitude",               url: "https://www.raptitude.com/feed/" },
    { name: "Wait But Why",            url: "https://waitbutwhy.com/feed" },
    { name: "Steve Pavlina",           url: "https://stevepavlina.com/feed" },
    { name: "Productivityist",         url: "https://productivityist.com/category/blog/feed/" },
    { name: "Sources of Insight",      url: "http://feeds.feedburner.com/SourcesOfInsight" },
    { name: "Happier Human",           url: "https://happierhuman.com/feed" },
  ],

  "History": [
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "History Today",           url: "https://www.historytoday.com/feed/rss.xml" },
    { name: "JSTOR Daily",             url: "https://daily.jstor.org/feed/" },
    { name: "Lapham's Quarterly",      url: "https://www.laphamsquarterly.org/rss.xml" },
    { name: "The Public Domain Review", url: "https://publicdomainreview.org/rss.xml" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Engelsberg Ideas",        url: "https://engelsbergideas.com/feed/" },
    { name: "Smithsonian (History)",   url: "https://www.smithsonianmag.com/rss/history/" },
  ],

  "Arts & Culture": [
    { name: "Literary Hub (Arts)",     url: "https://lithub.com/category/newsandculture/art-and-photography/feed/" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Smithsonian Magazine",    url: "https://www.smithsonianmag.com/rss/latest_articles/" },
    { name: "Public Books",            url: "https://www.publicbooks.org/feed/" },
    { name: "JSTOR Daily",             url: "https://daily.jstor.org/feed/" },
    { name: "Eurozine",                url: "https://www.eurozine.com/feed/" },
    { name: "Longreads",               url: "https://longreads.com/feed/" },
    { name: "Hyperallergic",           url: "https://hyperallergic.com/feed/" },
    { name: "Arts & Letters Daily",   url: "https://www.aldaily.com/feed/" },        // [VERIFY] türün atası — günde 3 seçilmiş deneme/eleştiri, 1998'den beri
    { name: "Kottke",                 url: "https://feeds.kottke.org/main" },        // 25+ yıldır kültür/fikir küratörlüğü yapan klasik blog
    { name: "The Sunday Long Read",   url: "https://sundaylongread.com/feed/" },
      ],

  "Military": [
    { name: "War on the Rocks",        url: "https://warontherocks.com/feed/" },
    { name: "Modern War Institute",    url: "https://mwi.westpoint.edu/feed/" },
    { name: "Inkstick Media",          url: "https://inkstickmedia.com/feed/" },
    { name: "Atlantic Council",        url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Defense One",             url: "https://www.defenseone.com/rss/all/" },
    { name: "Breaking Defense",        url: "https://breakingdefense.com/feed/" },
    { name: "The War Zone",            url: "https://www.twz.com/feed" },
    { name: "The Diplomat",            url: "https://thediplomat.com/feed/" },
  ],

  "Health": [
    { name: "Stat News",               url: "https://www.statnews.com/feed/" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Knowable Magazine",       url: "https://knowablemagazine.org/rss" },
    { name: "Scientific American",     url: "http://rss.sciam.com/ScientificAmerican-Global" },
    { name: "NPR Health (Shots)",      url: "https://feeds.npr.org/1128/rss.xml" },
    { name: "The Conversation (Health)", url: "https://theconversation.com/us/health/articles.atom" },
    { name: "Undark",                  url: "https://undark.org/feed/" },
    { name: "Nautilus",                url: "https://nautil.us/feed/" },
    { name: "Fight Aging",             url: "https://www.fightaging.org/feed" },
    { name: "Peter Attia (Articles)",  url: "https://peterattiamd.com/feed" },
  ],

  "Environment": [
    { name: "Yale Environment 360",    url: "https://e360.yale.edu/feed.xml" },
    { name: "Carbon Brief",            url: "https://www.carbonbrief.org/feed/" },
    { name: "Grist",                   url: "https://grist.org/feed/" },
    { name: "Anthropocene Magazine",   url: "https://www.anthropocenemagazine.org/feed/" },
    { name: "bioGraphic",              url: "https://www.biographic.com/feed/" },
    { name: "Atmos",                   url: "https://atmos.earth/feed/" },
    { name: "Noema Magazine",          url: "https://www.noemamag.com/feed/" },
    { name: "Knowable Magazine",       url: "https://knowablemagazine.org/rss" },
    { name: "Yale Climate Connections", url: "https://yaleclimateconnections.org/feed" },
    { name: "Legal Planet",            url: "https://legal-planet.org/feed" },
    { name: "Weather West",            url: "https://weatherwest.com/feed" },
    { name: "CleanTechnica",           url: "https://cleantechnica.com/feed" },
  ],

  "Philosophy & Ethics": [
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Philosophy Now",          url: "https://philosophynow.org/rss" },
    { name: "The Conversation (Phil)", url: "https://theconversation.com/us/articles.atom" },
    { name: "Practical Ethics (Oxford)", url: "http://blog.practicalethics.ox.ac.uk/feed/" },
    { name: "The Point Magazine",      url: "https://thepointmag.com/feed/" },
    { name: "3 Quarks Daily",          url: "https://3quarksdaily.com/feed" },
    { name: "Arts & Letters Daily",   url: "https://www.aldaily.com/feed/" },
  ],

  "Fashion & Style": [
  { name: "Business of Fashion",     url: "https://www.businessoffashion.com/feed/" },
  { name: "Dazed (Fashion)",         url: "https://www.dazeddigital.com/rss" },
  { name: "Vestoj",                  url: "https://vestoj.com/feed/" },
  { name: "Blackbird Spyplane",      url: "https://www.blackbirdspyplane.com/feed" },
  { name: "Put This On",             url: "https://putthison.com/feed/" },
  { name: "Who What Wear",           url: "https://www.whowhatwear.com/feeds.xml" },
  { name: "Permanent Style",         url: "https://www.permanentstyle.com/feed" },
  { name: "Ape to Gentleman",        url: "https://apetogentleman.com/feed" },
],

  "Life & Relationships": [
    { name: "Psyche (Aeon)",           url: "https://psyche.co/feed" },
    { name: "Aeon",                    url: "https://aeon.co/feed.rss" },
    { name: "Ness Labs",               url: "https://nesslabs.com/feed" },
    { name: "The Marginalian",         url: "https://www.themarginalian.org/feed/" },
    { name: "The Gottman Institute",   url: "https://www.gottman.com/blog/feed/" },
    { name: "Behavioral Scientist",    url: "https://behavioralscientist.org/feed/" },
    { name: "Tiny Buddha",             url: "https://tinybuddha.com/feed/" },
    { name: "Raptitude",               url: "https://www.raptitude.com/feed/" },
    { name: "Kendra Nicole",           url: "https://kendranicole.net/feed/" },
    { name: "Mark Manson",             url: "https://markmanson.net/feed" },
    { name: "Gretchen Rubin",          url: "https://gretchenrubin.com/feed" },
    { name: "Child & Family Blog",     url: "https://childandfamilyblog.com/feed" },
    { name: "The Positivity Blog",     url: "https://positivityblog.com/feed" },
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
    { name: "Acquired",                    url: "https://feeds.transistor.fm/acquired" },
    { name: "Search Engine",               url: "https://rss.amperwave.net/v2/feed/audacynetwork/search-engine" },
  ],

  "World Politics": [
    { name: "War on the Rocks",            url: "https://rss.libsyn.com/shows/70702/destinations/298196.xml" },
    { name: "Foreign Policy Podcast",      url: "https://foreignpolicy.com/podcasts/feed/" },
    { name: "From Our Own Correspondent",  url: "https://podcasts.files.bbci.co.uk/b006qjlq.rss" },
    { name: "The Foreign Affairs Interview", url: "https://feed.podbean.com/foreignaffairsmagazine/feed.xml" },
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
    { name: "Macro Musings",               url: "https://macromusings.libsyn.com/rss" },
  ],

  "Science": [
    { name: "In Our Time",                 url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",              url: "https://feeds.simplecast.com/h18ZIZD_" },
    { name: "Huberman Lab",                url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Radiolab",                    url: "http://feeds.wnyc.org/radiolab" },
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
    { name: "Tides of History",            url: "https://rss.art19.com/tides-of-history" },
  ],

  "Arts & Culture": [
    { name: "Switched on Pop",             url: "https://feeds.megaphone.fm/switchedonpop" },
    { name: "99% Invisible",               url: "https://feeds.simplecast.com/BqbsxVfO" },
    { name: "Fresh Air (Arts)",            url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Friday Night Comedy (BBC)",   url: "https://podcasts.files.bbci.co.uk/p02pc9pj.rss" },
    { name: "The Week in Art",             url: "https://feeds.acast.com/public/shows/5e29a2ef7644ff6b3f984cff" },
  ],

  "Military": [
    { name: "War on the Rocks",            url: "https://rss.libsyn.com/shows/70702/destinations/298196.xml" },
    { name: "Modern War Institute",        url: "https://mwi.westpoint.edu/category/podcasts/feed/" },
    { name: "Foreign Policy Podcast",      url: "https://foreignpolicy.com/podcasts/feed/" },
    { name: "Throughline",                 url: "https://feeds.npr.org/510333/podcast.xml" },
  ],

  "Health": [
    { name: "Huberman Lab",                url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "In Our Time (Medicine)",      url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",              url: "https://feeds.simplecast.com/h18ZIZD_" },
    { name: "The Peter Attia Drive",       url: "https://peterattiadrive.libsyn.com/rss" },
  ],

  "Environment": [
    { name: "Volts",                       url: "https://www.volts.wtf/feed" },
    { name: "Outside/In",                  url: "https://rss.introcast.io/1061222770/feeds.megaphone.fm/TPG9719828981" },
    { name: "Emergence Magazine",          url: "https://feeds.captivate.fm/emergence-magazine/" },
    { name: "The Climate Question (BBC)",  url: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss" },
  ],

  "Philosophy & Ethics": [
    { name: "In Our Time (Philosophy)",    url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Philosophize This!",          url: "https://feeds.feedburner.com/philosophizethis" },
    { name: "The Partially Examined Life", url: "https://partiallyexaminedlife.com/feed/podcast/" },
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "Philosophy Bites",            url: "https://philosophybites.libsyn.com/rss" },
  ],

  "Fashion & Style": [
    { name: "99% Invisible",             url: "https://feeds.simplecast.com/BqbsxVfO" },
    { name: "The BoF Podcast",           url: "https://feeds.acast.com/public/shows/6355d904dd5e0e0012da88d1" },
    { name: "The Glossy Podcast",        url: "https://feeds.megaphone.fm/DIGI4036367252" },
    { name: "Articles of Interest",      url: "https://feed.articlesofinterest.club/" },
    { name: "Dressed: History of Fashion", url: "https://feeds.megaphone.fm/ARML9655034287" },
  ],

  "Life & Relationships": [
    { name: "Hidden Brain",                url: "https://feeds.npr.org/510308/podcast.xml" },
    { name: "Fresh Air",                   url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Where Should We Begin?",      url: "https://feeds.megaphone.fm/ep-wswb" },
    { name: "The Happiness Lab",           url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/d623ef0b-3fee-4c26-b815-ae32006cd739/podcast.rss" },
    { name: "The Science of Happiness",    url: "http://feeds.feedburner.com/TheScienceOfHappiness" },
  ],
};

// ─── RSS fetch & parse ────────────────────────────────────────────────────────

export interface RSSItem {
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

/**
 * Normalises tracking variants of the same article URL without changing the
 * destination itself. If parsing fails, the original URL is preserved.
 */
export function canonicalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;

  try {
    const url = new URL(value);
    url.hash = "";

    const trackingParams = new Set([
      "fbclid", "gclid", "dclid", "mc_cid", "mc_eid",
      "ref", "referrer", "source",
    ]);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || trackingParams.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") ||
        (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.replace(/#.*$/, "").replace(/\/$/, "");
  }
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
      const url = canonicalizeUrl(rawUrl
        .replace(/&#038;/g, "&").replace(/&amp;/g, "&")
        .replace(/&#\d+;/g, "").trim());

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

export async function fetchRSSFeed(source: { name: string; url: string }): Promise<RSSItem[]> {
  const res = await fetch(source.url, {
    headers: {
      // Gerçek tarayıcı UA'sı: Aeon/NYT/The Conversation/IAI gibi yayıncılar
      // bot UA'larını 403 ile engelliyor. Tarayıcı gibi görünmek feed başarısını
      // ciddi artırır.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.url}`);
  const xml = await res.text();
  return extractItems(xml, source.name);
}

// ─── DynamoDB helpers ─────────────────────────────────────────────────────────

export interface RecentHistory {
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
        if (a.url)    seenUrls.add(canonicalizeUrl(a.url));
        if (a.source) seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }
      const podcast = item.podcast as Podcast | null;
      if (podcast?.url)    seenUrls.add(canonicalizeUrl(podcast.url));
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
  "Fashion & Style":     "👗",
  "Life & Relationships": "💛",
};

function articleEmailBlock(article: Article, withDivider: boolean): string {
  const emoji = CATEGORY_EMOJI[article.category] ?? "📄";
  const divider = withDivider
    ? "border-top:1px solid #f3f4f6;padding-top:28px;margin-top:4px;"
    : "";
  return `
              <tr>
                <td style="padding:28px 0;${divider}">
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${emoji} ${article.category}</span>
                  <h2 style="margin:10px 0 4px 0;font-size:21px;font-weight:700;line-height:1.3;color:#111827;">
                    <a href="${article.url}" style="color:#111827;text-decoration:none;">${article.title}</a>
                  </h2>
                  <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-weight:500;">${article.source} &nbsp;·&nbsp; ${article.readingTime}</p>
                  <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                    ${article.summary} <a href="${article.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Read full article &rarr;</a>
                  </p>
                </td>
              </tr>`;
}

function podcastEmailBlock(podcast: Podcast): string {
  return `
              <tr>
                <td style="padding:28px 0;border-top:1px solid #f3f4f6;">
                  <span style="font-size:11px;font-weight:700;color:#d1d5db;margin-right:8px;">🎙</span>
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Podcast · ${podcast.category}</span>
                  <h2 style="margin:10px 0 4px 0;font-size:18px;font-weight:700;line-height:1.3;color:#111827;">
                    <a href="${podcast.url}" style="color:#111827;text-decoration:none;">${podcast.title}</a>
                  </h2>
                  <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-weight:500;">${podcast.source} &nbsp;·&nbsp; ${podcast.duration}</p>
                  <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                    ${podcast.summary} <a href="${podcast.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Listen &rarr;</a>
                  </p>
                </td>
              </tr>`;
}

function buildEmailHtml(articles: Article[], podcasts: Podcast[]): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const multi   = articles.length > 1;
  const heading = multi
    ? `Your ${articles.length} articles for today are ready.`
    : "Your article for today is ready.";

  // Başlıktaki kategori rozetleri (tekrarsız)
  const cats = Array.from(new Set(articles.map(a => a.category)));
  const chips = cats.map(c => {
    const e = CATEGORY_EMOJI[c] ?? "📄";
    return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:#f3f4f6;border-radius:20px;font-size:11px;color:#6b7280;font-weight:500;">${e} ${c}</span>`;
  }).join("");

  const articleBlocks = articles.map((a, i) => articleEmailBlock(a, i > 0)).join("");
  const podcastBlocks = podcasts.map(podcastEmailBlock).join("");

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
            <p style="margin:16px 0 12px 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${heading}</p>
            ${chips}
          </td>
        </tr>
        <tr>
          <td style="padding:0 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">${articleBlocks}${podcastBlocks}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              Cogletta &nbsp;·&nbsp; delivered every morning.<br>
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

function buildEmailText(articles: Article[], podcasts: Podcast[]): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const articleLines = articles
    .map(a => `${a.category} — ${a.source}\n${a.title}\n${a.reason}\n${a.url}`)
    .join("\n\n");
  const podcastLines = podcasts.length
    ? "\n\n---\n\n" + podcasts
        .map(p => `🎙 Podcast · ${p.category} — ${p.source}\n${p.title}\n${p.reason}\n${p.url}`)
        .join("\n\n")
    : "";
  const intro = articles.length > 1 ? "Your articles for today:" : "Your article for today:";
  return `Cogletta — ${today}\n\n${intro}\n\n${articleLines}${podcastLines}\n\nNew content arrives every morning at 07:00.`;
}

export async function sendDailyEmail(toEmail: string, articles: Article[], podcasts: Podcast[]): Promise<void> {
  // Fallback dışında gerçek makalesi olanları tut
  const real = articles.filter(a => a.url && a.url !== "https://news.ycombinator.com");
  if (real.length === 0) {
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
        Html: { Data: buildEmailHtml(real, podcasts), Charset: "UTF-8" },
        Text: { Data: buildEmailText(real, podcasts), Charset: "UTF-8" },
      },
    },
  }));
  console.log(`Email sent to ${toEmail} (${real.length} article(s), ${podcasts.length} podcast(s))`);
}

// ─── Filter & rank ────────────────────────────────────────────────────────────

interface ScoredCandidate extends RSSItem {
  freshness: "today" | "recent" | "older";
  penalised: boolean;
}

const ROUNDUP_PATTERNS     = /\b(weekly|roundup|link list|best of|this week in|top \d+)\b/i;
const PODCAST_PATTERNS     = /\b(podcast|transcript|episode|listen now|audio|ep\.|ep \d+)\b/i;
const VIDEO_PATTERNS       = /\b(video|watch|newsfeed|news feed)\b/i;
const VIDEO_URL_PATTERN    = /\/(video|videos|watch)\//i;
const BREAKING_PATTERNS    = /\b(breaking|live|live blog|live updates|live coverage|as it happened|in pictures|in maps)\b/i;
const LIVEBLOG_URL_PATTERN = /\/(liveblog|live-blog|live_blog|breaking|live\/)\//i;
// URL YOLUNDA haber göstergesi: /news/, /news-features/ vb. altındaki içerik
// haber raporudur, analiz değil — ürün tezi gereği elenir. Yalnızca path'e
// bakılır; hostname'e bakılmaz (statnews.com gibi alan adları kurban gitmesin).
const NEWS_URL_PATH_PATTERN = /\/(news|news-features|breaking-news|headlines|newswire|latest-news)(\/|$)/i;
// "blog" içeren URL'lere sıralama önceliği — kişisel/kurumsal bloglar tercih edilir.
const BLOG_URL_PATTERN = /(\/blog\/|\/blogs\/|^https?:\/\/blog\.)/i;
function urlPath(u: string): string {
  try { return new URL(u).pathname; } catch { return u; }
}

const ARTICLE_MAX_AGE_DAYS: Record<string, number> = {
  "Software & DevOps": 14,
  "Technology": 7,
  "World Politics": 4,
  "Business": 10,
  "Economics": 10,
  "Science": 14,
  "Productivity": 30,
  "History": 60,
  "Arts & Culture": 30,
  "Military": 10,
  "Health": 14,
  "Environment": 21,
  "Philosophy & Ethics": 60,
  "Fashion & Style": 45,
  "Life & Relationships": 30,
};

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " " )
    .replace(/\s+/g, " " )
    .trim();
}

function scoreAndFilter(
  items: RSSItem[],
  history: RecentHistory,
  isPodcast = false,
  scope: string[] = []
): ScoredCandidate[] {
  const now       = Date.now();
  const oneDayMs  = 24 * 60 * 60 * 1000;
  const twoDaysMs = 48 * 60 * 60 * 1000;
  // For multi-interest pools use the most permissive category window so an
  // evergreen category is not accidentally starved by a news-heavy one.
  const maxAgeDays = isPodcast
    ? 45
    : Math.max(7, ...scope.map(category => ARTICLE_MAX_AGE_DAYS[category] ?? 30));
  const maxAgeMs = maxAgeDays * oneDayMs;

  const sorted = items
    .map((item): ScoredCandidate => {
      const url        = canonicalizeUrl(item.url);
      const age        = item.pubTimestamp > 0 ? now - item.pubTimestamp : Number.POSITIVE_INFINITY;
      const freshness  = age <= oneDayMs ? "today" : age <= twoDaysMs ? "recent" : "older";
      const penalised  = history.seenUrls.has(url) || (history.seenSources.get(item.sourceName) ?? 0) >= 3;
      return { ...item, url, freshness, penalised };
    })
    .filter((item) => !history.seenUrls.has(item.url))
    .filter((item) => item.pubTimestamp === 0 || now - item.pubTimestamp <= maxAgeMs)
    .filter((item) => !ROUNDUP_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_URL_PATTERN.test(item.url))
    .filter((item) => !BREAKING_PATTERNS.test(item.title))
    .filter((item) => !LIVEBLOG_URL_PATTERN.test(item.url))
    .filter((item) => isPodcast || !NEWS_URL_PATH_PATTERN.test(urlPath(item.url)))
    .filter((item) => isPodcast || !PODCAST_PATTERNS.test(item.title))
    .sort((a, b) => {
      const freshnessScore = (f: string) => f === "today" ? 2 : f === "recent" ? 1 : 0;
      const diff = freshnessScore(b.freshness) - freshnessScore(a.freshness);
      if (diff !== 0) return diff;
      if (a.penalised !== b.penalised) return a.penalised ? 1 : -1;
      const blogDiff = (BLOG_URL_PATTERN.test(b.url) ? 1 : 0) - (BLOG_URL_PATTERN.test(a.url) ? 1 : 0);
      if (blogDiff !== 0) return blogDiff;
      return b.pubTimestamp - a.pubTimestamp;
    });

  // Remove exact URL duplicates and near-identical title duplicates after
  // ranking, keeping the strongest/freshest occurrence.
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return sorted.filter(item => {
    const titleKey = normaliseTitle(item.title);
    if (seenUrls.has(item.url) || (titleKey && seenTitles.has(titleKey))) return false;
    seenUrls.add(item.url);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
}

/** Selects a source-balanced shortlist while preserving the ranking order. */
function buildBalancedShortlist(candidates: ScoredCandidate[], limit = 12, maxPerSource = 2): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const sourceCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const count = sourceCounts.get(candidate.sourceName) ?? 0;
    if (count >= maxPerSource) continue;
    selected.push(candidate);
    sourceCounts.set(candidate.sourceName, count + 1);
    if (selected.length >= limit) break;
  }

  return selected;
}

function truncateDescription(description: string, maxLength = 320): string {
  const clean = description.replace(/\s+/g, " " ).trim();
  if (clean.length <= maxLength) return clean;

  const window = clean.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentenceEnd >= Math.floor(maxLength * 0.65)) return window.slice(0, sentenceEnd + 1).trim();

  const wordEnd = window.lastIndexOf(" " );
  return `${window.slice(0, wordEnd > 0 ? wordEnd : maxLength).trim()}…`;
}

// ─── Bedrock ──────────────────────────────────────────────────────────────────

interface BedrockSelection {
  selectedIndex: number;
  category:      string;
  summary:       string;
  reason:        string;
  readingTime:   string;
}

async function selectBestArticle(candidates: ScoredCandidate[], interests: string[], history: RecentHistory, subTopicContext = ""): Promise<BedrockSelection> {
  const interest = interests.join(", ");
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2).map(([src]) => src).join(", ");

  const candidateList = candidates
    .map((c, i) => `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    URL: ${c.url}\n    ${truncateDescription(c.description, 320)}`)
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen articles from: ${recentSourcesList}. Prefer a different source today if possible.`
    : "";

  const categoryList = interests.map(i => `"${i}"`).join(", ");

  const LIGHT_CATEGORIES = ["Life & Relationships"];
  const toneNote = interests.some(i => LIGHT_CATEGORIES.includes(i))
    ? `\nTONE (applies to Life & Relationships): readers of these sections want pieces that are uplifting, warm, practical, or delightful — personal growth, style, joy, connection, creativity, everyday life. Strongly prefer positive, hopeful, or genuinely useful angles. AVOID heavy or distressing subjects (war, death, grief, trauma, abuse, serious illness, tragedy) unless there is truly nothing else on-topic. When two candidates fit, always choose the lighter, more enjoyable one.`
    : "";

  const prompt = `You curate Cogletta's daily long-form reading picks.

Valid user interests only:
${categoryList}${subTopicContext}
${diversityNote}

Choose the single best written long-form article genuinely about one valid interest.

Reject any candidate that is:
- off-topic when judged from title, description and URL slug; never infer topic from a general-interest source name
- a transcript, episode summary, video report, breaking-news dispatch or liveblog

Among eligible pieces prefer depth (essay, analysis, research or report), then freshness and source variety. Avoid a recently shown source unless clearly better.
${toneNote}
Return selectedIndex -1 when none is clearly eligible.

Candidates:
${candidateList}

Return only valid JSON:
{
  "selectedIndex": <0-${candidates.length - 1}, or -1>,
  "category": "<one exact valid interest; empty when -1>",
  "summary": "<3-4 sentences, about 75 words; direct, specific and jargon-free; do not begin 'This article' or use delve/explore/unpack/shed light on>",
  "reason": "<max 18 words; a concrete idea, question, tension or takeaway; no generic relevance or must-read wording>",
  "readingTime": "<estimate such as '8 min read'>"
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
    console.warn("Bedrock JSON parse failed; using the highest-ranked candidate safely. Raw:", text.slice(0, 200));
    parsed = { selectedIndex: 0, category: "", summary: "", reason: "", readingTime: "~5 min read" };
  }

  if (!Number.isInteger(parsed.selectedIndex) || parsed.selectedIndex < -1 || parsed.selectedIndex >= candidates.length) {
    console.warn(`Bedrock returned invalid article index ${parsed.selectedIndex}; using highest-ranked candidate.`);
    parsed.selectedIndex = 0;
  }

  const cleanStr = (s: string) => s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#\d+;/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  return { ...parsed, category: (parsed.category ?? "").trim(), summary: cleanStr(parsed.summary ?? ""), reason: cleanStr(parsed.reason ?? "") };
}

interface BedrockPodcastSelection {
  selectedIndex: number;
  category:      string;
  summary:       string;
  reason:        string;
  duration:      string;
}

async function selectBestPodcast(candidates: ScoredCandidate[], interests: string[], history: RecentHistory, subTopicContext = ""): Promise<BedrockPodcastSelection> {
  const interest = interests.join(", ");
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2).map(([src]) => src).join(", ");

  const candidateList = candidates
    .map((c, i) => `[${i}] "${c.title}" — ${c.sourceName}${c.duration ? ` (${c.duration})` : ""} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    URL: ${c.url}\n    ${truncateDescription(c.description, 300)}`)
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen content from: ${recentSourcesList}. Prefer a different podcast show today if possible.`
    : "";

  const categoryList = interests.map(i => `"${i}"`).join(", ");

  const LIGHT_CATEGORIES = ["Life & Relationships"];
  const toneNote = interests.some(i => LIGHT_CATEGORIES.includes(i))
    ? `\nTONE (applies to Life & Relationships): prefer episodes that are uplifting, warm, practical, or fun — personal growth, style, joy, connection, creativity, everyday life. AVOID heavy or distressing subjects (war, death, grief, trauma, abuse, serious illness) unless there is truly nothing else on-topic. When two fit, choose the lighter, more enjoyable one.`
    : "";

  const prompt = `You are an editorial assistant for Cogletta, a daily content curation app.

The user follows these interests — these are the ONLY valid categories:
${categoryList}${subTopicContext}
${diversityNote}

Select the single best PODCAST EPISODE that is genuinely ABOUT one of the user's interests above.

HARD REQUIREMENTS — a candidate that fails ANY of these is NOT eligible:
- RELEVANCE: the episode must clearly address one of the user's interests. Judge from the title, description AND URL slug. General shows publish on many topics, so never assume relevance from the show name — judge by the episode content.
- DEPTH: prefer substantive interviews, investigations, long-form analysis. STRICTLY AVOID daily news bulletins and breaking-news recaps.

Among ELIGIBLE candidates, prefer freshness (recent episodes) and source variety (avoid shows marked "[source shown recently]" unless clearly superior).
${toneNote}
If NONE of the candidates is clearly about one of the user's interests, respond with selectedIndex -1.

Candidates:
${candidateList}

Respond ONLY with valid JSON (no markdown):
{
  "selectedIndex": <0-${candidates.length - 1}, or -1 if no candidate is on-topic>,
  "category": "<the ONE user interest this episode belongs to, copied EXACTLY from the list above; empty string if selectedIndex is -1>",
  "summary": "<2-3 sentences (~50 words). Say what the episode is actually about and why it's worth listening to.>",
  "reason": "<One short, natural sentence (max 18 words) naming a CONCRETE hook from THIS episode — a specific idea, guest, or question a listener would be curious about. Sound like a friend recommending it. NEVER use filler like 'directly relevant to your interests', 'relevant to you', 'for your interest in', 'a must-listen', 'perfect for you', and do NOT just name the category.>",
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
    console.warn("Podcast Bedrock JSON parse failed; using the highest-ranked candidate safely. Raw:", text.slice(0, 200));
    parsed = { selectedIndex: 0, category: "", summary: "", reason: "", duration: "" };
  }

  if (!Number.isInteger(parsed.selectedIndex) || parsed.selectedIndex < -1 || parsed.selectedIndex >= candidates.length) {
    console.warn(`Bedrock returned invalid podcast index ${parsed.selectedIndex}; using highest-ranked candidate.`);
    parsed.selectedIndex = 0;
  }

  const cleanStr = (s: string) => s
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…").replace(/&#\d+;/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  return { ...parsed, category: (parsed.category ?? "").trim(), summary: cleanStr(parsed.summary ?? ""), reason: cleanStr(parsed.reason ?? "") };
}


// ─── Shared topic-pool generation ─────────────────────────────────────────────

export interface TopicPoolOptions {
  activeSubTopics?: string[];
  minSize?: number;
  maxSize?: number;
}

interface PoolSelectionItem {
  selectedIndex: number;
  subTopics?: string[];
  qualityScore?: number;
  summary?: string;
  reason?: string;
  readingTime?: string;
  duration?: string;
}

interface PoolSelectionResponse {
  items: PoolSelectionItem[];
  unrepresentedSubTopics?: string[];
}

function normaliseSubTopic(value: string): string {
  return value.trim().toLowerCase();
}

function poolSizeFor(activeSubTopics: string[], minSize = 10, maxSize = 20): number {
  return Math.min(maxSize, Math.max(minSize, activeSubTopics.length + 4));
}

function sanitiseSubTopics(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const allowedMap = new Map(allowed.map(v => [normaliseSubTopic(v), v]));
  const result: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const exact = allowedMap.get(normaliseSubTopic(raw));
    if (exact && !result.includes(exact)) result.push(exact);
  }
  return result;
}

async function fetchPoolCandidates(category: string, history: RecentHistory, isPodcast: boolean): Promise<ScoredCandidate[]> {
  const sourceMap = isPodcast ? PODCAST_SOURCES : RSS_SOURCES;
  const sources = sourceMap[category] ?? [];
  if (!sources.length) return [];
  const results = await Promise.allSettled(sources.map(fetchRSSFeed));
  const allItems: RSSItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") allItems.push(...r.value);
    else console.warn(`${isPodcast ? "Podcast" : "Article"} feed failed: ${sources[i].url}`, r.reason);
  });
  const filtered = scoreAndFilter(allItems, history, isPodcast, [category]);
  return buildBalancedShortlist(filtered, isPodcast ? 24 : 40, isPodcast ? 3 : 4);
}

async function selectPoolWithBedrock(
  candidates: ScoredCandidate[],
  category: string,
  activeSubTopics: string[],
  desiredSize: number,
  isPodcast: boolean
): Promise<PoolSelectionResponse> {
  const candidateList = candidates.map((c, i) =>
    `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})\nURL: ${c.url}\n${truncateDescription(c.description, isPodcast ? 260 : 300)}`
  ).join("\n\n");
  const subTopicText = activeSubTopics.length
    ? activeSubTopics.map(s => `- ${s}`).join("\n")
    : "- none configured; use an empty subTopics array";
  const contentType = isPodcast ? "podcast episodes" : "long-form articles";
  const extraFields = isPodcast
    ? `"duration": "<duration or estimate>"`
    : `"readingTime": "<estimate such as '8 min read'>"`;
  const prompt = `Create today's shared Cogletta ${category} pool from the candidates below.\n\nSelect up to ${desiredSize} high-quality ${contentType}. Rank best first. Never repeat an index. Include at most two items from any single source. REJECT incident reports, battlefield updates and other current-events coverage; choose analysis, essays and explainers with lasting value. Also REJECT announcements, product or tool releases, calls for papers, event listings and other meta/professional-news posts — every item must itself be a substantive read. Reject off-topic, roundup, transcript, video, breaking-news or liveblog content. Prefer depth, freshness and source diversity.\n\nActive sub-topics selected by users:\n${subTopicText}\n\nCoverage rule: when a clearly relevant quality candidate exists, include at least one item for every active sub-topic. Never force weak or unrelated content merely to fill coverage. Tag each selected item only with exact sub-topic names from the list. General ${category} pieces may have an empty subTopics array.\n\nCandidates:\n${candidateList}\n\nReturn only valid JSON:\n{\n  "items": [\n    {\n      "selectedIndex": <candidate index>,\n      "subTopics": ["<exact active sub-topic>"],\n      "qualityScore": <0-100>,\n      "summary": "<specific ${isPodcast ? "2-3" : "3-4"} sentence summary>",\n      "reason": "<max 18 words; concrete hook>",\n      ${extraFields}\n    }\n  ],\n  "unrepresentedSubTopics": ["<exact active sub-topic with no suitable selected item>"]\n}`;
  const command = new InvokeModelCommand({
    modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: isPodcast ? 1800 : 3200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  try {
    const response = await bedrock.send(command);
    const raw = JSON.parse(new TextDecoder().decode(response.body));
    const text = raw.content[0].text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(text) as PoolSelectionResponse;
    const seen = new Set<number>();
    const items = (Array.isArray(parsed.items) ? parsed.items : []).filter(item => {
      if (!Number.isInteger(item.selectedIndex) || item.selectedIndex < 0 || item.selectedIndex >= candidates.length || seen.has(item.selectedIndex)) return false;
      seen.add(item.selectedIndex);
      return true;
    }).slice(0, desiredSize);
    return {
      items,
      unrepresentedSubTopics: sanitiseSubTopics(parsed.unrepresentedSubTopics, activeSubTopics),
    };
  } catch (err) {
    console.warn(`Pool Bedrock response failed for ${category}; using deterministic shortlist fallback`, err);
    return {
      items: candidates.slice(0, desiredSize).map((_, selectedIndex) => ({ selectedIndex, subTopics: [], qualityScore: Math.max(50, 90 - selectedIndex) })),
      unrepresentedSubTopics: activeSubTopics,
    };
  }
}

export async function pickArticlePool(category: string, history: RecentHistory, options: TopicPoolOptions = {}): Promise<{ articles: Article[]; unrepresentedSubTopics: string[] }> {
  const activeSubTopics = [...new Set((options.activeSubTopics ?? []).map(s => s.trim()).filter(Boolean))];
  const desiredSize = poolSizeFor(activeSubTopics, options.minSize ?? 10, options.maxSize ?? 20);
  const candidates = await fetchPoolCandidates(category, history, false);
  if (!candidates.length) return { articles: [fallbackArticle(category)], unrepresentedSubTopics: activeSubTopics };
  const selection = await selectPoolWithBedrock(candidates, category, activeSubTopics, desiredSize, false);
  const articles = selection.items.map((item, rank) => {
    const chosen = candidates[item.selectedIndex];
    return {
      category,
      title: chosen.title,
      summary: item.summary || chosen.description || "Click to read the full article.",
      reason: item.reason || "A strong, timely read selected for today.",
      url: chosen.url,
      source: chosen.sourceName,
      readingTime: item.readingTime || "~5 min read",
      publishedAt: chosen.pubDate || new Date().toISOString(),
      subTopics: sanitiseSubTopics(item.subTopics, activeSubTopics),
      poolRank: rank + 1,
      qualityScore: typeof item.qualityScore === "number" ? Math.max(0, Math.min(100, item.qualityScore)) : undefined,
    } as Article;
  });
  return { articles: articles.length ? articles : [fallbackArticle(category)], unrepresentedSubTopics: selection.unrepresentedSubTopics ?? [] };
}

export async function pickPodcastPool(category: string, history: RecentHistory, options: TopicPoolOptions = {}): Promise<{ podcasts: Podcast[]; unrepresentedSubTopics: string[] }> {
  const activeSubTopics = [...new Set((options.activeSubTopics ?? []).map(s => s.trim()).filter(Boolean))];
  const desiredSize = Math.min(10, Math.max(5, activeSubTopics.length + 2));
  const candidates = await fetchPoolCandidates(category, history, true);
  if (!candidates.length) return { podcasts: [], unrepresentedSubTopics: activeSubTopics };
  const selection = await selectPoolWithBedrock(candidates, category, activeSubTopics, desiredSize, true);
  const podcasts = selection.items.map((item, rank) => {
    const chosen = candidates[item.selectedIndex];
    return {
      category,
      title: chosen.title,
      summary: item.summary || chosen.description || "Click to listen.",
      reason: item.reason || "A worthwhile episode selected for today.",
      url: chosen.url,
      source: chosen.sourceName,
      duration: item.duration || chosen.duration || "—",
      publishedAt: chosen.pubDate || new Date().toISOString(),
      subTopics: sanitiseSubTopics(item.subTopics, activeSubTopics),
      poolRank: rank + 1,
      qualityScore: typeof item.qualityScore === "number" ? Math.max(0, Math.min(100, item.qualityScore)) : undefined,
    } as Podcast;
  });
  return { podcasts, unrepresentedSubTopics: selection.unrepresentedSubTopics ?? [] };
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function fallbackArticle(interest: string): Article {
  return {
    category:    interest,
    title:       `Today's ${interest} digest`,
    summary:     "We couldn't find a fresh matching article today. Check back tomorrow!",
    reason:      `A fresh ${interest} pick will be waiting for you tomorrow.`,
    url:         "https://news.ycombinator.com",
    source:      "Hacker News",
    readingTime: "—",
    publishedAt: new Date().toISOString(),
  };
}

// ─── Per-scope pickers ────────────────────────────────────────────────────────
// `scope` is the set of interests Bedrock may choose from and use as valid
// categories. Free plan → all interests pooled (one call). Pro plan → one call
// per interest ([interest]) so each category yields its own pick.
// `exclude` holds URLs already used in this run so the 3 Pro picks don't repeat.

export async function pickArticle(
  scope: string[],
  history: RecentHistory,
  subTopicContext: string,
  exclude: Set<string>
): Promise<Article> {
  const label = scope.join(", ");
  try {
    const sources = scope.flatMap(i => RSS_SOURCES[i] ?? []);
    if (sources.length === 0) throw new Error(`No RSS sources for: ${label}`);

    const feedResults = await Promise.allSettled(sources.map(fetchRSSFeed));
    const allItems: RSSItem[] = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else console.warn(`Article feed failed: ${sources[i].url}`, r.reason);
    });
    if (allItems.length === 0) throw new Error(`All article feeds failed for: ${label}`);

    const candidates = scoreAndFilter(allItems, history, false, scope)
      .filter(c => !exclude.has(canonicalizeUrl(c.url)));
    if (candidates.length === 0) throw new Error(`No fresh articles for: ${label}`);

    console.log(`${label}: ${allItems.length} raw → ${candidates.length} article candidates`);

    const shortlist = buildBalancedShortlist(candidates, 12, 2);
    const selection = await selectBestArticle(shortlist, scope, history, subTopicContext);

    if (selection.selectedIndex === -1) {
      console.log(`No on-topic article for ${label}; using fallback`);
      return fallbackArticle(scope[0]);
    }

    const chosen = shortlist[selection.selectedIndex] ?? shortlist[0];
    if (!chosen) return fallbackArticle(scope[0]);

    // Kategori MODELDEN gelir (scope içinde doğrulanır), kaynak-üyeliğinden DEĞİL.
    const modelCat  = scope.find(i => i.toLowerCase() === selection.category.toLowerCase());
    const sourceCat = scope.find(i => (RSS_SOURCES[i] ?? []).some(s => s.name === chosen.sourceName));
    const category  = modelCat ?? sourceCat ?? scope[0];

    return {
      category,
      title:       chosen.title,
      summary:     selection.summary || chosen.description || "Click to read the full article.",
      reason:      selection.reason,
      url:         chosen.url,
      source:      chosen.sourceName,
      readingTime: selection.readingTime || "~5 min read",
      publishedAt: chosen.pubDate || new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Article generation failed for "${label}":`, err);
    return fallbackArticle(scope[0]);
  }
}

export async function pickPodcast(
  scope: string[],
  history: RecentHistory,
  subTopicContext: string,
  exclude: Set<string>
): Promise<Podcast | null> {
  const label = scope.join(", ");
  try {
    const sources = scope.flatMap(i => PODCAST_SOURCES[i] ?? []);
    if (sources.length === 0) throw new Error(`No podcast sources for: ${label}`);

    const feedResults = await Promise.allSettled(sources.map(fetchRSSFeed));
    const items: RSSItem[] = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else console.warn(`Podcast feed failed: ${sources[i].url}`, r.reason);
    });
    if (items.length === 0) throw new Error(`All podcast feeds failed for: ${label}`);

    const candidates = scoreAndFilter(items, history, true, scope)
      .filter(c => !exclude.has(canonicalizeUrl(c.url)));
    if (candidates.length === 0) throw new Error(`No fresh podcast episodes for: ${label}`);

    console.log(`${label}: ${items.length} raw → ${candidates.length} podcast candidates`);

    const shortlist = buildBalancedShortlist(candidates, 12, 2);
    const selection = await selectBestPodcast(shortlist, scope, history, subTopicContext);

    if (selection.selectedIndex === -1) {
      console.log(`No on-topic podcast for ${label}; skipping`);
      return null;
    }

    const chosen = shortlist[selection.selectedIndex] ?? shortlist[0];
    if (!chosen) return null;

    const modelCat  = scope.find(i => i.toLowerCase() === selection.category.toLowerCase());
    const sourceCat = scope.find(i => (PODCAST_SOURCES[i] ?? []).some(s => s.name === chosen.sourceName));
    const category  = modelCat ?? sourceCat ?? scope[0];

    return {
      category,
      title:       chosen.title,
      summary:     selection.summary || chosen.description || "Click to listen.",
      reason:      selection.reason,
      url:         chosen.url,
      source:      chosen.sourceName,
      duration:    selection.duration || chosen.duration || "—",
      publishedAt: chosen.pubDate || new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`Podcast generation failed for "${label}":`, err);
    return null;
  }
}

/** Sub-topic prompt context limited to a given interest scope. */
function buildSubTopicContext(scope: string[], subTopics: Record<string, string[]>): string {
  const lines = scope
    .filter(i => subTopics[i] && subTopics[i].length > 0)
    .map(i => `  - ${i}: ${subTopics[i].join(", ")}`)
    .join("\n");
  return lines
    ? `\n\nUser's selected sub-topics:\n${lines}\nStrongly prefer articles that fall within these sub-topics.`
    : "";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

interface GenerateEvent {
  userId:     string;
  interests:  string[];
  subTopics?: Record<string, string[]>;
  plan?:      string;
  userEmail?: string;
  email?:     string;
}

export const handler = async (event: GenerateEvent): Promise<void> => {
  const { userId, interests, subTopics = {} } = event;

  if (!userId || !Array.isArray(interests) || interests.length < 1) {
    throw new Error("userId and at least 1 interest are required.");
  }

  const interestsLabel = interests.join(", ");
  const isPro = (event.plan ?? "free").toLowerCase() === "pro";

  console.log(`Generating for user=${userId} plan=${isPro ? "pro" : "free"} interests=${interestsLabel}`);

  const history = await fetchRecentHistory(userId);
  console.log(`History: ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`);

  // ── Seçim ──────────────────────────────────────────────────────────────────
  // Free: 3 ilgi alanı havuzlanır → 1 makale + 1 podcast.
  // Pro:  her ilgi alanı için 1 makale (toplam 3) + EN FAZLA 2 podcast.
  //       Podcast 2'ye ulaşınca kalan kategori denenmez; bir kategoride podcast
  //       bulunamazsa diğerinden tamamlanır (yine en fazla 2).
  // usedArticleUrls / usedPodcastUrls: Pro'da aynı linkin iki kategoride
  // tekrarlanmasını önler.
  const MAX_PRO_PODCASTS = 2;
  const articles:        Article[]   = [];
  const podcasts:        Podcast[]   = [];
  const usedArticleUrls: Set<string> = new Set();
  const usedPodcastUrls: Set<string> = new Set();

  if (isPro) {
    for (const interest of interests) {
      const scope   = [interest];
      const subCtx  = buildSubTopicContext(scope, subTopics);

      // Makale: her interest için (toplam 3)
      const article = await pickArticle(scope, history, subCtx, usedArticleUrls);
      articles.push(article);
      if (article.url) usedArticleUrls.add(article.url);

      // Podcast: sadece henüz 2'ye ulaşmadıysak dene
      if (podcasts.length < MAX_PRO_PODCASTS) {
        const podcast = await pickPodcast(scope, history, subCtx, usedPodcastUrls);
        if (podcast) {
          podcasts.push(podcast);
          usedPodcastUrls.add(podcast.url);
        }
      }
    }
  } else {
    const subCtx  = buildSubTopicContext(interests, subTopics);

    const article = await pickArticle(interests, history, subCtx, usedArticleUrls);
    articles.push(article);
    if (article.url) usedArticleUrls.add(article.url);

    const podcast = await pickPodcast(interests, history, subCtx, usedPodcastUrls);
    if (podcast) podcasts.push(podcast);
  }

  // ── DynamoDB'e yaz ────────────────────────────────────────────────────────
  const now  = new Date();
  const item: DailyArticles = {
    PK:          Keys.userPK(userId),
    SK:          Keys.dateSK(now),
    articles:    articles,
    podcast:     podcasts[0] ?? null,   // geriye uyumluluk (eski dashboard tekil okur)
    podcasts:    podcasts,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Wrote ${articles.length} article(s) + ${podcasts.length} podcast(s) for user=${userId} date=${Keys.dateSK(now)}`);

  // ── Email ─────────────────────────────────────────────────────────────────
  if (SES_FROM_EMAIL) {
    const userEmail = event.userEmail ?? event.email ?? await fetchUserEmail(userId);
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
