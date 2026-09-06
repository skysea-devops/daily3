import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { createHash, randomUUID } from "crypto";
import { Article, Podcast, DailyArticles, Keys } from "../../../shared/types";
import type { SundayPick } from "../../../shared/types";
import {
  ARTICLE_MAX_AGE_DAYS,
  PODCAST_MAX_AGE_DAYS,
  LIGHT_CATEGORY_IDS,
  AUDIENCE_BALANCED_CATEGORY_ID,
  categoryEmoji,
  categoryLabel,
} from "../../../shared/categories";



// ─── Yakalanamayan promise reddi koruması ─────────────────────────────────────
//
// Node 20'de yakalanamayan bir promise reddi SÜRECİ ÖLDÜRÜR. Lambda bunu
// "Runtime.NodeJsExit" olarak raporlar ve o çalıştırmanın tüm işi kaybolur —
// üretimin 30. saniyesinde çöken bir invocation, o kullanıcı ya da kategori
// için hiçbir şey yazamaz.
//
// Asıl sebep (tüketilmeyen fetch gövdesi) fetchRSSFeed ve resolveFinalUrl
// içinde kapatıldı. Bu kayıt ikinci savunma katmanı: benzer bir kaçak
// ileride başka bir yerde oluşursa çalıştırmayı öldürmesin, ama SESSİZ de
// kalmasın — belirgin bir işaretle loglanır ki CloudWatch'ta aranabilsin.
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED_REJECTION — invocation continues, investigate:", reason);
});

const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
// retryMode "adaptive": SDK'nin client-side rate limiter'i devreye girer —
// Throttling alindiginda gonderim hizini kendi kendine dusurur. Varsayilan
// "standard" mod sadece 3 kez hizlica yeniden dener ve surekli asim halinde
// yetmez. SES Frankfurt limiti: 14 gonderim/saniye.
const ses     = new SESClient({
  region: process.env.AWS_REGION,
  maxAttempts: 5,
  retryMode: "adaptive",
});

const ARTICLES_TABLE   = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE      = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL   = process.env.SES_FROM_EMAIL!;
const APP_URL          = process.env.APP_URL ?? "https://cogletta.com";

// ─── Article RSS source map ───────────────────────────────────────────────────
//
// Anahtarlar shared/categories.ts icindeki CategoryId'lerdir — kullaniciya
// gosterilen etiket degil. Etiketi degistirmek bu dosyayi etkilemez.
//
// Source hygiene rules (enforced by scripts/check-feeds.mjs):
//   1. A source name must map to exactly ONE url. `history.seenSources` is keyed
//      by name, so the same feed listed under two names silently defeats the
//      diversity penalty (In Our Time / Fresh Air / JSTOR Daily cases).
//   2. Prefer the post-redirect url so the Lambda never pays for an extra hop.
//   3. The Conversation: the NUMERIC ID in a /topics/<slug>-<id>/ url is
//      authoritative, not the slug. Topic ids drift, so use the stable section
//      feeds (/us/<section>/articles.atom) instead.
//   4. A feed working is not the same as a feed being alive. Check the newest
//      item age too — Die, Workwear! returned valid RSS whose newest post was
//      252 days old.
//   5. Genel amacli bir kaynak birden fazla kategoride kullanilacaksa mumkunse
//      bolum feed'i tercih edilir (Literary Hub, STAT, Smithsonian orneginde
//      oldugu gibi). Eleme item duzeyinde Bedrock'ta yapiliyor ama elenen her
//      item shortlist'te yer isgal ediyor.

