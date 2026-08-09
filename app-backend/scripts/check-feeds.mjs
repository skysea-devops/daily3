#!/usr/bin/env node
/**
 * Feed health check for Cogletta.
 *
 * Reads the source maps AND the age windows straight out of the Lambda source
 * so nothing can drift, then hits every feed with the same User-Agent and
 * timeout the Lambda uses.
 *
 * Usage:
 *   node scripts/check-feeds.mjs
 *   node scripts/check-feeds.mjs --deep          # also sample real item pages
 *   node scripts/check-feeds.mjs --only=Health
 *   node scripts/check-feeds.mjs --json
 *   node scripts/check-feeds.mjs --source=path/to/index.ts
 *
 * States:
 *   OK       usable
 *   WARN     partial paywall signal, or a sample page could not be judged
 *   PAYWALL  most sampled items sit behind a hard wall
 *   BLOCKED  publisher refused our request (403/429/timeout) — NOT a paywall
 *   STALE    newest item is older than the category window in the Lambda
 *   BROKEN   not a feed, or zero items
 *
 * Exit code 1 when any feed is BROKEN.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DEEP = args.includes("--deep");
const AS_JSON = args.includes("--json");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

// --deep triples the request count (feed + up to 3 sample pages each), which
// saturates a home connection's socket pool and produces a wall of
// UND_ERR_CONNECT_TIMEOUT that looks like dead feeds but is purely local.
const CONCURRENCY = DEEP ? 2 : 5;
const TIMEOUT_MS = 15_000;
const SAMPLES_PER_FEED = 3;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7";
const PAGE_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";

const MARKER = "RSS_SOURCES: Record<string, { name: string; url: string }[]>";
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".terraform", "out", "coverage",
]);

// ─── Locate and parse the Lambda source ──────────────────────────────────────

async function findSourceFile() {
  const explicit = args.find((a) => a.startsWith("--source="))?.slice("--source=".length);
  if (explicit) return path.resolve(process.cwd(), explicit);

  async function scan(dir, depth) {
    if (depth > 6) return null;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    const subdirs = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) subdirs.push(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      try {
        if ((await readFile(full, "utf8")).includes(MARKER)) return full;
      } catch { /* unreadable */ }
    }
    for (const sub of subdirs) {
      const hit = await scan(sub, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  let base = __dirname;
  for (let up = 0; up < 4; up++) {
    const hit = await scan(base, 0);
    if (hit) return hit;
    const parent = path.dirname(base);
    if (parent === base) break;
    base = parent;
  }
  throw new Error(
    "Could not locate the file declaring RSS_SOURCES.\n" +
      "  node scripts/check-feeds.mjs --source=lambdas/generate-articles/index.ts",
  );
}

function extractObjectLiteral(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const braceStart = src.indexOf("{", start + marker.length);
  if (braceStart === -1) throw new Error(`No opening brace after ${marker}`);

  let depth = 0, inString = null, inLineComment = false, inBlockComment = false;
  for (let i = braceStart; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (inLineComment) { if (c === "\n") inLineComment = false; continue; }
    if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i++; } continue; }
    if (inString) { if (c === "\\") i++; else if (c === inString) inString = null; continue; }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(braceStart, i + 1); }
  }
  throw new Error(`Unbalanced braces after ${marker}`);
}

const evalLiteral = (literal) => Function(`"use strict";return (${literal});`)();

