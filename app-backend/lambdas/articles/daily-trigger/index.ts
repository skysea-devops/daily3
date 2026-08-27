import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { RSS_SOURCES } from "../generate-articles";
import { randomUUID } from "crypto";
import { rotationCategoryFor } from "../../../shared/categories";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const USERS_TABLE                     = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";
const APP_URL        = process.env.APP_URL ?? "https://cogletta.com";

const ses = new SESClient({ maxAttempts: 5, retryMode: "adaptive" });

/** Deneme bitmeden kac gun once hatirlatma gonderilecek. */
const REMINDER_DAYS_BEFORE = 3;
/** Deneme suresi (gun) — hatirlatma metninde "gecen X gun" icin. */
const TRIAL_DAYS = 14;
const GENERATE_ARTICLES_FUNCTION      = process.env.GENERATE_ARTICLES_FUNCTION_NAME!;
const GENERATE_CATEGORY_PICKS_FUNCTION = process.env.GENERATE_CATEGORY_PICKS_FUNCTION_NAME!;
const DELIVER_DAILY_FUNCTION          = process.env.DELIVER_DAILY_FUNCTION_NAME!;

// ─── İki fazlı orkestrasyon ───────────────────────────────────────────────────
// Faz A — kategori havuzu: bölgedeki havuzlu free kullanıcıların kategorileri
//   için generate-category-picks SENKRON (RequestResponse) paralel çağrılır.
//   EU günün ilk cron'u olduğundan 15 kategorinin TAMAMINI üretir; sonraki
//   bölgeler kendi kategorilerini ensure eder ve ready-check'ten anında döner
//   (EU cron'u çökmüşse üretimi devralırlar — güvenlik ağı).
// Faz B — teslimat fan-out'u: havuzlu free kullanıcılar deliver-daily'ye
//   (Bedrock'suz kopyala+e-postala), Pro ve legacy free (2-3 interest)
//   kullanıcılar eskisi gibi generate-articles'a async gönderilir.
// Teslimat üretim bittikten sonra başladığı için "seçim henüz yok" durumu
// yapısal olarak oluşmaz.

interface TriggerUser {
  userId:     string;
  interests:  string[];
  subTopics:  Record<string, string[]>;
  email?:     string;
  plan:       string;
  /** "trial" = 14 gunluk deneme, "paid" = Lemon Squeezy aboneligi. */
  planSource?:       string;
  /** ISO tarih; yalnizca planSource === "trial" iken anlamli. */
  trialEndsAt?:      string;
  /** Varsa kullanici gercekten odeme yapmis demektir. */
  lsSubscriptionId?: string;
  /** Hatirlatma gonderildiyse ISO tarih; mukerrer gonderimi engeller. */
  trialReminderSentAt?: string;
}

interface EnsureResult {
  status:    "ready" | "failed";
  category:  string;
  generated: boolean;
}

// ─── Faz A: kategori havuzunu hazırla ─────────────────────────────────────────

async function ensureCategoryPick(category: string, activeSubTopics: string[]): Promise<EnsureResult> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName:   GENERATE_CATEGORY_PICKS_FUNCTION,
    InvocationType: "RequestResponse",
    Payload:        Buffer.from(JSON.stringify({ category, activeSubTopics })),
  }));

  if (res.FunctionError) {
    throw new Error(`generate-category-picks errored for "${category}": ${res.FunctionError}`);
  }

  const payload = res.Payload ? JSON.parse(new TextDecoder().decode(res.Payload)) : null;
  return (payload ?? { status: "failed", category, generated: false }) as EnsureResult;
}

// Hesabın eşzamanlı Lambda limiti düşük olabilir (yeni hesaplarda varsayılan 10).
// 15 senkron invoke'u tek seferde atmak ConcurrentInvocationLimitExceeded (429)
// üretir — 2026-07-11 prod'da 6/15 kategori tam bu sebeple üretilemedi. Çözüm:
// sınırlı paralellik (1 trigger + 4 invoke = 5 eşzamanlı) + throttle'da retry.
const PHASE_A_PARALLELISM    = 4;
const PHASE_A_MAX_ATTEMPTS   = 3;
const PHASE_A_RETRY_DELAY_MS = 8_000; // bir üretim dalgası ~10 sn — retry anına kadar kapasite boşalır

