import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION });

const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const APP_URL        = process.env.APP_URL!;
const CONTACT_EMAIL  = process.env.CONTACT_EMAIL!;
const APP_NAME       = process.env.APP_NAME ?? "Daily3";

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
                I once realized that after spending time on my phone, when I put it down, I couldn't remember anything tangible. Social media, news sites, video platforms show me things — but are these things really what matters to me? And there's so much out there that choosing what to read has become stressful in itself.
              </p>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                I thought about how I used to read. I would pick up a magazine, follow topics that made sense to me. That feeling was gone.
              </p>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                That's why I created ${APP_NAME}. Three articles every morning on topics you choose. No noise. Focus.
              </p>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                If you think like me — welcome. You're in the right place.
              </p>

              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                Thanks to AI-powered ${APP_NAME}, hundreds of sources are scanned every day and we select what is truly worth your attention based on your interests.
              </p>

              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#111827;">Here's what we share with you every day:</p>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:0 0 10px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 10px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Three carefully selected article recommendations based on your interests</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 0 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">An audio version of each article — listen on your commute, walk, or while making coffee</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.85;color:#374151;font-family:Georgia,'Times New Roman',serif;">
                You're now subscribed — head to your dashboard to read your 3 curated articles and listen to their audio versions:
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#111827;border-radius:8px;">
                    <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Go to my dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr><td style="border-top:1px solid #f3f4f6;"></td></tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#111827;">A few things to know:</p>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:0 0 12px 0;vertical-align:top;width:20px;">
                    <span style="font-size:14px;color:#9ca3af;">→</span>
                  </td>
                  <td style="padding:0 0 12px 16px;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Your articles are ready every morning at <strong>07:00</strong>.</p>
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

I once realized that after spending time on my phone, when I put it down, I couldn't remember anything tangible. That's why I created ${APP_NAME} — three articles every morning on topics you choose. No noise. Focus.

Here's what we share with you every day:
→ Three carefully selected articles based on your interests
→ An audio version of each article

Go to your dashboard: ${APP_URL}

Your articles are ready every morning at 07:00. You can change your topics anytime from the Interests page — changes take effect the next morning.

If you enjoy ${APP_NAME}, recommend it to a friend. We grow because readers share us with people they trust.

— The ${APP_NAME} Team
${CONTACT_EMAIL}`;
}

export const handler = async (event: any): Promise<any> => {
  // Sadece email doğrulama sonrası tetikle (ConfirmSignUp)
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
    // Email hatası Cognito akışını engellemesin
    console.error("Failed to send welcome email:", err);
  }

  return event;
};
