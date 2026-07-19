// src/app/essays/page.tsx
// Server component — metadata is embedded in static HTML for SEO.

import ShareCard from "@/components/ShareCard";
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { ESSAYS } from "@/data/essays";

export const metadata: Metadata = {
  title: "Essays — Cogletta",
  description:
    "Essays from Cogletta on reading, attention, personal habits, philosophy and ethics. Long-form thinking, no feed.",
  alternates: { canonical: "/essays/" },
  openGraph: {
    title: "Essays — Cogletta",
    description:
      "Essays on reading, attention, personal habits, philosophy and ethics.",
    url: "/essays/",
    type: "website",
  },
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function EssaysPage() {
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
        <header style={{ marginBottom: 48 }}>
          <h1
            style={{
              fontFamily: "'Lora', serif",
              fontWeight: 600,
              fontSize: "2rem",
              color: "var(--ink)",
              letterSpacing: "-0.01em",
            }}
          >
            Essays
          </h1>
          <p
            style={{
              marginTop: 10,
              fontSize: "0.9375rem",
              lineHeight: 1.7,
              color: "var(--ink-muted)",
            }}
          >
            Occasional writing on reading, attention, habits, philosophy and
            ethics — the ideas behind Cogletta.
          </p>
        </header>

        <div>
          {ESSAYS.map((essay) => (
            <article
              key={essay.slug}
              style={{
                borderTop: "1px solid var(--rule)",
                padding: "28px 0",
              }}
            >
              <p
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                  marginBottom: 8,
                }}
              >
                <time dateTime={essay.date}>{formatDate(essay.date)}</time>
                {" · "}
                {essay.readingMinutes} min read
              </p>
              <h2
                style={{
                  fontFamily: "'Lora', serif",
                  fontWeight: 600,
                  fontSize: "1.375rem",
                  lineHeight: 1.35,
                }}
              >
                <Link
                  href={`/essays/${essay.slug}/`}
                  style={{ color: "var(--ink)", textDecoration: "none" }}
                >
                  {essay.title}
                </Link>
              </h2>
              <p
                style={{
                  marginTop: 8,
                  fontSize: "0.9375rem",
                  lineHeight: 1.7,
                  color: "var(--ink-soft)",
                }}
              >
                {essay.description}
              </p>
              <p style={{ marginTop: 12 }}>
                <Link
                  href={`/essays/${essay.slug}/`}
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "var(--accent)",
                    textDecoration: "none",
                  }}
                >
                  Read essay →
                </Link>
              </p>
            </article>
          ))}
        </div>

        <div style={{ marginTop: 48 }}>
          <ShareCard compact />
        </div>
      </main>
    </>
  );
}