async function ensureCategoryPickWithRetry(category: string, activeSubTopics: string[]): Promise<EnsureResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ensureCategoryPick(category, activeSubTopics);
    } catch (err: any) {
      const throttled = err?.name === "TooManyRequestsException" || err?.$metadata?.httpStatusCode === 429;
      if (throttled && attempt < PHASE_A_MAX_ATTEMPTS) {
        console.warn(`Throttled ensuring "${category}" (attempt ${attempt}/${PHASE_A_MAX_ATTEMPTS}), retrying in ${PHASE_A_RETRY_DELAY_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, PHASE_A_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
}

async function ensureCategoryPicks(categories: string[], activeSubTopicsByCategory: Map<string, Set<string>>): Promise<Set<string>> {
  const readyCategories = new Set<string>();
  if (categories.length === 0) return readyCategories;

  console.log(`Phase A: ensuring ${categories.length} category pick(s): ${categories.join(", ")}`);

  let ready = 0, generated = 0, failed = 0;

  for (let i = 0; i < categories.length; i += PHASE_A_PARALLELISM) {
    const wave    = categories.slice(i, i + PHASE_A_PARALLELISM);
    const results = await Promise.allSettled(
      wave.map(category => ensureCategoryPickWithRetry(category, [...(activeSubTopicsByCategory.get(category) ?? new Set<string>())]))
    );

    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value.status === "ready") {
        ready++;
        readyCategories.add(r.value.category);
        if (r.value.generated) generated++;
      } else {
        failed++;
        const reason = r.status === "rejected" ? r.reason : `status=${r.value.status}`;
        console.warn(`Category pick not ready: "${wave[j]}" —`, reason);
      }
    });
  }

  console.log(`Phase A complete: ${ready}/${categories.length} ready (${generated} freshly generated, ${failed} failed)`);
  return readyCategories;
}

// ─── Faz B: fan-out ───────────────────────────────────────────────────────────

// SES gonderim hizi tavani: Frankfurt'ta 14 e-posta/saniye.
//
// Fan-out "Event" invoke oldugu icin tetiklenen her Lambda hemen basliyor ve
// sonunda bir SES cagrisi yapiyor — yani e-posta hizi, dagitim hizini takip
// ediyor. Onceki ayar (10 invoke / 500ms) saniyede 20 gonderim demekti ve tek
// batch'i asan her calistirmada SES limitini asiyordu. Asim sessizdi: throttling
// hatasi deliver-daily icinde yakalanip loglaniyor, kullanici mail almiyordu.
//
// 10 invoke / 1000ms = saniyede 10 gonderim; 14'un altinda emniyet payi birakir.
// Limit artarsa (SES konsolundan quota yukseltilirse) BATCH_SIZE degil,
// BATCH_DELAY_MS asagi cekilmelidir.
const BATCH_SIZE     = 10;
const BATCH_DELAY_MS = 1000;

async function fanOut(
  invocations: { functionName: string; payload: Record<string, unknown>; label: string }[]
): Promise<void> {
  for (let i = 0; i < invocations.length; i += BATCH_SIZE) {
    const batch = invocations.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(({ functionName, payload, label }) =>
        lambda.send(
          new InvokeCommand({
            FunctionName:   functionName,
            InvocationType: "Event", // fire-and-forget
            Payload:        Buffer.from(JSON.stringify(payload)),
          })
        ).then(() => {
          console.log(`Triggered ${label}`);
        }).catch((err) => {
          console.error(`Failed to trigger ${label}:`, err);
        })
      )
    );

    if (i + BATCH_SIZE < invocations.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────



/**
 * Deneme bittiğinde gönderilen tek e-posta.
 *
 * Ton bilinçli olarak sakin: kullanıcı bir şey kaybetmedi, ücretsiz plana
 * geçti. Kaybı abartmak yerine ne değiştiğini açıkça söylüyoruz.
 */
async function sendTrialEndedEmail(to: string): Promise<void> {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Pro trial has ended</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;"><tr><td style="padding:32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 36px 24px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">Your Pro trial has ended</p>
      </td></tr>
      <tr><td style="padding:28px 36px;">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          For the last two weeks you've had three articles and two podcast episodes every morning, across the topics you chose — plus The Sunday Supplement.
        </p>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          From tomorrow you'll keep getting one article and one podcast each morning, free, on a different topic each day. If you'd rather keep choosing your own three, Pro is there whenever you want it.
        </p>
        <a href="${APP_URL}/settings" style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Continue with Pro &rarr;</a>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 24px 0;">
          <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
        </table>

        <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">Why Cogletta</p>
        <p style="margin:0 0 18px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          There’s already more to read than any of us have time for. The challenge is finding what’s actually worth our attention.
        </p>
        <p style="margin:0 0 28px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          That’s the idea behind Cogletta. Every morning, we narrow the noise down to a small selection of thoughtful articles and podcasts around the topics you care about — so you can spend less time searching and more time reading.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
        </table>

        <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">Know someone who’d enjoy Cogletta?</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          If Cogletta feels like something a friend would enjoy too, send it their way. The best way for Cogletta to grow is one curious reader introducing it to another.
        </p>
        <p style="margin:0;font-size:15px;">
          <a href="${APP_URL}" style="color:#111827;font-weight:600;text-decoration:none;">Share Cogletta with a friend &rarr;</a>
        </p>
      </td></tr>
      <tr><td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Cogletta &nbsp;·&nbsp; a curated read every morning.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `Your Pro trial has ended

For the last two weeks you've had three articles and two podcast episodes every morning, across the topics you chose — plus The Sunday Supplement.

From tomorrow you'll keep getting one article and one podcast each morning, free, on a different topic each day. If you'd rather keep choosing your own three, Pro is there whenever you want it.

${APP_URL}/settings

WHY COGLETTA
There’s already more to read than any of us have time for. The challenge is finding what’s actually worth our attention.

That’s the idea behind Cogletta. Every morning, we narrow the noise down to a small selection of thoughtful articles and podcasts around the topics you care about — so you can spend less time searching and more time reading.

KNOW SOMEONE WHO’D ENJOY COGLETTA?
If Cogletta feels like something a friend would enjoy too, send it their way. The best way for Cogletta to grow is one curious reader introducing it to another.
${APP_URL}`;

  await ses.send(new SendEmailCommand({
    Source: SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: "Your Cogletta Pro trial has ended", Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } },
    },
  }));
}


/**
 * Deneme bitmeden 3 gun once gonderilen tek hatirlatma.
 *
 * Neden bitiste degil de ONCE: bitis e-postasi kullaniciya olan biteni
 * bildiriyor, karar anini kaciriyor. Hatirlatma karari kullanicinin elinde
 * birakiyor.
 *
 * Ton baski yapmiyor: "son sans" yok. Kullanicinin aklindaki asil soru
 * "ucret alinacak mi?" oldugu icin o endise ilk paragrafta kaldiriliyor.
 */
async function sendTrialReminderEmail(to: string, daysLeft: number): Promise<void> {
  const elapsed = Math.max(1, TRIAL_DAYS - daysLeft);
  const dayWord = daysLeft === 1 ? "day" : "days";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your trial ends soon</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;"><tr><td style="padding:32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 36px 24px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${daysLeft === 1 ? "One day" : `${daysLeft} ${dayWord}`} left with Cogletta Pro</p>
      </td></tr>
      <tr><td style="padding:28px 36px;">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          For the past ${elapsed} days, your mornings have included three carefully selected articles on topics you chose, two podcast recommendations, personalized sub-topics, and the Sunday Supplement.
        </p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          Your trial ends in ${daysLeft === 1 ? "one day" : `${daysLeft} ${dayWord}`}, after which you&rsquo;ll automatically switch to the Free plan.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#374151;font-family:Georgia,'Times New Roman',serif;">
          Choose the Pro plan to keep enjoying everything Cogletta has to offer.
        </p>
        <a href="${APP_URL}/register" style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Continue with Pro &rarr;</a>
      </td></tr>
      <tr><td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Cogletta &nbsp;&middot;&nbsp; a curated read every morning.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `${daysLeft === 1 ? "One day" : `${daysLeft} ${dayWord}`} left with Cogletta Pro

For the past ${elapsed} days, your mornings have included three carefully selected articles on topics you chose, two podcast recommendations, personalized sub-topics, and the Sunday Supplement.

Your trial ends in ${daysLeft === 1 ? "one day" : `${daysLeft} ${dayWord}`}, after which you'll automatically switch to the Free plan.

Choose the Pro plan to keep enjoying everything Cogletta has to offer.

${APP_URL}/register`;

  await ses.send(new SendEmailCommand({
    Source: SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `Your Cogletta Pro trial ends in ${daysLeft === 1 ? "1 day" : `${daysLeft} days`}`, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } },
    },
  }));
}

/**
 * Bitmesine 3 gun ve daha az kalan denemeler icin TEK hatirlatma.
 *
 * Mukerrer gonderim korumasi profildeki `trialReminderSentAt` alani ile:
 * kosullu yazma sayesinde iki bolgenin cron'u ayni anda calissa bile yalnizca
 * biri basarili olur ve tek e-posta gider.
 */
async function sendTrialReminders(users: TriggerUser[]): Promise<void> {
  if (!SES_FROM_EMAIL) return;
  const now = Date.now();

  const due = users.filter(u =>
    u.plan.toLowerCase() === "pro" &&
    u.planSource === "trial" &&
    !u.lsSubscriptionId &&
    !u.trialReminderSentAt &&
    u.email &&
    u.trialEndsAt &&
    Date.parse(u.trialEndsAt) > now &&
    Date.parse(u.trialEndsAt) - now <= REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000
  );

  if (due.length === 0) return;
  console.log(`Sending trial reminder to ${due.length} user(s)`);

  for (const user of due) {
    const daysLeft = Math.max(1, Math.ceil((Date.parse(user.trialEndsAt!) - now) / 86_400_000));
    try {
      await dynamo.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { PK: `USER#${user.userId}`, SK: "PROFILE" },
        UpdateExpression: "SET trialReminderSentAt = :now",
        ConditionExpression: "attribute_not_exists(trialReminderSentAt) AND #planSource = :trial",
        ExpressionAttributeNames:  { "#planSource": "planSource" },
        ExpressionAttributeValues: { ":now": new Date().toISOString(), ":trial": "trial" },
      }));
    } catch (err: any) {
      if (err?.name === "ConditionalCheckFailedException") continue; // baskasi gonderdi
      console.error(`Trial reminder claim failed for user=${user.userId}:`, err);
      continue;
    }

    try {
      await sendTrialReminderEmail(user.email!, daysLeft);
      console.log(`Trial reminder sent to ${user.email} (${daysLeft}d left)`);
    } catch (err) {
      // EMAIL_SEND_FAILED: CloudWatch metric filter bu ifadeye baglanir.
      console.error(`EMAIL_SEND_FAILED user=${user.userId} reason=trial-reminder`, err);
    }
  }
}

