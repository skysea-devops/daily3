// src/lib/essays.ts
//
// Deneme yayınının TİPLERİ ve YÜKLEYİCİSİ.
//
// İçerik content/essays/<slug>.md dosyalarında yaşar (yazım rehberi:
// content/essays/README.md). `npm run build` / `npm run dev` öncesinde
// scripts/essays/build.mjs bunları src/generated/essays.json'a çevirir.
//
// GÜVENLİK: Buradaki veri HERKESE AÇIKTIR. access: "pro" denemelerde `blocks`
// yalnızca önizlemeyi içerir; kilitli bölüm .essays-private/ altında durur,
// private S3'e yüklenir ve yalnızca GET /essays/{slug}/body ile servis edilir.

import generated from "@/generated/essays.json";
import { CATEGORIES, type CategoryId } from "@/lib/categories";

export type EssayBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "ul"; items: string[] }
  | { type: "img"; src: string; alt: string; caption?: string };

export interface Author {
  name: string;
  role: string;
  /** Opsiyonel. Foto yoksa ismin baş harfi daire içinde gösterilir. */
  avatar?: string;
  /** Opsiyonel. Verilirse yazar adı bu adrese link olur. */
  url?: string;
}

export type EssayAccess = "free" | "pro";

export interface Essay {
  slug: string;
  title: string;
  description: string;
  /** ISO "YYYY-MM-DD" */
  date: string;
  readingMinutes: number;
  coverImage?: string;
  coverCredit?: string;
  /** Kapak gövdede de kullanılıyor mu (öyleyse deneme sayfasında üstte gösterilmez). */
  coverInBody?: boolean;
  author?: Author;
  tags: CategoryId[];
  series?: string;
  seriesSlug?: string;
  seriesPart?: number;
  access: EssayAccess;
  /** Herkese açık bloklar (pro denemede yalnızca önizleme). */
  blocks: EssayBlock[];
  /** Önizlemeden sonra kilitli bir bölüm var mı (yalnızca pro). */
  hasLockedPart: boolean;
}

/**
 * Yazıların çoğunu Ismail yazıyor; `author` yalnızca misafir yazarda doldurulur.
 */
export const DEFAULT_AUTHOR: Author = {
  name: "Ismail Gokdeniz",
  role: "Founder of Cogletta",
  url: "https://www.linkedin.com/in/samuel80/",
};

export { FREE_WINDOW_DAYS } from "@/lib/essay-access";

/** Hiç seri yokken static export'un istediği tek yer tutucu (404 render edilir, sitemap'e girmez). */
export const NO_SERIES_PLACEHOLDER = "_none";

export const SITE_URL = "https://cogletta.com";

/** En yeniden eskiye. */
export const ESSAYS: Essay[] = generated as Essay[];

export function getEssay(slug: string): Essay | undefined {
  return ESSAYS.find((e) => e.slug === slug);
}

export function essayAuthor(essay: Essay): Author {
  return essay.author ?? DEFAULT_AUTHOR;
}

export function authorInitial(author: Author): string {
  return author.name.trim().charAt(0).toUpperCase() || "?";
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(
    "en-US",
    opts ?? { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
  );
}

export function tagLabel(tag: CategoryId): string {
  return CATEGORIES.find((c) => c.id === tag)?.label ?? tag;
}

export function tagEmoji(tag: CategoryId): string {
  return CATEGORIES.find((c) => c.id === tag)?.emoji ?? "";
}

/** Yalnızca denemesi olan kategoriler, kategori listesindeki sırayla, sayılarıyla. */
export function tagsWithCounts(): { id: CategoryId; label: string; emoji: string; count: number }[] {
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    emoji: c.emoji,
    count: ESSAYS.filter((e) => e.tags.includes(c.id)).length,
  })).filter((t) => t.count > 0);
}

export function essaysByTag(tag: CategoryId): Essay[] {
  return ESSAYS.filter((e) => e.tags.includes(tag));
}

export interface Series {
  slug: string;
  title: string;
  /** seriesPart sırasıyla */
  parts: Essay[];
}

export function allSeries(): Series[] {
  const map = new Map<string, Series>();
  for (const e of ESSAYS) {
    if (!e.seriesSlug || !e.series) continue;
    if (!map.has(e.seriesSlug)) map.set(e.seriesSlug, { slug: e.seriesSlug, title: e.series, parts: [] });
    map.get(e.seriesSlug)!.parts.push(e);
  }
  for (const s of map.values()) s.parts.sort((a, b) => (a.seriesPart ?? 0) - (b.seriesPart ?? 0));
  // En son güncellenen seri önce
  return [...map.values()].sort((a, b) =>
    b.parts[b.parts.length - 1].date.localeCompare(a.parts[a.parts.length - 1].date),
  );
}

export function getSeries(slug: string): Series | undefined {
  return allSeries().find((s) => s.slug === slug);
}

/** Seri içinde önceki / sonraki bölüm. */
export function seriesNeighbors(essay: Essay): { prev?: Essay; next?: Essay } {
  if (!essay.seriesSlug) return {};
  const parts = getSeries(essay.seriesSlug)?.parts ?? [];
  const i = parts.findIndex((p) => p.slug === essay.slug);
  return { prev: i > 0 ? parts[i - 1] : undefined, next: i >= 0 ? parts[i + 1] : undefined };
}

/** İlgili denemeler: önce aynı seri, sonra ortak etiket sayısı, sonra yenilik. */
export function relatedEssays(essay: Essay, limit = 3): Essay[] {
  return ESSAYS.filter((e) => e.slug !== essay.slug)
    .map((e) => ({
      e,
      score:
        (essay.seriesSlug && e.seriesSlug === essay.seriesSlug ? 10 : 0) +
        e.tags.filter((t) => essay.tags.includes(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.date.localeCompare(a.e.date))
    .slice(0, limit)
    .map((x) => x.e);
}

/** Arşiv: yıl → ay → denemeler (en yeniden eskiye). */
export function archiveGroups(list: Essay[] = ESSAYS): { year: string; months: { month: string; essays: Essay[] }[] }[] {
  const years: { year: string; months: { month: string; essays: Essay[] }[] }[] = [];
  for (const e of list) {
    const year = e.date.slice(0, 4);
    const month = formatDate(e.date, { month: "long", timeZone: "UTC" });
    let y = years.find((x) => x.year === year);
    if (!y) years.push((y = { year, months: [] }));
    let m = y.months.find((x) => x.month === month);
    if (!m) y.months.push((m = { month, essays: [] }));
    m.essays.push(e);
  }
  return years;
}

/** OG görseli: kapak varsa kapak, yoksa build'de başlıktan üretilen PNG. */
export function ogImageFor(essay: Essay): string {
  return essay.coverImage ?? `/essays/og/${essay.slug}.png`;
}

/** Düz metin (RSS ve JSON-LD için). */
export function blocksToPlainText(blocks: EssayBlock[]): string {
  return blocks
    .map((b) =>
      b.type === "ul" ? b.items.join("\n") : b.type === "img" ? b.caption ?? "" : b.type === "quote" ? b.text : b.text,
    )
    .filter(Boolean)
    .join("\n\n");
}
