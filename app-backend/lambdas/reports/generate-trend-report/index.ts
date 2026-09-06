import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Keys } from "../../../shared/types";
import type { SundayPick, SundayIssue, SundayHistory } from "../../../shared/types";
import {
  SUNDAY_SOURCES,
  SUNDAY_PODCAST_SOURCES,
  canonicalizeUrl,
  pickSundayItem,
} from "../../articles/generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses    = new SESClient({ maxAttempts: 5, retryMode: "adaptive" });

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";

// Kilit: generate-category-picks ile aynı desen.
const STALE_MS         = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 4 * 1000;
const POLL_MAX_MS      = 120 * 1000;
const PLACEHOLDER_TTL  = 6 * 60 * 60;

/**
 * Tekrar korumasında tutulan geçmiş boyutu.
 *
 * Pazar Eki penceresi 90 gün ve haftada tek seçim yapılıyor; 20 hafta ≈ 5 ay
 * koruma demek, yani bir yazı pencereden düşmeden önce tekrar seçilemiyor.
 * Kaynak geçmişi daha kısa: aynı yayının 6 hafta ara ile gelmesi sorun değil,
 * arka arkaya gelmesi sorun.
 */
const URL_HISTORY_LIMIT    = 20;
const SOURCE_HISTORY_LIMIT = 4;

interface SundayEvent {
  userId:     string;
  interests?: string[];
  email?:     string;
  userEmail?: string;
  plan?:      string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function weekLabel(): string {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// ── Tekrar koruması ───────────────────────────────────────────────────────────

async function readHistory(): Promise<SundayHistory> {
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.sundayHistoryPK(), SK: "URLS" },
    }));
    const item = res.Item as SundayHistory | undefined;
    return {
      PK: Keys.sundayHistoryPK(), SK: "URLS",
      urls:    Array.isArray(item?.urls) ? item!.urls : [],
      sources: Array.isArray(item?.sources) ? item!.sources : [],
      updatedAt: item?.updatedAt ?? "",
    };
  } catch (err) {
    // Geçmiş okunamazsa seçim yine yapılır — tekrar riski, hiç ek göndermemekten iyi.
    console.warn("Sunday history read failed; proceeding without repeat protection:", err);
    return { PK: Keys.sundayHistoryPK(), SK: "URLS", urls: [], sources: [], updatedAt: "" };
  }
}

async function writeHistory(previous: SundayHistory, picks: (SundayPick | null)[]): Promise<void> {
  const fresh = picks.filter((p): p is SundayPick => p !== null);
  if (fresh.length === 0) return;

  // TTL YOK: geçmiş kaydı silinirse tekrar koruması sessizce kaybolur.
  const urls = [...fresh.map((p) => canonicalizeUrl(p.url)), ...previous.urls];
  const sources = [...fresh.map((p) => p.source), ...previous.sources];

  const item: SundayHistory = {
    PK: Keys.sundayHistoryPK(), SK: "URLS",
    urls:    [...new Set(urls)].slice(0, URL_HISTORY_LIMIT),
    sources: [...new Set(sources)].slice(0, SOURCE_HISTORY_LIMIT),
    updatedAt: new Date().toISOString(),
  };
  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: item }));
  console.log(`Sunday history updated: ${item.urls.length} url(s), ${item.sources.length} source(s)`);
}

// ── Haftanın eki (tüm Pro üyeler için ortak, kilitli) ──────────────────────────

async function readIssue(sk: string): Promise<SundayIssue | undefined> {
  const res = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE,
    Key: { PK: Keys.sundayPK(), SK: sk },
  }));
  return res.Item as SundayIssue | undefined;
}

