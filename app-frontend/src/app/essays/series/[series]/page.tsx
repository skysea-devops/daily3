// src/app/essays/series/[series]/page.tsx
// Seri sayfası: bölümler sırayla.
//
// NOT: `output: "export"` boş generateStaticParams() kabul etmiyor (build hatası).
// Henüz hiç seri yokken tek bir yer tutucu ("_none") üretilir ve 404 olarak
// render edilir; sitemap'e girmez.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import EssaysCta from "@/components/essays/EssaysCta";
import { NO_SERIES_PLACEHOLDER, allSeries, formatDate, getSeries } from "@/lib/essays";
import styles from "../../essays.module.css";

type Props = { params: Promise<{ series: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  const params = allSeries().map((s) => ({ series: s.slug }));
  return params.length > 0 ? params : [{ series: NO_SERIES_PLACEHOLDER }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series } = await params;
  const s = getSeries(series);
  if (!s) return { robots: { index: false } };
  const title = `${s.title} — Cogletta Essays`;
  return {
    title,
    description: `A ${s.parts.length}-part essay series from Cogletta: ${s.parts.map((p) => p.title).join("; ")}.`,
    alternates: { canonical: `/essays/series/${s.slug}/` },
    openGraph: { title, url: `/essays/series/${s.slug}/`, type: "website" },
  };
}

export default async function SeriesPage({ params }: Props) {
  const { series } = await params;
  const s = getSeries(series);
  if (!s) notFound();

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <p style={{ marginBottom: 28 }}>
          <Link href="/essays/" style={{ fontSize: "0.875rem", color: "var(--ink-muted)", textDecoration: "none" }}>
            ← All essays
          </Link>
        </p>
        <p className={styles.eyebrow}>Series</p>
        <h1 className={styles.h1}>{s.title}</h1>
        <p className={styles.meta}>
          {s.parts.length} {s.parts.length === 1 ? "part" : "parts"}
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: "40px 0 0" }}>
          {s.parts.map((p) => (
            <li key={p.slug} className={styles.row} style={{ gridTemplateColumns: "80px 1fr auto" }}>
              <span className={styles.partNo}>Part {p.seriesPart}</span>
              <div>
                <h2 className={styles.rowTitle}>
                  <Link href={`/essays/${p.slug}/`}>{p.title}</Link>
                </h2>
                <p className={styles.rowDesc}>{p.description}</p>
                <div className={styles.rowTags}>
                  <time className={styles.day} dateTime={p.date}>
                    {formatDate(p.date)}
                  </time>
                </div>
              </div>
              <span className={styles.min}>{p.readingMinutes} min</span>
            </li>
          ))}
        </ol>

        <EssaysCta />
      </main>
    </>
  );
}
