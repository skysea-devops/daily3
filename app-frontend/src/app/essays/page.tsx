// src/app/essays/page.tsx
// Deneme yayınının ana sayfası (statik). Sıra: öne çıkan en yeni deneme →
// konuya göre gezinme → seriler → yıl/ay arşivi → kayıt kutusu.

import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ShareCard from "@/components/ShareCard";
import EssaysCta from "@/components/essays/EssaysCta";
import { Archive } from "@/components/essays/EssayRow";
import {
  ESSAYS,
  allSeries,
  archiveGroups,
  essayAuthor,
  formatDate,
  tagLabel,
  tagsWithCounts,
} from "@/lib/essays";
import styles from "./essays.module.css";

const DESCRIPTION =
  "Long-form writing on reading, attention, philosophy and the quiet habits of a curious life. Old ideas, turned toward the way we live now.";

export const metadata: Metadata = {
  title: "Essays — Cogletta",
  description: DESCRIPTION,
  alternates: {
    canonical: "/essays/",
    types: { "application/rss+xml": [{ url: "/essays/rss.xml", title: "Cogletta Essays" }] },
  },
  openGraph: {
    title: "Essays — Cogletta",
    description: DESCRIPTION,
    url: "/essays/",
    type: "website",
  },
};

function RssIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="3" cy="13" r="2" fill="currentColor" />
      <path d="M1 7a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M1 2a13 13 0 0 1 13 13" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

export default function EssaysPage() {
  const [featured] = ESSAYS;
  const topics = tagsWithCounts();
  const series = allSeries();

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Cogletta Essays</p>
            <h1 className={styles.h1}>Essays</h1>
            <p className={styles.intro}>{DESCRIPTION}</p>
          </div>
          <div className={styles.headMeta}>
            <span>
              {ESSAYS.length} {ESSAYS.length === 1 ? "essay" : "essays"}
            </span>
            <a className={styles.rss} href="/essays/rss.xml" title="Subscribe via RSS">
              <RssIcon />
              RSS
            </a>
          </div>
        </div>

        {featured && (
          <article className={`${styles.featured} ${featured.coverImage ? "" : styles.featuredNoCover}`}>
            {featured.coverImage && (
              <figure style={{ margin: 0 }}>
                <Link href={`/essays/${featured.slug}/`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.cover} src={featured.coverImage} alt="" />
                </Link>
                {featured.coverCredit && <figcaption className={styles.credit}>{featured.coverCredit}</figcaption>}
              </figure>
            )}
            <div>
              <div className={styles.kicker}>
                {featured.tags.map((t) => (
                  <Link key={t} href={`/essays/tag/${t}/`} className={styles.tag}>
                    {tagLabel(t)}
                  </Link>
                ))}
                {featured.seriesSlug && (
                  <Link href={`/essays/series/${featured.seriesSlug}/`} className={styles.seriesTag}>
                    {featured.series} · Part {featured.seriesPart}
                  </Link>
                )}
              </div>
              <h2 className={styles.featuredTitle}>
                <Link href={`/essays/${featured.slug}/`}>{featured.title}</Link>
              </h2>
              <p className={styles.desc}>{featured.description}</p>
              <p className={styles.meta}>
                <time dateTime={featured.date}>{formatDate(featured.date)}</time> · {featured.readingMinutes} min read ·{" "}
                {essayAuthor(featured).name}
              </p>
              <Link href={`/essays/${featured.slug}/`} className={styles.read}>
                Read essay →
              </Link>
            </div>
          </article>
        )}

        {topics.length > 0 && (
          <section className={styles.section} aria-labelledby="topics-label">
            <p className={styles.label} id="topics-label">
              Browse by topic
            </p>
            <div className={styles.chips}>
              {topics.map((t) => (
                <Link key={t.id} href={`/essays/tag/${t.id}/`} className={styles.chip}>
                  <span aria-hidden="true">{t.emoji}</span> {t.label} <span className={styles.chipCount}>{t.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {series.length > 0 && (
          <section className={styles.section} aria-labelledby="series-label">
            <p className={styles.label} id="series-label">
              Series
            </p>
            <div style={{ display: "grid", gap: 16 }}>
              {series.map((s) => {
                const cover = s.parts.find((p) => p.coverImage)?.coverImage;
                return (
                  <div key={s.slug} className={`${styles.series} ${cover ? "" : styles.seriesNoCover}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover && <img className={styles.seriesCover} src={cover} alt="" />}
                    <div className={styles.seriesBody}>
                      <h3 className={styles.seriesTitle}>
                        <Link href={`/essays/series/${s.slug}/`}>{s.title}</Link>
                      </h3>
                      <ol className={styles.parts}>
                        {s.parts.map((p) => (
                          <li key={p.slug} className={styles.part}>
                            <span className={styles.partNo}>Part {p.seriesPart}</span>
                            <Link href={`/essays/${p.slug}/`} className={styles.partLink}>
                              {p.title}
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className={styles.section} aria-labelledby="archive-label">
          <p className={styles.label} id="archive-label">
            Archive
          </p>
          <Archive groups={archiveGroups()} />
        </section>

        <EssaysCta />

        <div style={{ marginTop: 40 }}>
          <ShareCard compact />
        </div>
      </main>
    </>
  );
}
