import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { createHash } from "crypto";
import { Keys } from "../../../shared/types";
import type { Article, TrendPick, WeeklyTrendReport, WeeklyBonusRead } from "../../../shared/types";
import { BONUS_CATEGORY_IDS } from "../../../shared/categories";
import { canonicalizeUrl, pickArticle } from "../../articles/generate-articles";
import type { RecentHistory } from "../../articles/generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses    = new SESClient({ maxAttempts: 5, retryMode: "adaptive" });

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_URL  = "https://news.ycombinator.com";

// Bonus okuma kilidi — generate-category-picks ile aynı desen.
const STALE_MS         = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 4 * 1000;
const POLL_MAX_MS      = 90 * 1000;
const PLACEHOLDER_TTL  = 6 * 60 * 60;

interface TrendEvent {
  userId:     string;
  interests:  string[];
  email?:     string;
  userEmail?: string;
  plan?:      string;
}

// ── Deterministik seçim ───────────────────────────────────────────────────────
//
// Math.random() yerine tohumlu hash: rapor yeniden üretilirse (retry, manuel
// invoke, dashboard'da yeniden okuma) aynı sonucu verir.
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return -1;
  const hash = createHash("sha256").update(seed).digest();
  return hash.readUInt32BE(0) % length;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, i) => ({
      item,
      key: createHash("sha256").update(`${seed}#${i}`).digest("hex"),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.item);
}

function toPick(article: Article): TrendPick {
  return {
    title:       article.title,
    summary:     article.summary,
    url:         article.url,
    source:      article.source,
    readingTime: article.readingTime || "~5 min read",
    category:    article.category,
  };
}

/** Fallback kartları ("Today's X digest") rapora asla girmemeli. */
function isRealArticle(a: Article | undefined): a is Article {
  return !!a && !!a.url && a.url !== FALLBACK_URL && !!a.title;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

async function fetchUserEmail(userId: string): Promise<string | undefined> {
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { PK: Keys.userPK(userId), SK: "PROFILE" },
      ProjectionExpression: "email",
    }));
    return res.Item?.email as string | undefined;
  } catch { return undefined; }
}

/**
 * Kullanıcının son 7 günde GERÇEKTEN ALDIĞI makaleler. Feed'lere hiç gidilmez;
 * DailyArticles kayıtları zaten özet, kaynak ve okuma süresini taşıyor.
 * Podcast'ler bilinçli olarak dışarıda — haftalık rapor yalnızca okuma.
 */
async function fetchWeeklyArticles(userId: string): Promise<Article[]> {
  const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const skStart = `DATE#${weekAgo.toISOString().slice(0, 10)}`;

  const res = await dynamo.send(new QueryCommand({
    TableName: ARTICLES_TABLE,
    KeyConditionExpression: "PK = :pk AND SK >= :skStart",
    ExpressionAttributeValues: { ":pk": Keys.userPK(userId), ":skStart": skStart },
    ProjectionExpression: "articles",
  }));

  const seen = new Set<string>();
  const articles: Article[] = [];
  for (const item of res.Items ?? []) {
    for (const a of (item.articles ?? []) as Article[]) {
      if (!isRealArticle(a)) continue;
      const url = canonicalizeUrl(a.url);
      if (seen.has(url)) continue;
      seen.add(url);
      articles.push(a);
    }
  }
  return articles;
}

/**
 * İlgi alanı başına bir seçki. Kategori etiketi kullanıcıya GÖSTERİLMİYOR ama
 * seçim kategoriye göre yapılıyor: üç kartın üçünün aynı konudan çıkması
 * raporu bozuk gösterirdi.
 */
function selectPicks(articles: Article[], interests: string[], seed: string): TrendPick[] {
  const byCategory = new Map<string, Article[]>();
  for (const a of articles) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }

  const picks: TrendPick[] = [];
  for (const interest of interests) {
    const candidates = byCategory.get(interest) ?? [];
    if (candidates.length === 0) continue;
    const idx = seededIndex(`${seed}#${interest}`, candidates.length);
    picks.push(toPick(candidates[idx]));
  }

  // Bir ilgi alanı o hafta boş kaldıysa kalan makalelerden tamamla — rapor
  // 3 karta ulaşmaya çalışır ama zorlamaz.
  const target = Math.min(3, interests.length);
  if (picks.length < target) {
    const used = new Set(picks.map((p) => canonicalizeUrl(p.url)));
    const rest = seededShuffle(
      articles.filter((a) => !used.has(canonicalizeUrl(a.url))),
      `${seed}#fill`,
    );
    for (const a of rest) {
      if (picks.length >= target) break;
      picks.push(toPick(a));
      used.add(canonicalizeUrl(a.url));
    }
  }

  return seededShuffle(picks, `${seed}#order`).slice(0, 3);
}

