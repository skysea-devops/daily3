#!/usr/bin/env node

/**
 * Cogletta feed preflight / health checker
 *
 * Checks:
 *
 *   RSS_SOURCES
 *   PODCAST_SOURCES
 *   SUNDAY_SOURCES
 *   SUNDAY_PODCAST_SOURCES
 *
 * directly from:
 *
 *   lambdas/articles/generate-articles/index.ts
 *
 * Freshness windows are read directly from:
 *
 *   shared/categories.ts
 *
 * Deep mode:
 *
 *   ARTICLE
 *     - tests the 3 newest eligible items deterministically
 *     - checks whether the actual article body is readable
 *     - "Subscribe" text alone is NOT considered a paywall
 *     - BLOCKED requires real paywall evidence + insufficient readable body
 *
 *   PODCAST
 *     - tests the 3 newest eligible episodes deterministically
 *     - prefers <enclosure> / media audio URL
 *     - tests that the audio resource is really reachable
 *     - page text length is NOT used as an accessibility signal
 *     - HTML page fallback only considers explicit/strong episode paywall text
 *
 * Network:
 *
 *   - feed/deep concurrency = 2 in --deep mode
 *   - normal mode concurrency = 8
 *   - transient network/5xx/429 failures are retried twice
 *   - unresolved network failures become NETWORK, not BROKEN
 *
 * Usage:
 *
 *   node scripts/check-feeds.mjs
 *   node scripts/check-feeds.mjs --deep
 *
 *   node scripts/check-feeds.mjs --only=health --deep
 *   node scripts/check-feeds.mjs --only=technology --kind=article --deep
 *
 *   node scripts/check-feeds.mjs --kind=article --deep
 *   node scripts/check-feeds.mjs --kind=podcast --deep
 *
 *   node scripts/check-feeds.mjs --only=sunday --deep
 *   node scripts/check-feeds.mjs --kind=sunday --deep
 *
 *   node scripts/check-feeds.mjs --json
 *   node scripts/check-feeds.mjs --strict
 *   node scripts/check-feeds.mjs --fail-on-warn
 *
 * Optional:
 *
 *   --source=/absolute/path/to/generate-articles/index.ts
 *   --categories=/absolute/path/to/shared/categories.ts
 *
 * Exit behaviour:
 *
 *   default:
 *     exit 1 only for genuinely BROKEN feeds / category config errors
 *
 *   --strict:
 *     also fail for list hygiene/config problems
 *
 *   --fail-on-warn:
 *     also fail for WARN
 *
 * NETWORK and STALE do not fail default CI.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// CLI / PATHS
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(
  fileURLToPath(import.meta.url),
);

const args = process.argv.slice(2);

const getArg = (name) =>
  args
    .find((arg) =>
      arg.startsWith(`--${name}=`),
    )
    ?.slice(name.length + 3);

const DEEP =
  args.includes("--deep");

const STRICT =
  args.includes("--strict");

const FAIL_ON_WARN =
  args.includes("--fail-on-warn");

const AS_JSON =
  args.includes("--json");

const ONLY =
  getArg("only")
    ?.trim()
    ?.toLowerCase();

const KIND_FILTER =
  getArg("kind")
    ?.trim()
    ?.toLowerCase();

const SOURCE_FILE =
  getArg("source") ??
  path.resolve(
    __dirname,
    "../lambdas/articles/generate-articles/index.ts",
  );

const CATEGORY_FILE_CANDIDATES = [
  getArg("categories"),

  path.resolve(
    __dirname,
    "../../shared/categories.ts",
  ),

  path.resolve(
    __dirname,
    "../shared/categories.ts",
  ),
].filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// Normal feed-only run can be relatively parallel.
const NORMAL_CONCURRENCY = 8;

// Deep mode opens up to three real content URLs for each feed.
// Keep outer concurrency low to avoid 8 × 3 = 24 parallel page requests.
const DEEP_CONCURRENCY = 2;

const CONCURRENCY =
  DEEP
    ? DEEP_CONCURRENCY
    : NORMAL_CONCURRENCY;

// Match production fetch timeout.
const TIMEOUT_MS = 8_000;

// Initial request + 2 retries.
const MAX_ATTEMPTS = 3;

const RETRY_BASE_MS = 450;

const SAMPLE_COUNT = 3;

const DAY_MS = 86_400_000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

const FEED_ACCEPT =
  "application/rss+xml, " +
  "application/atom+xml, " +
  "application/xml;q=0.9, " +
  "text/xml;q=0.9, " +
  "text/html;q=0.8, " +
  "*/*;q=0.7";

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE ACCESS THRESHOLDS
//
// ONLY FOR ARTICLES.
//
// Never use these thresholds for podcasts.
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLE_FULLY_READABLE_CHARS = 2200;

const ARTICLE_MIN_REASONABLE_CHARS = 900;

// ─────────────────────────────────────────────────────────────────────────────
// PAYWALL SIGNALS
// ─────────────────────────────────────────────────────────────────────────────

// Strong phrases explicitly saying content cannot continue without access.
const STRONG_ARTICLE_PAYWALL_MARKERS = [
  "subscribe to continue reading",
  "subscribe to keep reading",
  "subscribe to continue",
  "unlock this article",
  "unlock the full article",
  "continue reading with a subscription",
  "this article is for subscribers",
  "this article is for members",
  "subscriber-only article",
  "members-only article",
  "you've reached your article limit",
  "you have reached your article limit",
  "you've reached your free article limit",
  "you have reached your free article limit",
  "start your free trial to continue reading",
  "sign in to continue reading",
  "log in to continue reading",
  "register to continue reading",
];

// Weak signals may appear on totally free pages.
//
// They only contribute to BLOCKED when the actual article body is also
// extremely short.
const WEAK_ARTICLE_PAYWALL_MARKERS = [
  "subscriber-only",
  "subscribers only",
  "members only",
  "members-only",
  "member-only",
  "become a member",
  "become a subscriber",
  "already a subscriber",
  "start your free trial",
  "sign in to read",
  "log in to continue",
  "meter-paywall",
  "piano-paywall",
  "tp-modal",
];

// Podcast HTML fallback uses ONLY explicit episode-specific paywall wording.
//
// Generic footer language such as:
//   "become a member"
//   "subscribe"
// does NOT block a podcast.
const STRONG_PODCAST_PAYWALL_MARKERS = [
  "this episode is only available to members",
  "this episode is available to members only",
  "this episode is for members only",
  "members-only episode",
  "member-only episode",
  "subscriber-only episode",
  "this episode is only available to subscribers",
  "full episode is only available to members",
  "full episode is available to members only",
  "full episode is only available to subscribers",
  "subscribe to hear the full episode",
  "subscribe to listen to the full episode",
];

// Production-level known gated markers.
const GATED_CONTENT_MARKERS = [
  "<!--members-only-->",
  "<!--paid-members-only-->",
];

const NON_EDITORIAL_CATEGORIES =
  new Set([
    "sponsored",
    "announcement",
    "exhibition announcement",
    "newsletter",
    "daily newsletter",
  ]);

const MEMBER_ONLY_TITLE_PATTERN =
  /\b(members?[- ]only|subscribers?[- ]only|bonus for members|member exclusive)\b/i;

const MEMBER_ONLY_DESCRIPTION_PATTERN =
  /\b(this episode is (only )?(for|available to) members|members?[- ]only episode|subscriber[- ]only episode|full episode is (only )?available to (members|subscribers))\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );
}

function cleanUrl(raw = "") {
  return raw
    .replace(/&#038;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function normaliseUrl(raw) {
  try {
    const url = new URL(
      cleanUrl(raw),
    );

    url.hash = "";

    return url.toString();
  } catch {
    return cleanUrl(raw);
  }
}

function normaliseName(name) {
  return String(name)
    .trim()
    .toLowerCase();
}

function findMarkers(
  text,
  markers,
) {
  const lower =
    String(text ?? "")
      .toLowerCase();

  return markers.filter(
    (marker) =>
      lower.includes(
        marker.toLowerCase(),
      ),
  );
}

function isNetworkError(err) {
  if (!err) {
    return false;
  }

  const name =
    String(
      err.name ?? "",
    );

  const message =
    String(
      err.message ?? "",
    ).toLowerCase();

  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("eai_again") ||
    message.includes("socket") ||
    message.includes("connect")
  );
}