// ─── 14 günlük Pro denemesinin sona ermesi ────────────────────────────────────
//
// Neden ayrı bir cron yok: daily-trigger zaten her sabah tüm kullanıcıları
// tarıyor. Denemeyi burada sonlandırmak yeni bir Lambda, yeni bir zamanlayıcı
// ve yeni bir hata yüzeyi eklemeden aynı işi görüyor.
//
// Düşürme fan-out'tan ÖNCE yapılır: aksi halde süresi dolmuş kullanıcı o sabah
// bir kez daha Pro içeriği alırdı.
async function expireFinishedTrials(users: TriggerUser[]): Promise<void> {
  const now = Date.now();

  const expired = users.filter(u =>
    u.plan.toLowerCase() === "pro" &&
    u.planSource === "trial" &&
    // Ödeme yapmış kullanıcıya ASLA dokunma: kullanıcı deneme sırasında
    // yükseltmişse webhook planSource'u "paid" yapar, ama sıralama ters
    // giderse bu kontrol ikinci güvence.
    !u.lsSubscriptionId &&
    u.trialEndsAt &&
    Date.parse(u.trialEndsAt) <= now
  );

  if (expired.length === 0) return;
  console.log(`Expiring ${expired.length} finished Pro trial(s)`);

  for (const user of expired) {
    try {
      // Koşullu yazma: aynı anda başka bir bölgenin cron'u da düşürmeye
      // çalışırsa yalnızca biri başarılı olur ve tek e-posta gider.
      await dynamo.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { PK: `USER#${user.userId}`, SK: "PROFILE" },
        UpdateExpression:
          "SET #plan = :free, updatedAt = :now REMOVE planSource, trialEndsAt, interests, subTopics",
        ConditionExpression:
          "#planSource = :trial AND attribute_not_exists(lsSubscriptionId)",
        ExpressionAttributeNames:  { "#plan": "plan", "#planSource": "planSource" },
        ExpressionAttributeValues: { ":free": "free", ":trial": "trial", ":now": new Date().toISOString() },
      }));
    } catch (err: any) {
      if (err?.name === "ConditionalCheckFailedException") continue; // başkası halletti
      console.error(`Trial expiry failed for user=${user.userId}:`, err);
      continue;
    }

    // Kayıttaki plan artık free — fan-out doğru yolu seçsin.
    user.plan = "free";
    user.interests = [];
    user.subTopics = {};

    if (!SES_FROM_EMAIL || !user.email) continue;
    try {
      await sendTrialEndedEmail(user.email);
      console.log(`Trial-ended email sent to ${user.email}`);
    } catch (err) {
      // EMAIL_SEND_FAILED: CloudWatch metric filter bu ifadeye baglanir.
      console.error(`EMAIL_SEND_FAILED user=${user.userId} reason=trial-ended`, err);
    }
  }
}

