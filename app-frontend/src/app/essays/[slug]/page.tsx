// src/app/essays/[slug]/page.tsx
// Server component. `output: "export"` ile her slug build'de statik HTML'e
// dönüşür (metadata + JSON-LD dahil).
//
// access: "pro" denemelerde statik HTML YALNIZCA önizlemeyi içerir — ilk 7 gün
// bile. 7 gün dolunca CDN'deki dosya yeni bir deploy'a kadar değişmezdi; tam
// metin statik çıktıya hiç girmez. Kalan bölümü <EssayContinuation> tarayıcıda
// GET /essays/{slug}/body ile getirir (yetkiyi sunucu belirler).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import ShareCard from "@/components/ShareCard";
import EssayFooterCta from "@/components/EssayFooterCta";
import EssayBlocks from "@/components/essays/EssayBlocks";
import EssayContinuation from "@/components/essays/EssayContinuation";
import {
  ESSAYS,
  SITE_URL,
  authorInitial,
  essayAuthor,
  formatDate,
  getEssay,
  ogImageFor,
  relatedEssays,
  seriesNeighbors,
  tagLabel,
  type Author,
} from "@/lib/essays";
import styles from "../essays.module.css";

/** JSON-LD hasPart ve paywall'ın yerleştiği kapsayıcı (Google paywall yönergesi). */
const LOCKED_SELECTOR_CLASS = "essay-locked";

export function generateStaticParams() {
  return ESSAYS.map((essay) => ({ slug: essay.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const essay = getEssay(slug);
  if (!essay) return {};
  // Sosyal önizleme görseli: kapak varsa kapak, yoksa build'de başlıktan
  // üretilen PNG (/essays/og/<slug>.png). Gövdedeki img blokları buraya geçmez.
  const images = [ogImageFor(essay)];

  return {
    title: `${essay.title} — Cogletta Essays`,
    description: essay.description,
    alternates: {
      canonical: `/essays/${essay.slug}/`,
      types: { "application/rss+xml": [{ url: "/essays/rss.xml", title: "Cogletta Essays" }] },
    },
    openGraph: {
      title: essay.title,
      description: essay.description,
      url: `/essays/${essay.slug}/`,
      type: "article",
      publishedTime: essay.date,
      siteName: "Cogletta",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: essay.title,
      description: essay.description,
      images,
    },
  };
}

function AuthorByline({ author }: { author: Author }) {
  const initial = authorInitial(author);
  const name = author.url ? (
    <a href={author.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 600 }}>
      {author.name}
    </a>
  ) : (
    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{author.name}</span>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
      {author.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.avatar} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: "var(--rule)", color: "var(--ink-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Lora', serif", fontSize: "1.0625rem", fontWeight: 600,
          }}
        >
          {initial}
        </span>
      )}
      <span style={{ fontSize: "0.875rem", lineHeight: 1.45 }}>
        {name}
        <br />
        <span style={{ color: "var(--ink-muted)" }}>{author.role}</span>
      </span>
    </div>
  );
}

const sectionLabel = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--ink-muted)",
  margin: "0 0 14px",
};

