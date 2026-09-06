// app-backend/lambdas/users/post-confirmation/index.ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { claimTrial } from "../../../shared/trial-ledger";

const ses    = new SESClient({ region: process.env.AWS_REGION });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME ?? "";

const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const APP_URL        = process.env.APP_URL!;
const CONTACT_EMAIL  = process.env.CONTACT_EMAIL!;
const APP_NAME       = process.env.APP_NAME ?? "Cogletta";

/** Kayit sonrasi ucretsiz Pro deneme suresi (gun). */
const TRIAL_DAYS     = 14;

// ─── Deneme hakki defteri (e-posta seviyesinde) ───────────────────────────────
// Deneme hakki artik PROFIL'de degil, ayri bir TRIAL#<hmac(email)> kaydinda
// tutuluyor. Hesap silinse bile bu kayit kaliyor; ayni e-posta ile yeniden
// kayit olan kullanici IKINCI kez deneme alamiyor.
const TRIAL_LEDGER_SECRET     = process.env.TRIAL_LEDGER_SECRET ?? "";
const TRIAL_LEDGER_RETENTION_DAYS = Number(process.env.TRIAL_LEDGER_RETENTION_DAYS ?? "0") || 0;
const TRIAL_LEDGER_STRICT_ALIAS   = (process.env.TRIAL_LEDGER_STRICT_ALIAS ?? "true") !== "false";

function buildWelcomeHtml(email: string, trialGranted: boolean): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Welcome to ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;">
    <tr>
      <td style="padding:32px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <tr>
            <td style="padding:32px 36px 24px 36px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">${APP_NAME}</span>
              <p style="margin:16px 0 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                Welcome. Ready to read?
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 36px;">

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                Thanks for joining ${APP_NAME}. It means a lot to have you here.
              </p>

              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                You're now subscribed — head to your dashboard to read your first curated articles:
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#111827;border-radius:8px;">
                    <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Go to my dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#111827;">A few things to know:</p>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:0 0 12px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 12px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Your articles are ready every morning — on your dashboard and in your inbox.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 0 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">You can <strong>change your topics anytime</strong> from the Interests page. Changes take effect the next morning.</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#111827;">Here's what we share with you every day:</p>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:0 0 10px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 10px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Three carefully selected articles — one for each topic you chose — from think-tanks, academic journals, and quality publications</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 10px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Two podcast episodes from top shows in your topics, paired with your reading each morning</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 0 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">A short editorial note on each pick — why this piece, why today, why it matters</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px 0;font-size:13px;line-height:1.6;color:#9ca3af;font-style:italic;">
                ${trialGranted
                  ? `You’re starting with the full ${APP_NAME} Pro experience: three curated articles every morning — one for each of your chosen topics — plus two podcast recommendations and the Sunday Supplement each week.<br><br>Your ${TRIAL_DAYS}-day free trial needs no credit card. When it ends, you’ll automatically continue on the Free plan unless you choose to keep Pro.`
                  : `You’re starting on the Free plan: one curated article and one podcast recommendation every morning, on a different topic each day. Upgrade to Pro any time to choose your own three topics and get the Sunday Supplement.`}
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">Why ${APP_NAME}</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                There’s already more to read than any of us have time for. The challenge is finding what’s actually worth our attention.
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                That’s the idea behind ${APP_NAME}. Every morning, we narrow the noise down to a small selection of thoughtful articles and podcasts around the topics you care about — so you can spend less time searching and more time reading.
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                Your first picks are already waiting. See you tomorrow morning.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">Know someone who’d enjoy ${APP_NAME}?</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                If ${APP_NAME} feels like something a friend would enjoy too, send it their way. The best way for ${APP_NAME} to grow is one curious reader introducing it to another.
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;">
                <a href="${APP_URL}" style="color:#111827;font-weight:600;text-decoration:none;">Share ${APP_NAME} with a friend &rarr;</a>
              </p>



              <p style="margin:0;font-size:14px;color:#6b7280;">
                — The ${APP_NAME} Team<br>
                For feedback: <a href="mailto:${CONTACT_EMAIL}" style="color:#111827;">${CONTACT_EMAIL}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                © 2026 ${APP_NAME}<br>
                <a href="${APP_URL}" style="color:#9ca3af;">Open dashboard</a>
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

