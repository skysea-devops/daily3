"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { getDailyArticles } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import type { Article } from "@/lib/types";

// Yeni 9 kategori — onboarding/page.tsx ile senkron
const CATEGORIES: Record<string, string> = {
  "Software & DevOps": "🛠️",
  "Technology":        "💡",
  "World Politics":    "🌍",
  "Business":         "📈",
  "Economics":        "💰",
  "Science":          "🔬",
  "Productivity":     "⚡",
  "History":          "🏛️",
  "Arts & Culture":   "🎭",
};

function ArticleCard({ article }: { article: Article }) {
  const emoji = CATEGORIES[article.category] ?? "📄";

  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{emoji}</span>
            <div>
              <p className="text-sm font-medium text-gray-500">{article.category}</p>
              <p className="text-xs text-gray-400">
                {article.source} · {article.readingTime}
              </p>
            </div>
          </div>

          <h2 className="mt-4 text-xl font-semibold leading-snug text-gray-900">
            {article.title}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {article.summary}
          </p>

          <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Why this article?</p>
            <p className="mt-1 text-sm text-gray-700">{article.reason}</p>
          </div>
        </div>

        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl bg-black px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Read →
        </a>
      </div>
    </article>
  );
}

function PendingCard({ category }: { category: string }) {
  const emoji = CATEGORIES[category] ?? "📄";
  return (
    <article className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl opacity-40">{emoji}</span>
        <div>
          <p className="text-sm font-medium text-gray-400">{category}</p>
          <p className="text-xs text-gray-300">Article being curated…</p>
        </div>
      </div>
      <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-gray-200" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-gray-200" />
    </article>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  const [articles, setArticles]       = useState<Article[]>([]);
  const [status, setStatus]           = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [interests, setInterests]     = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("daily3-categories");
    if (stored) setInterests(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await getDailyArticles(user!.accessToken);

        if (cancelled) return;

        if (data.status === "ready" && data.articles.length > 0) {
          setArticles(data.articles);
          setGeneratedAt(data.generatedAt);
          setStatus("ready");
        } else {
          setStatus("pending");
          setTimeout(() => { if (!cancelled) load(); }, 5000);
        }
      } catch (err) {
        console.error("Failed to load articles:", err);
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-400">{today}</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Your Daily3</h1>
          <p className="mt-2 text-gray-500">
            Three carefully selected articles based on your interests.
          </p>
        </div>

        {/* Interests chips */}
        {interests.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"
              >
                {CATEGORIES[interest]} {interest}
              </span>
            ))}
          </div>
        )}

        {/* States */}
        {status === "loading" && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-3xl bg-white border border-gray-200" />
            ))}
          </div>
        )}

        {status === "pending" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4">
              <p className="text-sm font-medium text-blue-700">
                ✦ Curating your articles…
              </p>
              <p className="mt-1 text-xs text-blue-500">
                We're finding the best articles for you. This takes about 30 seconds.
              </p>
            </div>
            {interests.map((interest) => (
              <PendingCard key={interest} category={interest} />
            ))}
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-4">
            {articles.map((article) => (
              <ArticleCard key={article.url} article={article} />
            ))}

            {generatedAt && (
              <p className="text-center text-xs text-gray-300 pt-2">
                Curated at {new Date(generatedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit", minute: "2-digit",
                })} · Refreshes tomorrow at 07:00
              </p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl bg-red-50 border border-red-100 px-5 py-4">
            <p className="text-sm font-medium text-red-700">Failed to load articles.</p>
            <button
              onClick={() => { setStatus("loading"); }}
              className="mt-2 text-xs text-red-500 underline"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