// ── Ortak bonus okuma ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readBonus(sk: string): Promise<WeeklyBonusRead | undefined> {
  const res = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE,
    Key: { PK: Keys.bonusPK(), SK: sk },
  }));
  return res.Item as WeeklyBonusRead | undefined;
}

async function acquireBonusLock(sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: {
        PK: Keys.bonusPK(), SK: sk,
        status: "generating", generatingAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + PLACEHOLDER_TTL,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function takeoverStaleBonusLock(sk: string, previousGeneratingAt: number): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.bonusPK(), SK: sk },
      UpdateExpression: "SET generatingAt = :now",
      ConditionExpression: "#s = :generating AND generatingAt = :prev",
      ExpressionAttributeNames:  { "#s": "status" },
      ExpressionAttributeValues: { ":now": Date.now(), ":generating": "generating", ":prev": previousGeneratingAt },
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/**
 * Bonus okuma haftada BİR KEZ üretilir ve tüm Pro kullanıcılar aynı yazıyı alır.
 * Kilit olmasaydı her kullanıcı için feed'ler yeniden çekilir ve Bedrock yeniden
 * çağrılırdı — generate-category-picks'te çözülen problemin aynısı.
 */
async function ensureWeeklyBonus(sk: string): Promise<TrendPick | null> {
  const existing = await readBonus(sk);
  if (existing && existing.status !== "generating") return existing.pick ?? null;

  let mine = false;
  if (!existing) {
    mine = await acquireBonusLock(sk);
  } else if (Date.now() - (existing.generatingAt ?? 0) > STALE_MS) {
    console.warn(`Bonus lock for ${sk} looks stale; attempting takeover`);
    mine = await takeoverStaleBonusLock(sk, existing.generatingAt ?? 0);
  }

  if (!mine) {
    // Başka bir invocation üretiyor — bitmesini bekle.
    const deadline = Date.now() + POLL_MAX_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const item = await readBonus(sk);
      if (item && item.status !== "generating") return item.pick ?? null;
    }
    console.warn(`Bonus read for ${sk} not ready in time; sending report without it`);
    return null;
  }

  // Kilit bizde: haftaya göre dönüşümlü kategori seç, taze bir makale üret.
  const category = BONUS_CATEGORY_IDS[seededIndex(`bonus#${sk}`, BONUS_CATEGORY_IDS.length)];
  console.log(`Generating weekly bonus read for ${sk} from "${category}"`);

  let pick: TrendPick | null = null;
  try {
    // pickArticle tüm eleme mantığını taşıyor: haber filtreleri, paywall
    // domainleri, yaş penceresi, kaynak dengesi ve Life & Relationships için
    // "uplifting, avoid grief/trauma" tone kuralı.
    const emptyHistory: RecentHistory = { seenUrls: new Set(), seenSources: new Map() };
    const article = await pickArticle([category], emptyHistory, "", new Set());
    if (isRealArticle(article)) pick = toPick(article);
    else console.warn(`Bonus generation for ${category} returned the fallback card; skipping bonus`);
  } catch (err) {
    console.error(`Bonus generation failed for ${category}:`, err);
  }

  const item: WeeklyBonusRead = {
    PK: Keys.bonusPK(), SK: sk,
    pick, category,
    generatedAt: new Date().toISOString(),
    ttl: Keys.ttl30Days(),
  };
  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  return pick;
}

// ── E-posta ───────────────────────────────────────────────────────────────────