function buildWelcomeText(email: string, trialGranted: boolean): string {
  return `Welcome to ${APP_NAME}!

Thanks for joining ${APP_NAME}. It means a lot to have you here.

You're now subscribed — head to your dashboard to read your first curated articles:
${APP_URL}/dashboard

A FEW THINGS TO KNOW
→ Your articles are ready every morning — on your dashboard and in your inbox.
→ You can change your topics anytime from the Interests page. Changes take effect the next morning.

HERE'S WHAT WE SHARE WITH YOU EVERY DAY
→ Three carefully selected articles — one for each topic you chose — from think-tanks, academic journals, and quality publications
→ Two podcast episodes from top shows in your topics, paired with your reading each morning
→ A short editorial note on each pick — why this piece, why today, why it matters

${trialGranted
  ? `You’re starting with the full ${APP_NAME} Pro experience: three curated articles every morning — one for each of your chosen topics — plus two podcast recommendations and the Sunday Supplement each week.\n\nYour ${TRIAL_DAYS}-day free trial needs no credit card. When it ends, you’ll automatically continue on the Free plan unless you choose to keep Pro.`
  : `You’re starting on the Free plan: one curated article and one podcast recommendation every morning, on a different topic each day. Upgrade to Pro any time to choose your own three topics and get the Sunday Supplement.`}

WHY ${APP_NAME.toUpperCase()}
There’s already more to read than any of us have time for. The challenge is finding what’s actually worth our attention.

That’s the idea behind ${APP_NAME}. Every morning, we narrow the noise down to a small selection of thoughtful articles and podcasts around the topics you care about — so you can spend less time searching and more time reading.

Your first picks are already waiting. See you tomorrow morning.

KNOW SOMEONE WHO’D ENJOY ${APP_NAME.toUpperCase()}?\nIf ${APP_NAME} feels like something a friend would enjoy too, send it their way. The best way for ${APP_NAME} to grow is one curious reader introducing it to another.\n${APP_URL}

— The ${APP_NAME} Team
${CONTACT_EMAIL}`;
}