function formatError(err) {
  if (!err) {
    return "unknown error";
  }

  if (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    /timeout/i.test(
      err.message ?? "",
    )
  ) {
    return `timeout after ${TIMEOUT_MS / 1000}s`;
  }

  return (
    err.message ??
    String(err)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPESCRIPT LITERAL EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function extractAssignedLiteral(
  src,
  name,
) {
  const namePos =
    src.indexOf(name);

  if (namePos === -1) {
    throw new Error(
      `Constant not found: ${name}`,
    );
  }

  const eq =
    src.indexOf(
      "=",
      namePos +
        name.length,
    );

  if (eq === -1) {
    throw new Error(
      `No assignment found for: ${name}`,
    );
  }

  let literalStart = -1;

  for (
    let i = eq + 1;
    i < src.length;
    i++
  ) {
    if (
      src[i] === "{" ||
      src[i] === "["
    ) {
      literalStart = i;
      break;
    }

    if (
      src[i] === ";"
    ) {
      break;
    }
  }

  if (
    literalStart === -1
  ) {
    throw new Error(
      `No object/array literal found for: ${name}`,
    );
  }

  const opener =
    src[literalStart];

  const closer =
    opener === "{"
      ? "}"
      : "]";

  let depth = 0;

  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (
    let i = literalStart;
    i < src.length;
    i++
  ) {
    const c = src[i];
    const next =
      src[i + 1];

    if (inLineComment) {
      if (c === "\n") {
        inLineComment =
          false;
      }

      continue;
    }

    if (inBlockComment) {
      if (
        c === "*" &&
        next === "/"
      ) {
        inBlockComment =
          false;

        i++;
      }

      continue;
    }

    if (inString) {
      if (c === "\\") {
        i++;
      } else if (
        c === inString
      ) {
        inString = null;
      }

      continue;
    }

    if (
      c === "/" &&
      next === "/"
    ) {
      inLineComment = true;
      i++;
      continue;
    }

    if (
      c === "/" &&
      next === "*"
    ) {
      inBlockComment = true;
      i++;
      continue;
    }

    if (
      c === '"' ||
      c === "'" ||
      c === "`"
    ) {
      inString = c;
      continue;
    }

    if (c === opener) {
      depth++;
    } else if (
      c === closer
    ) {
      depth--;

      if (depth === 0) {
        return src.slice(
          literalStart,
          i + 1,
        );
      }
    }
  }

  throw new Error(
    `Unbalanced literal for ${name}`,
  );
}

function evaluateLiteral(
  literal,
  name,
) {
  try {
    return Function(
      `"use strict"; return (${literal});`,
    )();
  } catch (err) {
    throw new Error(
      `Could not evaluate ${name}: ${err.message}`,
    );
  }
}

function extractNumberConstant(
  src,
  name,
) {
  const escaped =
    name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const match =
    src.match(
      new RegExp(
        `\\b${escaped}\\b[^=;]*=\\s*(\\d+)`,
      ),
    );

  return match
    ? Number(match[1])
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD SOURCE LISTS
// ─────────────────────────────────────────────────────────────────────────────

async function loadSources() {
  const src =
    await readFile(
      SOURCE_FILE,
      "utf8",
    );

  const readRequired =
    (name) =>
      evaluateLiteral(
        extractAssignedLiteral(
          src,
          name,
        ),
        name,
      );

  const readOptional =
    (name, fallback) => {
      try {
        return readRequired(
          name,
        );
      } catch {
        return fallback;
      }
    };

  return {
    sourceText: src,

    articles:
      readRequired(
        "RSS_SOURCES",
      ),

    podcasts:
      readRequired(
        "PODCAST_SOURCES",
      ),

    sundayArticles:
      readOptional(
        "SUNDAY_SOURCES",
        [],
      ),

    sundayPodcasts:
      readOptional(
        "SUNDAY_PODCAST_SOURCES",
        [],
      ),

    sundayMaxAgeDays:
      extractNumberConstant(
        src,
        "SUNDAY_MAX_AGE_DAYS",
      ) ?? 90,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD REAL PRODUCTION FRESHNESS WINDOWS
//
// NO hard-coded category window fallback.
//
// If categories.ts cannot be parsed, stale classification is disabled rather
// than pretending that 30/45 days are production values.
// ─────────────────────────────────────────────────────────────────────────────

async function loadAgeWindows() {
  const warnings = [];

  for (
    const file of
      CATEGORY_FILE_CANDIDATES
  ) {
    try {
      const src =
        await readFile(
          file,
          "utf8",
        );

      let articleMaxAgeDays =
        null;

      // Preferred form:
      //
      // export const ARTICLE_MAX_AGE_DAYS = {
      //   technology: 21,
      //   ...
      // };
      try {
        articleMaxAgeDays =
          evaluateLiteral(
            extractAssignedLiteral(
              src,
              "ARTICLE_MAX_AGE_DAYS",
            ),
            "ARTICLE_MAX_AGE_DAYS",
          );
      } catch {
        // Fallback for category-definition structures:
        //
        // {
        //   id: "technology",
        //   maxAgeDays: 21
        // }
        const matches = [
          ...src.matchAll(
            /id:\s*["']([a-z_]+)["'][\s\S]{0,1500}?maxAgeDays:\s*(\d+)/g,
          ),
        ];

        if (
          matches.length
        ) {
          articleMaxAgeDays =
            Object.fromEntries(
              matches.map(
                (match) => [
                  match[1],
                  Number(
                    match[2],
                  ),
                ],
              ),
            );
        }
      }

      const podcastMaxAgeDays =
        extractNumberConstant(
          src,
          "PODCAST_MAX_AGE_DAYS",
        );

      if (
        !articleMaxAgeDays ||
        typeof articleMaxAgeDays !==
          "object" ||
        Array.isArray(
          articleMaxAgeDays,
        )
      ) {
        throw new Error(
          "ARTICLE_MAX_AGE_DAYS could not be extracted",
        );
      }

      if (
        !Number.isFinite(
          podcastMaxAgeDays,
        )
      ) {
        throw new Error(
          "PODCAST_MAX_AGE_DAYS could not be extracted",
        );
      }

      return {
        articleMaxAgeDays,

        podcastMaxAgeDays,

        loadedFrom: file,

        warnings,
      };
    } catch (err) {
      warnings.push(
        `${file}: ${formatError(err)}`,
      );
    }
  }

  return {
    articleMaxAgeDays: {},

    podcastMaxAgeDays: null,

    loadedFrom: null,

    warnings: [
      ...warnings,

      "Freshness config could not be loaded. STALE classification is disabled to avoid false results.",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// XML HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function stripCdata(value = "") {
  return value
    .replace(
      /^\s*<!\[CDATA\[/i,
      "",
    )
    .replace(
      /\]\]>\s*$/i,
      "",
    )
    .trim();
}

function extractText(
  xml,
  tag,
) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const regex =
    new RegExp(
      `<${escaped}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${escaped}>`,
      "i",
    );

  const match =
    xml.match(regex);

  return match
    ? stripCdata(
        match[1],
      )
    : "";
}

function itemSegments(xml) {
  const tag =
    /<entry[\s>]/i.test(
      xml,
    )
      ? "entry"
      : "item";

  const regex =
    new RegExp(
      `<${tag}\\b[\\s\\S]*?<\\/${tag}>`,
      "gi",
    );

  return [
    ...xml.matchAll(
      regex,
    ),
  ].map(
    (match) =>
      match[0],
  );
}

function countItems(xml) {
  return itemSegments(
    xml,
  ).length;
}

function parseItemDate(seg) {
  const raw =
    extractText(
      seg,
      "pubDate",
    ) ||
    extractText(
      seg,
      "published",
    ) ||
    extractText(
      seg,
      "updated",
    ) ||
    extractText(
      seg,
      "dc:date",
    );

  const timestamp =
    raw
      ? Date.parse(raw)
      : NaN;

  return Number.isNaN(
    timestamp,
  )
    ? null
    : timestamp;
}

function newestPubDate(xml) {
  const timestamps =
    itemSegments(xml)
      .map(
        parseItemDate,
      )
      .filter(
        Number.isFinite,
      );

  return timestamps.length
    ? Math.max(
        ...timestamps,
      )
    : null;
}

function itemTitle(seg) {
  return extractText(
    seg,
    "title",
  )
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function itemDescription(seg) {
  return (
    extractText(
      seg,
      "description",
    ) ||
    extractText(
      seg,
      "summary",
    ) ||
    extractText(
      seg,
      "content:encoded",
    ) ||
    extractText(
      seg,
      "content",
    )
  );
}

function itemCategories(seg) {
  return [
    ...seg.matchAll(
      /<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi,
    ),
  ]
    .map(
      (match) =>
        stripCdata(
          match[1],
        ),
    )
    .filter(Boolean);
}

function isGatedItem(seg) {
  const content =
    extractText(
      seg,
      "content:encoded",
    ) ||
    extractText(
      seg,
      "content",
    );

  return GATED_CONTENT_MARKERS.some(
    (marker) =>
      content.includes(
        marker,
      ),
  );
}

function isNonEditorialItem(seg) {
  return itemCategories(
    seg,
  ).some(
    (category) =>
      NON_EDITORIAL_CATEGORIES.has(
        category
          .trim()
          .toLowerCase(),
      ),
  );
}

function isMemberOnlyPodcastItem(seg) {
  const title =
    itemTitle(seg);

  const description =
    itemDescription(seg)
      .replace(
        /<[^>]+>/g,
        " ",
      );

  return (
    MEMBER_ONLY_TITLE_PATTERN.test(
      title,
    ) ||
    MEMBER_ONLY_DESCRIPTION_PATTERN.test(
      description,
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM URLS
// ─────────────────────────────────────────────────────────────────────────────

const SHOW_PAGE_PATTERN =
  /\/(column|columns|show|shows|podcast|podcasts)\/[^/]+\/?$/i;

function isShowPage(raw) {
  try {
    const pathname =
      new URL(
        cleanUrl(raw),
      ).pathname;

    return (
      pathname === "/" ||
      SHOW_PAGE_PATTERN.test(
        pathname,
      )
    );
  } catch {
    return false;
  }
}

function extractLinkUrl(seg) {
  const text =
    cleanUrl(
      extractText(
        seg,
        "link",
      ),
    );

  if (
    /^https?:\/\//i.test(
      text,
    )
  ) {
    return text;
  }

  const href =
    cleanUrl(
      seg.match(
        /<link[^>]+href=["']([^"']+)["']/i,
      )?.[1] ?? "",
    );

  return /^https?:\/\//i.test(
    href,
  )
    ? href
    : "";
}

function extractGuidUrl(seg) {
  const guid =
    cleanUrl(
      extractText(
        seg,
        "guid",
      ),
    );

  return /^https?:\/\//i.test(
    guid,
  )
    ? guid
    : "";
}

function extractAudioUrl(seg) {
  // Standard RSS enclosure.
  const enclosure =
    seg.match(
      /<enclosure\b[^>]*\/?>/i,
    )?.[0] ?? "";

  const enclosureUrl =
    cleanUrl(
      enclosure.match(
        /\burl\s*=\s*["']([^"']+)["']/i,
      )?.[1] ?? "",
    );

  const enclosureType =
    enclosure.match(
      /\btype\s*=\s*["']([^"']+)["']/i,
    )?.[1] ?? "";

  if (
    enclosureUrl &&
    (
      /^audio\//i.test(
        enclosureType,
      ) ||
      /\.(mp3|m4a|aac|ogg|wav|opus)(\?|#|$)/i.test(
        enclosureUrl,
      )
    )
  ) {
    return enclosureUrl;
  }

  // Media RSS.
  const mediaTag =
    seg.match(
      /<media:content\b[^>]*\/?>/i,
    )?.[0] ?? "";

  const mediaUrl =
    cleanUrl(
      mediaTag.match(
        /\burl\s*=\s*["']([^"']+)["']/i,
      )?.[1] ?? "",
    );

  const mediaType =
    mediaTag.match(
      /\btype\s*=\s*["']([^"']+)["']/i,
    )?.[1] ?? "";

  if (
    mediaUrl &&
    (
      /^audio\//i.test(
        mediaType,
      ) ||
      /\.(mp3|m4a|aac|ogg|wav|opus)(\?|#|$)/i.test(
        mediaUrl,
      )
    )
  ) {
    return mediaUrl;
  }

  return "";
}

function itemPageUrl(seg) {
  const link =
    extractLinkUrl(seg);

  if (link) {
    return link;
  }

  return extractGuidUrl(
    seg,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC SAMPLE SELECTION
//
// NO Math.random().
//
// Sort newest -> oldest and select first three eligible items.
// Running twice against an unchanged feed will test the same three items.
// ─────────────────────────────────────────────────────────────────────────────

function deterministicSamples(
  xml,
  isPodcast,
) {
  const parsed =
    itemSegments(xml)
      .map(
        (seg, index) => ({
          seg,

          index,

          date:
            parseItemDate(
              seg,
            ),

          title:
            itemTitle(
              seg,
            ),

          pageUrl:
            itemPageUrl(
              seg,
            ),

          audioUrl:
            isPodcast
              ? extractAudioUrl(
                  seg,
                )
              : "",
        }),
      )
      .filter(
        (item) => {
          if (
            isGatedItem(
              item.seg,
            )
          ) {
            return false;
          }

          if (
            isNonEditorialItem(
              item.seg,
            )
          ) {
            return false;
          }

          if (
            isPodcast &&
            isMemberOnlyPodcastItem(
              item.seg,
            )
          ) {
            return false;
          }

          if (isPodcast) {
            return Boolean(
              item.audioUrl ||
              item.pageUrl,
            );
          }

          return Boolean(
            item.pageUrl,
          );
        },
      );

  parsed.sort(
    (a, b) => {
      const ad =
        Number.isFinite(
          a.date,
        )
          ? a.date
          : 0;

      const bd =
        Number.isFinite(
          b.date,
        )
          ? b.date
          : 0;

      if (bd !== ad) {
        return bd - ad;
      }

      return (
        a.index -
        b.index
      );
    },
  );

  return parsed.slice(
    0,
    SAMPLE_COUNT,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK FETCH WITH RETRY
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOnce(
  url,
  options = {},
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      TIMEOUT_MS,
    );

  try {
    return await fetch(
      url,
      {
        ...options,

        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timer,
    );
  }
}

function retryableStatus(status) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function fetchWithRetry(
  url,
  options = {},
) {
  let lastError = null;
  let lastResponse = null;

  for (
    let attempt = 1;
    attempt <=
    MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const response =
        await fetchOnce(
          url,
          options,
        );

      lastResponse =
        response;

      if (
        !retryableStatus(
          response.status,
        ) ||
        attempt ===
          MAX_ATTEMPTS
      ) {
        return response;
      }

      await response.body
        ?.cancel()
        .catch(
          () => {},
        );
    } catch (err) {
      lastError = err;

      if (
        !isNetworkError(
          err,
        ) ||
        attempt ===
          MAX_ATTEMPTS
      ) {
        throw err;
      }
    }

    const jitter =
      Math.floor(
        Math.random() * 150,
      );

    const delay =
      RETRY_BASE_MS *
        2 **
          (attempt - 1) +
      jitter;

    await sleep(delay);
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw (
    lastError ??
    new Error(
      "request failed",
    )
  );
}

async function fetchText(
  url,
  accept =
    FEED_ACCEPT,
) {
  const response =
    await fetchWithRetry(
      url,
      {
        method: "GET",

        headers: {
          "User-Agent": UA,

          Accept:
            accept,

          "Accept-Language":
            "en-US,en;q=0.9",
        },

        redirect:
          "follow",
      },
    );

  const body =
    await response.text();

  return {
    status:
      response.status,

    ok:
      response.ok,

    body,

    finalUrl:
      response.url,

    contentType:
      response.headers.get(
        "content-type",
      ) ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO PROBE
//
// Does NOT download the whole podcast.
// ─────────────────────────────────────────────────────────────────────────────

async function probeAudioUrl(url) {
  // HEAD first.
  try {
    const response =
      await fetchWithRetry(
        url,
        {
          method: "HEAD",

          headers: {
            "User-Agent": UA,

            Accept:
              "audio/*,*/*;q=0.8",

            "Accept-Language":
              "en-US,en;q=0.9",
          },

          redirect:
            "follow",
        },
      );

    const contentType =
      response.headers.get(
        "content-type",
      ) ?? "";

    await response.body
      ?.cancel()
      .catch(
        () => {},
      );

    if (
      response.status !== 405 &&
      response.status !== 501
    ) {
      return {
        status:
          response.status,

        ok:
          response.ok,

        finalUrl:
          response.url,

        contentType,

        method:
          "HEAD",
      };
    }
  } catch (err) {
    // Network issue will get another chance through ranged GET.
    if (
      !isNetworkError(
        err,
      )
    ) {
      throw err;
    }
  }

  // Tiny ranged GET fallback.
  const response =
    await fetchWithRetry(
      url,
      {
        method: "GET",

        headers: {
          "User-Agent": UA,

          Accept:
            "audio/*,*/*;q=0.8",

          "Accept-Language":
            "en-US,en;q=0.9",

          Range:
            "bytes=0-65535",
        },

        redirect:
          "follow",
      },
    );

  const contentType =
    response.headers.get(
      "content-type",
    ) ?? "";

  await response.body
    ?.cancel()
    .catch(
      () => {},
    );

  return {
    status:
      response.status,

    ok:
      response.ok ||
      response.status === 206,

    finalUrl:
      response.url,

    contentType,

    method:
      "RANGE_GET",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE TEXT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

function decodeBasicEntities(text) {
  return text
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&quot;/gi,
      '"',
    )
    .replace(
      /&#39;/gi,
      "'",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    );
}

function stripHtml(html) {
  return decodeBasicEntities(
    String(
      html ?? "",
    )
      .replace(
        /<script\b[\s\S]*?<\/script>/gi,
        " ",
      )
      .replace(
        /<style\b[\s\S]*?<\/style>/gi,
        " ",
      )
      .replace(
        /<noscript\b[\s\S]*?<\/noscript>/gi,
        " ",
      )
      .replace(
        /<svg\b[\s\S]*?<\/svg>/gi,
        " ",
      )
      .replace(
        /<template\b[\s\S]*?<\/template>/gi,
        " ",
      )
      .replace(
        /<!--[\s\S]*?-->/g,
        " ",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      ),
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function extractMainReadableText(
  html,
) {
  // Prefer <article>.
  const articleMatches = [
    ...String(
      html,
    ).matchAll(
      /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    ),
  ];

  if (
    articleMatches.length
  ) {
    const texts =
      articleMatches
        .map(
          (match) =>
            stripHtml(
              match[1],
            ),
        )
        .sort(
          (a, b) =>
            b.length -
            a.length,
        );

    if (
      texts[0]?.length >=
      300
    ) {
      return texts[0];
    }
  }

  // Then <main>.
  const mainMatches = [
    ...String(
      html,
    ).matchAll(
      /<main\b[^>]*>([\s\S]*?)<\/main>/gi,
    ),
  ];

  if (
    mainMatches.length
  ) {
    const texts =
      mainMatches
        .map(
          (match) =>
            stripHtml(
              match[1],
            ),
        )
        .sort(
          (a, b) =>
            b.length -
            a.length,
        );

    if (
      texts[0]?.length >=
      300
    ) {
      return texts[0];
    }
  }

  // Then paragraphs.
  const paragraphs = [
    ...String(
      html,
    ).matchAll(
      /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    ),
  ]
    .map(
      (match) =>
        stripHtml(
          match[1],
        ),
    )
    .filter(
      (text) =>
        text.length >=
        30,
    );

  const paragraphText =
    paragraphs.join(
      " ",
    );

  if (
    paragraphText.length >=
    300
  ) {
    return paragraphText;
  }

  return stripHtml(
    html,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

function classifyArticlePage(
  html,
) {
  const readableText =
    extractMainReadableText(
      html,
    );

  const readableChars =
    readableText.length;

  const strongHits =
    findMarkers(
      readableText,
      STRONG_ARTICLE_PAYWALL_MARKERS,
    );

  const weakHits =
    findMarkers(
      html,
      WEAK_ARTICLE_PAYWALL_MARKERS,
    );

  if (
    strongHits.length >
      0 &&
    readableChars <
      ARTICLE_FULLY_READABLE_CHARS
  ) {
    return {
      access:
        "BLOCKED",

      readableChars,

      markers: [
        ...new Set([
          ...strongHits,
          ...weakHits,
        ]),
      ],

      reason:
        "explicit continue-reading/paywall wording + insufficient readable article body",
    };
  }

  if (
    weakHits.length >
      0 &&
    readableChars <
      ARTICLE_MIN_REASONABLE_CHARS
  ) {
    return {
      access:
        "BLOCKED",

      readableChars,

      markers: [
        ...new Set(
          weakHits,
        ),
      ],

      reason:
        "subscription/member marker + extremely short readable article body",
    };
  }

  if (
    readableChars >=
      ARTICLE_FULLY_READABLE_CHARS
  ) {
    return {
      access:
        "READABLE",

      readableChars,

      markers: [
        ...new Set([
          ...strongHits,
          ...weakHits,
        ]),
      ],

      reason:
        "substantial readable article body available",
    };
  }

  if (
    readableChars >=
      ARTICLE_MIN_REASONABLE_CHARS &&
    strongHits.length ===
      0
  ) {
    return {
      access:
        "READABLE",

      readableChars,

      markers: [
        ...new Set(
          weakHits,
        ),
      ],

      reason:
        "readable body present and no explicit paywall wall detected",
    };
  }

  return {
    access:
      "UNKNOWN",

    readableChars,

    markers: [
      ...new Set([
        ...strongHits,
        ...weakHits,
      ]),
    ],

    reason:
      "page body is unusually short but no reliable paywall evidence was found",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE SAMPLE CHECK
// ─────────────────────────────────────────────────────────────────────────────

async function checkArticleSample(
  sample,
) {
  const result = {
    title:
      sample.title,

    url:
      sample.pageUrl,

    access:
      "UNKNOWN",

    status:
      null,

    readableChars:
      0,

    markers: [],

    reason:
      null,
  };

  try {
    const response =
      await fetchText(
        sample.pageUrl,
        "text/html,application/xhtml+xml,*/*;q=0.8",
      );

    result.status =
      response.status;

    if (!response.ok) {
      result.access =
        "HTTP_ERROR";

      result.reason =
        `HTTP ${response.status}`;

      return result;
    }

    const classified =
      classifyArticlePage(
        response.body,
      );

    return {
      ...result,

      ...classified,

      url:
        response.finalUrl ||
        sample.pageUrl,
    };
  } catch (err) {
    result.access =
      isNetworkError(
        err,
      )
        ? "NETWORK"
        : "FETCH_ERROR";

    result.reason =
      formatError(err);

    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PODCAST SAMPLE CHECK
// ─────────────────────────────────────────────────────────────────────────────

async function checkPodcastSample(
  sample,
) {
  const result = {
    title:
      sample.title,

    pageUrl:
      sample.pageUrl,

    audioUrl:
      sample.audioUrl,

    access:
      "UNKNOWN",

    status:
      null,

    contentType:
      "",

    reason:
      null,
  };

  // Preferred test:
  // actual RSS audio enclosure.
  if (
    sample.audioUrl
  ) {
    try {
      const probe =
        await probeAudioUrl(
          sample.audioUrl,
        );

      result.status =
        probe.status;

      result.contentType =
        probe.contentType;

      result.audioUrl =
        probe.finalUrl ||
        sample.audioUrl;

      if (!probe.ok) {
        result.access =
          "HTTP_ERROR";

        result.reason =
          `audio enclosure returned HTTP ${probe.status}`;

        return result;
      }

      // Many podcast CDNs correctly identify audio.
      if (
        /^audio\//i.test(
          probe.contentType,
        )
      ) {
        result.access =
          "PLAYABLE";

        result.reason =
          `audio enclosure reachable (${probe.contentType})`;

        return result;
      }

      // Some CDNs send application/octet-stream.
      if (
        /application\/octet-stream/i.test(
          probe.contentType,
        ) ||
        /\.(mp3|m4a|aac|ogg|wav|opus)(\?|#|$)/i.test(
          result.audioUrl,
        )
      ) {
        result.access =
          "PLAYABLE";

        result.reason =
          `audio enclosure reachable (${probe.contentType || "generic binary content-type"})`;

        return result;
      }

      result.access =
        "PLAYABLE";

      result.reason =
        `audio enclosure HTTP ${probe.status}; unusual content-type "${probe.contentType || "unknown"}"`;

      return result;
    } catch (err) {
      result.access =
        isNetworkError(
          err,
        )
          ? "NETWORK"
          : "FETCH_ERROR";

      result.reason =
        `audio enclosure: ${formatError(err)}`;

      return result;
    }
  }

  // Fallback:
  // no enclosure found; inspect episode HTML.
  //
  // IMPORTANT:
  // NO page-length threshold for podcasts.
  if (
    sample.pageUrl
  ) {
    try {
      const response =
        await fetchText(
          sample.pageUrl,
          "text/html,application/xhtml+xml,*/*;q=0.8",
        );

      result.status =
        response.status;

      if (!response.ok) {
        result.access =
          "HTTP_ERROR";

        result.reason =
          `episode page returned HTTP ${response.status}`;

        return result;
      }

      const readable =
        stripHtml(
          response.body,
        );

      const strongHits =
        findMarkers(
          readable,
          STRONG_PODCAST_PAYWALL_MARKERS,
        );

      if (
        strongHits.length
      ) {
        result.access =
          "BLOCKED";

        result.reason =
          `explicit episode paywall: ${strongHits.join(", ")}`;

        return result;
      }

      result.access =
        "PAGE_REACHABLE";

      result.reason =
        "episode page reachable; no explicit episode-level paywall detected";

      return result;
    } catch (err) {
      result.access =
        isNetworkError(
          err,
        )
          ? "NETWORK"
          : "FETCH_ERROR";

      result.reason =
        formatError(err);

      return result;
    }
  }

  result.access =
    "UNKNOWN";

  result.reason =
    "no audio enclosure or usable episode page URL";

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEEP SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function summarizeArticleSamples(
  samples,
) {
  const readable =
    samples.filter(
      (sample) =>
        sample.access ===
        "READABLE",
    ).length;

  const blocked =
    samples.filter(
      (sample) =>
        sample.access ===
        "BLOCKED",
    ).length;

  const network =
    samples.filter(
      (sample) =>
        sample.access ===
        "NETWORK",
    ).length;

  const errors =
    samples.filter(
      (sample) =>
        sample.access ===
          "HTTP_ERROR" ||
        sample.access ===
          "FETCH_ERROR",
    ).length;

  const unknown =
    samples.filter(
      (sample) =>
        sample.access ===
        "UNKNOWN",
    ).length;

  if (
    samples.length === 3 &&
    readable === 3
  ) {
    return {
      decision:
        "KEEP",

      readable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    samples.length === 3 &&
    readable === 2 &&
    blocked === 1
  ) {
    return {
      decision:
        "KEEP_MIXED",

      readable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    samples.length === 3 &&
    readable === 1 &&
    blocked === 2
  ) {
    return {
      decision:
        "REMOVE_CANDIDATE",

      readable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    samples.length > 0 &&
    blocked ===
      samples.length
  ) {
    return {
      decision:
        "REMOVE_PAYWALL",

      readable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  return {
    decision:
      "REVIEW",

    readable,
    blocked,
    network,
    errors,
    unknown,
  };
}

function summarizePodcastSamples(
  samples,
) {
  const playable =
    samples.filter(
      (sample) =>
        sample.access ===
          "PLAYABLE" ||
        sample.access ===
          "PAGE_REACHABLE",
    ).length;

  const blocked =
    samples.filter(
      (sample) =>
        sample.access ===
        "BLOCKED",
    ).length;

  const network =
    samples.filter(
      (sample) =>
        sample.access ===
        "NETWORK",
    ).length;

  const errors =
    samples.filter(
      (sample) =>
        sample.access ===
          "HTTP_ERROR" ||
        sample.access ===
          "FETCH_ERROR",
    ).length;

  const unknown =
    samples.filter(
      (sample) =>
        sample.access ===
        "UNKNOWN",
    ).length;

  if (
    samples.length === 3 &&
    playable === 3
  ) {
    return {
      decision:
        "KEEP",

      playable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    playable >= 2
  ) {
    return {
      decision:
        "KEEP_MIXED",

      playable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    samples.length > 0 &&
    blocked ===
      samples.length
  ) {
    return {
      decision:
        "REMOVE_PAYWALL",

      playable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  if (
    blocked >= 2 &&
    playable <= 1
  ) {
    return {
      decision:
        "REMOVE_CANDIDATE",

      playable,
      blocked,
      network,
      errors,
      unknown,
    };
  }

  return {
    decision:
      "REVIEW",

    playable,
    blocked,
    network,
    errors,
    unknown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FRESHNESS
// ─────────────────────────────────────────────────────────────────────────────

function freshnessLimitFor(
  job,
  ageConfig,
  sundayMaxAgeDays,
) {
  if (
    job.kind ===
      "sunday-article" ||
    job.kind ===
      "sunday-podcast"
  ) {
    return Number.isFinite(
      sundayMaxAgeDays,
    )
      ? sundayMaxAgeDays
      : null;
  }

  if (
    job.kind ===
    "podcast"
  ) {
    return Number.isFinite(
      ageConfig.podcastMaxAgeDays,
    )
      ? ageConfig.podcastMaxAgeDays
      : null;
  }

  const configured =
    ageConfig
      .articleMaxAgeDays[
        job.category
      ];

  return Number.isFinite(
    configured,
  )
    ? configured
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK ONE FEED
// ─────────────────────────────────────────────────────────────────────────────

async function checkFeed(
  job,
  ageConfig,
  sundayMaxAgeDays,
) {
  const {
    kind,
    category,
    source,
  } = job;

  const isPodcast =
    kind === "podcast" ||
    kind ===
      "sunday-podcast";

  const result = {
    kind,

    category,

    name:
      source.name,

    url:
      source.url,

    status:
      null,

    items: 0,

    newestAgeDays:
      null,

    freshnessLimit:
      null,

    state:
      "OK",

    notes: [],

    samples: [],

    accessDecision:
      null,
  };

  let feed;

  try {
    feed =
      await fetchText(
        source.url,
        FEED_ACCEPT,
      );
  } catch (err) {
    if (
      isNetworkError(
        err,
      )
    ) {
      result.state =
        "NETWORK";

      result.notes.push(
        `feed network failure after ${MAX_ATTEMPTS} attempts: ${formatError(err)}`,
      );

      return result;
    }

    result.state =
      "BROKEN";

    result.notes.push(
      formatError(err),
    );

    return result;
  }

  result.status =
    feed.status;

  // HTTP 4xx is a real endpoint/feed problem.
  if (!feed.ok) {
    // 408/429/5xx were already retried.
    if (
      retryableStatus(
        feed.status,
      )
    ) {
      result.state =
        "NETWORK";

      result.notes.push(
        `feed returned transient HTTP ${feed.status} after ${MAX_ATTEMPTS} attempts`,
      );

      return result;
    }

    result.state =
      "BROKEN";

    result.notes.push(
      `RSS/feed returned HTTP ${feed.status}`,
    );

    return result;
  }

  if (
    feed.finalUrl &&
    normaliseUrl(
      feed.finalUrl,
    ) !==
      normaliseUrl(
        source.url,
      )
  ) {
    result.notes.push(
      `redirect → ${feed.finalUrl}`,
    );
  }

  const looksLikeFeed =
    /<(rss|feed|rdf:RDF)[\s>]/i.test(
      feed.body.slice(
        0,
        10_000,
      ),
    );

  if (!looksLikeFeed) {
    result.state =
      "BROKEN";

    result.notes.push(
      `response is not recognizable RSS/Atom XML${
        feed.contentType
          ? ` (${feed.contentType})`
          : ""
      }`,
    );

    return result;
  }

  result.items =
    countItems(
      feed.body,
    );

  if (
    result.items === 0
  ) {
    result.state =
      "BROKEN";

    result.notes.push(
      "feed contains 0 items",
    );

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Freshness
  // ─────────────────────────────────────────────────────────────────────────

  const newest =
    newestPubDate(
      feed.body,
    );

  const freshnessLimit =
    freshnessLimitFor(
      job,
      ageConfig,
      sundayMaxAgeDays,
    );

  result.freshnessLimit =
    freshnessLimit;

  if (newest) {
    result.newestAgeDays =
      Math.max(
        0,
        Math.floor(
          (
            Date.now() -
            newest
          ) /
            DAY_MS,
        ),
      );

    if (
      Number.isFinite(
        freshnessLimit,
      ) &&
      result.newestAgeDays >
        freshnessLimit
    ) {
      result.state =
        "STALE";

      result.notes.push(
        `newest item is ${result.newestAgeDays}d old; production window is ${freshnessLimit}d`,
      );
    } else if (
      freshnessLimit ===
      null
    ) {
      result.notes.push(
        "freshness window unavailable; STALE classification skipped",
      );
    }
  } else {
    result.notes.push(
      "no parseable publication date found",
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deep
  // ─────────────────────────────────────────────────────────────────────────

  if (DEEP) {
    const samples =
      deterministicSamples(
        feed.body,
        isPodcast,
      );

    if (
      samples.length === 0
    ) {
      if (
        result.state ===
        "OK"
      ) {
        result.state =
          "WARN";
      }

      result.notes.push(
        "could not extract an eligible content URL from the feed",
      );

      return result;
    }

    // IMPORTANT:
    // sequential within a feed.
    //
    // Outer feed concurrency is already 2.
    // This means max deep page concurrency remains roughly 2, not 2 × 3.
    for (
      const sample of
        samples
    ) {
      if (isPodcast) {
        result.samples.push(
          await checkPodcastSample(
            sample,
          ),
        );
      } else {
        result.samples.push(
          await checkArticleSample(
            sample,
          ),
        );
      }
    }

    if (isPodcast) {
      result.accessDecision =
        summarizePodcastSamples(
          result.samples,
        );
    } else {
      result.accessDecision =
        summarizeArticleSamples(
          result.samples,
        );
    }

    const decision =
      result.accessDecision
        .decision;

    if (
      decision ===
      "REMOVE_PAYWALL" ||
      decision ===
      "REMOVE_CANDIDATE"
    ) {
      if (
        result.state ===
        "OK"
      ) {
        result.state =
          "WARN";
      }
    }

    if (
      decision ===
        "REVIEW" &&
      result.state ===
        "OK"
    ) {
      // Distinguish network-only uncertainty.
      const networkSamples =
        result.samples.filter(
          (sample) =>
            sample.access ===
            "NETWORK",
        ).length;

      if (
        networkSamples ===
        result.samples.length
      ) {
        result.state =
          "NETWORK";
      } else {
        result.state =
          "WARN";
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE LIST HYGIENE
// ─────────────────────────────────────────────────────────────────────────────

function lintSources(
  articles,
  podcasts,
  sundayArticles,
  sundayPodcasts,
) {
  const problems = [];

  const registry = {
    article: {
      urlToName:
        new Map(),

      nameToUrls:
        new Map(),
    },

    podcast: {
      urlToName:
        new Map(),

      nameToUrls:
        new Map(),
    },
  };

  function registerList(
    medium,
    category,
    list,
  ) {
    const {
      urlToName,
      nameToUrls,
    } =
      registry[medium];

    const seenUrls =
      new Set();

    for (
      const source of list
    ) {
      if (
        !source?.name ||
        !source?.url
      ) {
        problems.push(
          `INVALID ${medium} · ${category} · missing name/url`,
        );

        continue;
      }

      const url =
        normaliseUrl(
          source.url,
        );

      if (
        seenUrls.has(
          url,
        )
      ) {
        problems.push(
          `DUPLICATE ${medium} · ${category} · "${source.name}" listed twice`,
        );
      }

      seenUrls.add(
        url,
      );

      const existingName =
        urlToName.get(
          url,
        );

      if (
        existingName &&
        existingName !==
          source.name
      ) {
        problems.push(
          `NAME CLASH ${medium} · ${url} appears as "${existingName}" and "${source.name}"`,
        );
      } else {
        urlToName.set(
          url,
          source.name,
        );
      }

      const nameKey =
        normaliseName(
          source.name,
        );

      const urls =
        nameToUrls.get(
          nameKey,
        ) ??
        new Set();

      urls.add(
        url,
      );

      nameToUrls.set(
        nameKey,
        urls,
      );
    }
  }

  for (
    const [
      category,
      list,
    ] of Object.entries(
      articles,
    )
  ) {
    registerList(
      "article",
      category,
      list,
    );
  }

  for (
    const [
      category,
      list,
    ] of Object.entries(
      podcasts,
    )
  ) {
    registerList(
      "podcast",
      category,
      list,
    );
  }

  registerList(
    "article",
    "sunday",
    sundayArticles,
  );

  registerList(
    "podcast",
    "sunday",
    sundayPodcasts,
  );

  for (
    const [
      medium,
      data,
    ] of Object.entries(
      registry,
    )
  ) {
    for (
      const [
        name,
        urls,
      ] of data
        .nameToUrls
        .entries()
    ) {
      if (
        urls.size > 1
      ) {
        problems.push(
          `NAME REUSE ${medium} · "${name}" uses ${urls.size} different feed URLs: ${[
            ...urls,
          ].join(" , ")}`,
        );
      }
    }
  }

  // Sunday must remain separate from weekday feeds.
  const weekdayArticleUrls =
    new Set();

  const weekdayArticleNames =
    new Set();

  for (
    const list of Object.values(
      articles,
    )
  ) {
    for (
      const source of list
    ) {
      weekdayArticleUrls.add(
        normaliseUrl(
          source.url,
        ),
      );

      weekdayArticleNames.add(
        normaliseName(
          source.name,
        ),
      );
    }
  }

  const weekdayPodcastUrls =
    new Set();

  const weekdayPodcastNames =
    new Set();

  for (
    const list of Object.values(
      podcasts,
    )
  ) {
    for (
      const source of list
    ) {
      weekdayPodcastUrls.add(
        normaliseUrl(
          source.url,
        ),
      );

      weekdayPodcastNames.add(
        normaliseName(
          source.name,
        ),
      );
    }
  }

  for (
    const source of
      sundayArticles
  ) {
    if (
      weekdayArticleUrls.has(
        normaliseUrl(
          source.url,
        ),
      ) ||
      weekdayArticleNames.has(
        normaliseName(
          source.name,
        ),
      )
    ) {
      problems.push(
        `SUNDAY OVERLAP article · "${source.name}" already exists in weekday article sources`,
      );
    }
  }

  for (
    const source of
      sundayPodcasts
  ) {
    if (
      weekdayPodcastUrls.has(
        normaliseUrl(
          source.url,
        ),
      ) ||
      weekdayPodcastNames.has(
        normaliseName(
          source.name,
        ),
      )
    ) {
      problems.push(
        `SUNDAY OVERLAP podcast · "${source.name}" already exists in weekday podcast sources`,
      );
    }
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY CONFIG VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validateCategoryConfig(
  articles,
  podcasts,
  ageConfig,
) {
  const problems = [];

  if (
    !ageConfig.loadedFrom
  ) {
    return problems;
  }

  const weekdayCategories =
    new Set([
      ...Object.keys(
        articles,
      ),

      ...Object.keys(
        podcasts,
      ),
    ]);

  for (
    const category of
      weekdayCategories
  ) {
    if (
      !Number.isFinite(
        ageConfig
          .articleMaxAgeDays[
            category
          ],
      )
    ) {
      problems.push(
        `CATEGORY CONFIG missing ARTICLE_MAX_AGE_DAYS for "${category}"`,
      );
    }
  }

  for (
    const category of
      Object.keys(
        ageConfig.articleMaxAgeDays,
      )
  ) {
    if (
      !weekdayCategories.has(
        category,
      )
    ) {
      problems.push(
        `CATEGORY CONFIG has unused category "${category}"`,
      );
    }
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB BUILDING
// ─────────────────────────────────────────────────────────────────────────────

function kindAllowed(kind) {
  if (
    !KIND_FILTER
  ) {
    return true;
  }

  if (
    KIND_FILTER ===
    "article"
  ) {
    return (
      kind === "article"
    );
  }

  if (
    KIND_FILTER ===
    "podcast"
  ) {
    return (
      kind === "podcast"
    );
  }

  if (
    KIND_FILTER ===
    "sunday"
  ) {
    return (
      kind ===
        "sunday-article" ||
      kind ===
        "sunday-podcast"
    );
  }

  return (
    kind ===
    KIND_FILTER
  );
}

function categoryAllowed(
  kind,
  category,
) {
  if (!ONLY) {
    return true;
  }

  if (
    ONLY ===
    "sunday"
  ) {
    return (
      kind ===
        "sunday-article" ||
      kind ===
        "sunday-podcast"
    );
  }

  return (
    category.toLowerCase() ===
    ONLY
  );
}

function pushMapJobs(
  jobs,
  kind,
  map,
) {
  for (
    const [
      category,
      list,
    ] of Object.entries(
      map,
    )
  ) {
    if (
      !kindAllowed(
        kind,
      ) ||
      !categoryAllowed(
        kind,
        category,
      )
    ) {
      continue;
    }

    for (
      const source of list
    ) {
      jobs.push({
        kind,
        category,
        source,
      });
    }
  }
}

function pushSundayJobs(
  jobs,
  kind,
  list,
) {
  const category =
    "sunday";

  if (
    !kindAllowed(
      kind,
    ) ||
    !categoryAllowed(
      kind,
      category,
    )
  ) {
    return;
  }

  for (
    const source of list
  ) {
    jobs.push({
      kind,
      category,
      source,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCURRENCY
// ─────────────────────────────────────────────────────────────────────────────

async function mapWithConcurrency(
  items,
  limit,
  fn,
) {
  if (
    items.length === 0
  ) {
    return [];
  }

  const output =
    new Array(
      items.length,
    );

  let cursor = 0;

  const workerCount =
    Math.min(
      limit,
      items.length,
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },

      async () => {
        while (true) {
          const index =
            cursor++;

          if (
            index >=
            items.length
          ) {
            break;
          }

          output[index] =
            await fn(
              items[index],
            );
        }
      },
    ),
  );

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

function colour(state) {
  if (AS_JSON) {
    return state;
  }

  const colours = {
    OK:
      "\x1b[32m",

    WARN:
      "\x1b[33m",

    STALE:
      "\x1b[36m",

    BROKEN:
      "\x1b[31m",

    NETWORK:
      "\x1b[35m",
  };

  return (
    `${colours[state] ?? ""}` +
    `${state.padEnd(7)}` +
    "\x1b[0m"
  );
}

function printSamples(
  result,
) {
  if (
    !result.samples?.length
  ) {
    return;
  }

  result.samples.forEach(
    (
      sample,
      index,
    ) => {
      if (
        result.kind ===
          "podcast" ||
        result.kind ===
          "sunday-podcast"
      ) {
        console.log(
          `       [${index + 1}] ${sample.access.padEnd(14)} ${sample.title}`,
        );

        console.log(
          `           ${sample.reason ?? ""}`,
        );

        if (
          sample.audioUrl
        ) {
          console.log(
            `           audio: ${sample.audioUrl}`,
          );
        } else if (
          sample.pageUrl
        ) {
          console.log(
            `           page: ${sample.pageUrl}`,
          );
        }
      } else {
        console.log(
          `       [${index + 1}] ${sample.access.padEnd(11)} ~${sample.readableChars} chars · ${sample.title}`,
        );

        console.log(
          `           ${sample.reason ?? ""}`,
        );

        if (
          sample.markers?.length
        ) {
          console.log(
            `           markers: ${sample.markers.join(", ")}`,
          );
        }

        console.log(
          `           ${sample.url}`,
        );
      }
    },
  );
}

function printActionGroup(
  title,
  items,
  detail,
) {
  if (
    !items.length
  ) {
    return;
  }

  console.log(
    `\n── ${title} ${"─".repeat(
      Math.max(
        0,
        68 -
          title.length,
      ),
    )}`,
  );

  for (
    const result of items
  ) {
    console.log(
      `  ${result.kind} · ${result.category} · "${result.name}"`,
    );

    const message =
      detail?.(
        result,
      );

    if (message) {
      console.log(
        `       ↳ ${message}`,
      );
    }

    printSamples(
      result,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const sources =
    await loadSources();

  const ageConfig =
    await loadAgeWindows();

  const jobs = [];

  pushMapJobs(
    jobs,
    "article",
    sources.articles,
  );

  pushMapJobs(
    jobs,
    "podcast",
    sources.podcasts,
  );

  pushSundayJobs(
    jobs,
    "sunday-article",
    sources.sundayArticles,
  );

  pushSundayJobs(
    jobs,
    "sunday-podcast",
    sources.sundayPodcasts,
  );

  const lint =
    lintSources(
      sources.articles,
      sources.podcasts,
      sources.sundayArticles,
      sources.sundayPodcasts,
    );

  const categoryProblems =
    validateCategoryConfig(
      sources.articles,
      sources.podcasts,
      ageConfig,
    );

  if (!AS_JSON) {
    console.log(
      `Source: ${SOURCE_FILE}`,
    );

    console.log(
      ageConfig.loadedFrom
        ? `Freshness: ${ageConfig.loadedFrom}`
        : "Freshness: NOT LOADED — STALE classification disabled",
    );

    if (
      ageConfig.loadedFrom
    ) {
      console.log(
        `Podcast window: ${ageConfig.podcastMaxAgeDays}d`,
      );
    }

    console.log(
      `Sunday window: ${sources.sundayMaxAgeDays}d`,
    );

    console.log(
      `Checking ${jobs.length} feeds${
        DEEP
          ? ` (deep, ${SAMPLE_COUNT} deterministic recent samples)`
          : ""
      }`,
    );

    console.log(
      `Concurrency: ${CONCURRENCY}`,
    );

    console.log(
      `Retries: ${MAX_ATTEMPTS - 1}`,
    );

    console.log(
      `Timeout: ${TIMEOUT_MS / 1000}s\n`,
    );
  }

  const results =
    await mapWithConcurrency(
      jobs,
      CONCURRENCY,

      (job) =>
        checkFeed(
          job,
          ageConfig,
          sources.sundayMaxAgeDays,
        ),
    );

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          sourceFile:
            SOURCE_FILE,

          freshnessConfig:
            ageConfig.loadedFrom,

          podcastMaxAgeDays:
            ageConfig.podcastMaxAgeDays,

          sundayMaxAgeDays:
            sources.sundayMaxAgeDays,

          configWarnings:
            ageConfig.warnings,

          categoryProblems,

          lint,

          results,
        },

        null,
        2,
      ),
    );

    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────

  let currentGroup =
    "";

  for (
    const result of results
  ) {
    const group =
      `${result.kind} · ${result.category}`;

    if (
      group !==
      currentGroup
    ) {
      currentGroup =
        group;

      console.log(
        `\n── ${group} ${"─".repeat(
          Math.max(
            0,
            62 -
              group.length,
          ),
        )}`,
      );
    }

    const age =
      result.newestAgeDays ===
      null
        ? "  ?"
        : `${String(
            result.newestAgeDays,
          ).padStart(
            3,
          )}d`;

    console.log(
      `  ${colour(
        result.state,
      )} ` +
        `${String(
          result.items,
        ).padStart(
          4,
        )} items ` +
        `newest ${age}  ` +
        `${result.name}`,
    );

    for (
      const note of
        result.notes
    ) {
      console.log(
        `         ↳ ${note}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────

  const counts =
    results.reduce(
      (
        acc,
        result,
      ) => {
        acc[
          result.state
        ] =
          (
            acc[
              result.state
            ] ?? 0
          ) + 1;

        return acc;
      },

      {},
    );

  console.log(
    "\n══════════════════════════════════════════════════════════════════",
  );

  console.log(
    "SUMMARY",
  );

  console.log(
    "══════════════════════════════════════════════════════════════════",
  );

  console.log(
    `${counts.OK ?? 0} OK · ` +
      `${counts.WARN ?? 0} WARN · ` +
      `${counts.STALE ?? 0} STALE · ` +
      `${counts.NETWORK ?? 0} NETWORK · ` +
      `${counts.BROKEN ?? 0} BROKEN`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  if (
    ageConfig.warnings.length
  ) {
    console.log(
      "\n── CONFIG NOTES ─────────────────────────────────────────────────",
    );

    for (
      const warning of
        ageConfig.warnings
    ) {
      console.log(
        `  ${warning}`,
      );
    }
  }

  if (
    categoryProblems.length
  ) {
    console.log(
      "\n── FIX - CATEGORY CONFIGURATION ─────────────────────────────────",
    );

    for (
      const problem of
        categoryProblems
    ) {
      console.log(
        `  ${problem}`,
      );
    }
  }

  if (lint.length) {
    console.log(
      "\n── FIX - SOURCE LIST HYGIENE ────────────────────────────────────",
    );

    for (
      const problem of lint
    ) {
      console.log(
        `  ${problem}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BROKEN FEEDS
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "FIX - FEED / RSS",
    results.filter(
      (result) =>
        result.state ===
        "BROKEN",
    ),

    (result) =>
      result.notes[0] ??
      "broken feed",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // NETWORK
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "RETRY - NETWORK / TIMEOUT / TRANSIENT",
    results.filter(
      (result) =>
        result.state ===
        "NETWORK",
    ),

    (result) =>
      result.notes[0] ??
      "network problem",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DEFINITE PAYWALL
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "KALDIR - PAYMENT / SUBSCRIPTION WALL",
    results.filter(
      (result) =>
        result
          .accessDecision
          ?.decision ===
        "REMOVE_PAYWALL",
    ),

    (result) => {
      const decision =
        result.accessDecision;

      if (
        result.kind ===
          "podcast" ||
        result.kind ===
          "sunday-podcast"
      ) {
        return (
          `${decision.playable ?? 0}/${result.samples.length} playable · ` +
          `${decision.blocked ?? 0} blocked`
        );
      }

      return (
        `${decision.readable ?? 0}/${result.samples.length} readable · ` +
        `${decision.blocked ?? 0} blocked`
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // REMOVE CANDIDATES
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "KALDIR? - MIXED ACCESS / MANUEL KONTROL",
    results.filter(
      (result) =>
        result
          .accessDecision
          ?.decision ===
        "REMOVE_CANDIDATE",
    ),

    (result) => {
      const decision =
        result.accessDecision;

      if (
        result.kind ===
          "podcast" ||
        result.kind ===
          "sunday-podcast"
      ) {
        return (
          `${decision.playable ?? 0}/${result.samples.length} playable · ` +
          `${decision.blocked ?? 0} blocked`
        );
      }

      return (
        `${decision.readable ?? 0}/${result.samples.length} readable · ` +
        `${decision.blocked ?? 0} blocked`
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MIXED BUT KEEP
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "KALSIN - 2/3 OK, MIXED ACCESS",
    results.filter(
      (result) =>
        result
          .accessDecision
          ?.decision ===
        "KEEP_MIXED",
    ),

    (result) => {
      const decision =
        result.accessDecision;

      if (
        result.kind ===
          "podcast" ||
        result.kind ===
          "sunday-podcast"
      ) {
        return (
          `${decision.playable ?? 0}/${result.samples.length} playable`
        );
      }

      return (
        `${decision.readable ?? 0}/${result.samples.length} readable`
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STALE
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "KALSIN - GÜN KRİTERİ / ŞU ANDA ADAY ÜRETMİYOR",
    results.filter(
      (result) =>
        result.state ===
        "STALE",
    ),

    (result) =>
      result.notes.find(
        (note) =>
          note.includes(
            "production window",
          ),
      ) ??
      "currently outside production freshness window",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // UNKNOWN / BOT / PARSER
  // ─────────────────────────────────────────────────────────────────────────

  printActionGroup(
    "REVIEW - BOT PROTECTION / UNKNOWN ACCESS",
    results.filter(
      (result) =>
        result
          .accessDecision
          ?.decision ===
        "REVIEW" &&
        result.state !==
          "NETWORK",
    ),

    (result) => {
      const d =
        result.accessDecision;

      if (
        result.kind ===
          "podcast" ||
        result.kind ===
          "sunday-podcast"
      ) {
        return (
          `${d.playable ?? 0}/${result.samples.length} playable · ` +
          `${d.blocked ?? 0} blocked · ` +
          `${d.network ?? 0} network · ` +
          `${d.errors ?? 0} errors · ` +
          `${d.unknown ?? 0} unknown`
        );
      }

      return (
        `${d.readable ?? 0}/${result.samples.length} readable · ` +
        `${d.blocked ?? 0} blocked · ` +
        `${d.network ?? 0} network · ` +
        `${d.errors ?? 0} errors · ` +
        `${d.unknown ?? 0} unknown`
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CLEAN KEEP
  // ─────────────────────────────────────────────────────────────────────────

  if (DEEP) {
    const keep =
      results.filter(
        (result) =>
          result
            .accessDecision
            ?.decision ===
          "KEEP",
      );

    if (
      keep.length
    ) {
      console.log(
        `\n── KALSIN - 3/3 ACCESSIBLE (${keep.length}) ${"─".repeat(31)}`,
      );

      for (
        const result of
          keep
      ) {
        console.log(
          `  ${result.kind} · ${result.category} · "${result.name}"`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXIT
  // ─────────────────────────────────────────────────────────────────────────

  const hasBroken =
    results.some(
      (result) =>
        result.state ===
        "BROKEN",
    );

  const hasWarn =
    results.some(
      (result) =>
        result.state ===
        "WARN",
    );

  if (
    hasBroken ||
    categoryProblems.length >
      0 ||
    (
      STRICT &&
      lint.length > 0
    ) ||
    (
      FAIL_ON_WARN &&
      hasWarn
    )
  ) {
    process.exitCode = 1;
  }
}

main().catch(
  (err) => {
    console.error(
      "Feed checker failed:",
      formatError(err),
    );

    process.exit(1);
  },
);