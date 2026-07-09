import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION });

const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const APP_URL        = process.env.APP_URL!;
const CONTACT_EMAIL  = process.env.CONTACT_EMAIL!;
const APP_NAME       = process.env.APP_NAME ?? "Cogletta";

function buildWelcomeHtml(email: string): string {
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
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">A carefully selected article based on your interests — substantive pieces from think-tanks, academic journals, and quality publications <span style="color:#9ca3af;">(3 per day, one for each interest, with Pro)</span></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 10px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">A podcast episode from top shows in your interest area — paired with your article every morning <span style="color:#9ca3af;">(2 per day with Pro)</span></p>
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
                You're on the free plan. ${APP_NAME} Pro adds 3 articles per interest, 2 podcasts, sub-topics, and weekly trend reports — you can upgrade anytime from Settings.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">Why ${APP_NAME}</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                We still spend hours consuming content every day, but it often feels fragmented. We jump from one short video to another, skim headlines, scroll through endless feeds — and by the end of the day it's hard to remember anything we actually learned.
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                That's why ${APP_NAME} exists. Every morning, a small collection of thoughtfully selected reads on the topics you actually chose. No algorithms competing for your attention. No endless feed to scroll through. If you think like us — you're in the right place.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                If you enjoy ${APP_NAME}, the best thing you can do is recommend it to a friend. We don't advertise, we don't manipulate algorithms — we grow because readers share us with people they trust.
              </p>

              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                Your first articles are already waiting. See you tomorrow morning.
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

function buildWelcomeText(email: string): string {
  return `Welcome to ${APP_NAME}!

Thanks for joining ${APP_NAME}. It means a lot to have you here.

You're now subscribed — head to your dashboard to read your first curated articles:
${APP_URL}/dashboard

A FEW THINGS TO KNOW
→ Your articles are ready every morning — on your dashboard and in your inbox.
→ You can change your topics anytime from the Interests page. Changes take effect the next morning.

HERE'S WHAT WE SHARE WITH YOU EVERY DAY
→ A carefully selected article based on your interests — substantive pieces from think-tanks, academic journals, and quality publications (3 per day, one for each interest, with Pro)
→ A podcast episode from top shows in your interest area — paired with your article every morning (2 per day with Pro)
→ A short editorial note on each pick — why this piece, why today, why it matters

You're on the free plan. ${APP_NAME} Pro adds 3 articles per interest, 2 podcasts, sub-topics, and weekly trend reports — you can upgrade anytime from Settings.

WHY ${APP_NAME.toUpperCase()}
We still spend hours consuming content every day, but it often feels fragmented. We jump from one short video to another, skim headlines, scroll through endless feeds — and by the end of the day it's hard to remember anything we actually learned.

That's why ${APP_NAME} exists. Every morning, a small collection of thoughtfully selected reads on the topics you actually chose. No algorithms competing for your attention. No endless feed to scroll through. If you think like us — you're in the right place.

If you enjoy ${APP_NAME}, recommend it to a friend. We grow because readers share us with people they trust.

Your first articles are already waiting. See you tomorrow morning.

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
            Html: { Data: buildWelcomeHtml(email), Charset: "UTF-8" },
            Text: { Data: buildWelcomeText(email), Charset: "UTF-8" },
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
