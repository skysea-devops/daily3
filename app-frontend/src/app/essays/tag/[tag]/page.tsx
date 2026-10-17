// src/app/essays/tag/[tag]/page.tsx
// Bir kategorideki denemeler. Yalnızca denemesi olan kategoriler için üretilir.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import EssaysCta from "@/components/essays/EssaysCta";
import { Archive } from "@/components/essays/EssayRow";
import { archiveGroups, essaysByTag, tagsWithCounts } from "@/lib/essays";
import { getCategory, type CategoryId } from "@/lib/categories";
import styles from "../../essays.module.css";

type Props = { params: Promise<{ tag: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return tagsWithCounts().map((t) => ({ tag: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const category = getCategory(tag);
  if (!category) return {};
  const title = `${category.label} essays — Cogletta`;
  return {
    title,
    description: `Cogletta essays on ${category.label.toLowerCase()}. ${category.description}`,
    alternates: {
      canonical: `/essays/tag/${tag}/`,
      types: { "application/rss+xml": [{ url: "/essays/rss.xml", title: "Cogletta Essays" }] },
    },
    openGraph: { title, url: `/essays/tag/${tag}/`, type: "website" },
  };
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const category = getCategory(tag);
  if (!category) notFound();
  const essays = essaysByTag(category.id as CategoryId);
  if (essays.length === 0) notFound();

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <p style={{ marginBottom: 28 }}>
          <Link href="/essays/" style={{ fontSize: "0.875rem", color: "var(--ink-muted)", textDecoration: "none" }}>
            ← All essays
          </Link>
        </p>
        <p className={styles.eyebrow}>Topic</p>
        <h1 className={styles.h1}>
          <span aria-hidden="true">{category.emoji}</span> {category.label}
        </h1>
        <p className={styles.intro}>{category.description}</p>
        <p className={styles.meta}>
          {essays.length} {essays.length === 1 ? "essay" : "essays"}
        </p>

        <section className={styles.section}>
          <Archive groups={archiveGroups(essays)} />
        </section>

        <EssaysCta topicLabel={category.label} />
      </main>
    </>
  );
}
