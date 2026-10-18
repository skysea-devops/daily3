// app-frontend/scripts/essays/lib.mjs
//
// Deneme içerik hattının ortak kodu: content/essays/*.md → blok listesi.
//
// NEDEN MDX DEĞİL: MDX içeriği JS modülüne derler; kilitli bölümler JS bundle'ına
// girerdi. Burada markdown build ÖNCESİNDE düz veriye (blok listesi) çevrilir;
// kilitli kısım yalnızca .essays-private/ altına yazılır, Next.js onu hiç görmez.
//
// Desteklenen blok tipleri (mevcut tasarımın birebir karşılığı):
//   paragraf               → { type: "p",     text }
//   ## Başlık              → { type: "h2",    text }
//   > alıntı + "— Kaynak"  → { type: "quote", text, cite? }
//   - madde listesi        → { type: "ul",    items }
//   ![alt](src "alt yazı") → { type: "img",   src, alt, caption? }   (paragrafta TEK başına)
//   <!-- paywall -->       → önizleme kesim noktası (blok üretmez)
// Bunların dışındaki her şey (kalın/italik, link, kod, tablo, ### ...) build'i durdurur:
// sessizce farklı render etmektense yazara açık hata vermek daha güvenli.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";

export const WORDS_PER_MINUTE = 225;
export const PREVIEW_RATIO = 0.3;
export const PAYWALL_MARKER = "paywall";

export class EssayError extends Error {
  constructor(file, message) {
    super(`[essays] ${file}: ${message}`);
  }
}