export const RSS_SOURCES: Record<string, { name: string; url: string }[]> = {

  // Technology & Software
  technology: [
    //{ name: "MIT Technology Review",    url: "https://www.technologyreview.com/feed/" },
    { name: "IEEE Spectrum",            url: "https://spectrum.ieee.org/feeds/feed.rss" },
    { name: "Ars Technica",             url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "Eurozine",                 url: "https://www.eurozine.com/feed/" },
    { name: "Works in Progress",        url: "https://worksinprogress.co/rss.xml" },
    { name: "Rest of World",            url: "https://restofworld.org/feed/latest/" },
    { name: "404 Media",                url: "https://www.404media.co/rss/" },
    { name: "Why is this interesting?", url: "https://whyisthisinteresting.substack.com/feed" },
    { name: "Securities",               url: "https://www.readsecurities.com/feed" },
    { name: "Stack Overflow Blog",      url: "https://stackoverflow.blog/feed/" },
    { name: "Martin Fowler",            url: "https://martinfowler.com/feed.atom" },
    { name: "InfoQ",                    url: "https://feed.infoq.com/" },
    { name: "The New Stack",            url: "https://thenewstack.io/feed/" },
    { name: "AWS Architecture",         url: "https://aws.amazon.com/blogs/architecture/feed/" },
    { name: "ACM Queue",                url: "https://queue.acm.org/rss/feeds/queuecontent.xml" },
    { name: "The Pragmatic Engineer",   url: "https://blog.pragmaticengineer.com/rss/" },
    { name: "Cloudflare Blog",          url: "https://blog.cloudflare.com/rss/" },
    { name: "Yale News (Science & Technology)", url: "https://news.yale.edu/topics/science-technology/rss" },
  ],

  // Geopolitics & Security
  // 2026-08-09: The Conversation (Politics) ve Just Security cikarildi — ikisi de
  // ABD IC siyaseti/hukuku agirlikli. Kategori etiketi "Geopolitics & Security"
  // devletler arasi strateji vaat ediyor; ic siyaset o vaadi bozuyordu.
  geopolitics: [
    { name: "Atlantic Council",                 url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Responsible Statecraft",           url: "https://responsiblestatecraft.org/feeds/feed.rss" },
    { name: "ECFR",                             url: "https://ecfr.eu/feed/" },
    { name: "Lowy Interpreter",                 url: "https://www.lowyinstitute.org/the-interpreter/rss.xml" },
    { name: "LSE European Politics and Policy", url: "https://blogs.lse.ac.uk/europpblog/feed/" },
    { name: "LSE IR Blog",                      url: "https://blogs.lse.ac.uk/internationalrelations/feed/" },
    { name: "Engelsberg Ideas",                 url: "https://engelsbergideas.com/feed/" },
    { name: "Modern War Institute",             url: "https://mwi.westpoint.edu/feed/" },
    { name: "Inkstick Media",                   url: "https://inkstickmedia.com/feed/" },
    { name: "Defense One",                      url: "https://www.defenseone.com/rss/all/" },
    { name: "Breaking Defense",                 url: "https://breakingdefense.com/full-rss-feed/?v=2" },
    { name: "The Strategist (ASPI)",            url: "https://www.aspistrategist.org.au/feed/" },
    { name: "CIMSEC",                           url: "https://cimsec.org/feed/" },
  ],

  // Business & Economics
  business_economics: [
    
    { name: "Noema Magazine",        url: "https://www.noemamag.com/?feed=noemarss" },
    { name: "Knowledge at Wharton",  url: "https://knowledge.wharton.upenn.edu/feed/" },
    { name: "Fast Company",          url: "https://www.fastcompany.com/latest/rss" },
    { name: "Stratechery",           url: "https://stratechery.com/feed/" },
    { name: "Commoncog",             url: "https://commoncog.com/rss/" },
    { name: "Kellogg Insight",       url: "https://insight.kellogg.northwestern.edu/feed/rss" },
    { name: "Rest of World",         url: "https://restofworld.org/feed/latest/" },
    { name: "Econlib new",           url: "https://econlib.org/?feed=rss" },
    { name: "Noahpinion",            url: "https://www.noahpinion.blog/feed" },
    { name: "Works in Progress",     url: "https://worksinprogress.co/rss.xml" },
    { name: "Conversable Economist", url: "https://conversableeconomist.com/feed/" },
    { name: "VoxEU (CEPR)",          url: "https://cepr.org/rss/vox-content" },
    { name: "FRED Blog",             url: "https://fredblog.stlouisfed.org/feed/" },
    { name: "The Big Picture",       url: "https://ritholtz.com/feed/" },
    { name: "Yale News (Business)", url: "https://news.yale.edu/topics/business/rss" },
  ],

  // Science & Environment
  science_environment: [
    { name: "Quanta Magazine",            url: "https://www.quantamagazine.org/feed/" },
    { name: "Undark",                     url: "https://undark.org/feed/" },
    { name: "Knowable Magazine",          url: "https://knowablemagazine.org/rss" },
    { name: "Ars Technica Science",       url: "https://feeds.arstechnica.com/arstechnica/science" },
    { name: "Smithsonian (Science)",      url: "https://www.smithsonianmag.com/rss/science-nature/" },
    { name: "Physics World",              url: "https://physicsworld.com/feed/" },
    { name: "The Conversation (Science)", url: "https://theconversation.com/us/technology/articles.atom" },
    { name: "Science News",               url: "https://www.sciencenews.org/feed" },
    { name: "MIT News (Genetics)",        url: "https://news.mit.edu/rss/topic/genetics" },
    { name: "The Transmitter",            url: "https://www.thetransmitter.org/feed/" },
    { name: "Yale Environment 360",       url: "https://e360.yale.edu/feed.xml" },
    { name: "Carbon Brief",               url: "https://www.carbonbrief.org/feed" },
    { name: "Anthropocene Magazine",      url: "https://www.anthropocenemagazine.org/feed/" },
    { name: "bioGraphic",                 url: "https://www.biographic.com/feed/" },
    { name: "Atmos",                      url: "https://atmos.earth/feed/" },
    { name: "Noema Magazine",             url: "https://www.noemamag.com/?feed=noemarss" },
    { name: "Yale Climate Connections",   url: "https://yaleclimateconnections.org/feed/" },
    { name: "Legal Planet",               url: "https://legal-planet.org/feed/" },
    { name: "World Resources Institute",  url: "https://www.wri.org/insights/rss.xml" },
    { name: "The Nature Conservancy",     url: "https://blog.nature.org/feed/" },
    { name: "Yale News (Science & Technology)", url: "https://news.yale.edu/topics/science-technology/rss" },
  ],

  // Life, Work & Wellbeing
  life_work: [
    { name: "Psyche (Aeon)",         url: "https://psyche.co/feed.rss" },
    { name: "Cal Newport",           url: "https://calnewport.com/feed/" },
    { name: "Scott H. Young",        url: "https://www.scotthyoung.com/blog/feed/" },
    { name: "Raptitude",             url: "https://www.raptitude.com/feed/" },
    { name: "Happier Human",         url: "https://www.happierhuman.com/feed/" },
    { name: "Behavioral Scientist",  url: "https://behavioralscientist.org/feed/" },
    { name: "Aeon",                  url: "https://aeon.co/feed.rss" },
    { name: "The Marginalian",       url: "https://www.themarginalian.org/feed/" },
    { name: "The Gottman Institute", url: "https://www.gottman.com/blog/feed/" },
    { name: "Tiny Buddha",           url: "https://tinybuddha.com/feed/" },
    { name: "Kendra Nicole",         url: "https://kendranicole.net/feed/" },
    { name: "Gretchen Rubin",        url: "https://gretchenrubin.com/feed/" },
    { name: "The Positivity Blog",   url: "https://www.positivityblog.com/feed/" },
    { name: "Kellogg Insight",       url: "https://insight.kellogg.northwestern.edu/feed/rss" },
    { name: "Yale News (Social Sciences)", url: "https://news.yale.edu/topics/social-sciences/rss" },
    { name: "James Clear",           url: "https://jamesclear.com/feed" },
    { name: "Ness Labs",             url: "https://nesslabs.com/feed" },
    { name: "Farnam Street",         url: "https://fs.blog/feed/" },
    { name: "The Collector (Travel)", url: "https://www.thecollector.com/travel/rss/" },
  ],

  // Culture & Style
  culture_style: [
    { name: "Literary Hub (Arts)",  url: "https://lithub.com/category/newsandculture/art-and-photography/feed/" },
    { name: "Aeon",                 url: "https://aeon.co/feed.rss" },
    { name: "Smithsonian Magazine", url: "https://www.smithsonianmag.com/rss/latest_articles/" },
    { name: "Public Books",         url: "https://www.publicbooks.org/feed/" },
    { name: "JSTOR Daily",          url: "https://daily.jstor.org/feed/" },
    { name: "Eurozine",             url: "https://www.eurozine.com/feed/" },
    { name: "Arts & Letters Daily", url: "https://www.aldaily.com/feed/" },
    { name: "Kottke",               url: "https://feeds.kottke.org/main" },
    { name: "The Sunday Long Read", url: "https://sundaylongread.com/feed/" },
    { name: "The Stacks Reader",    url: "https://www.thestacksreader.com/feed/" },
    { name: "Neal Stephenson",      url: "https://nealstephenson.substack.com/feed" },
    { name: "N + 1 Mag",            url: "https://www.nplusonemag.com/feed/" },
    { name: "OUPblog",              url: "https://blog.oup.com/feed/" },
    { name: "Business of Fashion",  url: "https://www.businessoffashion.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "Dazed (Fashion)",      url: "https://www.dazeddigital.com/rss" },
    { name: "Vestoj",               url: "https://vestoj.com/feed/" },
    { name: "Who What Wear",        url: "https://www.whowhatwear.com/feeds.xml" },
    { name: "Permanent Style",      url: "https://www.permanentstyle.com/feed" },
    { name: "Corporette",           url: "https://corporette.com/feed/" },
    { name: "Heddels",              url: "https://heddels.com/feed" },
    { name: "Fashionista",          url: "https://fashionista.com/.rss/feed/28e21eb8-20ac-4617-a448-e845081591ca.xml" },
    { name: "Yale News (Arts & Humanities)", url: "https://news.yale.edu/topics/arts-humanities/rss" },
    { name: "Literary Hub",          url: "https://lithub.com/feed/" },
    { name: "The Collector (Art)",     url: "https://www.thecollector.com/art/rss/" },
    { name: "The Collector (Film)",    url: "https://www.thecollector.com/film/rss/" },
  ],

  // Philosophy & Ethics
  philosophy: [
    { name: "Aeon",                      url: "https://aeon.co/feed.rss" },
    { name: "Psyche (Aeon)",             url: "https://psyche.co/feed.rss" },
    { name: "Philosophy Now",            url: "https://philosophynow.org/rss" },
    { name: "Justice Everywhere",        url: "https://justice-everywhere.org/feed/" },
    { name: "Practical Ethics (Oxford)", url: "https://blog.practicalethics.ox.ac.uk/feed/" },
    { name: "The Point Magazine",        url: "https://thepointmag.com/feed/" },
    { name: "JSTOR Daily",               url: "https://daily.jstor.org/feed/" },
    { name: "Arts & Letters Daily",      url: "https://www.aldaily.com/feed/" },
    { name: "New Humanist",              url: "https://newhumanist.org.uk/feed/" },
    { name: "Columbia University Press", url: "https://cupblog.org/feed/" },
    { name: "OUPblog",                   url: "https://blog.oup.com/feed/" },
    { name: "1000-Word Philosophy",      url: "https://1000wordphilosophy.com/feed/" },
    { name: "The Prindle Post",          url: "https://www.prindleinstitute.org/feed/" },
    { name: "Blog of the APA",           url: "https://blog.apaonline.org/feed/" },
    { name: "The Ideas Letter",          url: "https://www.theideasletter.org/feed/" },
    { name: "The Collector (Philosophy)",      url: "https://www.thecollector.com/philosophy/rss/" },
   
  ],

  // History
  history: [
    { name: "Aeon",                      url: "https://aeon.co/feed.rss" },
    { name: "JSTOR Daily",               url: "https://daily.jstor.org/feed/" },
    { name: "Lapham's Quarterly",        url: "https://www.laphamsquarterly.org/rss.xml" },
    { name: "The Public Domain Review",  url: "https://publicdomainreview.org/rss.xml" },
    { name: "Eurozine",                  url: "https://www.eurozine.com/feed/" },
    { name: "Smithsonian (History)",     url: "https://www.smithsonianmag.com/rss/history/" },
    { name: "History Workshop",          url: "https://www.historyworkshop.org.uk/feed/" },
    { name: "Columbia University Press", url: "https://cupblog.org/feed/" },
    { name: "Medieval Histories",        url: "https://www.medieval.eu/feed/" },
    { name: "On History (IHR)",          url: "https://blog.history.ac.uk/feed/" },
    { name: "World History Encyclopedia",url: "https://www.worldhistory.org/rss2/?lang=en" },
    { name: "Medievalists.net",          url: "https://www.medievalists.net/feed/" },
    { name: "Active History",            url: "https://feeds.feedburner.com/Activehistoryca" },
    { name: "The Acoup Blog",            url: "https://acoup.blog/feed" },  // history
    { name: "The Collector (History)",   url: "https://www.thecollector.com/history/rss" },  // history
  
   
  ],

  // Health
  health: [
    { name: "Psyche (Aeon)",             url: "https://psyche.co/feed.rss" },
    { name: "NPR Health (Shots)",        url: "https://feeds.npr.org/1128/rss.xml" },
    { name: "The Conversation (Health)", url: "https://theconversation.com/us/health/articles.atom" },
    { name: "Undark",                    url: "https://undark.org/feed/" },
    { name: "Fight Aging",               url: "https://www.fightaging.org/feed" },
    { name: "MIT News (Health)",         url: "https://news.mit.edu/rss/topic/health" },
    { name: "Medical Xpress",            url: "https://medicalxpress.com/rss-feed/" },
    { name: "News Medical",              url: "https://www.news-medical.net/syndication.axd" },
    { name: "Yale News (Health & Medicine)", url: "https://news.yale.edu/topics/health-medicine/rss" },
    { name: "Nature Medicine",                 url: "https://www.nature.com/nm.rss" },
    { name: "Buck Institute",                  url: "https://www.buckinstitute.org/feed/" },
    { name: "ScienceDaily (Top Health)", url: "https://www.sciencedaily.com/rss/top/health.xml" },
    { name: "Patient.info",              url: "https://patient.info/doctor/rss" },

    // Removed 2026-08-16: STAT (First Opinion) — abonelik duvari. Feed acikti
    // ama makale sayfalari kayit/odeme istiyor. Domain PAYWALLED_DOMAINS'e de
    // eklendi: aggregator feed'leri statnews.com'a link verirse o da elenir.
  ],

};

// ─── Podcast RSS source map ───────────────────────────────────────────────────

export const PODCAST_SOURCES: Record<string, { name: string; url: string }[]> = {

  // Technology & Software
  technology: [
    { name: "Lex Fridman Podcast",        url: "https://lexfridman.com/feed/podcast/" },
    { name: "Hard Fork",                  url: "https://feeds.simplecast.com/l2i9YnTd" },
    { name: "Acquired",                   url: "https://feeds.transistor.fm/acquired" },
    { name: "Search Engine",              url: "https://rss.amperwave.net/v2/feed/audacynetwork/search-engine" },
    { name: "Software Engineering Daily", url: "https://softwareengineeringdaily.com/feed/podcast/" },
    { name: "The Changelog",              url: "https://changelog.com/podcast/feed" },
    { name: "Hanselminutes",              url: "https://feeds.simplecast.com/gvtxUiIf" },
    { name: "CoRecursive",                url: "https://rss.libsyn.com/shows/112428/destinations/628353.xml" },
  ],

  // Geopolitics & Security
  geopolitics: [
    { name: "War on the Rocks",                     url: "https://rss.libsyn.com/shows/70702/destinations/298196.xml" },
    { name: "Foreign Policy Podcast",               url: "https://foreignpolicy.com/podcasts/feed/" },
    { name: "From Our Own Correspondent",           url: "https://podcasts.files.bbci.co.uk/b006qjlq.rss" },
    { name: "The Foreign Affairs Interview",        url: "https://feed.podbean.com/foreignaffairsmagazine/feed.xml" },
    { name: "The President's Inbox",                url: "https://feed.podbean.com/thepresidentsinbox/feed.xml" },
    { name: "Middle East Institute",                url: "https://rss.libsyn.com/shows/100837/destinations/531685.xml" },
    { name: "The Century Foundation",               url: "https://feed.podbean.com/thecenturyfoundation/feed.xml" },
    { name: "Independent Thinking (Chatham House)", url: "https://rss.libsyn.com/shows/248171/destinations/1866551.xml" },
    { name: "Trend Lines (WPR)",                    url: "https://feeds.simplecast.com/2cd8WWLc" },
    { name: "Modern War Institute",                 url: "https://mwi.westpoint.edu/category/podcasts/feed/" },
    { name: "Horns of a Dilemma",                   url: "https://rss.libsyn.com/shows/116143/destinations/662418.xml" },
  ],

  // Business & Economics
  business_economics: [
    { name: "The Tim Ferriss Show",  url: "https://rss.art19.com/tim-ferriss-show" },
    { name: "Masters of Scale",      url: "https://rss.art19.com/masters-of-scale" },
    { name: "Invest Like the Best",  url: "https://feeds.megaphone.fm/investlikethebest" },
    { name: "The Knowledge Project", url: "https://fs.blog/knowledge-project-podcast/feed/" },
    { name: "The Insightful Leader", url: "https://rss.libsyn.com/shows/59519/destinations/228034.xml" },
    { name: "Planet Money",          url: "https://feeds.npr.org/510289/podcast.xml" },
    { name: "EconTalk",              url: "https://feeds.simplecast.com/wgl4xEgL" },
    { name: "The Indicator",         url: "https://feeds.npr.org/510325/podcast.xml" },
    { name: "Freakonomics Radio",    url: "https://feeds.simplecast.com/Y8lFbOT4" },
    { name: "Macro Musings",         url: "https://rss.libsyn.com/shows/138806/destinations/865793.xml" },
  ],

  // Science & Environment
  science_environment: [
    { name: "In Our Time",                             url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",                          url: "https://feeds.simplecast.com/h18ZIZD_" },
    { name: "Huberman Lab",                            url: "https://feeds.megaphone.fm/hubermanlab" },
    { name: "Radiolab",                                url: "https://feeds.simplecast.com/EmVW7VGp" },
    { name: "Lex Fridman Podcast",                     url: "https://lexfridman.com/feed/podcast/" },
    { name: "New Scientist Podcast",                   url: "https://feeds.megaphone.fm/ARML6831509338" },
    { name: "Physics World Weekly",                    url: "https://physicsworld.com/feed/podcast-weekly/" },
    { name: "Volts",                                   url: "https://www.volts.wtf/feed" },
    { name: "Outside/In",                              url: "https://rss.introcast.io/1061222770/feeds.megaphone.fm/TPG9719828981" },
    { name: "Emergence Magazine",                      url: "https://feeds.captivate.fm/emergence-magazine/" },
    { name: "The Climate Question (BBC)",              url: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss" },
    { name: "Mongabay Newscast",                       url: "https://rss.libsyn.com/shows/87224/destinations/424646.xml" },
    { name: "Stockholm Environment Institute Podcast", url: "https://anchor.fm/s/fef3bdcc/podcast/rss" },
  ],

  // Life, Work & Wellbeing
  life_work: [
    { name: "Hidden Brain",                    url: "https://feeds.simplecast.com/kwWc0lhf" },
    { name: "The Tim Ferriss Show",            url: "https://rss.art19.com/tim-ferriss-show" },
    { name: "Fresh Air",                       url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Deep Questions with Cal Newport", url: "https://feeds.megaphone.fm/BVLLC6571400024" },
    { name: "The Knowledge Project",           url: "https://fs.blog/knowledge-project-podcast/feed/" },
    { name: "Where Should We Begin?",          url: "https://feeds.megaphone.fm/ep-wswb" },
    { name: "The Happiness Lab",               url: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/96c5c41e-0bc8-4661-b184-ae32006cd726/d623ef0b-3fee-4c26-b815-ae32006cd739/podcast.rss" },
    { name: "The Science of Happiness",        url: "http://feeds.feedburner.com/TheScienceOfHappiness" },
    { name: "Off the Page (Columbia UP)",      url: "https://feeds.megaphone.fm/NBN2998548382" },
  ],

  // Culture & Style
  culture_style: [
    { name: "Switched on Pop",             url: "https://feeds.megaphone.fm/switchedonpop" },
    { name: "99% Invisible",               url: "https://feeds.simplecast.com/BqbsxVfO" },
    { name: "Fresh Air",                   url: "https://feeds.npr.org/381444908/podcast.xml" },
    { name: "Friday Night Comedy (BBC)",   url: "https://podcasts.files.bbci.co.uk/p02pc9pj.rss" },
    { name: "The Week in Art",             url: "https://feeds.acast.com/public/shows/5e29a2ef7644ff6b3f984cff" },
    { name: "Articles of Interest",        url: "https://feed.articlesofinterest.club/" },
    { name: "Off the Page (Columbia UP)",  url: "https://feeds.megaphone.fm/NBN2998548382" },
    { name: "The BoF Podcast",             url: "https://feeds.acast.com/public/shows/6355d904dd5e0e0012da88d1" },
    { name: "The Glossy Podcast",          url: "https://feeds.megaphone.fm/DIGI4036367252" },
    { name: "Dressed: History of Fashion", url: "https://feeds.megaphone.fm/ARML9655034287" },
  ],

  // Philosophy & Ethics
  philosophy: [
    { name: "In Our Time",                 url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "The Partially Examined Life", url: "https://rss.libsyn.com/shows/19421/destinations/16399.xml" },
    { name: "Hidden Brain",                url: "https://feeds.simplecast.com/kwWc0lhf" },
    { name: "Philosophy Bites",            url: "https://rss.libsyn.com/shows/18828/destinations/14010.xml" },
    { name: "Mindscape",                   url: "https://rss.libsyn.com/shows/604590/destinations/5264190.xml" },
    { name: "The Gray Area",               url: "https://feeds.megaphone.fm/VMP5705694065" },
    { name: "Off the Page (Columbia UP)",  url: "https://feeds.megaphone.fm/NBN2998548382" },
  ],

  // History
  history: [
  { name: "In Our Time",                url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
  { name: "Throughline",                url: "https://feeds.npr.org/510333/podcast.xml" },
  { name: "HistoryExtra Podcast",       url: "https://feeds.megaphone.fm/GLT5697813216" },
  { name: "Off the Page (Columbia UP)", url: "https://feeds.megaphone.fm/NBN2998548382" },

  { name: "The Rest Is History",        url: "https://feeds.megaphone.fm/GLT4787413333" },
  { name: "The Ancients",               url: "https://access.acast.com/rss/f2925f7a-eb08-471a-9958-387cb5ee6353" },
  { name: "The History Bureau",         url: "https://podcasts.files.bbci.co.uk/m002q5dk.rss" },
],

  // Health
  health: [
    { name: "Hidden Brain",                               url: "https://feeds.simplecast.com/kwWc0lhf" },
    { name: "In Our Time",                                url: "https://podcasts.files.bbci.co.uk/b006qykl.rss" },
    { name: "Science Friday",                             url: "https://feeds.simplecast.com/h18ZIZD_" },
    { name: "The Peter Attia Drive",                      url: "https://rss.libsyn.com/shows/121729/destinations/713489.xml" },
    { name: "Health & Veritas",                           url: "https://rss.libsyn.com/shows/371540/destinations/3052370.xml" },
    { name: "Yale Cancer Answers",                        url: "https://medicine.yale.edu/cancer/podcast/feed.xml" },
  
  ],

};

// ─── The Sunday Supplement ────────────────────────────────────────────────────
//
// Pro üyelere her Pazar giden tek makale + tek podcast. Hafta içi akıştan
// TAMAMEN ayrı: kendi kaynak listesi, kendi yaş penceresi (90 gün), kullanıcının
// ilgi alanlarıyla ilgisi yok. Tüm Pro üyeler aynı içeriği alır.
//
// Ton: merak uyandıran, hafif, "bunu birine anlatmak isterim" hissi veren.
// Hafta içi ciddi ve bilgilendirici; Pazar bunun karşıtı olmalı.
//
// KURAL: buraya eklenen bir kaynak yukarıdaki kategori haritalarında OLMAMALI.
// Aksi halde kullanıcı Çarşamba aldığı yayını Pazar tekrar görür ve ekin
// "ayrı bir şey" olma hissi kaybolur.

export const SUNDAY_SOURCES: { name: string; url: string }[] = [
  { name: "The MIT Press Reader",  url: "https://thereader.mitpress.mit.edu/feed/" },
  { name: "Colossal",              url: "https://www.thisiscolossal.com/feed/" },
  { name: "Medievalists.net",      url: "https://www.medievalists.net/feed/" },
  { name: "Shakespeare & Beyond",  url: "https://www.folger.edu/blogs/shakespeare-and-beyond/feed/" },
  { name: "The History Blog",      url: "https://www.thehistoryblog.com/feed" },
  { name: "Disegno",               url: "https://disegnojournal.com/newsfeed?format=rss" },
  { name: "Atlas Obscura",         url: "https://www.atlasobscura.com/feeds/latest" },
  { name: "Taste",                 url: "https://tastecooking.com/feed/" },
  { name: "Hakai Magazine",        url: "https://hakaimagazine.com/feed/" },
];

export const SUNDAY_PODCAST_SOURCES: { name: string; url: string }[] = [
  { name: "Gastropod",               url: "https://feeds.megaphone.fm/VMP6255701211" },
  { name: "No Such Thing As A Fish", url: "https://audioboom.com/channels/2399216.rss" },
  { name: "The Allusionist",         url: "https://rss.art19.com/the-allusionist" },
  { name: "Twenty Thousand Hertz",   url: "https://feeds.megaphone.fm/20k" },
  { name: "Decoder Ring",            url: "https://feeds.acast.com/public/shows/696572d375c092ac4e159c27" },
  { name: "The Sporkful",            url: "https://feeds.simplecast.com/n91GPFY5" },
];

/**
 * Pazar Eki yaş penceresi. Kategori pencerelerinden bağımsız ve çok daha geniş:
 * haftada tek seçim yapıldığı için dar bir pencere o hafta hiçbir kaynak yayın
 * yapmadıysa boş dönme riski yaratır. Ayrıca Shakespeare & Beyond ve Disegno
 * gibi düşük hacimli kaynaklar ancak bu genişlikte havuza girebiliyor.
 *
 * Bunun bedeli tekrar riski: 90 günlük havuzdan haftada bir seçim yapılırsa aynı
 * yazı birkaç ay sonra yeniden çıkabilir. SUNDAY#history kaydı bunu engelliyor.
 */
export const SUNDAY_MAX_AGE_DAYS = 90;


// ─── RSS fetch & parse ────────────────────────────────────────────────────────

export interface RSSItem {
  title: string;
  /** Feed'deki <category> etiketleri — sponsorlu/bulten ogelerini elemek icin. */
  categories?: string[];
  /** Ghost'un uye duvari isareti bulundu mu (bkz. GATED_CONTENT_MARKERS). */
  gated?: boolean;
  url: string;
  description: string;
  pubDate: string;
  pubTimestamp: number;
  sourceName: string;
  duration?: string;
}

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "i",
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
      "fbclid",
      "gclid",
      "dclid",
      "mc_cid",
      "mc_eid",
      "ref",
      "referrer",
      "source",
      "src",
    ]);
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        trackingParams.has(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }

    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

// Son SEÇİLEN makalenin URL'sini takip et: bazı kaynaklar kendi sayfalarına link
// verip HTTP ile asıl makaleye yönlendirir. HEAD ile yönlendirmeleri izleyip nihai
// URL'i döndür; hata/timeout olursa orijinali koru. Sadece final pick'e uygulanır
// (tüm adaylara değil), o yüzden tek HTTP çağrısı. (#3)
async function resolveFinalUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    // HEAD yanitinin govdesi okunmuyor; ayni undici sizintisini onlemek icin
    // acikca kapatiliyor.
    await res.body?.cancel().catch(() => {});
    if (res.url && res.url !== url) return canonicalizeUrl(res.url);
    return url;
  } catch {
    return url;
  }
}

/**
 * HTML varliklarini cozer. Ayni metinde birden fazla tur uygulanabilir cunku
 * bazi feed'ler cift kodluyor (`&amp;lt;p&amp;gt;` → `&lt;p&gt;` → `<p>`).
 */
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…")
    .replace(/&nbsp;/gi, " ");
}

/**
 * Feed aciklamasindan duz metin cikarir.
 *
 * SIRA ONEMLI (2026-08-14 vakasi): onceki surum once etiketleri siliyor, sonra
 * varliklari cozuyordu. History Today gibi Drupal tabanli feed'ler aciklamayi
 * CIFT kodluyor — strip calistiginda ortada etiket yok, decode edilince
 * `<span property="schema:name">` gibi isaretleme metnin icinde beliriyor ve
 * temizleyecek adim kalmiyordu. Kullaniciya ham HTML gosterildi.
 *
 * Cozum: coz → sil dongusu. Cift kodlamada ikinci tur gerektigi icin en fazla
 * uc kez donuyoruz; metin degismeyi biraktiginda erken cikiyor.
 */
function stripHtml(input: string): string {
  let text = input;
  for (let pass = 0; pass < 3; pass++) {
    const before = text;
    text = decodeEntities(text).replace(/<[^>]+>/g, " ");
    if (text === before) break;
  }
  return text
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Feed icinde UYE DUVARI oldugunu KESIN olarak gosteren isaretler.
 *
 * Ghost tabanli yayincilar ucretsiz onizlemenin bittigi yere bu yorumu koyuyor.
 * Tahmin degil, yayincinin kendi beyani — bu yuzden guvenle elenebilir.
 * (2026-08-22: Hyperallergic'in bazi yazilari abonelik istiyordu; kaynagi
 * tamamen cikarmak yerine yalnizca duvarli ogeleri elemek yeterli.)
 */
const GATED_CONTENT_MARKERS = ["<!--members-only-->", "<!--paid-members-only-->"];

/**
 * Editoryal olmayan oge turleri. Sponsorlu icerik ve gunluk bulten
 * roundup'lari makale degil: birincisi reklam, ikincisi baska yazilara
 * yonlendiren link listesi — ikisi de urun tezine aykiri.
 */
const NON_EDITORIAL_CATEGORIES = new Set([
  "sponsored",
  "announcement",
  "exhibition announcement",
  "newsletter",
  "daily newsletter",
]);

function isNonEditorial(item: Pick<RSSItem, "categories">): boolean {
  return (item.categories ?? []).some(c => NON_EDITORIAL_CATEGORIES.has(c.trim().toLowerCase()));
}

/** Bir item bloğundan ham <link> değerini çeker (temizlenmemiş). */
function rawItemLink(seg: string): string {
  const cdata = extractText(seg, "link");
  const href  = seg.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "";
  return (cdata || href)
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractItems(xml: string, sourceName: string): RSSItem[] {
  const itemTag = xml.includes("<entry") ? "entry" : "item";
  const segments = xml.split(`<${itemTag}`).slice(1).slice(0, 20);

  // PROGRAM SAYFASI TESPİTİ — desen değil, TEKRAR sayısıyla.
  //
  // Eski sürüm URL desenine bakıyordu: /(column|show|podcast|podcasts)/<slug>/.
  // Bu, NYT'nin /column/hard-fork gibi program sayfaları için yazılmıştı ama
  // Software Engineering Daily'nin GERÇEK bölüm sayfası da aynı kalıba uyuyor:
  // /podcasts/nanoclaw-and-the-rise-of-personal-ai-agents/. Sonuç: geçerli
  // bölüm linki "program sayfası" sanılıp <guid>'e düşülüyordu; WordPress'te
  // guid ?p=23082 biçiminde ve 404 veriyordu.
  //
  // Güvenilir sinyal şu: program sayfası linki HER BÖLÜMDE AYNIDIR, bölüm
  // sayfası linki tekildir. Desen tahminine gerek yok.
  const linkCounts = new Map<string, number>();
  for (const seg of segments) {
    const raw = rawItemLink(seg);
    if (raw) linkCounts.set(raw, (linkCounts.get(raw) ?? 0) + 1);
  }
  const isSharedLink = (raw: string) => (linkCounts.get(raw) ?? 0) > 1;

  return segments
    .map((seg) => {
      const title = stripHtml(extractText(seg, "title"));

      const rawUrl =
        extractText(seg, "link") ||
        seg.match(/<link[^>]+href="([^"]+)"/)?.[1] ||
        "";
      const url = canonicalizeUrl(
        rawUrl
          .replace(/&#038;/g, "&")
          .replace(/&amp;/g, "&")
          .replace(/&#\d+;/g, "")
          .trim(),
      );
      // Bazı podcast feed'lerinde (ör. Simplecast/Hidden Brain) item <link>
      // bölüm sayfası değil site köküdür; bu durumda dinleme linki olarak
      // enclosure'daki ses dosyasına düşülür (2026-07-19 vakası).
      const enclosureTag = seg.match(/<enclosure\b[^>]*\/?>/i)?.[0] ?? "";
      const enclosureUrl =
        enclosureTag.match(/\burl\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      const enclosureType =
        enclosureTag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      // Ses tespiti sağlam: type'ta "audio", VEYA URL uzantısı (sorgu/hash öncesi),
      // VEYA bilinen podcast host'ları (NPR/Megaphone/Podtrac/Simplecast/chrt.fm gibi
      // izleme sarmalayıcılarında uzantı gizlenebilir — Hidden Brain vakası).
      const enclosureIsAudio =
        /audio/i.test(enclosureType) ||
        /\.(mp3|m4a|aac|ogg|wav|mp4)(\?|#|$)/i.test(enclosureUrl) ||
        /(podtrac|megaphone|simplecast|chrt\.fm|pdst\.fm|dts\.podtrac|npr\.org|libsyn|acast|buzzsprout|omny\.fm)/i.test(
          enclosureUrl,
        );
      // Bazı podcast feed'lerinde item <link> bölüm sayfası DEĞİL, sitenin köküdür
      // (pathname "/") VEYA showun genel sayfasıdır (ör. NYT Hard Fork → her bölümde
      // aynı nytimes.com/column/hard-fork). Böyle durumda bölüm-özel link olarak
      // enclosure (ses) kullanılır. (#4)
      // Bölüm permalink'i bazen <guid>'dedir: Simplecast gibi feed'lerde <link>
      // program sayfası olsa bile guid bölüm sayfasını verir (Hard Fork vakası).
      const guidRaw = extractText(seg, "guid").trim();
      const guidUrl = /^https?:\/\//i.test(guidRaw) ? canonicalizeUrl(guidRaw) : "";

      let finalUrl = url;
      try {
        const path = new URL(url).pathname;
        // Program sayfası: ya sitenin kökü, ya da AYNI link birden çok bölümde
        // tekrarlıyor. Tekil bir link her zaman bölüm sayfasıdır — dokunulmaz.
        const looksLikeShowPage = path === "/" || isSharedLink(rawUrl);
        if (looksLikeShowPage) {
          // 1) guid bölüm permalink'iyse onu kullan (kendisi de paylaşılan bir
          //    link değilse). 2) Yoksa ses enclosure'ı. 3) O da yoksa link kalır.
          const guidIsShared = guidUrl ? isSharedLink(guidRaw) : true;
          if (guidUrl && !guidIsShared) finalUrl = guidUrl;
          else if (enclosureUrl && enclosureIsAudio) finalUrl = enclosureUrl;
        }
      } catch {
        // url parse edilemedi (şemasız değer, ör. "siriusxm.com"): bölüm
        // sayfası yok demektir, sesle devam et.
        if (enclosureUrl && enclosureIsAudio) finalUrl = enclosureUrl;
      }

      // <category> etiketleri: Ghost/WordPress feed'lerinde ogenin turu burada.
      // Hyperallergic ornegi: "Sponsored", "Announcement", "Daily Newsletter".
      const categories = [...seg.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
        .map(m => m[1].trim())
        .filter(Boolean);

      // Ghost, ucretsiz onizlemenin bittigi yere content:encoded icine
      // <!--members-only--> yerlestiriyor. Yani UYE DUVARI FEED'DEN OKUNABILIYOR:
      // makale sayfasini acmadan, tahmin etmeden. Ghost kullanan her yayinci
      // icin gecerli (Hyperallergic, 404 Media, The Pragmatic Engineer...).
      const rawContent = extractText(seg, "content:encoded") || extractText(seg, "content");
      const gated = GATED_CONTENT_MARKERS.some(marker => rawContent.includes(marker));

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
        extractText(seg, "duration") ||
        "";
      const duration = durationRaw ? formatDuration(durationRaw) : "";

      const cleanDesc = stripHtml(description)
        .replace(/The post .+ appeared( first)? on .+\./gi, "")
        // Podcast feed'lerinde her bolumun sonuna eklenen sabit reklam ve
        // platform metni. Ozet olarak gosterildiginde kullaniciya "Hosted by
        // Simplecast, an AdsWizz company. See pcm.adswizz.com..." diye
        // gidiyordu (2026-08-15 Hidden Brain vakasi).
        .replace(/Hosted by [\s\S]{0,80}?for information about our collection and use of personal data for advertising\.?/gi, "")
        .replace(/Learn more about your ad choices\.?\s*Visit\s+\S+/gi, "")
        .replace(/(Be sure to )?[Ss]ubscribe so you don't miss any of our (upcoming )?videos[.!]?/g, "")
        .replace(/[^.!?]*\bis now on YouTube\b[^.!?]*[.!?]/gi, "")
        .replace(/[^.!?]*\bfree seven-day trial\b[^.!?]*[.!?]/gi, "")
        .replace(/\[\s*\.\.\.\s*\]/g, "…")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);

      return {
        title,
        // finalUrl, url DEGIL: show-page tespiti (asagida) bolum sayfasi
        // olmayan item <link>'lerini guid ya da ses enclosure'i ile degistirir.
        // 2026-08-15'e kadar bu satir `url` idi — yani tum tespit mantigi olu
        // koddu ve Hidden Brain gibi feed'lerde kullanici siriusxm.com ana
        // sayfasina (ucretli abonelik duvari) gonderiliyordu.
        url: finalUrl,
        description: cleanDesc,
        pubDate: pubDateRaw,
        pubTimestamp: parsePubDate(pubDateRaw),
        sourceName,
        duration,
        categories,
        gated,
      };
    })
    .filter((i) => i.title && i.url);
}

function formatDuration(raw: string): string {
  const parts = raw.split(":").map(Number);
  let minutes = 0;
  if (parts.length === 1) minutes = Math.round(parts[0] / 60);
  else if (parts.length === 2) minutes = parts[0] * 60 + parts[1];
  else if (parts.length === 3) minutes = parts[0] * 60 + parts[1];
  return minutes > 0 ? `${minutes} min` : "";
}

export async function fetchRSSFeed(source: {
  name: string;
  url: string;
}): Promise<RSSItem[]> {
  const res = await fetch(source.url, {
    headers: {
      // Gerçek tarayıcı UA'sı: Aeon/NYT/The Conversation/Knowable gibi yayıncılar
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
  if (!res.ok) {
    // GOVDEYI KAPATMADAN THROW ETME.
    //
    // undici (Node 20 fetch) yaniti tuketilmeyen bir baglantiyi acik tutuyor;
    // o soket daha sonra hata verirse ortaya YAKALANAMAYAN bir promise reddi
    // cikiyor ve Node varsayilan olarak SURECI OLDURUYOR. Lambda bunu
    // "Runtime.NodeJsExit — a Promise that was not resolved" diye raporluyor.
    //
    // 2026-08-22: generate-category-picks tam bu yuzden coktu; 6 kategoriden
    // 3'unun havuzu uretilemedi, iki Pro kullanici pahali legacy yoluna dustu.
    // Tetikleyici, 403 donen feed'lerdi (econlib, cupblog).
    await res.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${res.status} from ${source.url}`);
  }
  const xml = await res.text();
  return extractItems(xml, source.name);
}

// ─── DynamoDB helpers ─────────────────────────────────────────────────────────

export interface RecentHistory {
  seenUrls: Set<string>;
  seenSources: Map<string, number>;
}

async function fetchRecentHistory(userId: string): Promise<RecentHistory> {
  const seenUrls = new Set<string>();
  const seenSources = new Map<string, number>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const skStart = `DATE#${sevenDaysAgo.toISOString().slice(0, 10)}`;

  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: ARTICLES_TABLE,
        KeyConditionExpression: "PK = :pk AND SK >= :skStart",
        ExpressionAttributeValues: {
          ":pk": Keys.userPK(userId),
          ":skStart": skStart,
        },
        // "podcasts" DIZISI de okunmali. Pro kullanici gunde IKI podcast aliyor
        // ve ikisi de bu dizide duruyor; "podcast" alani yalnizca geriye
        // uyumluluk icin BIRINCI ogeyi tutuyor.
        //
        // 2026-08-25: yalnizca "podcast" okundugu icin IKINCI podcast gecmise
        // hic girmiyordu ve ertesi gun yeniden secilebiliyordu (BoF Podcast
        // iki gun ust uste geldi). deliver-daily'nin kendi okuyucusu ikisini de
        // dogru okuyor — ayni isi yapan iki fonksiyondan biri guncellenmis,
        // digeri unutulmustu.
        ProjectionExpression: "articles, podcast, podcasts",
      }),
    );

    for (const item of result.Items ?? []) {
      const articles = (item.articles ?? []) as Article[];
      for (const a of articles) {
        if (a.url) seenUrls.add(canonicalizeUrl(a.url));
        if (a.source)
          seenSources.set(a.source, (seenSources.get(a.source) ?? 0) + 1);
      }

      const storedPodcasts: Podcast[] = Array.isArray(item.podcasts)
        ? (item.podcasts as Podcast[])
        : item.podcast
          ? [item.podcast as Podcast]
          : [];

      for (const podcast of storedPodcasts) {
        if (podcast?.url) seenUrls.add(canonicalizeUrl(podcast.url));
        if (podcast?.source)
          seenSources.set(
            podcast.source,
            (seenSources.get(podcast.source) ?? 0) + 1,
          );
      }
    }
  } catch (err) {
    console.warn("Failed to fetch recent history:", err);
  }

  return { seenUrls, seenSources };
}

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { PK: Keys.userPK(userId), SK: "PROFILE" },
        ProjectionExpression: "email",
      }),
    );
    return (result.Item?.email as string) ?? null;
  } catch (err) {
    console.warn("Failed to fetch user email:", err);
    return null;
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

function articleEmailBlock(article: Article, withDivider: boolean): string {
  const emoji = categoryEmoji(article.category);
  const divider = withDivider
    ? "border-top:1px solid #f3f4f6;padding-top:28px;margin-top:4px;"
    : "";
  return `
              <tr>
                <td style="padding:28px 0;${divider}">
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${emoji} ${categoryLabel(article.category)}</span>
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
                  <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Podcast · ${categoryLabel(podcast.category)}</span>
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


/**
 * Free kullanicilara gunluk e-postada gosterilen Pro daveti.
 *
 * Iki kural:
 *  - YALNIZCA Free plana gider. Pro kullanici zaten odedigi seyin reklamini
 *    gormemeli.
 *  - Makale ile podcast ARASINA girer. En altta, podcast'in da altinda
 *    kalinca goz atlayip geciyordu; iki icerik arasindaki dogal duraklama
 *    okurun zaten durdugu yer.
 */
function upgradeBlock(): string {
  return `
              <tr>
                <td style="padding:8px 0 4px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;">
                    <tr><td style="padding:22px 24px;">
                      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#374151;">
                        <strong style="color:#111827;">One good read is a start.</strong> With Cogletta Pro, every morning brings 3 thoughtful articles and 2 podcast episodes across the topics you care about.
                      </p>
                      <a href="${APP_URL}/settings" style="display:inline-block;padding:11px 22px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
                        See Cogletta Pro &rarr;
                      </a>
                    </td></tr>
                  </table>
                </td>
              </tr>`;
}

function buildEmailHtml(articles: Article[], podcasts: Podcast[], isPro: boolean): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const multi = articles.length > 1;
  const heading = multi
    ? `Your ${articles.length} articles for today are ready.`
    : "Your article for today is ready.";

  // Başlıktaki kategori rozetleri (tekrarsız)
  const cats = Array.from(new Set(articles.map((a) => a.category)));
  const chips = cats
    .map((c) => {
      const e = categoryEmoji(c);
      return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:#f3f4f6;border-radius:20px;font-size:11px;color:#6b7280;font-weight:500;">${e} ${categoryLabel(c)}</span>`;
    })
    .join("");

  const articleBlocks = articles
    .map((a, i) => articleEmailBlock(a, i > 0))
    .join("");
  const podcastBlocks = podcasts.map(podcastEmailBlock).join("");
  const upsellBlock   = isPro ? "" : upgradeBlock();

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
            <table width="100%" cellpadding="0" cellspacing="0">${articleBlocks}${upsellBlock}${podcastBlocks}
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

function buildEmailText(articles: Article[], podcasts: Podcast[], isPro: boolean): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const articleLines = articles
    .map(
      (a) => `${categoryLabel(a.category)} — ${a.source}\n${a.title}\n${a.reason}\n${a.url}`,
    )
    .join("\n\n");
  const podcastLines = podcasts.length
    ? "\n\n---\n\n" +
      podcasts
        .map(
          (p) =>
            `🎙 Podcast · ${categoryLabel(p.category)} — ${p.source}\n${p.title}\n${p.reason}\n${p.url}`,
        )
        .join("\n\n")
    : "";
  const intro =
    articles.length > 1
      ? "Your articles for today:"
      : "Your article for today:";
  const upsell = isPro ? "" :
    `\n\n---\n\nOne good read is a start. With Cogletta Pro, every morning brings 3 thoughtful ` +
    `articles and 2 podcast episodes across the topics you care about.\n${APP_URL}/settings\n\n---`;
  // Sira HTML ile ayni: makale → davet → podcast.
  return `Cogletta — ${today}\n\n${intro}\n\n${articleLines}${upsell}${podcastLines}\n\nNew content arrives every morning at 07:00.`;
}

export async function sendDailyEmail(
  toEmail: string,
  articles: Article[],
  podcasts: Podcast[],
  plan: string = "free",
): Promise<void> {
  const isPro = plan.toLowerCase() === "pro";
  // Fallback dışında gerçek makalesi olanları tut
  const real = articles.filter(
    (a) => a.url && a.url !== "https://news.ycombinator.com",
  );
  if (real.length === 0) {
    console.warn(`No real article to email for ${toEmail}, skipping`);
    return;
  }
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data: `Your Cogletta for ${today} is ready`,
          Charset: "UTF-8",
        },
        Body: {
          Html: { Data: buildEmailHtml(real, podcasts, isPro), Charset: "UTF-8" },
          Text: { Data: buildEmailText(real, podcasts, isPro), Charset: "UTF-8" },
        },
      },
    }),
  );
  console.log(
    `Email sent to ${toEmail} (${real.length} article(s), ${podcasts.length} podcast(s))`,
  );
}

