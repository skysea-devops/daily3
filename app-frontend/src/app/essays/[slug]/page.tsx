// src/app/essays/[slug]/page.tsx
// Server component. With `output: "export"`, every slug listed by
// generateStaticParams() is pre-rendered to static HTML at build time,
// including full metadata and JSON-LD — ideal for Google and AI crawlers.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ESSAYS, getEssay, type EssayBlock } from "@/data/essays";

export function generateStaticParams() {
  return ESSAYS.map((essay) => ({ slug: essay.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const essay = getEssay(slug);
  if (!essay) return {};
  return {
    title: `${essay.title} — Cogletta Essays`,
    description: essay.description,
    alternates: { canonical: `/essays/${essay.slug}/` },
    openGraph: {
      title: essay.title,
      description: essay.description,
      url: `/essays/${essay.slug}/`,
      type: "article",
      publishedTime: essay.date,
      siteName: "Cogletta",
    },
    twitter: {
      card: "summary",
      title: essay.title,
      description: essay.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const pStyle: React.CSSProperties = {
  fontSize: "1.0625rem",
  lineHeight: 1.85,
  color: "var(--ink-soft)",
  marginTop: 22,
};

function Block({ block }: { block: EssayBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2
          style={{
            fontFamily: "'Lora', serif",
            fontWeight: 600,
            fontSize: "1.375rem",
            color: "var(--ink)",
            marginTop: 44,
          }}
        >
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <blockquote
          style={{
            margin: "32px 0",
            paddingLeft: 20,
            borderLeft: "3px solid var(--accent)",
            fontFamily: "'Lora', serif",
            fontStyle: "italic",
            fontSize: "1.1875rem",
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          {block.text}
          {block.cite && (
            <cite
              style={{
                display: "block",
                marginTop: 8,
                fontFamily: "'Inter', sans-serif",
                fontStyle: "normal",
                fontSize: "0.8125rem",
                color: "var(--ink-muted)",
              }}
            >
              — {block.cite}
            </cite>
          )}
        </blockquote>
      );
    case "ul":
      return (
        <ul
          style={{
            marginTop: 22,
            paddingLeft: 22,
            fontSize: "1.0625rem",
            lineHeight: 1.85,
            color: "var(--ink-soft)",
          }}
        >
          {block.items.map((item, i) => (
            <li key={i} style={{ marginTop: 6 }}>
              {item}
            </li>
          ))}
        </ul>
      );
    default:
      return <p style={pStyle}>{block.text}</p>;
  }
}

export default async function EssayPage({ params }: Props) {
  const { slug } = await params;
  const essay = getEssay(slug);
  if (!essay) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: essay.title,
    description: essay.description,
    datePublished: essay.date,
    author: { "@type": "Organization", name: "Cogletta", url: "https://cogletta.com" },
    publisher: { "@type": "Organization", name: "Cogletta", url: "https://cogletta.com" },
    mainEntityOfPage: `https://cogletta.com/essays/${essay.slug}/`,
  };

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "56px 5vw 96px",
        }}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <p style={{ marginBottom: 28 }}>
          <Link
            href="/essays/"
            style={{
              fontSize: "0.875rem",
              color: "var(--ink-muted)",
              textDecoration: "none",
            }}
          >
            ← All essays
          </Link>
        </p>

        <article>
          <header>
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
          </header>

          {essay.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </article>

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
          <p>
            Cogletta delivers three long-form articles and two podcast episodes
            on your interests, every morning.{" "}
            <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Start reading for free →
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
}
