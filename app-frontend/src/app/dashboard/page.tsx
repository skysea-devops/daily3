"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { getDailyArticles } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import type { Article } from "@/lib/types";

const UNSPLASH_ACCESS_KEY = "rp-OBp3MMcxOlSCIV6GyPh3DOkX4IgmEGq8XBJQVnvs";

const CATEGORY_EMOJI: Record<string, string> = {
  "Software & DevOps": "🛠️",
  "Technology":        "💡",
  "World Politics":    "🌍",
  "Business":         "📈",
  "Economics":        "💰",
  "Science":          "🔬",
  "Productivity":     "⚡",
  "History":          "🏛️",
  "Arts & Culture":   "🎭",
  "Military":         "⚔️",
  "Health":           "🧬",
  "Environment":      "🌿",
};

// Başlıktan arama terimi üret — ilk 3-4 anlamlı kelime
function extractKeywords(title: string): string {
  const stopWords = new Set(["the","a","an","of","in","on","at","to","for","is","are","was","were","and","or","but","how","why","what","when","who","will","can","has","have","its","by","with","from","as","this","that","these","those","be","been","being"]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 3)
    .join(" ");
}

interface UnsplashPhoto {
  url: string;
  authorName: string;
  authorUrl: string;
}

function useUnsplashPhoto(title: string, category: string): UnsplashPhoto | null {
  const [photo, setPhoto] = useState<UnsplashPhoto | null>(null);

  useEffect(() => {
    const keywords = extractKeywords(title) || category;
    const cacheKey = `unsplash:${keywords}`;

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setPhoto(JSON.parse(cached));
      return;
    }

    fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keywords)}&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
    )
      .then(r => r.json())
      .then(data => {
        if (data?.urls?.regular) {
          // Unsplash zorunluluğu: download endpoint'ini trigger et
          if (data.links?.download_location) {
            fetch(data.links.download_location, {
              headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
            }).catch(() => {});
          }

          const p: UnsplashPhoto = {
            url:        data.urls.regular,
            authorName: data.user?.name ?? "Unsplash",
            authorUrl:  `${data.user?.links?.html ?? "https://unsplash.com"}?utm_source=daily3&utm_medium=referral`,
          };
          sessionStorage.setItem(cacheKey, JSON.stringify(p));
          setPhoto(p);
        }
      })
      .catch(() => {});
  }, [title, category]);

  return photo;
}

function ArticleCard({ article }: { article: Article }) {
  const emoji = CATEGORY_EMOJI[article.category] ?? "📄";
  const isFallback = !article.url || article.url === "https://news.ycombinator.com";
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const photo = useUnsplashPhoto(article.title, article.category);

  function toggleAudio() {
    if (!article.audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(article.audioUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <article className="rounded-3xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">{emoji}</span>
              <p className="text-sm font-medium text-gray-500">{article.category}</p>
            </div>

            <h2 className="mt-3 text-xl font-semibold leading-snug text-gray-900">
              {article.title}
            </h2>

            <p className="mt-1.5 text-xs text-gray-400">
              {article.source} · {article.readingTime}
            </p>

            {/* Unsplash photo — başlığın altında, içerik genişliğinde */}
            {photo && (
              <div className="relative mt-3 h-36 w-full overflow-hidden rounded-2xl">
                <img
                  src={photo.url}
                  alt={article.title}
                  className="h-full w-full object-cover"
                />
                <a
                  href={photo.authorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-1 right-2 text-[10px] text-white/70 hover:text-white"
                >
                  Photo by {photo.authorName} on Unsplash
                </a>
              </div>
            )}

            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {article.summary}
            </p>

            <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium text-gray-500">Why this article?</p>
              <p className="mt-1 text-sm text-gray-700">{article.reason}</p>
            </div>
          </div>

          {!isFallback && (
            <div className="flex shrink-0 flex-col gap-2">
              {article.audioUrl && (
                <button
                  onClick={toggleAudio}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  aria-label={playing ? "Pause audio" : "Play audio"}
                >
                  {playing ? (
                    <><span className="text-base">⏸</span><span>Pause</span></>
                  ) : (
                    <><span className="text-base">▶</span><span>Listen</span></>
                  )}
                </button>
              )}
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-black px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Read Full Article →
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PendingCard({ category }: { category: string }) {
  const emoji = CATEGORY_EMOJI[category] ?? "📄";
  return (
    <article className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 overflow-hidden">
      <div className="h-48 animate-pulse bg-gray-200" />
      <div className="p-6">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-40">{emoji}</span>
          <p className="text-sm font-medium text-gray-400">{category}</p>
        </div>
        <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-gray-200" />
      </div>
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
      const invalidated = localStorage.getItem("daily3-articles-invalidated");
      if (invalidated) {
        localStorage.removeItem("daily3-articles-invalidated");
        setStatus("pending");
        setTimeout(() => { if (!cancelled) load(); }, 3000);
        return;
      }

      try {
        const data = await getDailyArticles(user!.accessToken);
        if (cancelled) return;

        if (data.status === "ready" && data.articles.length > 0) {
          const storedRaw = localStorage.getItem("daily3-categories");
          const storedInterests: string[] = storedRaw ? JSON.parse(storedRaw) : [];
          const articleCategories = data.articles.map((a: Article) => a.category);
          const isStale = storedInterests.length > 0 &&
            !storedInterests.every((i) => articleCategories.includes(i));

          if (isStale) {
            setStatus("pending");
            setTimeout(() => { if (!cancelled) load(); }, 3000);
            return;
          }

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
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-400">{today}</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Your Daily3</h1>
          <p className="mt-2 text-gray-500">
            Three carefully selected articles based on your interests.
          </p>
        </div>

        {interests.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"
              >
                {CATEGORY_EMOJI[interest]} {interest}
              </span>
            ))}
          </div>
        )}

        {status === "loading" && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl bg-white border border-gray-200 overflow-hidden">
                <div className="h-48 animate-pulse bg-gray-100" />
                <div className="p-6 space-y-3">
                  <div className="h-3 w-1/4 animate-pulse rounded bg-gray-100" />
                  <div className="h-5 w-3/4 animate-pulse rounded bg-gray-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "pending" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4">
              <p className="text-sm font-medium text-blue-700">✦ Curating your articles…</p>
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
              <ArticleCard key={article.category} article={article} />
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
            <button onClick={() => setStatus("loading")} className="mt-2 text-xs text-red-500 underline">
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
