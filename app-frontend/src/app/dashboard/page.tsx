"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { getDailyArticles } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import type { Article } from "@/lib/types";

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

// Kaynak adı → domain map (Clearbit Logo API için)
const SOURCE_DOMAIN: Record<string, string> = {
  "Stack Overflow Blog":         "stackoverflow.blog",
  "Martin Fowler":               "martinfowler.com",
  "InfoQ":                       "infoq.com",
  "The New Stack":               "thenewstack.io",
  "AWS Architecture":            "aws.amazon.com",
  "MIT Technology Review":       "technologyreview.com",
  "IEEE Spectrum":               "spectrum.ieee.org",
  "Ars Technica":                "arstechnica.com",
  "ACM Queue":                   "queue.acm.org",
  "Hacker News":                 "news.ycombinator.com",
  "Chatham House":               "chathamhouse.org",
  "Foreign Affairs":             "foreignaffairs.com",
  "War on the Rocks":            "warontherocks.com",
  "Council on Foreign Relations":"cfr.org",
  "Al Jazeera":                  "aljazeera.com",
  "Ness Labs":                   "nesslabs.com",
  "MIT Sloan Review":            "sloanreview.mit.edu",
  "Noema Magazine":              "noemamag.com",
  "Strategy+Business":           "strategy-business.com",
  "First Round Review":          "review.firstround.com",
  "VoxEU (CEPR)":                "cepr.org",
  "Econlib":                     "econlib.org",
  "Noahpinion":                  "noahpinion.blog",
  "Marginal Revolution":         "marginalrevolution.com",
  "IMF Blog":                    "imf.org",
  "Quanta Magazine":             "quantamagazine.org",
  "Nautilus":                    "nautil.us",
  "Undark":                      "undark.org",
  "Aeon":                        "aeon.co",
  "Phys.org":                    "phys.org",
  "Farnam Street":               "fs.blog",
  "Psyche (Aeon)":               "psyche.co",
  "LessWrong":                   "lesswrong.com",
  "Nir And Far":                 "nirandfar.com",
  "History Today":               "historytoday.com",
  "JSTOR Daily":                 "daily.jstor.org",
  "Lapham's Quarterly":          "laphamsquarterly.org",
  "The Public Domain Review":    "publicdomainreview.org",
  "Literary Hub (Arts)":         "lithub.com",
  "Literary Hub (Books)":        "lithub.com",
  "LA Review of Books":          "lareviewofbooks.org",
  "Smithsonian Magazine":        "smithsonianmag.com",
  "RUSI":                        "rusi.org",
  "Lawfare":                     "lawfaremedia.org",
  "Modern War Institute":        "mwi.westpoint.edu",
  "Inkstick Media":              "inkstickmedia.com",
  "Stat News":                   "statnews.com",
  "Undark (Health)":             "undark.org",
  "Aeon (Psychology)":           "psyche.co",
  "The BMJ":                     "bmj.com",
  "Knowable Magazine":           "knowablemagazine.org",
  "Yale Environment 360":        "e360.yale.edu",
  "Carbon Brief":                "carbonbrief.org",
  "Ensia":                       "ensia.com",
  "Mongabay":                    "mongabay.com",
  "Inside Climate News":         "insideclimatenews.org",
};

function SourceLogo({ source }: { source: string }) {
  const domain = SOURCE_DOMAIN[source];
  const [error, setError] = useState(false);

  if (!domain || error) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-400">
        {source.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={source}
      className="h-8 w-8 rounded-lg object-contain bg-white border border-gray-100"
      onError={() => setError(true)}
    />
  );
}

function ArticleCard({ article }: { article: Article }) {
  const emoji = CATEGORY_EMOJI[article.category] ?? "📄";
  const isFallback = !article.url || article.url === "https://news.ycombinator.com";
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    <article className="rounded-3xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <SourceLogo source={article.source} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{emoji}</span>
                <p className="text-sm font-medium text-gray-500">{article.category}</p>
              </div>
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

        {!isFallback && (
          <div className="flex shrink-0 flex-col gap-2">
            {article.audioUrl && (
              <button
                onClick={toggleAudio}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                aria-label={playing ? "Pause audio" : "Play audio"}
              >
                {playing ? (
                  <>
                    <span className="text-base">⏸</span>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <span className="text-base">▶</span>
                    <span>Listen</span>
                  </>
                )}
              </button>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-black px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Read →
            </a>
          </div>
        )}
      </div>
    </article>
  );
}

function PendingCard({ category }: { category: string }) {
  const emoji = CATEGORY_EMOJI[category] ?? "📄";
  return (
    <article className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-200" />
        <div>
          <p className="text-sm font-medium text-gray-400">{emoji} {category}</p>
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
            <button
              onClick={() => setStatus("loading")}
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
