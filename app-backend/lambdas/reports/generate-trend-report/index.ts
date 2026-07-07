import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Keys } from "../../../shared/types";
import type { WeeklyTrendReport, TrendInterest } from "../../../shared/types";
import { RSS_SOURCES, fetchRSSFeed } from "../../articles/generate-articles";
import type { RSSItem } from "../../articles/generate-articles";

const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({});
const ses     = new SESClient({});

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";
const BEDROCK_MODEL  = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

const SEVEN_DAYS_MS  = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_INTEREST = 15;

interface TrendEvent {
  userId:    string;
  interests: string[];
  email?:    string;
  userEmail?: string;
  plan?:     string;
}

// ── Yardımcılar ────────────────────────────────────────────────────────────────

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

// Bir ilgi alanı için son 7 günün makalelerini topla (tarihsiz feed'lerde recency fallback)
async function weeklyItemsForInterest(interest: string): Promise<RSSItem[]> {
  const sources = RSS_SOURCES[interest] ?? [];
  if (sources.length === 0) return [];

  const results = await Promise.allSettled(sources.map(fetchRSSFeed));
  const all: RSSItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.warn(`Trend feed failed (${interest}): ${sources[i].url}`, r.reason);
  });

  const now = Date.now();
  const seen = new Set<string>();
  const deduped = all.filter(it => {
    if (!it.url || seen.has(it.url)) return false;
    seen.add(it.url); return true;
  });

  const fresh = deduped
    .filter(it => it.pubTimestamp > 0 && now - it.pubTimestamp <= SEVEN_DAYS_MS)
    .sort((a, b) => b.pubTimestamp - a.pubTimestamp);

  // Yeterince tarihli öğe yoksa, feed sırasındaki ilk öğelerle tamamla
  const pool = fresh.length >= 4 ? fresh : deduped.slice(0, MAX_PER_INTEREST);
  return pool.slice(0, MAX_PER_INTEREST);
}

interface BedrockTrend {
  category: string;
  themes:   string[];
  topIndex: number;
}

async function synthesize(
  interest: string,
  items: RSSItem[]
): Promise<{ themes: string[]; topIndex: number }> {
  if (items.length === 0) return { themes: [], topIndex: -1 };

  const list = items
    .map((it, i) => `[${i}] "${it.title}" — ${it.sourceName}\n    ${(it.description ?? "").slice(0, 240)}`)
    .join("\n\n");

  const prompt = `You are the editor of Cogletta's weekly trend report. Below are this week's articles in the category "${interest}".

Your job:
1. Identify the 2-3 dominant THEMES or storylines of the week in this category — what a well-read person would say "mattered" this week. Each theme is ONE short sentence (max 16 words), specific and concrete (name the actual development, not "various discussions"). Positive/insightful tone; no hype words.
2. Pick the single most important article of the week (topIndex).

Articles:
${list}

Respond ONLY with valid JSON (no markdown):
{
  "themes": ["<theme 1>", "<theme 2>"${items.length > 6 ? ', "<theme 3>"' : ""}],
  "topIndex": <0-${items.length - 1}>
}`;

  try {
    const res = await bedrock.send(new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    }));
    const raw  = JSON.parse(new TextDecoder().decode(res.body));
    const text = raw.content[0].text.trim()
      .replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
      .replace(/[\u0000-\u001F\u007F]/g, " ");
    const parsed = JSON.parse(text) as { themes?: string[]; topIndex?: number };
    const themes = Array.isArray(parsed.themes) ? parsed.themes.filter(Boolean).slice(0, 3) : [];
    let topIndex = typeof parsed.topIndex === "number" ? parsed.topIndex : 0;
    if (topIndex < 0 || topIndex >= items.length) topIndex = 0;
    return { themes, topIndex };
  } catch (err) {
    console.warn(`Trend synthesis failed for ${interest}:`, err);
    return { themes: [], topIndex: 0 };
  }
}

// ── E-posta ─────────────────────────────────────────────────────────────────

function weekLabel(): string {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - day + 1);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function buildEmail(report: WeeklyTrendReport): { html: string; text: string } {
  const blocks = report.interests.map(t => {
    const themes = t.themes.map(th => `
      <li style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#374151;">${th}</li>`).join("");
    const top = t.topUrl ? `
      <p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">Read of the week — <a href="${t.topUrl}" style="color:#111827;font-weight:600;text-decoration:none;">${t.topTitle}</a> <span style="color:#9ca3af;">(${t.topSource})</span></p>` : "";
    return `
      <tr><td style="padding:24px 0;border-top:1px solid #f3f4f6;">
        <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${t.category}</span>
        <ul style="margin:12px 0 0 0;padding-left:18px;">${themes}</ul>${top}
      </td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;"><tr><td style="padding:32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 36px 20px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Cogletta</span>
        <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Your week in review · ${report.weekLabel}</p>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">This week across your interests</p>
      </td></tr>
      <tr><td style="padding:0 36px;"><table width="100%" cellpadding="0" cellspacing="0">${blocks}</table></td></tr>
      <tr><td style="padding:24px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">Cogletta Pro · A weekly trend report, every Sunday.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `Cogletta — Your week in review (${report.weekLabel})\n\n` +
    report.interests.map(t =>
      `${t.category}\n` + t.themes.map(th => `  • ${th}`).join("\n") +
      (t.topUrl ? `\n  Read of the week: ${t.topTitle} — ${t.topUrl}` : "")
    ).join("\n\n") +
    `\n\nCogletta Pro · weekly, every Sunday.`;

  return { html, text };
}

// ── Handler ─────────────────────────────────────────────────────────────────

export const handler = async (event: TrendEvent): Promise<void> => {
  const { userId, interests } = event;
  if (!userId || !Array.isArray(interests) || interests.length === 0) {
    throw new Error("userId and interests are required.");
  }

  console.log(`Trend report: user=${userId} interests=${interests.join(", ")}`);

  const trendInterests: TrendInterest[] = [];
  for (const interest of interests) {
    const items = await weeklyItemsForInterest(interest);
    const { themes, topIndex } = await synthesize(interest, items);
    const top = topIndex >= 0 ? items[topIndex] : undefined;

    trendInterests.push({
      category:  interest,
      themes:    themes.length ? themes : ["A quieter week here — no dominant storyline stood out."],
      topTitle:  top?.title ?? "",
      topUrl:    top?.url ?? "",
      topSource: top?.sourceName ?? "",
    });
  }

  const now = new Date();
  const report: WeeklyTrendReport = {
    PK:          Keys.userPK(userId),
    SK:          Keys.weekSK(now),
    weekLabel:   weekLabel(),
    interests:   trendInterests,
    generatedAt: now.toISOString(),
    ttl:         Keys.ttl30Days(),
  };

  await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: report }));
  console.log(`Wrote trend report ${report.SK} for user=${userId}`);

  if (SES_FROM_EMAIL) {
    const to = event.userEmail ?? event.email ?? await fetchUserEmail(userId);
    if (to) {
      try {
        const { html, text } = buildEmail(report);
        await ses.send(new SendEmailCommand({
          Source: SES_FROM_EMAIL,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: `Your week in review — ${report.weekLabel}`, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } },
          },
        }));
        console.log(`Trend email sent to ${to}`);
      } catch (err) {
        console.error("Trend email failed:", err);
      }
    }
  }
};