async function acquireLock(sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: {
        PK: Keys.sundayPK(), SK: sk,
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

async function takeoverStaleLock(sk: string, previousGeneratingAt: number): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.sundayPK(), SK: sk },
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
 * Haftanın ekini döndürür; yoksa ÜRETİR.
 *
 * Kilit şart: weekly-trigger her Pro üye için ayrı invocation başlatıyor.
 * Kilitsiz olsaydı her kullanıcı için 15 feed yeniden çekilir ve Bedrock iki
 * kez daha çağrılırdı — N kullanıcı için 2N çağrı. Kilitle haftada 2 çağrı.
 */
async function ensureIssue(sk: string): Promise<SundayIssue | null> {
  const existing = await readIssue(sk);
  if (existing && existing.status !== "generating") return existing;

  let mine = false;
  if (!existing) {
    mine = await acquireLock(sk);
  } else if (Date.now() - (existing.generatingAt ?? 0) > STALE_MS) {
    console.warn(`Sunday lock for ${sk} looks stale; attempting takeover`);
    mine = await takeoverStaleLock(sk, existing.generatingAt ?? 0);
  }

  if (!mine) {
    // Başka bir invocation üretiyor — bitmesini bekle.
    const deadline = Date.now() + POLL_MAX_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const item = await readIssue(sk);
      if (item && item.status !== "generating") return item;
    }
    console.warn(`Sunday issue ${sk} not ready in time; skipping this user`);
    return null;
  }

  console.log(`Generating Sunday Supplement for ${sk}`);
  const history = await readHistory();

  // Makale ve podcast paralel seçilir: ikisi de ayrı feed kümesi okuyor.
  const [article, podcast] = await Promise.all([
    pickSundayItem(SUNDAY_SOURCES,         false, history.urls, history.sources),
    pickSundayItem(SUNDAY_PODCAST_SOURCES, true,  history.urls, history.sources),
  ]);

  // EKSIK ISSUE HAFTAYI KILITLEMEMELI.
  //
  // pickSundayItem gecici bir sorunda null donebiliyor: RSS timeout, tum
  // feed'lerin ayni anda basarisiz olmasi, Bedrock hatasi, gecersiz JSON ya da
  // modelin -1 secmesi. Eksik issue'yu yine de "hazir" kaydetseydik o hafta
  // bir daha denenmezdi; ikisi de null ise tum Pro uyeler Pazar mailini
  // kacirirdi. Bu yuzden eksikse kilidi BIRAKIYORUZ (kaydi siliyoruz) ve bir
  // sonraki invocation bastan deniyor.
  //
  // Pazar Eki'nin vaadi "bir okuma + bir dinleme": ikisi de olmadan gonderim
  // yapilmaz.
  if (!article || !podcast) {
    console.warn(
      `Sunday issue ${sk} incomplete (article=${article ? "ok" : "MISSING"}, ` +
      `podcast=${podcast ? "ok" : "MISSING"}); releasing lock so it can be retried`,
    );
    try {
      await dynamo.send(new DeleteCommand({
        TableName: ARTICLES_TABLE,
        Key: { PK: Keys.sundayPK(), SK: sk },
        // Yalnizca kendi placeholder'imizi sil: bu arada baskasi gercek icerik
        // yazdiysa dokunma.
        ConditionExpression: "#s = :generating",
        ExpressionAttributeNames:  { "#s": "status" },
        ExpressionAttributeValues: { ":generating": "generating" },
      }));
    } catch (err: any) {
      if (err?.name !== "ConditionalCheckFailedException") throw err;
    }
    return null;
  }

  const issue: SundayIssue = {
    PK: Keys.sundayPK(), SK: sk,
    weekLabel: weekLabel(),
    article, podcast,
    generatedAt: new Date().toISOString(),
    ttl: Keys.ttl30Days(),
  };
  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: issue }));
  await writeHistory(history, [article, podcast]);

  console.log(`Sunday issue ${sk} ready — ${article.source} / ${podcast.source}`);
  return issue;
}

// ── E-posta ───────────────────────────────────────────────────────────────────

/**
 * Tek bir seçimin HTML bloğu.
 *
 * "Read" / "Listen" etiketi YOK: okurun ne bulacağını önceden söylemek sürprizi
 * öldürüyordu. Başlık zaten link, tıklanacak yer kaybolmuyor.
 */
function itemBlock(pick: SundayPick, withDivider: boolean): string {
  const divider = withDivider ? "border-top:2px solid #e5e7eb;" : "";
  return `
      <tr>
        <td style="padding:30px 0;${divider}">
          <h2 style="margin:0 0 4px 0;font-size:21px;font-weight:700;line-height:1.35;color:#111827;">
            <a href="${pick.url}" style="color:#111827;text-decoration:none;">${pick.title}</a>
          </h2>
          <p style="margin:0 0 14px 0;font-size:13px;color:#6b7280;font-weight:500;">${pick.source}</p>
          <p style="margin:0;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
            ${pick.summary}
          </p>
        </td>
      </tr>`;
}