// ─── Filter & rank ────────────────────────────────────────────────────────────

interface ScoredCandidate extends RSSItem {
  freshness: "today" | "recent" | "older";
  penalised: boolean;
}

const ROUNDUP_PATTERNS =
  /\b(weekly|roundup|link list|best of|this week in|top \d+)\b/i;
const PODCAST_PATTERNS =
  /\b(podcast|transcript|episode|listen now|audio|ep\.|ep \d+)\b/i;
// Makale havuzundan podcast bölümlerini URL YOLUNDAN da ele: başlıkta "podcast"
// geçmeyen ama URL'i podcast bölümüne işaret eden feed item'ları için (ör. fs.blog
// ana feed'indeki Knowledge Project bölümleri makale sanılıyordu). (#1)
const PODCAST_URL_PATTERN = /\/[^/]*podcast[^/]*(\/|$)/i;

// Sert paywall'lı kaynaklar: makale okunamıyor → makale havuzundan ele. (#2)
// 2026-08-07: doldurulan kayitlar tahmin degil, check-feeds.mjs --deep ile
// olculdu — her biri icin 3 ornek makale sayfasi cekildi ve gorunur metinde
// erisim reddi ifadesi bulundu. Kaynaklar RSS_SOURCES'tan da cikarildi; bu liste
// aggregator feed'lerinin (Arts & Letters Daily, Kottke, Sunday Long Read) bu
// domainlere verdigi disari linkleri yakalamak icin duruyor.
const PAYWALLED_DOMAINS = new Set([
  "foreignaffairs.com",
  "www.foreignaffairs.com",
  "mondediplo.com",
  "www.mondediplo.com",
  "foreignpolicy.com",
  "www.foreignpolicy.com",
  "notboring.co",
  "www.notboring.co",
  "blackbirdspyplane.com",
  "www.blackbirdspyplane.com",
  "statnews.com",
  "www.statnews.com",
]);
function isPaywalledUrl(u: string): boolean {
  try {
    return PAYWALLED_DOMAINS.has(new URL(u).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Üye-özel bölümler: Hidden Brain+/HistoryExtra/99% Invisible gibi programlar
// üyelere açık bölümleri de aynı feed'e koyuyor. Yalnızca BÖLÜM SEVİYESİNDE açık
// olan kalıplar kullanılır — "to listen to the rest" gibi genel abonelik
// promosyonları her bölümün show notes'unda geçtiği için kasıtlı olarak dışarıda
// bırakıldı; aksi halde tüm program elenirdi.
const MEMBER_ONLY_TITLE_PATTERN =
  /\b(members?[- ]only|subscribers?[- ]only|bonus for members|member exclusive)\b/i;
const MEMBER_ONLY_DESCRIPTION_PATTERN =
  /\b(this episode is (only )?(for|available to) members|members?[- ]only episode|subscriber[- ]only episode|full episode is (only )?available to (members|subscribers))\b/i;
function isMemberOnlyEpisode(
  item: Pick<RSSItem, "title" | "description">,
): boolean {
  return (
    MEMBER_ONLY_TITLE_PATTERN.test(item.title) ||
    MEMBER_ONLY_DESCRIPTION_PATTERN.test(item.description)
  );
}

const VIDEO_PATTERNS = /\b(video|watch|newsfeed|news feed)\b/i;
const VIDEO_URL_PATTERN = /\/(video|videos|watch)\//i;
const BREAKING_PATTERNS =
  /\b(breaking|live|live blog|live updates|live coverage|as it happened|in pictures|in maps)\b/i;
const LIVEBLOG_URL_PATTERN =
  /\/(liveblog|live-blog|live_blog|breaking|live\/)\//i;
// URL YOLUNDA haber göstergesi: /news/, /news-features/ vb. altındaki içerik
// haber raporudur, analiz değil — ürün tezi gereği elenir. Yalnızca path'e
// bakılır; hostname'e bakılmaz (statnews.com gibi alan adları kurban gitmesin).
const NEWS_URL_PATH_PATTERN =
  /\/(news|news-features|breaking-news|headlines|newswire|latest-news|current-events|updates)(\/|$)/i;

// Açık biçimde güncel olay/haber raporu olan başlıkları eler. "war", "military"
// veya "troops" gibi analitik yazılarda da geçebilecek genel kelimeler yerine,
// olay bildiren fiil ve kalıplara odaklanır.
const HARD_NEWS_TITLE_PATTERN =
  /\b(breaking|live updates?|latest updates?|developing story|as it happened|killed|dead|dies|died|wounded|injured|casualties|death toll|barrage|airstrike|air strike|missile strike|rocket attack|bombing|explosion|launches? attack|attacks? base|strikes? base|hits? base|troops? killed|soldiers? killed|officers? killed|civilians? killed|arrested|detained|evacuated|declares emergency|state of emergency)\b/i;

// RSS açıklaması bazen başlıktan daha açık biçimde olay haberi olduğunu belli eder.
const HARD_NEWS_DESCRIPTION_PATTERN =
  /\b(was killed|were killed|has been killed|have been killed|was wounded|were wounded|death toll|casualty count|according to officials|officials said|authorities said|the attack occurred|the strike occurred|the incident happened|breaking news|live coverage|developing story)\b/i;

// "blog" içeren URL'lere sıralama önceliği — kişisel/kurumsal bloglar tercih edilir.
const BLOG_URL_PATTERN = /(\/blog\/|\/blogs\/|^https?:\/\/blog\.)/i;
function urlPath(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
}

function isLikelyNewsReport(
  item: Pick<RSSItem, "title" | "description" | "url">,
): boolean {
  if (NEWS_URL_PATH_PATTERN.test(urlPath(item.url))) return true;
  if (HARD_NEWS_TITLE_PATTERN.test(item.title)) return true;
  return HARD_NEWS_DESCRIPTION_PATTERN.test(item.description);
}

// Yaş pencereleri ve podcast penceresi artık shared/categories.ts'ten gelir —
// kategori tanımıyla aynı yerde durmaları, birinin güncellenip diğerinin
// unutulmasını engelliyor.

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreAndFilter(
  items: RSSItem[],
  history: RecentHistory,
  isPodcast = false,
  scope: string[] = [],
): ScoredCandidate[] {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const twoDaysMs = 48 * 60 * 60 * 1000;
  // For multi-interest pools use the most permissive category window so an
  // evergreen category is not accidentally starved by a news-heavy one.
  const maxAgeDays = isPodcast
    ? PODCAST_MAX_AGE_DAYS
    : Math.max(
        7,
        ...scope.map((category) => ARTICLE_MAX_AGE_DAYS[category] ?? 30),
      );
  const maxAgeMs = maxAgeDays * oneDayMs;

  const sorted = items
    .map((item): ScoredCandidate => {
      const url = canonicalizeUrl(item.url);
      const age =
        item.pubTimestamp > 0
          ? now - item.pubTimestamp
          : Number.POSITIVE_INFINITY;
      const freshness =
        age <= oneDayMs ? "today" : age <= twoDaysMs ? "recent" : "older";
      const penalised =
        history.seenUrls.has(url) ||
        (history.seenSources.get(item.sourceName) ?? 0) >= 3;
      return { ...item, url, freshness, penalised };
    })
    .filter((item) => !history.seenUrls.has(item.url))
    .filter(
      (item) => item.pubTimestamp === 0 || now - item.pubTimestamp <= maxAgeMs,
    )
    .filter((item) => !ROUNDUP_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_PATTERNS.test(item.title))
    .filter((item) => !VIDEO_URL_PATTERN.test(item.url))
    .filter((item) => !BREAKING_PATTERNS.test(item.title))
    .filter((item) => !LIVEBLOG_URL_PATTERN.test(item.url))
    .filter((item) => !isPodcast || !isMemberOnlyEpisode(item))
    .filter((item) => isPodcast || !isLikelyNewsReport(item))
    .filter((item) => isPodcast || !PODCAST_PATTERNS.test(item.title))
    .filter((item) => isPodcast || !PODCAST_URL_PATTERN.test(item.url))
    .filter((item) => isPodcast || !isPaywalledUrl(item.url))
    // Uye duvarli ve editoryal olmayan ogeler: ikisi de feed'den okunuyor,
    // makale sayfasini acmaya gerek yok.
    .filter((item) => !item.gated)
    .filter((item) => !isNonEditorial(item))
    .sort((a, b) => {
      const freshnessScore = (f: string) =>
        f === "today" ? 2 : f === "recent" ? 1 : 0;
      const diff = freshnessScore(b.freshness) - freshnessScore(a.freshness);
      if (diff !== 0) return diff;
      if (a.penalised !== b.penalised) return a.penalised ? 1 : -1;
      const blogDiff =
        (BLOG_URL_PATTERN.test(b.url) ? 1 : 0) -
        (BLOG_URL_PATTERN.test(a.url) ? 1 : 0);
      if (blogDiff !== 0) return blogDiff;
      return b.pubTimestamp - a.pubTimestamp;
    });

  // Remove exact URL duplicates and near-identical title duplicates after
  // ranking, keeping the strongest/freshest occurrence.
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return sorted.filter((item) => {
    const titleKey = normaliseTitle(item.title);
    if (seenUrls.has(item.url) || (titleKey && seenTitles.has(titleKey)))
      return false;
    seenUrls.add(item.url);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
}

/** Selects a source-balanced shortlist while preserving the ranking order. */
function buildBalancedShortlist(
  candidates: ScoredCandidate[],
  limit = 12,
  maxPerSource = 2,
): ScoredCandidate[] {
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
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const window = clean.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("? "),
    window.lastIndexOf("! "),
  );
  if (sentenceEnd >= Math.floor(maxLength * 0.65))
    return window.slice(0, sentenceEnd + 1).trim();

  const wordEnd = window.lastIndexOf(" ");
  return `${window.slice(0, wordEnd > 0 ? wordEnd : maxLength).trim()}…`;
}

// ─── Bedrock ──────────────────────────────────────────────────────────────────

interface BedrockSelection {
  selectedIndex: number;
  imageQuery?: string;
  category: string;
  summary: string;
  reason: string;
  readingTime: string;
}

async function selectBestArticle(
  candidates: ScoredCandidate[],
  interests: string[],
  history: RecentHistory,
  subTopicContext = "",
): Promise<BedrockSelection> {
  const interest = interests.join(", ");
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2)
    .map(([src]) => src)
    .join(", ");

  const candidateList = candidates
    .map(
      (c, i) =>
        `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    URL: ${c.url}\n    ${truncateDescription(c.description, 320)}`,
    )
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen articles from: ${recentSourcesList}. Prefer a different source today if possible.`
    : "";

  const categoryList = interests.map((i) => `"${categoryLabel(i)}"`).join(", ");

  const toneNote = interests.some((i) => (LIGHT_CATEGORY_IDS as string[]).includes(i))
    ? `\nTONE (applies to Life, Work & Wellbeing): readers of these sections want pieces that are uplifting, warm, practical, or delightful — personal growth, style, joy, connection, creativity, everyday life. Strongly prefer positive, hopeful, or genuinely useful angles. AVOID heavy or distressing subjects (war, death, grief, trauma, abuse, serious illness, tragedy) unless there is truly nothing else on-topic. When two candidates fit, always choose the lighter, more enjoyable one.`
    : "";

  const prompt = `You curate Cogletta's daily long-form reading picks.
 
Valid user interests only:
${categoryList}${subTopicContext}
${diversityNote}
 
Choose the single best written long-form article genuinely about one valid interest.
 
Reject any candidate that is:
- off-topic when judged from title, description and URL slug; never infer topic from a general-interest source name
- a transcript, episode summary, video report, breaking-news dispatch or liveblog
- primarily reporting a recent event, casualty, attack, military operation, government announcement, company announcement or product launch

Cogletta does not recommend news reporting. Apply this evergreen test: the piece should still be worth reading at least one month from now. Prefer essays, explainers, historical context, research, analysis and long-form features with durable educational value. A current event may be mentioned only when the article's main purpose is broader explanation or lasting analysis, not reporting what just happened.
 
Among eligible pieces prefer depth, then freshness and source variety. Avoid a recently shown source unless clearly better.
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
  "readingTime": "<estimate such as '8 min read'>",
  "imageQuery": "<3-4 concrete VISUAL stock-photo keywords for the article THEME (tangible scene/object/setting). NEVER use acronyms, organization names, place names, people names, or figurative/ambiguous title words. Example: for an essay titled 'I can't bear my sorrows' use 'person walking rain street', NOT 'bear'.>"
}`;

  const command = new InvokeModelCommand({
    modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const text = raw.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ");

  let parsed: BedrockSelection;
  try {
    parsed = JSON.parse(text) as BedrockSelection;
  } catch {
    console.warn(
      "Bedrock JSON parse failed; rejecting the selection instead of guessing. Raw:",
      text.slice(0, 200),
    );
    parsed = {
      selectedIndex: -1,
      category: "",
      summary: "",
      reason: "",
      readingTime: "~5 min read",
      imageQuery: "",
    };
  }

  if (
    !Number.isInteger(parsed.selectedIndex) ||
    parsed.selectedIndex < -1 ||
    parsed.selectedIndex >= candidates.length
  ) {
    console.warn(
      `Bedrock returned invalid article index ${parsed.selectedIndex}; rejecting the selection.`,
    );
    parsed.selectedIndex = -1;
  }

  const cleanStr = (s: string) =>
    s
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8230;/g, "…")
      .replace(/&#\d+;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');

  return {
    ...parsed,
    category: (parsed.category ?? "").trim(),
    summary: cleanStr(parsed.summary ?? ""),
    reason: cleanStr(parsed.reason ?? ""),
  };
}

interface BedrockPodcastSelection {
  selectedIndex: number;
  category: string;
  summary: string;
  reason: string;
  duration: string;
}

async function selectBestPodcast(
  candidates: ScoredCandidate[],
  interests: string[],
  history: RecentHistory,
  subTopicContext = "",
): Promise<BedrockPodcastSelection> {
  const interest = interests.join(", ");
  const recentSourcesList = [...history.seenSources.entries()]
    .filter(([, count]) => count >= 2)
    .map(([src]) => src)
    .join(", ");

  const candidateList = candidates
    .map(
      (c, i) =>
        `[${i}] "${c.title}" — ${c.sourceName}${c.duration ? ` (${c.duration})` : ""} (${c.freshness})${c.penalised ? " [source shown recently]" : ""}\n    URL: ${c.url}\n    ${truncateDescription(c.description, 300)}`,
    )
    .join("\n\n");

  const diversityNote = recentSourcesList
    ? `\nIMPORTANT: The user has recently seen content from: ${recentSourcesList}. Prefer a different podcast show today if possible.`
    : "";

  const categoryList = interests.map((i) => `"${categoryLabel(i)}"`).join(", ");

  const toneNote = interests.some((i) => (LIGHT_CATEGORY_IDS as string[]).includes(i))
    ? `\nTONE (applies to Life, Work & Wellbeing): prefer episodes that are uplifting, warm, practical, or fun — personal growth, style, joy, connection, creativity, everyday life. AVOID heavy or distressing subjects (war, death, grief, trauma, abuse, serious illness) unless there is truly nothing else on-topic. When two fit, choose the lighter, more enjoyable one.`
    : "";

  const prompt = `You are an editorial assistant for Cogletta, a daily content curation app.
 
The user follows these interests — these are the ONLY valid categories:
${categoryList}${subTopicContext}
${diversityNote}
 
Select the single best PODCAST EPISODE that is genuinely ABOUT one of the user's interests above.
 
HARD REQUIREMENTS — a candidate that fails ANY of these is NOT eligible:
- RELEVANCE: the episode must clearly address one of the user's interests. Judge from the title, description AND URL slug. General shows publish on many topics, so never assume relevance from the show name — judge by the episode content.
- DEPTH: prefer substantive interviews, investigations, long-form analysis. STRICTLY AVOID daily news bulletins and breaking-news recaps.
- ACCESS: reject any episode that is a members-only or subscriber-only edition, or a short trailer/preview of a paid episode.
 
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
    modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const response = await bedrock.send(command);
  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const text = raw.content[0].text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ");

  let parsed: BedrockPodcastSelection;
  try {
    parsed = JSON.parse(text) as BedrockPodcastSelection;
  } catch {
    console.warn(
      "Podcast Bedrock JSON parse failed; using the highest-ranked candidate safely. Raw:",
      text.slice(0, 200),
    );
    parsed = {
      selectedIndex: 0,
      category: "",
      summary: "",
      reason: "",
      duration: "",
    };
  }

  if (
    !Number.isInteger(parsed.selectedIndex) ||
    parsed.selectedIndex < -1 ||
    parsed.selectedIndex >= candidates.length
  ) {
    console.warn(
      `Bedrock returned invalid podcast index ${parsed.selectedIndex}; using highest-ranked candidate.`,
    );
    parsed.selectedIndex = 0;
  }

  const cleanStr = (s: string) =>
    s
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8230;/g, "…")
      .replace(/&#\d+;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');

  return {
    ...parsed,
    category: (parsed.category ?? "").trim(),
    summary: cleanStr(parsed.summary ?? ""),
    reason: cleanStr(parsed.reason ?? ""),
  };
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

function poolSizeFor(
  activeSubTopics: string[],
  minSize = 10,
  maxSize = 20,
): number {
  return Math.min(maxSize, Math.max(minSize, activeSubTopics.length + 4));
}

function sanitiseSubTopics(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const allowedMap = new Map(allowed.map((v) => [normaliseSubTopic(v), v]));
  const result: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const exact = allowedMap.get(normaliseSubTopic(raw));
    if (exact && !result.includes(exact)) result.push(exact);
  }
  return result;
}

async function fetchPoolCandidates(
  category: string,
  history: RecentHistory,
  isPodcast: boolean,
): Promise<ScoredCandidate[]> {
  const sourceMap = isPodcast ? PODCAST_SOURCES : RSS_SOURCES;
  const sources = sourceMap[category] ?? [];
  if (!sources.length) return [];
  const results = await Promise.allSettled(sources.map(fetchRSSFeed));
  const allItems: RSSItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") allItems.push(...r.value);
    else
      console.warn(
        `${isPodcast ? "Podcast" : "Article"} feed failed: ${sources[i].url}`,
        r.reason,
      );
  });
  const filtered = scoreAndFilter(allItems, history, isPodcast, [category]);
  // Aday sayisi = havuz promptunun input maliyetinin neredeyse tamami: her aday
  // basliK + kaynak + URL + kirpilmis aciklama ile ~115 token tutuyor.
  //
  // 40 → 28 (2026-08-09): birlesmis kategorilerde ortalama 18 makale kaynagi
  // var, yani 40 slot kaynak basina ~2.2 aday demekti. 28'de bu ~1.5 oluyor;
  // maxPerSource=4 sinirli oldugu icin her kaynak hala temsil ediliyor, sadece
  // guclu kaynaklarin ikinci/ucuncu adaylari duşuyor. Bedrock zaten bu listeden
  // 10-20 tanesini seciyor — kirpilanlar buyuk olcude elenecek olanlar.
  //
  // Podcast 24 → 18 (2026-08-09): birlesme sonrasi kategori basina 6-13 podcast
  // kaynagi var ve maxPerSource=3. "history" 6 kaynakla zaten en fazla 18 aday
  // uretebiliyor, yani 24 orada ulasilamaz bir tavandi. Havuz da yalnizca 8
  // bolum seciyor (poolSizeFor: min(10, max(5, altKonu+2)) = 8).
  //
  // Dikkat: aday havuzu daraldikca havuz promptundaki "her aktif alt konu icin
  // en az bir oge" kuralini karsilamak zorlasir. CloudWatch'ta
  // unrepresentedSubTopics artiyorsa bu deger geri yukseltilmeli.
  return buildBalancedShortlist(
    filtered,
    isPodcast ? 18 : 28,
    isPodcast ? 3 : 4,
  );
}