export const handler = async (event: { region?: string } = {}): Promise<void> => {
  const region = event.region ?? "EU"; // EventBridge her bölge için ayrı cron ile region geçer
  console.log(`Daily trigger started — region=${region} —`, new Date().toISOString());

  // ── Kullanıcıları tara ──────────────────────────────────────────────────────
  // Tek scan ile iki veri seti çıkarılır:
  // 1) Bu cron bölgesinde teslimat yapılacak kullanıcılar.
  // 2) Tüm bölgelerde seçilmiş topic/alt-topic kapsamı. EU ilk cron olduğundan
  //    küresel kapsamı kullanarak günün havuzlarını bir kez üretir.
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const users: TriggerUser[] = [];
  const activeSubTopicsByCategory = new Map<string, Set<string>>();
  const activeCategories = new Set<string>();

  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName:                 USERS_TABLE,
        // attribute_exists(interests) KALDIRILDI.
        //
        // Free planda konu secimi yok, yani o kullanicilarin `interests` alani
        // hic olmuyor. Filtre yerinde kaldiginda TUM Free kullanicilar taramanin
        // disinda kaliyor ve hicbir e-posta almiyorlardi — sessiz, cunku hata
        // yok, sadece kimse listeye girmiyor.
        FilterExpression:          "SK = :profile",
        ExpressionAttributeValues: { ":profile": "PROFILE" },
        ExpressionAttributeNames:  { "#plan": "plan", "#region": "region" },
        ProjectionExpression:      "PK, interests, subTopics, email, #plan, #region, planSource, trialEndsAt, lsSubscriptionId, trialReminderSentAt",
        ExclusiveStartKey:         lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      // Free kullanicida interests YOK — bu normal, atlama sebebi degil.
      // Gecerlilik kontrolu asagida yalnizca Pro icin yapiliyor.
      const rawInterests = item.interests as string[] | undefined;
      const interests = Array.isArray(rawInterests) ? rawInterests.slice(0, 3) : [];

      const subTopics = (item.subTopics as Record<string, string[]> | undefined) ?? {};

      // Havuz kapsamı bölgeden bağımsızdır. Yalnızca tanımlı ana topic'ler eklenir.
      for (const category of interests) {
        if (!RSS_SOURCES[category]) continue;
        activeCategories.add(category);
        const set = activeSubTopicsByCategory.get(category) ?? new Set<string>();
        for (const subTopic of subTopics[category] ?? []) {
          const clean = typeof subTopic === "string" ? subTopic.trim() : "";
          if (clean) set.add(clean);
        }
        activeSubTopicsByCategory.set(category, set);
      }

      // Teslimat yalnızca bu cron'un bölgesindeki kullanıcılar için yapılır.
      const userRegion = (item.region as string | undefined) ?? "EU";
      if (userRegion !== region) continue;

      const userId = (item.PK as string).replace("USER#", "");
      users.push({
        userId,
        interests,
        subTopics,
        email:            (item.email as string | undefined),
        plan:             (item.plan as string | undefined) ?? "free",
        planSource:       (item.planSource as string | undefined),
        trialEndsAt:      (item.trialEndsAt as string | undefined),
        lsSubscriptionId:    (item.lsSubscriptionId as string | undefined),
        trialReminderSentAt: (item.trialReminderSentAt as string | undefined),
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  // Süresi dolan denemeleri fan-out'tan ÖNCE sonlandır.
  await expireFinishedTrials(users);

  // Sonra hatırlatmalar: sırası önemli, bugün sona eren bir kullanıcıya
  // "3 gün kaldı" maili gitmemeli (expire sonrası planı artık free).
  await sendTrialReminders(users);

  // ── Kullanıcıları yollara ayır ──────────────────────────────────────────────
  const pooledFree: TriggerUser[] = [];
  const pooledPro:  TriggerUser[] = [];
  const legacy:     TriggerUser[] = [];

  for (const user of users) {
    const isPro = user.plan.toLowerCase() === "pro";

    if (!isPro) {
      // Free planda konu SEÇİMİ YOK: herkes o günün rotasyon kategorisini alır.
      // Kullanıcının kayıtlı `interests` alanına hiç bakılmaz — bu, Pro'dan
      // düşen kullanıcının 3 ilgi alanıyla pahalı legacy yoluna düşmesini de
      // ortadan kaldırıyor (kullanıcı başına günde 2 Bedrock çağrısıydı).
      // Alan silinmiyor: kullanıcı tekrar Pro olursa seçimleri yerinde durur.
      pooledFree.push(user);
      continue;
    }

    const validInterests =
      user.interests.length > 0 && user.interests.every(category => Boolean(RSS_SOURCES[category]));
    if (validInterests) {
      pooledPro.push(user);
    } else {
      legacy.push(user);
      console.warn(
        `Legacy/fallback route user=${user.userId} plan=${user.plan} interests=${user.interests.join(", ")}`
      );
    }
  }

  console.log(
    `Found ${users.length} users in region=${region} — pooled-free=${pooledFree.length}, pooled-pro=${pooledPro.length}, legacy=${legacy.length}`
  );

  // ── Faz A ───────────────────────────────────────────────────────────────────
  // Yalnızca gerçekten seçilmiş topic'ler için havuz oluşturulur. EU ilk cron
  // olduğundan tüm bölgelerin aktif topic ve alt-topic kapsamını kullanır.
  // Sonraki bölge cron'ları aynı kayıtları ready-check ile tekrar üretmez.
  // Rotasyon kategorisinin havuzu HER GÜN üretilmeli: hiçbir Pro kullanıcı onu
  // seçmemiş olsa bile o günün Free içeriği oradan geliyor.
  const rotationCategory = rotationCategoryFor(new Date());
  activeCategories.add(rotationCategory);
  const categories = [...activeCategories].sort();
  console.log(`Rotation category for today: ${rotationCategory}`);
  const readyCategories = await ensureCategoryPicks(categories, activeSubTopicsByCategory);

  // ── Faz B ───────────────────────────────────────────────────────────────────
  // A user is sent to pool delivery only when every required topic pool is ready.
  // If one or more pools failed, the whole user is routed to the legacy generator.
  // This avoids partial Pro deliveries and guarantees exactly one delivery path.
  const deliveryInvocations: { functionName: string; payload: Record<string, unknown>; label: string }[] = [];
  const fallbackUsers: TriggerUser[] = [...legacy];

  for (const user of pooledFree) {
    const category = rotationCategory;
    if (!readyCategories.has(category)) {
      console.warn(`Pool unavailable; routing free user=${user.userId} to legacy generation — category=${category}`);
      fallbackUsers.push(user);
      continue;
    }

    deliveryInvocations.push({
      functionName: DELIVER_DAILY_FUNCTION,
      payload: {
        userId: user.userId,
        category,
        email: user.email,
        plan: "free",
      },
      label: `deliver free user=${user.userId}`,
    });
  }

  for (const user of pooledPro) {
    const missingCategories = user.interests.filter(category => !readyCategories.has(category));
    if (missingCategories.length > 0) {
      console.warn(
        `Pool unavailable; routing pro user=${user.userId} to legacy generation — missing=${missingCategories.join(", ")}`
      );
      fallbackUsers.push(user);
      continue;
    }

    deliveryInvocations.push({
      functionName: DELIVER_DAILY_FUNCTION,
      payload: {
        userId: user.userId,
        interests: user.interests,
        subTopics: user.subTopics,
        email: user.email,
        plan: "pro",
      },
      label: `deliver pro user=${user.userId}`,
    });
  }

  const fallbackInvocations = fallbackUsers.map(user => ({
    functionName: GENERATE_ARTICLES_FUNCTION,
    payload: {
      userId: user.userId,
      interests: user.interests,
      subTopics: user.subTopics,
      email: user.email,
      plan: user.plan,
      // Sahiplik jetonu: AWS async retry'da ayni payload gonderildigi icin
      // worker kendi kilidini tanir ve retry uretimi atlamaz.
      generationId: randomUUID(),
    },
    label: `fallback generate user=${user.userId}`,
  }));

  await fanOut([...deliveryInvocations, ...fallbackInvocations]);

  console.log(
    `Daily trigger complete — region=${region}, pool-delivery=${deliveryInvocations.length}, fallback=${fallbackInvocations.length}`
  );
};