export default async function EssayPage({ params }: Props) {
  const { slug } = await params;
  const essay = getEssay(slug);
  if (!essay) notFound();

  const author = essayAuthor(essay);
  const url = `${SITE_URL}/essays/${essay.slug}/`;
  const { prev, next } = seriesNeighbors(essay);
  const related = relatedEssays(essay, 3);
  const locked = essay.access === "pro";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: essay.title,
    description: essay.description,
    datePublished: essay.date,
    image: [`${SITE_URL}${ogImageFor(essay)}`],
    keywords: essay.tags.map(tagLabel).join(", "),
    author: {
      "@type": "Person",
      name: author.name,
      ...(author.url ? { url: author.url } : {}),
    },
    publisher: { "@type": "Organization", name: "Cogletta", url: SITE_URL },
    mainEntityOfPage: url,
    ...(essay.seriesSlug
      ? { isPartOf: { "@type": "CreativeWorkSeries", name: essay.series, url: `${SITE_URL}/essays/series/${essay.seriesSlug}/` } }
      : {}),
    // Google paywall yönergesi: kilitli bölüm cssSelector ile işaretlenir.
    // Googlebot da okuyucuyla AYNI önizlemeyi görür (cloaking yok).
    isAccessibleForFree: !locked,
    ...(locked
      ? {
          hasPart: {
            "@type": "WebPageElement",
            isAccessibleForFree: false,
            cssSelector: `.${LOCKED_SELECTOR_CLASS}`,
          },
        }
      : {}),
  };

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "56px 5vw 96px" }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <p style={{ marginBottom: 28 }}>
          <Link href="/essays/" style={{ fontSize: "0.875rem", color: "var(--ink-muted)", textDecoration: "none" }}>
            ← All essays
          </Link>
        </p>

        <article>
          <header>
            <div className={styles.kicker}>
              {essay.tags.map((t) => (
                <Link key={t} href={`/essays/tag/${t}/`} className={styles.tag}>
                  {tagLabel(t)}
                </Link>
              ))}
              {essay.seriesSlug && (
                <Link href={`/essays/series/${essay.seriesSlug}/`} className={styles.seriesTag}>
                  {essay.series} · Part {essay.seriesPart}
                </Link>
              )}
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
                marginBottom: 12,
              }}
            >
              <time dateTime={essay.date}>{formatDate(essay.date)}</time>
              {" · "}
              {essay.readingMinutes} min read
            </p>
            <h1
              style={{
                fontFamily: "'Lora', serif",
                fontWeight: 600,
                fontSize: "2.125rem",
                lineHeight: 1.25,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {essay.title}
            </h1>
            <AuthorByline author={author} />
          </header>

          {essay.coverImage && (
            <figure style={{ margin: "32px 0 8px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={essay.coverImage} alt="" className={styles.cover} />
              {essay.coverCredit && <figcaption className={styles.credit}>{essay.coverCredit}</figcaption>}
            </figure>
          )}

          <EssayBlocks blocks={essay.blocks} />

          {essay.hasLockedPart && (
            <div className={LOCKED_SELECTOR_CLASS}>
              <EssayContinuation slug={essay.slug} />
            </div>
          )}
        </article>

        {(prev || next) && (
          <nav aria-label="Series" style={{ marginTop: 56 }}>
            <p style={sectionLabel}>{essay.series}</p>
            <div className={styles.seriesNav}>
              {prev && (
                <Link href={`/essays/${prev.slug}/`} className={styles.seriesNavLink}>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>← Part {prev.seriesPart}</span>
                  <span style={{ display: "block", marginTop: 4, fontFamily: "'Lora', serif", fontWeight: 600 }}>{prev.title}</span>
                </Link>
              )}
              {next && (
                <Link href={`/essays/${next.slug}/`} className={`${styles.seriesNavLink} ${styles.seriesNavNext}`}>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>Part {next.seriesPart} →</span>
                  <span style={{ display: "block", marginTop: 4, fontFamily: "'Lora', serif", fontWeight: 600 }}>{next.title}</span>
                </Link>
              )}
            </div>
          </nav>
        )}

        <div style={{ margin: "40px 0" }}>
          <ShareCard compact />
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-label" style={{ marginTop: 48 }}>
            <p style={sectionLabel} id="related-label">
              Related essays
            </p>
            <div className={styles.related}>
              {related.map((r) => (
                <Link key={r.slug} href={`/essays/${r.slug}/`} className={styles.relatedCard}>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    {tagLabel(r.tags[0])} · {r.readingMinutes} min
                  </span>
                  <span style={{ display: "block", marginTop: 6, fontFamily: "'Lora', serif", fontWeight: 600, lineHeight: 1.35 }}>
                    {r.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--rule)",
            fontSize: "0.875rem",
            color: "var(--ink-muted)",
            lineHeight: 1.7,
          }}
        >
          <EssayFooterCta />
        </footer>
      </main>
    </>
  );
}