async function selectPoolWithBedrock(
  candidates: ScoredCandidate[],
  category: string,
  activeSubTopics: string[],
  desiredSize: number,
  isPodcast: boolean,
): Promise<PoolSelectionResponse> {
  const candidateList = candidates
    .map(
      (c, i) =>
        `[${i}] "${c.title}" — ${c.sourceName} (${c.freshness})\nURL: ${c.url}\n${truncateDescription(c.description, isPodcast ? 260 : 300)}`,
    )
    .join("\n\n");
  const subTopicText = activeSubTopics.length
    ? activeSubTopics.map((s) => `- ${s}`).join("\n")
    : "- none configured; use an empty subTopics array";
  const contentType = isPodcast ? "podcast episodes" : "long-form articles";
  const extraFields = isPodcast
    ? `"duration": "<duration or estimate>"`
    : `"readingTime": "<estimate such as '8 min read'>"`;
  // Culture & Style: kaynak listesi tek başına yetmez — kitle dengesi havuz
  // seviyesinde kurala bağlanmalı, yoksa güçlü menswear kaynakları üst sıraları
  // domine ediyor (2026-07-15: 3 gün üst üste erkek giyimi vakası).
  const fashionNote =
    category === AUDIENCE_BALANCED_CATEGORY_ID
      ? `\n\nAudience balance rule (Culture & Style): the pool MUST mix menswear and womenswear items every day — neither may exceed roughly two-thirds of the pool. Tag every item with "Menswear" or "Womenswear" in its subTopics (both for unisex/industry pieces), even when those tags are not in the active sub-topic list. Vary the audience of the TOP-RANKED items from day to day: if recently-shown markers indicate one audience dominated recent days, rank the other audience first today.`
      : "";

  const prompt = `Create today's shared Cogletta ${category} pool from the candidates below.\n\nSelect up to ${desiredSize} high-quality ${contentType}. Rank best first. Never repeat an index. Include at most two items from any single source. Cogletta NEVER recommends news reporting. REJECT incident reports, casualty reports, battlefield updates, attack reports and all other current-events coverage. Also REJECT government or company announcements, product or tool releases, calls for papers, event listings and meta/professional-news posts. Every selected item must itself be a substantive essay, explainer, research piece, historical analysis or long-form feature with durable educational value. Apply this evergreen test: it should still be worth reading at least one month from now. A current event may appear only as context for broader lasting analysis, never as the main subject. Reject off-topic, roundup, transcript, video, breaking-news or liveblog content. Prefer depth, then freshness and source diversity. Also REJECT items whose body is mostly a pointer to an external piece (link-posts, "read more here" redirects, roundups) rather than a complete standalone read.\n\nActive sub-topics selected by users:\n${subTopicText}${fashionNote}\n\nCoverage rule: when a clearly relevant quality candidate exists, include at least one item for every active sub-topic. Never force weak or unrelated content merely to fill coverage. Tag each selected item only with exact sub-topic names from the list. General ${category} pieces may have an empty subTopics array.\n\nCandidates:\n${candidateList}\n\nReturn only valid JSON:\n{\n  "items": [\n    {\n      "selectedIndex": <candidate index>,\n      "subTopics": ["<exact active sub-topic>"],\n      "qualityScore": <0-100>,\n      "summary": "<specific ${isPodcast ? "2-3" : "3-4"} sentence summary>",\n      "reason": "<max 18 words; concrete hook>",\n      \"imageQuery\": \"<3-4 concrete VISUAL stock-photo keywords capturing the item THEME; never reuse ambiguous or figurative title words>\",\n      ${extraFields}\n    }\n  ],\n  "unrepresentedSubTopics": ["<exact active sub-topic with no suitable selected item>"]\n}`;
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
    const text = raw.content[0].text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(text) as PoolSelectionResponse;
    const seen = new Set<number>();
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item) => {
        if (
          !Number.isInteger(item.selectedIndex) ||
          item.selectedIndex < 0 ||
          item.selectedIndex >= candidates.length ||
          seen.has(item.selectedIndex)
        )
          return false;
        seen.add(item.selectedIndex);
        return true;
      })
      .slice(0, desiredSize);
    return {
      items,
      unrepresentedSubTopics: sanitiseSubTopics(
        parsed.unrepresentedSubTopics,
        activeSubTopics,
      ),
    };
  } catch (err) {
    console.warn(
      `Pool Bedrock response failed for ${category}; using deterministic shortlist fallback`,
      err,
    );
    return {
      items: candidates
        .slice(0, desiredSize)
        .map((_, selectedIndex) => ({
          selectedIndex,
          subTopics: [],
          qualityScore: Math.max(50, 90 - selectedIndex),
        })),
      unrepresentedSubTopics: activeSubTopics,
    };
  }
}