/** src/lib/categories.ts içindeki CategoryId birleşiminden geçerli etiketler. */
export function readCategoryIds(categoriesFile) {
  const src = fs.readFileSync(categoriesFile, "utf8");
  const union = src.match(/export type CategoryId\s*=([^;]+);/);
  if (!union) throw new Error(`[essays] CategoryId type not found in ${categoriesFile}`);
  const ids = [...union[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error("[essays] no category ids parsed");
  return new Set(ids);
}

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inlineText(nodes, file) {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.value;
    else if (node.type === "break") out += "\n";
    else {
      throw new EssayError(
        file,
        `inline "${node.type}" is not supported (line ${node.position?.start.line}). ` +
          "Use plain text; bold/italic/links are not part of the essay style yet.",
      );
    }
  }
  // Paragraf içi yumuşak satır sonu tek boşluktur (markdown davranışı).
  return out.replace(/\s*\n\s*/g, " ").trim();
}

/** Markdown gövdesi → { blocks, paywallIndex } (paywallIndex: işaretten ÖNCEKİ blok sayısı ya da null). */
export function parseBody(markdown, file) {
  const tree = unified().use(remarkParse).parse(markdown);
  const blocks = [];
  let paywallIndex = null;

  for (const node of tree.children) {
    switch (node.type) {
      case "paragraph": {
        const onlyImage =
          node.children.length === 1 && node.children[0].type === "image";
        if (onlyImage) {
          const img = node.children[0];
          if (!img.alt) throw new EssayError(file, `image ${img.url} needs alt text`);
          blocks.push({
            type: "img",
            src: img.url,
            alt: img.alt,
            ...(img.title ? { caption: img.title } : {}),
          });
        } else {
          blocks.push({ type: "p", text: inlineText(node.children, file) });
        }
        break;
      }
      case "heading": {
        if (node.depth !== 2) {
          throw new EssayError(file, `only "## " headings are supported (line ${node.position?.start.line})`);
        }
        blocks.push({ type: "h2", text: inlineText(node.children, file) });
        break;
      }
      case "blockquote": {
        const paras = node.children.map((child) => {
          if (child.type !== "paragraph") {
            throw new EssayError(file, `blockquote may only contain paragraphs (line ${child.position?.start.line})`);
          }
          return inlineText(child.children, file);
        });
        let cite;
        const last = paras[paras.length - 1];
        if (paras.length > 1 && /^—\s+/.test(last)) {
          cite = last.replace(/^—\s+/, "");
          paras.pop();
        }
        blocks.push({ type: "quote", text: paras.join("\n\n"), ...(cite ? { cite } : {}) });
        break;
      }
      case "list": {
        if (node.ordered) throw new EssayError(file, "ordered lists are not supported, use \"- \"");
        const items = node.children.map((li) => {
          if (li.children.length !== 1 || li.children[0].type !== "paragraph") {
            throw new EssayError(file, `list items must be a single line of text (line ${li.position?.start.line})`);
          }
          return inlineText(li.children[0].children, file);
        });
        blocks.push({ type: "ul", items });
        break;
      }
      case "html": {
        const comment = node.value.trim().match(/^<!--\s*([\w-]+)\s*-->$/);
        if (comment && comment[1].toLowerCase() === PAYWALL_MARKER) {
          if (paywallIndex !== null) throw new EssayError(file, "only one <!-- paywall --> marker is allowed");
          paywallIndex = blocks.length;
          break;
        }
        throw new EssayError(file, `raw HTML is not supported (line ${node.position?.start.line})`);
      }
      default:
        throw new EssayError(file, `markdown "${node.type}" is not supported (line ${node.position?.start.line})`);
    }
  }

  if (blocks.length === 0) throw new EssayError(file, "essay body is empty");
  return { blocks, paywallIndex };
}

export function blockWords(block) {
  const text =
    block.type === "ul" ? block.items.join(" ")
    : block.type === "img" ? block.caption ?? ""
    : `${block.text} ${block.cite ?? ""}`;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Önizlemede kaç blok kalacağı.
 * İşaret varsa onun yeri; yoksa toplam kelimenin ~%30'una ulaşılan ilk PARAGRAFIN sonu.
 * Her zaman en az 1 blok gösterilir ve en az 1 blok kilitli kalır.
 */
export function previewLength(blocks, paywallIndex, file) {
  if (paywallIndex !== null) {
    if (paywallIndex < 1 || paywallIndex >= blocks.length) {
      throw new EssayError(file, "<!-- paywall --> must have content both before and after it");
    }
    return paywallIndex;
  }
  const total = blocks.reduce((sum, b) => sum + blockWords(b), 0);
  let running = 0;
  for (let i = 0; i < blocks.length; i++) {
    running += blockWords(blocks[i]);
    if (blocks[i].type === "p" && running >= total * PREVIEW_RATIO) {
      return Math.min(i + 1, blocks.length - 1);
    }
  }
  return Math.max(1, Math.floor(blocks.length * PREVIEW_RATIO));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** /essays/<bu>/ altında başka sayfalar var: deneme slug'ı olamaz. */
const RESERVED_SLUGS = new Set(["tag", "series", "og"]);

function req(data, key, file) {
  const value = data[key];
  if (value === undefined || value === null || value === "") {
    throw new EssayError(file, `frontmatter "${key}" is required`);
  }
  return value;
}

/** Tek bir .md dosyasını doğrulanmış bir deneme kaydına çevirir. */
export function loadEssayFile(filePath, categoryIds) {
  const file = path.basename(filePath);
  const slug = file.replace(/\.md$/, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new EssayError(file, "file name must be the URL slug (lowercase, digits, dashes)");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new EssayError(file, `"${slug}" is reserved by /essays/${slug}/ routes; pick another file name`);
  }

  const { data, content } = matter(fs.readFileSync(filePath, "utf8"));

  const title = String(req(data, "title", file));
  const description = String(req(data, "description", file));
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(req(data, "date", file));
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new EssayError(file, `date must be YYYY-MM-DD (got "${date}")`);
  }

  const tags = data.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new EssayError(file, "frontmatter \"tags\" must be a non-empty list of category ids");
  }
  for (const tag of tags) {
    if (!categoryIds.has(tag)) {
      throw new EssayError(file, `unknown tag "${tag}". Allowed: ${[...categoryIds].join(", ")}`);
    }
  }

  const access = data.access ?? "pro";
  if (access !== "free" && access !== "pro") {
    throw new EssayError(file, `access must be "free" or "pro" (got "${access}")`);
  }

  const coverImage = data.coverImage ? String(data.coverImage) : undefined;
  const coverCredit = data.coverCredit ? String(data.coverCredit) : undefined;
  // Opsiyonel sosyal paylaşım görseli (1200×630). Kapak 1,91:1'den çok farklıysa
  // (ör. çok geniş ya da kareye yakın bir eser) paylaşımda kırpılmasın diye.
  const ogImage = data.ogImage ? String(data.ogImage) : undefined;
  if (ogImage && !ogImage.startsWith("/essays/")) {
    throw new EssayError(file, `ogImage must be a site path under /essays/ (got "${ogImage}")`);
  }
  if (coverImage && !coverCredit) {
    // Uyarı, hata değil: kendi ürettiğin görsellerde kredi gerekmeyebilir.
    // Başkasına ait (kamu malı dahil) her görselde coverCredit YAZILMALI (README).
    console.warn(`[essays] ${file}: coverImage has no coverCredit (fine for your own artwork; required for anyone else's)`);
  }

  let series;
  let seriesPart;
  if (data.series !== undefined) {
    series = String(data.series);
    seriesPart = Number(data.seriesPart);
    if (!Number.isInteger(seriesPart) || seriesPart < 1) {
      throw new EssayError(file, "seriesPart (1, 2, 3 ...) is required when series is set");
    }
  } else if (data.seriesPart !== undefined) {
    throw new EssayError(file, "seriesPart is set but series is missing");
  }

  let author;
  if (data.author !== undefined) {
    const a = data.author;
    if (!a || typeof a !== "object" || !a.name || !a.role) {
      throw new EssayError(file, "author must have at least name and role");
    }
    author = {
      name: String(a.name),
      role: String(a.role),
      ...(a.avatar ? { avatar: String(a.avatar) } : {}),
      ...(a.url ? { url: String(a.url) } : {}),
    };
  }

  const { blocks, paywallIndex } = parseBody(content, file);
  if (access === "free" && paywallIndex !== null) {
    throw new EssayError(file, "<!-- paywall --> has no effect on a free essay; remove it or set access: pro");
  }

  const wordCount = blocks.reduce((sum, b) => sum + blockWords(b), 0);
  const readingMinutes =
    data.readingMinutes !== undefined
      ? Number(data.readingMinutes)
      : Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
  if (!Number.isInteger(readingMinutes) || readingMinutes < 1) {
    throw new EssayError(file, "readingMinutes must be a positive integer");
  }

  const cut = access === "pro" ? previewLength(blocks, paywallIndex, file) : blocks.length;

  return {
    slug,
    title,
    description,
    date,
    readingMinutes,
    ...(coverImage
      ? {
          coverImage,
          ...(coverCredit ? { coverCredit } : {}),
          // Kapak gövdede de kullanılıyorsa (önizlemede ya da kilitli bölümde)
          // deneme sayfası onu üstte TEKRAR göstermez: mevcut denemelerin
          // tasarımı değişmesin, görsel iki kez çıkmasın.
          coverInBody: blocks.some((b) => b.type === "img" && b.src === coverImage),
        }
      : {}),
    ...(ogImage ? { ogImage } : {}),
    ...(author ? { author } : {}),
    tags,
    ...(series ? { series, seriesSlug: slugify(series), seriesPart } : {}),
    access,
    /** Herkese açık bloklar: free'de tamamı, pro'da yalnızca önizleme. */
    publicBlocks: blocks.slice(0, cut),
    /** Kilitli bloklar: free'de boş. ASLA public çıktıya yazılmaz. */
    lockedBlocks: blocks.slice(cut),
  };
}

/** content/essays altındaki tüm denemeler, en yeniden eskiye. */
export function loadAllEssays(contentDir, categoriesFile) {
  const categoryIds = readCategoryIds(categoriesFile);
  const files = fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  const essays = files.map((f) => loadEssayFile(path.join(contentDir, f), categoryIds));

  const seriesParts = new Map();
  for (const e of essays) {
    if (!e.series) continue;
    const key = `${e.seriesSlug}#${e.seriesPart}`;
    if (seriesParts.has(key)) {
      throw new Error(`[essays] series "${e.series}" part ${e.seriesPart} is used by both ${seriesParts.get(key)} and ${e.slug}`);
    }
    seriesParts.set(key, e.slug);
  }

  return essays.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}
