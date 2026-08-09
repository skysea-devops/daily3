#!/usr/bin/env node
/**
 * Feed health check for Cogletta.
 *
 * Reads RSS_SOURCES and PODCAST_SOURCES straight out of
 * lambdas/generate-articles/index.ts so the lists can never drift, then hits
 * every feed with the exact same User-Agent / timeout the Lambda uses.
 *
 * Usage:
 *   node scripts/check-feeds.mjs                 # status + item counts
 *   node scripts/check-feeds.mjs --deep          # also fetch 1 sample item per
 *                                                # feed and look for paywall /
 *                                                # membership markers
 *   node scripts/check-feeds.mjs --only=Health   # single category
 *   node scripts/check-feeds.mjs --json          # machine-readable output
 *
 * Exit code is 1 when any feed is BROKEN, so it can be wired into CI later.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = path.resolve(
  __dirname,
  "../lambdas/generate-articles/index.ts",
);

const args = process.argv.slice(2);
const DEEP = args.includes("--deep");
const AS_JSON = args.includes("--json");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const CONCURRENCY = 8;
const TIMEOUT_MS = 12_000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7";

// Same windows the Lambda uses, so "stale" here means "the Lambda will drop it".
const ARTICLE_MAX_AGE_DAYS = {
  "Software & DevOps": 14,
  Technology: 7,
  "World Politics": 4,
  Business: 10,
  Economics: 10,
  Science: 14,
  Productivity: 30,
  History: 60,
  "Arts & Culture": 30,
  Military: 10,
  Health: 14,
  Environment: 21,
  "Philosophy & Ethics": 60,
  "Fashion & Style": 45,
  "Life & Relationships": 30,
};
const PODCAST_MAX_AGE_DAYS = 45;

// ─── Extract the source maps from the TypeScript file ────────────────────────

function extractObjectLiteral(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const braceStart = src.indexOf("{", start + marker.length);
  if (braceStart === -1) throw new Error(`No opening brace after ${marker}`);

  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = braceStart; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Unbalanced braces after ${marker}`);
}

async function loadSources() {
  const src = await readFile(SOURCE_FILE, "utf8");
  const articleLiteral = extractObjectLiteral(
    src,
    "RSS_SOURCES: Record<string, { name: string; url: string }[]> =",
  );
  const podcastLiteral = extractObjectLiteral(
    src,
    "PODCAST_SOURCES: Record<string, { name: string; url: string }[]> =",
  );
  // The literals are plain JS (comments included) — safe to evaluate locally.
  const evalLiteral = (literal) => Function(`"use strict";return (${literal});`)();
  return {
    articles: evalLiteral(articleLiteral),
    podcasts: evalLiteral(podcastLiteral),
  };
}

// ─── Minimal feed parsing (mirrors the Lambda's shape, not its filters) ──────

function countItems(xml) {
  const tag = xml.includes("<entry") ? "entry" : "item";
  return xml.split(new RegExp(`<${tag}[\\s>]`)).length - 1;
}

function newestPubDate(xml) {
  const stamps = [];
  const patterns = [
    /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/gi,
    /<published[^>]*>([\s\S]*?)<\/published>/gi,
    /<updated[^>]*>([\s\S]*?)<\/updated>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(xml))) {
      const t = Date.parse(m[1].trim());
      if (!Number.isNaN(t)) stamps.push(t);
    }
  }
  return stamps.length ? Math.max(...stamps) : null;
}

function firstItemLink(xml) {
  const tag = xml.includes("<entry") ? "entry" : "item";
  const seg = xml.split(new RegExp(`<${tag}[\\s>]`))[1];
  if (!seg) return null;
  const cdata = seg.match(
    /<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i,
  )?.[1];
  const href = seg.match(/<link[^>]+href="([^"]+)"/i)?.[1];
  const url = (cdata || href || "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

// ─── Paywall / membership markers ────────────────────────────────────────────

const PAYWALL_MARKERS = [
  "subscribe to continue",
  "subscribers only",
  "members only",
  "member-only",
  "this article is for members",
  "become a member to",
  "sign in to read",
  "log in to continue",
  "start your free trial",
  "unlock this article",
  "paywall",
  "already a subscriber",
  "meter-paywall",
  "piano-paywall",
  "tp-modal",
];

const FEED_LEVEL_MARKERS = [
  "this episode is for members",
  "members-only episode",
  "subscribe to hear the rest",
  "full episode available to members",
  "to listen to the rest",
];

function findMarkers(text, markers) {
  const lower = text.toLowerCase();
  return markers.filter((m) => lower.includes(m));
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function fetchText(url, accept) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  return { status: res.status, ok: res.ok, body, finalUrl: res.url };
}

async function checkFeed(kind, category, source) {
  const result = {
    kind,
    category,
    name: source.name,
    url: source.url,
    status: null,
    items: 0,
    newestAgeDays: null,
    state: "OK",
    notes: [],
  };

  try {
    const { status, ok, body, finalUrl } = await fetchText(source.url, ACCEPT);
    result.status = status;

    if (!ok) {
      result.state = "BROKEN";
      result.notes.push(`HTTP ${status}`);
      return result;
    }
    if (finalUrl && finalUrl !== source.url) {
      result.notes.push(`redirect → ${finalUrl}`);
    }

    const looksLikeXml = /<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 4000));
    if (!looksLikeXml) {
      result.state = "BROKEN";
      result.notes.push("response is not a feed (HTML or error page)");
      return result;
    }

    result.items = countItems(body);
    if (result.items === 0) {
      result.state = "BROKEN";
      result.notes.push("feed parsed but contains 0 items");
      return result;
    }

    const newest = newestPubDate(body);
    if (newest) {
      result.newestAgeDays = Math.round((Date.now() - newest) / 86_400_000);
      const limit =
        kind === "podcast"
          ? PODCAST_MAX_AGE_DAYS
          : (ARTICLE_MAX_AGE_DAYS[category] ?? 30);
      if (result.newestAgeDays > limit) {
        result.state = "STALE";
        result.notes.push(
          `newest item is ${result.newestAgeDays}d old, category window is ${limit}d — this feed never survives scoreAndFilter`,
        );
      }
    } else {
      result.notes.push("no parseable pubDate on any item");
    }

    const feedMarkers = findMarkers(body, FEED_LEVEL_MARKERS);
    if (feedMarkers.length) {
      if (result.state === "OK") result.state = "WARN";
      result.notes.push(`member-gated wording in feed: ${feedMarkers.join(", ")}`);
    }

    if (DEEP) {
      const link = firstItemLink(body);
      if (!link) {
        result.notes.push("could not extract a sample item link");
      } else {
        try {
          const sample = await fetchText(link, "text/html,*/*;q=0.8");
          if (!sample.ok) {
            if (result.state === "OK") result.state = "WARN";
            result.notes.push(`sample item returned HTTP ${sample.status}`);
          } else {
            const hits = findMarkers(sample.body, PAYWALL_MARKERS);
            if (hits.length) {
              if (result.state === "OK") result.state = "WARN";
              result.notes.push(`paywall markers on sample item: ${hits.join(", ")}`);
            }
            // A very short body usually means an interstitial, not an article.
            const textLen = sample.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").length;
            if (textLen < 1200) {
              if (result.state === "OK") result.state = "WARN";
              result.notes.push(`sample item body is only ~${textLen} chars`);
            }
          }
        } catch (err) {
          result.notes.push(`sample item fetch failed: ${err.message}`);
        }
      }
    }
  } catch (err) {
    result.state = "BROKEN";
    result.notes.push(err.name === "TimeoutError" ? "timeout" : err.message);
  }

  return result;
}