export async function pickArticlePool(
  category: string,
  history: RecentHistory,
  options: TopicPoolOptions = {},
): Promise<{ articles: Article[]; unrepresentedSubTopics: string[] }> {
  const activeSubTopics = [
    ...new Set(
      (options.activeSubTopics ?? []).map((s) => s.trim()).filter(Boolean),
    ),
  ];
  const desiredSize = poolSizeFor(
    activeSubTopics,
    options.minSize ?? 10,
    options.maxSize ?? 20,
  );
  const candidates = await fetchPoolCandidates(category, history, false);
  if (!candidates.length)
    return {
      articles: [fallbackArticle(category)],
      unrepresentedSubTopics: activeSubTopics,
    };
  const selection = await selectPoolWithBedrock(
    candidates,
    category,
    activeSubTopics,
    desiredSize,
    false,
  );
  const safeSelectionItems = selection.items.filter((item) => {
    const chosen = candidates[item.selectedIndex];
    return Boolean(chosen) && !isLikelyNewsReport(chosen);
  });
  const articles = safeSelectionItems.map((item, rank) => {
    const chosen = candidates[item.selectedIndex];
    return {
      category,
      title: chosen.title,
      summary:
        item.summary || chosen.description || "Click to read the full article.",
      reason: item.reason || "A strong, timely read selected for today.",
      imageQuery:
        typeof (item as any).imageQuery === "string"
          ? (item as any).imageQuery
          : undefined,
      url: chosen.url,
      source: chosen.sourceName,
      readingTime: item.readingTime || "~5 min read",
      publishedAt: chosen.pubDate || new Date().toISOString(),
      subTopics: sanitiseSubTopics(item.subTopics, activeSubTopics),
      poolRank: rank + 1,
      qualityScore:
        typeof item.qualityScore === "number"
          ? Math.max(0, Math.min(100, item.qualityScore))
          : undefined,
    } as Article;
  });

  return {
    articles: articles.length ? articles : [fallbackArticle(category)],
    unrepresentedSubTopics: selection.unrepresentedSubTopics ?? [],
  };
}