function weekLabel(): string {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function pickBlock(pick: TrendPick, index: number): string {
  const divider = index > 0 ? "border-top:1px solid #f3f4f6;" : "";
  return `
      <tr>
        <td style="padding:26px 0;${divider}">
          <span style="font-size:12px;font-weight:700;color:#d1d5db;letter-spacing:0.08em;">${String(index + 1).padStart(2, "0")}</span>
          <h2 style="margin:8px 0 4px 0;font-size:20px;font-weight:700;line-height:1.35;color:#111827;">
            <a href="${pick.url}" style="color:#111827;text-decoration:none;">${pick.title}</a>
          </h2>
          <p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;font-weight:500;">${pick.source} &nbsp;·&nbsp; ${pick.readingTime}</p>
          <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
            ${pick.summary} <a href="${pick.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Read &rarr;</a>
          </p>
        </td>
      </tr>`;
}

function bonusBlock(bonus: TrendPick): string {
  return `
      <tr>
        <td style="padding:24px 0 4px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;">
            <tr><td style="padding:22px 24px;">
              <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Bonus read</span>
              <h2 style="margin:8px 0 4px 0;font-size:18px;font-weight:700;line-height:1.35;color:#111827;">
                <a href="${bonus.url}" style="color:#111827;text-decoration:none;">${bonus.title}</a>
              </h2>
              <p style="margin:0 0 10px 0;font-size:13px;color:#6b7280;font-weight:500;">${bonus.source} &nbsp;·&nbsp; ${bonus.readingTime}</p>
              <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563;font-family:Georgia,'Times New Roman',serif;">
                ${bonus.summary} <a href="${bonus.url}" style="color:#111827;font-weight:600;text-decoration:none;white-space:nowrap;">Read &rarr;</a>
              </p>
            </td></tr>
          </table>
        </td>
      </tr>`;
}

function buildEmail(report: WeeklyTrendReport): { html: string; text: string } {
  const blocks = report.picks.map(pickBlock).join("") + (report.bonus ? bonusBlock(report.bonus) : "");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>This week's selections</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;"><tr><td style="padding:32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 36px 22px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
        <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">${report.weekLabel}</p>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">This week's selections</p>
        <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;line-height:1.55;">A few pieces from your week worth a second look${report.bonus ? ", plus one on us" : ""}.</p>
      </td></tr>
      <tr><td style="padding:0 36px 12px;"><table width="100%" cellpadding="0" cellspacing="0">${blocks}</table></td></tr>
      <tr><td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Cogletta Pro &nbsp;·&nbsp; every Sunday.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const lines = report.picks
    .map((p, i) => `${String(i + 1).padStart(2, "0")}  ${p.title}\n    ${p.source} · ${p.readingTime}\n    ${p.url}`)
    .join("\n\n");
  const bonusText = report.bonus
    ? `\n\n---\n\nBonus read\n${report.bonus.title}\n${report.bonus.source} · ${report.bonus.readingTime}\n${report.bonus.url}`
    : "";
  const text = `Cogletta — This week's selections (${report.weekLabel})\n\n${lines}${bonusText}\n\nCogletta Pro · every Sunday.`;

  return { html, text };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event: TrendEvent): Promise<void> => {
  const { userId, interests } = event;
  if (!userId || !Array.isArray(interests) || interests.length === 0) {
    throw new Error("userId and interests are required.");
  }

  const now = new Date();
  const sk  = Keys.weekSK(now);
  console.log(`Weekly report: user=${userId} week=${sk} interests=${interests.join(", ")}`);

  const articles = await fetchWeeklyArticles(userId);
  console.log(`Found ${articles.length} delivered article(s) in the last 7 days`);

  // Hiç makale yoksa rapor gönderme. Boş bir "haftan böyleydi" e-postası
  // Pro değerini artırmaz, azaltır.
  if (articles.length === 0) {
    console.log(`No delivered articles for user=${userId}; skipping report entirely`);
    return;
  }

  const picks = selectPicks(articles, interests, `${userId}#${sk}`);
  if (picks.length === 0) {
    console.log(`No usable picks for user=${userId}; skipping report`);
    return;
  }

  let bonus = await ensureWeeklyBonus(sk);
  // Bonus, kullanıcının o hafta zaten aldığı bir yazıysa gösterme.
  if (bonus) {
    const weekUrls = new Set(articles.map((a) => canonicalizeUrl(a.url)));
    if (weekUrls.has(canonicalizeUrl(bonus.url))) {
      console.log(`Bonus read already delivered to user=${userId}; omitting`);
      bonus = null;
    }
  }

  const report: WeeklyTrendReport = {
    PK:          Keys.userPK(userId),
    SK:          sk,
    weekLabel:   weekLabel(),
    picks,
    bonus,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: report }));
  console.log(`Wrote report ${sk} for user=${userId} (${picks.length} pick(s), bonus=${bonus ? "yes" : "no"})`);

  if (SES_FROM_EMAIL) {
    const to = event.userEmail ?? event.email ?? await fetchUserEmail(userId);
    if (to) {
      try {
        const { html, text } = buildEmail(report);
        await ses.send(new SendEmailCommand({
          Source: SES_FROM_EMAIL,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: `Your Cogletta selections — ${report.weekLabel}`, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } },
          },
        }));
        console.log(`Weekly email sent to ${to}`);
      } catch (err) {
        console.error("Weekly email failed:", err);
      }
    } else {
      console.warn(`No email for user=${userId}; report stored but not sent`);
    }
  }
};