/** categories.ts'i bul — yas pencereleri ve etiketler orada yasiyor. */
async function findCategoriesFile(sourceFile) {
  const marker = "export const CATEGORIES: CategoryDefinition[]";
  // Once kaynak dosyanin komsulugundaki shared/ dizinine bak, sonra yukari tirman.
  let dir = path.dirname(sourceFile);
  for (let up = 0; up < 6; up++) {
    for (const candidate of [
      path.join(dir, "shared", "categories.ts"),
      path.join(dir, "categories.ts"),
    ]) {
      try {
        if ((await readFile(candidate, "utf8")).includes(marker)) return candidate;
      } catch { /* yok */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * CategoryDefinition dizisinden id → { label, maxAgeDays } cikarir.
 * Tam bir TS parser degil; sadece bu dosyanin bilinen sekline gore calisir.
 */
function parseCategories(src) {
  const out = new Map();
  const re = /id:\s*"([a-z_]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?maxAgeDays:\s*(\d+)/g;
  let m;
  while ((m = re.exec(src))) {
    out.set(m[1], { label: m[2], maxAgeDays: Number(m[3]) });
  }
  return out;
}

async function loadSources() {
  const sourceFile = await findSourceFile();
  const src = await readFile(sourceFile, "utf8");
  const T = " Record<string, { name: string; url: string }[]> =";

  const articles = evalLiteral(extractObjectLiteral(src, `RSS_SOURCES:${T}`));
  const podcasts = evalLiteral(extractObjectLiteral(src, `PODCAST_SOURCES:${T}`));

  // Yas pencereleri ve etiketler shared/categories.ts'ten okunur. Yerel bir
  // kopya tutmak drift uretiyordu: script feed'leri gecmis pencerelere gore
  // STALE isaretliyordu.
  let articleMaxAge = {};
  let labels = {};
  let podcastMaxAge = 90;

  const categoriesFile = await findCategoriesFile(sourceFile);
  if (categoriesFile) {
    const catSrc = await readFile(categoriesFile, "utf8");
    for (const [id, def] of parseCategories(catSrc)) {
      articleMaxAge[id] = def.maxAgeDays;
      labels[id] = def.label;
    }
    const pm = catSrc.match(/PODCAST_MAX_AGE_DAYS\s*=\s*(\d+)/);
    if (pm) podcastMaxAge = Number(pm[1]);
  } else {
    console.warn("! categories.ts bulunamadi; her kategori icin 30 gun varsayiliyor.");
  }

  return { sourceFile, categoriesFile, articles, podcasts, articleMaxAge, podcastMaxAge, labels };
}

// ─── Feed parsing ────────────────────────────────────────────────────────────

function countItems(xml) {
  const tag = xml.includes("<entry") ? "entry" : "item";
  return xml.split(new RegExp(`<${tag}[\\s>]`)).length - 1;
}

function newestPubDate(xml) {
  const stamps = [];
  for (const re of [
    /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/gi,
    /<published[^>]*>([\s\S]*?)<\/published>/gi,
    /<updated[^>]*>([\s\S]*?)<\/updated>/gi,
  ]) {
    let m;
    while ((m = re.exec(xml))) {
      const t = Date.parse(m[1].trim());
      if (!Number.isNaN(t)) stamps.push(t);
    }
  }
  return stamps.length ? Math.max(...stamps) : null;
}

/** Up to `limit` item permalinks, skipping audio enclosures. */
function itemLinks(xml, limit) {
  const tag = xml.includes("<entry") ? "entry" : "item";
  const segs = xml.split(new RegExp(`<${tag}[\\s>]`)).slice(1);
  const links = [];
  for (const seg of segs) {
    const cdata = seg.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1];
    const href = seg.match(/<link[^>]+href="([^"]+)"/i)?.[1];
    const guid = seg.match(/<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i)?.[1];
    for (const raw of [cdata, href, guid]) {
      const url = (raw || "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (/\.(mp3|m4a|aac|ogg|wav)(\?|#|$)/i.test(url)) continue;
      if (!links.includes(url)) links.push(url);
      break;
    }
    if (links.length >= limit) break;
  }
  return links;
}

// ─── Paywall detection on real pages ─────────────────────────────────────────

/**
 * Only the text a reader would actually see. Scripts, styles and tag attributes
 * are dropped first: v1 matched the bare word "paywall" anywhere in the HTML,
 * which flagged every Substack (they ship paywall CSS on free posts) and every
 * site running a metered-access script that never fires.
 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Phrases that only appear when access is actually denied.
const HARD_MARKERS = [
  "sign in to read",
  "log in to continue",
  "log in to read",
  "already a subscriber",
  "subscribe to continue reading",
  "subscribe to keep reading",
  "to continue reading this article",
  "this article is for subscribers",
  "this post is for paid subscribers",
  "this episode is for members",
  "become a member to read",
  "become a member to listen",
  "unlock this article",
  "keep reading with a",
  "this content is available to members",
];

// Real signals, but they also show up in navigation and footers. Only counted
// when the page body is also suspiciously short.
const SOFT_MARKERS = [
  "members only",
  "member-only",
  "subscribers only",
  "subscriber-only",
  "become a member to",
  "start your free trial",
];

const THIN_BODY_CHARS = 1500;

function judgeSample(html) {
  const text = visibleText(html).toLowerCase();
  const hard = HARD_MARKERS.filter((m) => text.includes(m));
  const soft = SOFT_MARKERS.filter((m) => text.includes(m));
  const thin = text.length < THIN_BODY_CHARS;
  if (hard.length) return { gated: true, why: hard.join(", "), chars: text.length };
  if (soft.length && thin) return { gated: true, why: `${soft.join(", ")} + thin body`, chars: text.length };
  if (thin) return { gated: false, thin: true, chars: text.length };
  return { gated: false, chars: text.length };
}

// ─── Fetching ────────────────────────────────────────────────────────────────
//
// Successful responses are cached by url because the same feed appears in
// several categories (Aeon is in five) and re-fetching it both wastes time and
// trips rate limits. FAILURES ARE NEVER CACHED: a single network blip used to
// be replayed into every category that shared the url, turning one dropped
// connection into dozens of false BROKEN rows.

const fetchCache = new Map();
const RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const PACE_MS = DEEP ? 250 : 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url, accept) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, ok: res.ok, body: await res.text(), finalUrl: res.url };
  } catch (err) {
    return {
      status: 0, ok: false, body: "", finalUrl: url,
      error: err.name === "TimeoutError" ? "timeout" : (err.cause?.code || err.message),
      networkError: true,
    };
  }
}

async function fetchText(url, accept) {
  const key = `${accept}::${url}`;
  const cached = fetchCache.get(key);
  if (cached) return cached;

  let res;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (PACE_MS) await sleep(PACE_MS);
    res = await fetchOnce(url, accept);
    // Retry only transient conditions; a clean 404 will not improve.
    if (!res.networkError && res.status !== 429 && res.status !== 503) break;
    if (attempt < RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1));
  }

  // Only successes enter the cache.
  if (res.ok) fetchCache.set(key, res);
  return res;
}

// ─── Per-feed check ──────────────────────────────────────────────────────────

async function checkFeed(kind, category, source, windows) {
  const r = {
    kind, category, name: source.name, url: source.url,
    status: null, items: 0, newestAgeDays: null, state: "OK", networkFailed: false, notes: [],
  };

  const res = await fetchText(source.url, FEED_ACCEPT);
  r.status = res.status;

  if (res.error) {
    // Network-level failure: our side or the route, not evidence about the feed.
    r.state = "BLOCKED";
    r.networkFailed = true;
    r.notes.push(`network error after ${RETRIES + 1} attempts: ${res.error} — local/route failure, rerun before acting on this`);
    return r;
  }
  if (!res.ok) {
    r.state = res.status === 403 || res.status === 429 ? "BLOCKED" : "BROKEN";
    r.notes.push(`feed returned HTTP ${res.status}`);
    return r;
  }
  if (res.finalUrl && res.finalUrl !== source.url) r.notes.push(`redirect → ${res.finalUrl}`);
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(res.body.slice(0, 4000))) {
    r.state = "BROKEN"; r.notes.push("response is not a feed (HTML or error page)"); return r;
  }

  r.items = countItems(res.body);
  if (r.items === 0) { r.state = "BROKEN"; r.notes.push("feed parsed but contains 0 items"); return r; }

  const newest = newestPubDate(res.body);
  if (newest) {
    r.newestAgeDays = Math.round((Date.now() - newest) / 86_400_000);
    const limit = kind === "podcast" ? windows.podcast : (windows.article[category] ?? 30);
    if (r.newestAgeDays > limit) {
      r.state = "STALE";
      r.notes.push(`newest item is ${r.newestAgeDays}d old, window is ${limit}d — never survives scoreAndFilter`);
    }
  } else {
    r.notes.push("no parseable pubDate on any item");
  }

  if (!DEEP) return r;

  const links = itemLinks(res.body, SAMPLES_PER_FEED);
  if (!links.length) { r.notes.push("no sampleable item links (audio-only feed)"); return r; }

  let gated = 0, judged = 0, blocked = 0;
  const reasons = [];
  for (const link of links) {
    const page = await fetchText(link, PAGE_ACCEPT);
    if (page.error || page.status === 403 || page.status === 429) { blocked++; continue; }
    if (!page.ok) { blocked++; continue; }
    judged++;
    const verdict = judgeSample(page.body);
    if (verdict.gated) { gated++; reasons.push(verdict.why); }
    else if (verdict.thin) reasons.push(`thin body (~${verdict.chars} chars)`);
  }

  if (judged === 0) {
    if (r.state === "OK") r.state = "BLOCKED";
    r.notes.push(`publisher refused all ${links.length} sample requests — access unknown, not necessarily a paywall`);
  } else if (gated >= Math.ceil(judged / 2) && gated > 0) {
    if (r.state === "OK") r.state = "PAYWALL";
    r.notes.push(`${gated}/${judged} sampled items gated: ${[...new Set(reasons)].join("; ")}`);
  } else if (gated > 0) {
    if (r.state === "OK") r.state = "WARN";
    r.notes.push(`${gated}/${judged} sampled items gated (partial): ${[...new Set(reasons)].join("; ")}`);
  }
  if (blocked && judged) r.notes.push(`${blocked} sample(s) blocked by the publisher`);

  return r;
}

// ─── Static lint ─────────────────────────────────────────────────────────────

function lintSources(articles, podcasts) {
  const problems = [];
  const nameByUrl = new Map();
  const urlsByName = new Map();

  for (const [kind, map] of [["article", articles], ["podcast", podcasts]]) {
    for (const [category, list] of Object.entries(map)) {
      const seen = new Set();
      for (const s of list) {
        if (seen.has(s.url)) problems.push(`DUPLICATE  ${kind} · ${category} · "${s.name}" listed twice with the same URL`);
        seen.add(s.url);
        const known = nameByUrl.get(`${kind}:${s.url}`);
        if (known && known !== s.name) problems.push(`NAME CLASH ${kind} · ${s.url} appears as both "${known}" and "${s.name}"`);
        nameByUrl.set(`${kind}:${s.url}`, s.name);
        const urls = urlsByName.get(`${kind}:${s.name}`) ?? new Set();
        urls.add(s.url);
        urlsByName.set(`${kind}:${s.name}`, urls);
      }
    }
  }
  for (const [k, urls] of urlsByName) {
    if (urls.size > 1) {
      const [kind, name] = k.split(":");
      problems.push(`NAME REUSE ${kind} · "${name}" maps to ${urls.size} feeds: ${[...urls].join(" , ")}`);
    }
  }
  return problems;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try { out[i] = await fn(items[i]); }
        catch (err) {
          // Never let one feed vanish from the report.
          const { kind, category, source } = items[i];
          out[i] = { kind, category, name: source.name, url: source.url, status: null,
                     items: 0, newestAgeDays: null, state: "BROKEN", notes: [`checker error: ${err.message}`] };
        }
      }
    }),
  );
  return out;
}

const COLOURS = { OK: "\x1b[32m", WARN: "\x1b[33m", STALE: "\x1b[33m", BLOCKED: "\x1b[36m", PAYWALL: "\x1b[35m", BROKEN: "\x1b[31m" };
const colour = (state) => (AS_JSON ? state : `${COLOURS[state] ?? ""}${state.padEnd(7)}\x1b[0m`);

async function main() {
  const { sourceFile, categoriesFile, articles, podcasts, articleMaxAge, podcastMaxAge, labels } = await loadSources();
  const windows = { article: articleMaxAge, podcast: podcastMaxAge };

  const jobs = [];
  for (const [kind, map] of [["article", articles], ["podcast", podcasts]]) {
    for (const [category, list] of Object.entries(map)) {
      if (ONLY && category.toLowerCase() !== ONLY.toLowerCase()) continue;
      for (const source of list) jobs.push({ kind, category, source });
    }
  }

  if (!AS_JSON) {
    console.log(`Source list: ${path.relative(process.cwd(), sourceFile)}`);
    if (categoriesFile) console.log(`Categories:  ${path.relative(process.cwd(), categoriesFile)}`);
    console.log(`Windows: podcast ${podcastMaxAge}d, ${Object.keys(articleMaxAge).length} article categories`);
    console.log(`Checking ${jobs.length} feeds${DEEP ? ` (deep: up to ${SAMPLES_PER_FEED} sample pages each)` : ""}…\n`);
  }

  const results = await mapWithConcurrency(jobs, CONCURRENCY, (job) =>
    checkFeed(job.kind, job.category, job.source, windows),
  );
  const lint = lintSources(articles, podcasts);

  if (AS_JSON) { console.log(JSON.stringify({ lint, results }, null, 2)); }
  else {
    let group = "";
    for (const r of results) {
      const g = `${r.kind} · ${labels[r.category] ?? r.category}`;
      if (g !== group) { group = g; console.log(`\n── ${g} ${"─".repeat(Math.max(0, 60 - g.length))}`); }
      const age = r.newestAgeDays === null ? "  ?" : `${String(r.newestAgeDays).padStart(3)}d`;
      console.log(`  ${colour(r.state)} ${String(r.items).padStart(4)} items  newest ${age}  ${r.name}`);
      for (const n of r.notes) console.log(`          ↳ ${n}`);
    }

    const counts = results.reduce((a, r) => { a[r.state] = (a[r.state] ?? 0) + 1; return a; }, {});
    console.log(
      `\nSummary: ${counts.OK ?? 0} OK · ${counts.WARN ?? 0} WARN · ${counts.PAYWALL ?? 0} PAYWALL · ` +
      `${counts.BLOCKED ?? 0} BLOCKED · ${counts.STALE ?? 0} STALE · ${counts.BROKEN ?? 0} BROKEN`,
    );
    console.log(`(${jobs.length} feeds checked, ${results.length} reported)`);

    if (lint.length) {
      console.log(`\n── list hygiene ${"─".repeat(45)}`);
      for (const p of lint) console.log(`  ${p}`);
    }

    // Show the note that matches the state, not whatever landed in notes[0].
    const actionable = results.filter((r) => ["BROKEN", "STALE", "PAYWALL"].includes(r.state));
    if (actionable.length) {
      console.log(`\n── needs a decision ${"─".repeat(41)}`);
      for (const r of actionable) {
        const key = r.state === "STALE" ? "newest item" : r.state === "PAYWALL" ? "sampled items gated" : "";
        const reason = r.notes.find((n) => key && n.includes(key)) ?? r.notes[r.notes.length - 1] ?? r.state;
        console.log(`  [${r.state}] ${r.kind} · ${r.category} · "${r.name}"\n          ${reason}`);
      }
    }

    const blocked = results.filter((r) => r.state === "BLOCKED" && !r.networkFailed);
    if (blocked.length) {
      console.log(`\n── blocked by publisher (bot protection, not paywall) ${"─".repeat(8)}`);
      console.log(`  ${[...new Set(blocked.map((r) => r.name))].join(", ")}`);
      console.log(`  The Lambda may still fetch these fine — it only reads the feed, not article pages.`);
    }

    // Kept separate: these say nothing about the feed, only about the run.
    const netFailed = results.filter((r) => r.networkFailed);
    if (netFailed.length) {
      console.log(`\n── could not be reached this run (LOCAL NETWORK) ${"─".repeat(13)}`);
      console.log(`  ${netFailed.length} feed(s): ${[...new Set(netFailed.map((r) => r.name))].join(", ")}`);
      console.log(`  These are connection failures on our side, NOT evidence about the feed.`);
      console.log(`  Do not remove any source based on this section — rerun first.`);
    }
  }

  if (results.some((r) => r.state === "BROKEN")) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