export async function pickPodcastPool(
  category: string,
  history: RecentHistory,
  options: TopicPoolOptions = {},
): Promise<{ podcasts: Podcast[]; unrepresentedSubTopics: string[] }> {
  const activeSubTopics = [
    ...new Set(
      (options.activeSubTopics ?? []).map((s) => s.trim()).filter(Boolean),
    ),
  ];
  const desiredSize = Math.min(10, Math.max(5, activeSubTopics.length + 2));
  const candidates = await fetchPoolCandidates(category, history, true);
  if (!candidates.length)
    return { podcasts: [], unrepresentedSubTopics: activeSubTopics };
  const selection = await selectPoolWithBedrock(
    candidates,
    category,
    activeSubTopics,
    desiredSize,
    true,
  );
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
      qualityScore:
        typeof item.qualityScore === "number"
          ? Math.max(0, Math.min(100, item.qualityScore))
          : undefined,
    } as Podcast;
  });
  return {
    podcasts,
    unrepresentedSubTopics: selection.unrepresentedSubTopics ?? [],
  };
}


// ─── Pazar Eki seçimi ─────────────────────────────────────────────────────────

interface SundaySelection {
  selectedIndex: number;
  summary: string;
  duration: string;
}

/**
 * Pazar Eki için tek bir öğe seçer.
 *
 * pickArticle'dan ayrı bir fonksiyon çünkü ihtiyaçlar farklı:
 *   - kategori kavramı yok, ilgi alanı doğrulaması yok
 *   - yaş penceresi 90 gün (SUNDAY_MAX_AGE_DAYS), kategori tablosundan bağımsız
 *   - "hafiflik" birincil kriter; hafta içi akışın ciddiyeti burada istenmiyor
 *   - tekrar koruması URL VE kaynak düzeyinde (excludeUrls / recentSources)
 */