function buildEmail(issue: SundayIssue): { html: string; text: string } {
  const blocks =
    (issue.article ? itemBlock(issue.article, false) : "") +
    (issue.podcast ? itemBlock(issue.podcast, Boolean(issue.article)) : "");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>The Sunday Supplement</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;"><tr><td style="padding:32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 36px 22px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
        <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">${issue.weekLabel}</p>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">The Sunday Supplement</p>
        <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;line-height:1.55;">Something to read and something to hear, away from the week's news.</p>
      </td></tr>
      <tr><td style="padding:0 36px 12px;"><table width="100%" cellpadding="0" cellspacing="0">${blocks}</table></td></tr>
      <tr><td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Cogletta Pro &nbsp;·&nbsp; every Sunday.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // Plain-text fallback. Onceden bos gidiyordu: `lines` doldurulmadan
  // join ediliyordu, yani text/plain okuyan istemcide mail bombostu.
  const textBlock = (pick: SundayPick) =>
    `${pick.title}\n${pick.source}\n\n${pick.summary}\n\n${pick.url}`;

  const lines = [issue.article, issue.podcast]
    .filter((p): p is SundayPick => Boolean(p))
    .map(textBlock);

  const text = `Cogletta — The Sunday Supplement (${issue.weekLabel})\n\n${lines.join("\n\n———\n\n")}\n\nCogletta Pro · every Sunday.`;

  return { html, text };
}


/**
 * Gonderim hakkini atomik olarak alir: USER#<id> / SUNDAY_SENT#<hafta>.
 *
 * Neden gerekli: SES hatasini yukari firlatiyoruz ki AWS invocation'i yeniden
 * denesin. Ama isaret olmadan retry, maili ZATEN ALMIS kullaniciya ikinci kez
 * gonderirdi. Once isareti koyuyoruz, sonra gonderiyoruz; gonderim kalici
 * olarak basarisiz olursa isaret siliniyor ki bir sonraki deneme calissin.
 */
async function claimSend(userId: string, sk: string): Promise<boolean> {
  try {
    await dynamo.send(new PutCommand({
      TableName: ARTICLES_TABLE,
      Item: {
        PK: Keys.userPK(userId),
        SK: `SUNDAY_SENT#${sk.replace("TREND#", "")}`,
        sentAt: new Date().toISOString(),
        ttl: Keys.ttl30Days(),
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function releaseSend(userId: string, sk: string): Promise<void> {
  try {
    await dynamo.send(new DeleteCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.userPK(userId), SK: `SUNDAY_SENT#${sk.replace("TREND#", "")}` },
    }));
  } catch (err) {
    console.warn(`Could not release send marker for user=${userId}:`, err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event: SundayEvent): Promise<void> => {
  const { userId } = event;
  if (!userId) throw new Error("userId is required.");

  const sk = Keys.weekSK(new Date());
  console.log(`Sunday Supplement: user=${userId} week=${sk}`);

  const issue = await ensureIssue(sk);

  // İçerik yoksa e-posta gönderme. Boş bir ek Pro değerini artırmaz, azaltır.
  if (!issue || (!issue.article && !issue.podcast)) {
    console.log(`No Sunday content for ${sk}; skipping user=${userId}`);
    return;
  }

  // Kullanıcı başına kayıt YOK: ek herkes için aynı, tek kayıtta duruyor.
  // Dashboard SUNDAY#issue kaydını doğrudan okur.

  if (!SES_FROM_EMAIL) return;
  const to = event.userEmail ?? event.email ?? await fetchUserEmail(userId);
  if (!to) {
    console.warn(`No email for user=${userId}; supplement stored but not sent`);
    return;
  }

  if (!(await claimSend(userId, sk))) {
    console.log(`Sunday email already sent to user=${userId} for ${sk}; skipping`);
    return;
  }

  try {
    const { html, text } = buildEmail(issue);
    await ses.send(new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `The Sunday Supplement — ${issue.weekLabel}`, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } },
      },
    }));
    console.log(`Sunday email sent to ${to}`);
  } catch (err) {
    // EMAIL_SEND_FAILED: CloudWatch metric filter bu ifadeye baglanir.
    console.error(`EMAIL_SEND_FAILED user=${userId} reason=${(err as Error)?.name ?? "unknown"}`, err);
    // Isareti geri al ve HATAYI FIRLAT: aksi halde Lambda basarili sayilir,
    // AWS yeniden denemez ve kullanici maili kalici olarak kaybeder.
    await releaseSend(userId, sk);
    throw err;
  }
};