// ─── Static (offline) lint of the source lists ───────────────────────────────

function lintSources(articles, podcasts) {
  const problems = [];
  const nameByUrl = new Map();
  const urlsByName = new Map();

  for (const [kind, map] of [
    ["article", articles],
    ["podcast", podcasts],
  ]) {
    for (const [category, list] of Object.entries(map)) {
      const seenInCategory = new Set();
      for (const s of list) {
        const key = `${kind}:${category}:${s.url}`;
        if (seenInCategory.has(s.url)) {
          problems.push(
            `DUPLICATE  ${kind} · ${category} · "${s.name}" listed twice with the same URL`,
          );
        }
        seenInCategory.add(s.url);

        const known = nameByUrl.get(`${kind}:${s.url}`);
        if (known && known !== s.name) {
          problems.push(
            `NAME CLASH ${kind} · ${s.url} appears as both "${known}" and "${s.name}"`,
          );
        }
        nameByUrl.set(`${kind}:${s.url}`, s.name);

        const urls = urlsByName.get(`${kind}:${s.name}`) ?? new Set();
        urls.add(s.url);
        urlsByName.set(`${kind}:${s.name}`, urls);
        void key;
      }
    }
  }

  for (const [k, urls] of urlsByName) {
    if (urls.size > 1) {
      const [kind, name] = k.split(":");
      problems.push(
        `NAME REUSE ${kind} · "${name}" is used for ${urls.size} different feeds: ${[...urls].join(" , ")}`,
      );
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
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function colour(state) {
  if (AS_JSON) return state;
  const map = { OK: "\x1b[32m", WARN: "\x1b[33m", STALE: "\x1b[33m", BROKEN: "\x1b[31m" };
  return `${map[state] ?? ""}${state.padEnd(6)}\x1b[0m`;
}

async function main() {
  const { articles, podcasts } = await loadSources();

  const jobs = [];
  for (const [kind, map] of [
    ["article", articles],
    ["podcast", podcasts],
  ]) {
    for (const [category, list] of Object.entries(map)) {
      if (ONLY && category.toLowerCase() !== ONLY.toLowerCase()) continue;
      for (const source of list) jobs.push({ kind, category, source });
    }
  }

  const lint = lintSources(articles, podcasts);

  if (!AS_JSON) {
    console.log(
      `Checking ${jobs.length} feeds${DEEP ? " (deep: also fetching one sample item each)" : ""}…\n`,
    );
  }

  const results = await mapWithConcurrency(jobs, CONCURRENCY, (job) =>
    checkFeed(job.kind, job.category, job.source),
  );

  if (AS_JSON) {
    console.log(JSON.stringify({ lint, results }, null, 2));
  } else {
    let currentGroup = "";
    for (const r of results) {
      const group = `${r.kind} · ${r.category}`;
      if (group !== currentGroup) {
        currentGroup = group;
        console.log(`\n── ${group} ${"─".repeat(Math.max(0, 60 - group.length))}`);
      }
      const age =
        r.newestAgeDays === null ? "  ?" : `${String(r.newestAgeDays).padStart(3)}d`;
      console.log(
        `  ${colour(r.state)} ${String(r.items).padStart(3)} items  newest ${age}  ${r.name}`,
      );
      for (const note of r.notes) console.log(`         ↳ ${note}`);
    }

    const counts = results.reduce((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `\nSummary: ${counts.OK ?? 0} OK · ${counts.WARN ?? 0} WARN · ${counts.STALE ?? 0} STALE · ${counts.BROKEN ?? 0} BROKEN`,
    );

    if (lint.length) {
      console.log(`\n── list hygiene ${"─".repeat(48)}`);
      for (const p of lint) console.log(`  ${p}`);
    }

    const removable = results.filter((r) => r.state === "BROKEN" || r.state === "STALE");
    if (removable.length) {
      console.log(`\n── candidates to remove ${"─".repeat(40)}`);
      for (const r of removable) {
        console.log(`  ${r.kind} · ${r.category} · "${r.name}"  (${r.notes[0] ?? r.state})`);
      }
    }
  }

  if (results.some((r) => r.state === "BROKEN")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