export async function pickSundayItem(
  sources: { name: string; url: string }[],
  isPodcast: boolean,
  excludeUrls: string[] = [],
  recentSources: string[] = [],
): Promise<SundayPick | null> {
  const label = isPodcast ? "Sunday podcast" : "Sunday article";
  try {
    const results = await Promise.allSettled(sources.map(fetchRSSFeed));
    const items: RSSItem[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else console.warn(`${label} feed failed: ${sources[i].url}`, r.reason);
    });
    if (items.length === 0) throw new Error(`All ${label} feeds failed`);

    const excluded = new Set(excludeUrls.map(canonicalizeUrl));
    const now = Date.now();
    const maxAgeMs = SUNDAY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    // scoreAndFilter kategori penceresine bağlı olduğu için burada kullanılmıyor;
    // aynı elemeleri Pazar penceresiyle uyguluyoruz.
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const candidates = items
      // ScoredCandidate seklini koru: buildBalancedShortlist bunu bekliyor.
      // freshness/penalised Pazar Eki'nde kullanilmiyor (90 gunluk pencerede
      // "bugun mu yayinlandi" bilgisi anlamsiz), sabit deger veriliyor.
      .map((item): ScoredCandidate => ({
        ...item,
        url: canonicalizeUrl(item.url),
        freshness: "older",
        penalised: false,
      }))
      .filter((i) => !excluded.has(i.url))
      .filter((i) => i.pubTimestamp === 0 || now - i.pubTimestamp <= maxAgeMs)
      .filter((i) => !ROUNDUP_PATTERNS.test(i.title))
      .filter((i) => !VIDEO_URL_PATTERN.test(i.url))
      .filter((i) => !BREAKING_PATTERNS.test(i.title))
      .filter((i) => !LIVEBLOG_URL_PATTERN.test(i.url))
      .filter((i) => !isPaywalledUrl(i.url))
      .filter((i) => !isPodcast || !isMemberOnlyEpisode(i))
      .filter((i) => isPodcast || !isLikelyNewsReport(i))
      .sort((a, b) => {
        // Son haftalarda kullanılan yayınlar dibe: aynı kaynağın üst üste
        // gelmesi eki tek sesli gösterir.
        const penalty = (n: string) => (recentSources.includes(n) ? 1 : 0);
        const diff = penalty(a.sourceName) - penalty(b.sourceName);
        if (diff !== 0) return diff;
        return b.pubTimestamp - a.pubTimestamp;
      })
      .filter((item) => {
        const key = normaliseTitle(item.title);
        if (seenUrls.has(item.url) || (key && seenTitles.has(key))) return false;
        seenUrls.add(item.url);
        if (key) seenTitles.add(key);
        return true;
      });

    if (candidates.length === 0) throw new Error(`No eligible ${label} candidates`);

    const shortlist = buildBalancedShortlist(candidates, 20, 3);
    console.log(`${label}: ${items.length} raw → ${candidates.length} candidates → ${shortlist.length} shortlisted`);

    const list = shortlist
      .map((c, i) => `[${i}] "${c.title}" — ${c.sourceName}\nURL: ${c.url}\n${truncateDescription(c.description, 260)}`)
      .join("\n\n");

    const kindWord = isPodcast ? "podcast episode" : "article";
    const prompt = `You are choosing the single ${kindWord} for Cogletta's Sunday Supplement.

Cogletta sends serious, informative reading on weekdays — geopolitics, economics, science, philosophy. The Sunday Supplement is the counterweight: one delightful thing to read with coffee.

Choose the candidate that best fits ALL of these:
- Curious, surprising, or quietly delightful — the kind of piece someone wants to tell a friend about
- Light in spirit but not thin: well written, rewarding, worth the time
- Evergreen — it would read just as well next month

REJECT any candidate that is:
- current-events reporting, politics, conflict, or market news
- a product review, shopping guide, or listicle
- career, productivity, or self-improvement advice
- health advice
- heavy or distressing (grief, illness, trauma, violence, disaster)
- a stub, catalogue entry, event notice, book announcement, or fundraising appeal rather than a full piece

Return selectedIndex -1 if nothing is genuinely suitable. A missing supplement is better than a bad one.

Candidates:
${list}

Return only valid JSON:
{
  "selectedIndex": <0-${shortlist.length - 1}, or -1>,
  "summary": "<2-3 sentences, about 55 words. Say what it is actually about and what makes it a pleasure. Warm and specific; no hype, no 'delve', no 'this article'.>",
  "duration": "<${isPodcast ? "episode length such as '38 min'" : "reading estimate such as '9 min read'"}>"
}`;

    const response = await bedrock.send(new InvokeModelCommand({
      modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    }));
    const raw = JSON.parse(new TextDecoder().decode(response.body));
    const text = raw.content[0].text.trim()
      .replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
      .replace(/[\u0000-\u001F\u007F]/g, " ");

    let parsed: SundaySelection;
    try {
      parsed = JSON.parse(text) as SundaySelection;
    } catch {
      console.warn(`${label}: JSON parse failed; skipping rather than guessing. Raw:`, text.slice(0, 200));
      return null;
    }

    if (!Number.isInteger(parsed.selectedIndex) || parsed.selectedIndex < 0 || parsed.selectedIndex >= shortlist.length) {
      console.log(`${label}: nothing suitable this week (index ${parsed.selectedIndex})`);
      return null;
    }

    const chosen = shortlist[parsed.selectedIndex];
    const resolved = isPodcast ? chosen.url : await resolveFinalUrl(chosen.url);

    return {
      title:    chosen.title,
      summary:  parsed.summary || chosen.description || "",
      url:      resolved,
      source:   chosen.sourceName,
      duration: parsed.duration || chosen.duration || (isPodcast ? "—" : "~6 min read"),
    };
  } catch (err) {
    console.error(`${label} selection failed:`, err);
    return null;
  }
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function fallbackArticle(interest: string): Article {
  return {
    category: interest,
    title: `Today's ${interest} digest`,
    summary:
      "We couldn't find a fresh matching article today. Check back tomorrow!",
    reason: `A fresh ${interest} pick will be waiting for you tomorrow.`,
    url: "https://news.ycombinator.com",
    source: "Hacker News",
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
  exclude: Set<string>,
): Promise<Article> {
  const label = scope.join(", ");
  try {
    const sources = scope.flatMap((i) => RSS_SOURCES[i] ?? []);
    if (sources.length === 0) throw new Error(`No RSS sources for: ${label}`);

    const feedResults = await Promise.allSettled(sources.map(fetchRSSFeed));
    const allItems: RSSItem[] = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") allItems.push(...r.value);
      else console.warn(`Article feed failed: ${sources[i].url}`, r.reason);
    });
    if (allItems.length === 0)
      throw new Error(`All article feeds failed for: ${label}`);

    const candidates = scoreAndFilter(allItems, history, false, scope).filter(
      (c) => !exclude.has(canonicalizeUrl(c.url)),
    );
    if (candidates.length === 0)
      throw new Error(`No fresh articles for: ${label}`);

    console.log(
      `${label}: ${allItems.length} raw → ${candidates.length} article candidates`,
    );

    const shortlist = buildBalancedShortlist(candidates, 12, 2);
    const selection = await selectBestArticle(
      shortlist,
      scope,
      history,
      subTopicContext,
    );

    if (selection.selectedIndex === -1) {
      // LLM hicbirini "yeterince uygun" bulmadi. Ama elimizde kategoriye ait, haber
      // OLMAYAN, taze adaylar VAR (candidates.length>0 zaten dogrulandi). Bos "digest"
      // karti gostermek yerine en iyi (ust-siralanan) uygun adayi goster; boylece
      // kategori nadiren bos kalir. Yalnizca hicbir aday kalmazsa gercek fallback.
      const best = shortlist.find((c) => !isLikelyNewsReport(c));
      if (best) {
        console.log(`No clear match for ${label}; using top candidate instead of empty card`);
        const resolvedTop = await resolveFinalUrl(best.url);
        return {
          category: scope[0],
          title: best.title,
          summary: best.description || "Click to read the full article.",
          reason: `A fresh ${scope[0]} pick for you today.`,
          url: resolvedTop,
          source: best.sourceName,
          readingTime: "~5 min read",
          publishedAt: best.pubDate || new Date().toISOString(),
        };
      }
      console.log(`No on-topic article for ${label}; using fallback`);
      return fallbackArticle(scope[0]);
    }

    const chosen = shortlist[selection.selectedIndex];
    if (!chosen || isLikelyNewsReport(chosen)) {
      console.warn(
        `Rejected selected article for ${label}: candidate is missing or looks like news.`,
      );
      return fallbackArticle(scope[0]);
    }

    // Kategori MODELDEN gelir (scope içinde doğrulanır), kaynak-üyeliğinden DEĞİL.
    const modelCat = scope.find(
      (i) => i.toLowerCase() === selection.category.toLowerCase(),
    );
    const sourceCat = scope.find((i) =>
      (RSS_SOURCES[i] ?? []).some((s) => s.name === chosen.sourceName),
    );
    const category = modelCat ?? sourceCat ?? scope[0];

    // Yalnızca final seçime redirect çözümü uygula. (#3)
    const resolvedUrl = await resolveFinalUrl(chosen.url);

    return {
      category,
      title: chosen.title,
      summary:
        selection.summary ||
        chosen.description ||
        "Click to read the full article.",
      reason: selection.reason,
      imageQuery: selection.imageQuery,
      url: resolvedUrl,
      source: chosen.sourceName,
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
  exclude: Set<string>,
): Promise<Podcast | null> {
  const label = scope.join(", ");
  try {
    const sources = scope.flatMap((i) => PODCAST_SOURCES[i] ?? []);
    if (sources.length === 0)
      throw new Error(`No podcast sources for: ${label}`);

    const feedResults = await Promise.allSettled(sources.map(fetchRSSFeed));
    const items: RSSItem[] = [];
    feedResults.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else console.warn(`Podcast feed failed: ${sources[i].url}`, r.reason);
    });
    if (items.length === 0)
      throw new Error(`All podcast feeds failed for: ${label}`);

    const candidates = scoreAndFilter(items, history, true, scope).filter(
      (c) => !exclude.has(canonicalizeUrl(c.url)),
    );
    if (candidates.length === 0)
      throw new Error(`No fresh podcast episodes for: ${label}`);

    console.log(
      `${label}: ${items.length} raw → ${candidates.length} podcast candidates`,
    );

    const shortlist = buildBalancedShortlist(candidates, 12, 2);
    const selection = await selectBestPodcast(
      shortlist,
      scope,
      history,
      subTopicContext,
    );

    if (selection.selectedIndex === -1) {
      console.log(`No on-topic podcast for ${label}; skipping`);
      return null;
    }

    const chosen = shortlist[selection.selectedIndex] ?? shortlist[0];
    if (!chosen) return null;

    const modelCat = scope.find(
      (i) => i.toLowerCase() === selection.category.toLowerCase(),
    );
    const sourceCat = scope.find((i) =>
      (PODCAST_SOURCES[i] ?? []).some((s) => s.name === chosen.sourceName),
    );
    const category = modelCat ?? sourceCat ?? scope[0];

    return {
      category,
      title: chosen.title,
      summary: selection.summary || chosen.description || "Click to listen.",
      reason: selection.reason,
      url: chosen.url,
      source: chosen.sourceName,
      duration: selection.duration || chosen.duration || "—",
      publishedAt: chosen.pubDate || new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`Podcast generation failed for "${label}":`, err);
    return null;
  }
}