export const handler = async (event: any): Promise<any> => {
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") {
    return event;
  }

  const email = event.request?.userAttributes?.email;
  if (!email) {
    console.warn("No email found in event, skipping welcome email");
    return event;
  }

  // ── Profili kayıt anında email ile oluştur ─────────────────────────────────
  // Email'in tek doğru kaynağı Cognito; buradan bir kez yazılır ve
  // update-interests bir daha bu alana dokunmaz. (upsert: mevcut alanları ezmez)
  const sub = event.request?.userAttributes?.sub ?? event.userName;

  // Deneme hakkı e-posta seviyesinde talep edilir. Hesabını silip aynı e-posta
  // ile yeniden kayıt olan kullanıcı burada granted=false alır ve doğrudan Free
  // planda başlar — eskiden bu senaryo sınırsız 14 günlük deneme veriyordu.
  let trialGranted = true;
  if (sub && USERS_TABLE_NAME) {
    try {
      const claim = await claimTrial({
        dynamo,
        PutCommand,
        GetCommand,
        tableName:     USERS_TABLE_NAME,
        email,
        userId:        sub,
        secret:        TRIAL_LEDGER_SECRET,
        retentionDays: TRIAL_LEDGER_RETENTION_DAYS,
        strictAlias:   TRIAL_LEDGER_STRICT_ALIAS,
      });
      trialGranted = claim.granted;
      if (!claim.granted) {
        console.log(
          `Trial already consumed for this email (first=${claim.firstTrialStartedAt ?? "unknown"}) — user=${sub} starts on Free`
        );
      }
    } catch (err) {
      // Defter erişilemedi: kayıt akışını KIRMA, denemeyi ver ve yüksek sesle logla.
      console.error("CRITICAL: trial ledger unavailable, granting trial by default:", err);
      trialGranted = true;
    }
  }

  if (sub && USERS_TABLE_NAME) {
    const now      = new Date().toISOString();
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Deneme VERİLDİĞİNDE kullanici 14 gun boyunca PRO baslar — kredi karti
    // istenmez.
    //
    // Neden: Free ile baslayan kullanicinin Pro'nun ne kadar farkli oldugunu
    // ZIHNINDE canlandirmasi gerekiyordu. Once gercek deneyimi yasatip sonra
    // eksiltmek, tarif etmekten daha ikna edici.
    //
    // `plan` alani "pro" oluyor, boylece tum akis — onboarding, interests,
    // deliver-daily, Sunday Supplement — hicbir degisiklik olmadan calisiyor.
    // Ayrimi `planSource` tasiyor:
    //   "trial" → 14 gun sonra daily-trigger (ya da tembel expiry) dusurur
    //   "paid"  → Lemon Squeezy aboneligi, dokunulmaz
    //
    // `trialStartedAt` KALICI: deneme bittiginde silinmez, boylece backend
    // "denemesini kullanmis Free" ile "hic deneme gormemis Free" ayrimini
    // yapabilir (/register sayfasi bunun uzerine kuruluyor).
    //
    // if_not_exists: bu Lambda yeniden denenebilir, mevcut bir kullanicinin
    // planini ya da deneme bitisini SIFIRLAMAMALI.
    const setParts = [
      "email = :email",
      "createdAt = if_not_exists(createdAt, :now)",
    ];
    const values: Record<string, unknown> = { ":email": email, ":now": now };

    if (trialGranted) {
      setParts.push(
        "#plan = if_not_exists(#plan, :pro)",
        "planSource = if_not_exists(planSource, :trial)",
        "trialStartedAt = if_not_exists(trialStartedAt, :now)",
        "trialEndsAt = if_not_exists(trialEndsAt, :trialEnd)",
      );
      values[":pro"]      = "pro";
      values[":trial"]    = "trial";
      values[":trialEnd"] = trialEnd;
    } else {
      // Deneme hakkı yok: Free planda başla ve bunu kalıcı olarak işaretle.
      // trialConsumedAt sayesinde /register ve /settings doğru durumu gösterir.
      setParts.push(
        "#plan = if_not_exists(#plan, :free)",
        "trialConsumedAt = if_not_exists(trialConsumedAt, :now)",
      );
      values[":free"] = "free";
    }

    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: USERS_TABLE_NAME,
          Key: { PK: `USER#${sub}`, SK: "PROFILE" },
          UpdateExpression: `SET ${setParts.join(", ")}`,
          ExpressionAttributeNames: { "#plan": "plan" },
          ExpressionAttributeValues: values,
        })
      );
      console.log(`Profile upserted for user=${sub} trialGranted=${trialGranted}`);
    } catch (err) {
      // Kayıt akışını bozmamak için hata yutulur ama yüksek sesle loglanır
      console.error("CRITICAL: Failed to write profile email:", err);
    }
  } else if (!USERS_TABLE_NAME) {
    console.error("CRITICAL: USERS_TABLE_NAME env var missing — profile not created");
  }

  try {
    await ses.send(
      new SendEmailCommand({
        Source:      `Cogletta <${SES_FROM_EMAIL}>`,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: {
            Data:    `Welcome to ${APP_NAME} — your daily reading starts now`,
            Charset: "UTF-8",
          },
          Body: {
            Html: { Data: buildWelcomeHtml(email, trialGranted), Charset: "UTF-8" },
            Text: { Data: buildWelcomeText(email, trialGranted), Charset: "UTF-8" },
          },
        },
      })
    );
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }

  return event;
};