/** Sub-topic prompt context limited to a given interest scope. */
function buildSubTopicContext(
  scope: string[],
  subTopics: Record<string, string[]>,
): string {
  const lines = scope
    .filter((i) => subTopics[i] && subTopics[i].length > 0)
    .map((i) => `  - ${i}: ${subTopics[i].join(", ")}`)
    .join("\n");
  return lines
    ? `\n\nUser's selected sub-topics:\n${lines}\nStrongly prefer articles that fall within these sub-topics.`
    : "";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

interface GenerateEvent {
  userId: string;
  /**
   * Cagiranin urettigi sahiplik jetonu. AWS ayni async event'i yeniden
   * denediginde payload AYNI kalir, dolayisiyla bu deger de aynidir — boylece
   * bir retry KENDI kilidine takilmaz. Yoksa suna dusuyorduk: worker 08:00'de
   * claimedAt yazip 08:02:30'da timeout oldu, AWS retry etti, retry
   * "claimedAt 2.5 dk once, taze" deyip cikti; gercekte calisan kimse yok ve
   * o gunun uretimi kayboldu.
   */
  generationId?: string;
  interests: string[];
  subTopics?: Record<string, string[]>;
  plan?: string;
  userEmail?: string;
  email?: string;
}


// ─── Üretim kilidi (idempotency) ──────────────────────────────────────────────
//
// Bu Lambda sistemin EN PAHALI işi: Pro kullanıcı için 3 pickArticle +
// 2 pickPodcast = 5 Bedrock çağrısı, üstelik her biri onlarca RSS feed çekiyor.
// Kilit ÇAĞIRANLARDA değil BURADA olmalı; update-interests doğrudan invoke
// ediyor ve orada hiç kilit yok (art arda PUT = N paralel üretim).
//
// İKİ KATMAN VAR, karıştırılmamalı:
//
//   generatingAt → REZERVASYON. get-articles bu Lambda'yı çağırmadan ÖNCE
//                  "bu kullanıcı/gün için üretim başlatılıyor" diye placeholder
//                  yazıyor. Yani biz çalışmaya başladığımızda kayıt ZATEN VAR.
//   claimedAt    → SAHİPLENME. Yalnızca bu Lambda yazar. "Bir worker gerçekten
//                  üretime başladı" demek.
//
// Tek alan kullanılsaydı (ilk sürümdeki hata) get-articles'ın rezervasyonunu
// "başkası üretiyor" sanıp hemen çıkardık — hiç kimse üretmez, dashboard
// sonsuza kadar "Curating your content..." ekranında kalırdı.
const GEN_STALE_MS        = 3 * 60 * 1000;
const GEN_PLACEHOLDER_TTL = 6 * 60 * 60;

/**
 * Üretim hakkını atomik olarak alır.
 *  - Kayıt yoksa            → koşullu yazma, sahiplenerek başla (true)
 *  - İçerik hazırsa         → false (yeniden üretme)
 *  - Rezerve ama sahipsizse → sahiplen (true)   ← get-articles yolu
 *  - Sahipli ve tazeyse     → false (gerçekten başka bir worker üretiyor)
 *  - Sahipli ama bayatsa    → devral (true)
 */
async function acquireGenerationLock(
  userId: string,
  sk: string,
  generationId: string,
): Promise<boolean> {
  const pk  = Keys.userPK(userId);
  const now = Date.now();

  // 1) Hiç kayıt yoksa: doğrudan sahiplenerek oluştur.
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: { PK: pk, SK: sk, status: "generating", generatingAt: now, claimedAt: now,
              generationId, ttl: Math.floor(now / 1000) + GEN_PLACEHOLDER_TTL },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name !== "ConditionalCheckFailedException") throw err;
  }

  // ConsistentRead: koşullu yazma "kayıt var" dedi; eventually consistent bir
  // okuma o kaydı henüz göremeyip gereksiz yere üretimi atlayabilirdi.
  const existing = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk },
    ProjectionExpression: "#s, claimedAt, generationId",
    ExpressionAttributeNames: { "#s": "status" },
    ConsistentRead: true,
  }));
  const item = existing.Item;
  if (!item) return false;
  if (item.status !== "generating") return false;   // içerik hazır, dokunma

  const claimedAt = Number(item.claimedAt ?? 0);

  // 2) Rezerve edilmiş ama henüz sahiplenilmemiş (get-articles bizi çağırdı).
  //    generatingAt de güncelleniyor: get-articles bayatlık hesabını ONUN
  //    üzerinden yapıyor, iki ayrı saat tutmak gereksiz invoke üretiyordu.
  if (!claimedAt) {
    try {
      await dynamo.send(new UpdateCommand({
        TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk },
        UpdateExpression: "SET claimedAt = :now, generatingAt = :now, generationId = :gid",
        ConditionExpression: "#s = :generating AND attribute_not_exists(claimedAt)",
        ExpressionAttributeNames:  { "#s": "status" },
        ExpressionAttributeValues: { ":now": now, ":generating": "generating", ":gid": generationId },
      }));
      return true;
    } catch (err: any) {
      if (err?.name === "ConditionalCheckFailedException") return false;
      throw err;
    }
  }

  // 3) Kilit ZATEN BİZİM: bu, aynı event'in AWS tarafından yeniden denenmesi.
  //    Kendi kilidimize takılmadan devam etmeliyiz.
  if (generationId && item.generationId === generationId) {
    console.warn(`Retry of generation ${generationId} for user=${userId}; resuming`);
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk },
      UpdateExpression: "SET claimedAt = :now, generatingAt = :now",
      ExpressionAttributeValues: { ":now": now },
    }));
    return true;
  }

  // 4) Başka bir worker sahipli ve taze → gerçekten üretim sürüyor.
  if (now - claimedAt <= GEN_STALE_MS) return false;

  // 5) Sahipli ama bayat → önceki worker çökmüş olabilir, devral.
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE, Key: { PK: pk, SK: sk },
      UpdateExpression: "SET claimedAt = :now, generatingAt = :now, generationId = :gid",
      ConditionExpression: "#s = :generating AND claimedAt = :prev",
      ExpressionAttributeNames:  { "#s": "status" },
      ExpressionAttributeValues: { ":now": now, ":generating": "generating", ":prev": claimedAt, ":gid": generationId },
    }));
    console.warn(`Stale generation lock taken over for user=${userId} ${sk}`);
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export const handler = async (event: GenerateEvent): Promise<void> => {
  const { userId, interests, subTopics = {} } = event;

  if (!userId || !Array.isArray(interests) || interests.length < 1) {
    throw new Error("userId and at least 1 interest are required.");
  }

  const interestsLabel = interests.join(", ");
  const isPro = (event.plan ?? "free").toLowerCase() === "pro";
  const todaySK = Keys.dateSK(new Date());

  // Cagiran jeton gondermediyse uret: o zaman retry korumasi olmaz ama
  // davranis eski haliyle ayni kalir (bayatlik zaman asimina duser).
  const generationId = event.generationId ?? randomUUID();

  // Pahalı üretimden ÖNCE kilit al. Kilit alınamazsa içerik ya hazır ya da
  // üretiliyor demektir — sessizce çık, Bedrock'a hiç gitme.
  if (!(await acquireGenerationLock(userId, todaySK, generationId))) {
    console.log(`Generation skipped for user=${userId} ${todaySK} (already done or in progress)`);
    return;
  }

  console.log(
    `Generating for user=${userId} plan=${isPro ? "pro" : "free"} interests=${interestsLabel}`,
  );

  const history = await fetchRecentHistory(userId);
  console.log(
    `History: ${history.seenUrls.size} seen URLs, ${history.seenSources.size} sources`,
  );

  // ── Seçim ──────────────────────────────────────────────────────────────────
  // Free: 3 ilgi alanı havuzlanır → 1 makale + 1 podcast.
  // Pro:  her ilgi alanı için 1 makale (toplam 3) + EN FAZLA 2 podcast.
  //       Podcast 2'ye ulaşınca kalan kategori denenmez; bir kategoride podcast
  //       bulunamazsa diğerinden tamamlanır (yine en fazla 2).
  // usedArticleUrls / usedPodcastUrls: Pro'da aynı linkin iki kategoride
  // tekrarlanmasını önler.
  const MAX_PRO_PODCASTS = 2;
  const articles: Article[] = [];
  const podcasts: Podcast[] = [];
  const usedArticleUrls: Set<string> = new Set();
  const usedPodcastUrls: Set<string> = new Set();

  if (isPro) {
    for (const interest of interests) {
      const scope = [interest];
      const subCtx = buildSubTopicContext(scope, subTopics);

      // Makale: her interest için (toplam 3)
      const article = await pickArticle(
        scope,
        history,
        subCtx,
        usedArticleUrls,
      );
      articles.push(article);
      if (article.url) usedArticleUrls.add(article.url);

      // Podcast: sadece henüz 2'ye ulaşmadıysak dene
      if (podcasts.length < MAX_PRO_PODCASTS) {
        const podcast = await pickPodcast(
          scope,
          history,
          subCtx,
          usedPodcastUrls,
        );
        if (podcast) {
          podcasts.push(podcast);
          usedPodcastUrls.add(podcast.url);
        }
      }
    }
  } else {
    const subCtx = buildSubTopicContext(interests, subTopics);

    const article = await pickArticle(
      interests,
      history,
      subCtx,
      usedArticleUrls,
    );
    articles.push(article);
    if (article.url) usedArticleUrls.add(article.url);

    const podcast = await pickPodcast(
      interests,
      history,
      subCtx,
      usedPodcastUrls,
    );
    if (podcast) podcasts.push(podcast);
  }

  // ── DynamoDB'e yaz ────────────────────────────────────────────────────────
  // Koşulsuz Put: "generating" placeholder'ının üstüne gerçek içerik yazılır.
  const now = new Date();
  const item: DailyArticles = {
    PK: Keys.userPK(userId),
    SK: todaySK,
    articles: articles,
    podcast: podcasts[0] ?? null, // geriye uyumluluk (eski dashboard tekil okur)
    podcasts: podcasts,
    generatedAt: now.toISOString(),
    ttl: Keys.ttl30Days(),
  };

  // Kosullu yazma: bu arada bayat kilit devralinip BASKA bir worker icerik
  // yazdiysa onun uzerine yazma. Normalde Lambda timeout'u (150s) bayatlik
  // esiginden (180s) kisa oldugu icin bu senaryo beklenmez, ama sessizce
  // icerigin ezilmesi kotu bir basarisizlik bicimi olurdu.
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: { ...item, status: "ready", generationId },
      ConditionExpression: "attribute_not_exists(PK) OR generationId = :gid OR attribute_not_exists(generationId)",
      ExpressionAttributeValues: { ":gid": generationId },
    }));
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      console.warn(`Generation ${generationId} superseded for user=${userId} ${todaySK}; discarding result`);
      return;
    }
    throw err;
  }
  console.log(
    `Wrote ${articles.length} article(s) + ${podcasts.length} podcast(s) for user=${userId} date=${todaySK}`,
  );

  // ── Email ─────────────────────────────────────────────────────────────────
  if (SES_FROM_EMAIL) {
    const userEmail =
      event.userEmail ?? event.email ?? (await fetchUserEmail(userId));
    if (userEmail) {
      try {
        await sendDailyEmail(userEmail, articles, podcasts, isPro ? "pro" : "free");
      } catch (err) {
        // EMAIL_SEND_FAILED: CloudWatch metric filter bu ifadeye baglanabilir.
        // Gonderim sessizce kaybolmamali — SES throttling'i burada goruntur.
        console.error(`EMAIL_SEND_FAILED user=${userId} reason=${(err as Error)?.name ?? "unknown"}`, err);
      }
    } else {
      console.warn(`No email found for user=${userId}, skipping notification`);
    }
  }
};
