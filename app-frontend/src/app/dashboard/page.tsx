"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { getDailyArticles } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import type { Article, Podcast } from "@/lib/types";

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

function extractKeywords(title: string): string {
  const stop = new Set(["the","a","an","of","in","on","at","to","for","is","are","was","were","and","or","but","how","why","what","when","who","will","can","has","have","its","by","with","from","as","this","that","these","those","be","been","being"]);
  return title.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2&&!stop.has(w)).slice(0,3).join(" ");
}

interface UnsplashPhoto { url: string; authorName: string; authorUrl: string; }

function useUnsplashPhoto(title: string, category: string): UnsplashPhoto | null {
  const [photo, setPhoto] = useState<UnsplashPhoto | null>(null);
  useEffect(() => {
    const kw = extractKeywords(title) || category;
    const key = `unsplash:${kw}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { setPhoto(JSON.parse(cached)); return; }
    fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(kw)}&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } })
      .then(r => r.json()).then(data => {
        if (data?.urls?.regular) {
          if (data.links?.download_location) fetch(data.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }).catch(()=>{});
          const p = { url: data.urls.regular, authorName: data.user?.name ?? "Unsplash", authorUrl: `${data.user?.links?.html ?? "https://unsplash.com"}?utm_source=cogletta&utm_medium=referral` };
          sessionStorage.setItem(key, JSON.stringify(p));
          setPhoto(p);
        }
      }).catch(()=>{});
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
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  return (
    <article style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "28px 28px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: "0.9rem" }}>{emoji}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
                {article.category}
              </span>
            </div>

            <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35, color: "var(--ink)", marginBottom: 6 }}>
              {article.title}
            </h2>

            <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", fontWeight: 500, marginBottom: 16 }}>
              {article.source} · {article.readingTime}
            </p>

            {photo && (
              <div style={{ position: "relative", height: 160, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <img src={photo.url} alt={article.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <a href={photo.authorUrl} target="_blank" rel="noreferrer"
                  style={{ position: "absolute", bottom: 6, right: 10, fontSize: "0.6875rem", color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
                  Photo by {photo.authorName} on Unsplash
                </a>
              </div>
            )}

            <p style={{ fontFamily: "'Lora', serif", fontSize: "0.9375rem", lineHeight: 1.75, color: "var(--ink-soft)", marginBottom: 16 }}>
              {article.summary}
            </p>

            <div style={{ background: "var(--paper-warm)", border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 16px" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
                Why we picked this for you
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>{article.reason}</p>
            </div>
          </div>

          {!isFallback && (
            <div style={{ display: "flex", gap: 10 }}>
              {article.audioUrl && (
                <button onClick={toggleAudio}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    border: "1px solid var(--rule)", background: "var(--white)",
                    borderRadius: 10, padding: "10px 18px", fontSize: "0.875rem",
                    fontWeight: 600, color: "var(--ink-soft)", cursor: "pointer",
                  }}>
                  {playing ? "⏸ Pause" : "▶ Listen"}
                </button>
              )}
              <a href={article.url} target="_blank" rel="noreferrer"
                style={{
                  flex: 1, textAlign: "center", background: "var(--ink)", color: "var(--white)",
                  borderRadius: 10, padding: "10px 20px", fontSize: "0.875rem",
                  fontWeight: 600, textDecoration: "none",
                }}>
                Read Full Article →
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PodcastCard({ podcast }: { podcast: Podcast }) {
  const emoji = CATEGORY_EMOJI[podcast.category] ?? "🎙";

  return (
    <article style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "28px 28px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ flex: 1 }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: "0.9rem" }}>🎙</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
                Podcast · {podcast.category}
              </span>
            </div>

            <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35, color: "var(--ink)", marginBottom: 6 }}>
              {podcast.title}
            </h2>

            <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", fontWeight: 500, marginBottom: 16 }}>
              {podcast.source} · {podcast.duration}
            </p>

            <p style={{ fontFamily: "'Lora', serif", fontSize: "0.9375rem", lineHeight: 1.75, color: "var(--ink-soft)", marginBottom: 16 }}>
              {podcast.summary}
            </p>

            <div style={{ background: "var(--paper-warm)", border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 16px" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
                Why we picked this for you
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>{podcast.reason}</p>
            </div>
          </div>

          <a href={podcast.url} target="_blank" rel="noreferrer"
            style={{
              textAlign: "center", background: "var(--accent)", color: "var(--white)",
              borderRadius: 10, padding: "10px 20px", fontSize: "0.875rem",
              fontWeight: 600, textDecoration: "none",
            }}>
            🎙 Listen →
          </a>
        </div>
      </div>
    </article>
  );
}

function PendingCard({ category, type = "article" }: { category: string; type?: "article" | "podcast" }) {
  const emoji = type === "podcast" ? "🎙" : (CATEGORY_EMOJI[category] ?? "📄");
  const label = type === "podcast" ? `Podcast · ${category}` : category;
  return (
    <article style={{ background: "var(--white)", border: "1px dashed var(--rule)", borderRadius: 16, overflow: "hidden", opacity: 0.7 }}>
      <div style={{ height: 80, background: "var(--paper-warm)", animation: "pulse 2s infinite" }} />
      <div style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span>{emoji}</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink-muted)" }}>{label}</span>
        </div>
        <div style={{ height: 16, background: "var(--paper-warm)", borderRadius: 6, marginBottom: 10, width: "75%" }} />
        <div style={{ height: 16, background: "var(--paper-warm)", borderRadius: 6, width: "50%" }} />
      </div>
    </article>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [article, setArticle]         = useState<Article | null>(null);
  const [podcast, setPodcast]         = useState<Podcast | null>(null);
  const [status, setStatus]           = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [interest, setInterest]       = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("cogletta-categories");
    if (stored) {
      const cats = JSON.parse(stored) as string[];
      if (cats.length > 0) setInterest(cats[0]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await getDailyArticles(user!.accessToken);
        if (cancelled) return;
        if (data.status === "ready" && data.articles.length > 0) {
          setArticle(data.articles[0]);
          setPodcast(data.podcast ?? null);
          setGeneratedAt(data.generatedAt);
          setStatus("ready");
        } else {
          setStatus("pending");
          setTimeout(() => { if (!cancelled) load(); }, 5000);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 5vw" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>{today}</p>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", marginTop: 4, marginBottom: 6 }}>
            Your Cogletta
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)" }}>
            Curated for you, every morning.
          </p>
        </div>

        {/* Interest badge */}
        {interest && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
            <span style={{
              background: "var(--white)", border: "1px solid var(--rule)",
              borderRadius: 20, padding: "5px 14px", fontSize: "0.8125rem",
              fontWeight: 500, color: "var(--ink-soft)",
            }}>
              {CATEGORY_EMOJI[interest]} {interest}
            </span>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, padding: 28 }}>
                <div style={{ height: 12, background: "var(--paper-warm)", borderRadius: 6, width: "25%", marginBottom: 16 }} />
                <div style={{ height: 20, background: "var(--paper-warm)", borderRadius: 6, width: "75%", marginBottom: 12 }} />
                <div style={{ height: 12, background: "var(--paper-warm)", borderRadius: 6, width: "100%" }} />
              </div>
            ))}
          </div>
        )}

        {/* Pending */}
        {status === "pending" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              background: "var(--paper-warm)", border: "1px solid var(--rule)",
              borderRadius: 12, padding: "16px 20px",
            }}>
              <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--accent)" }}>✦ Curating your content…</p>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", marginTop: 4 }}>
                We're finding the best article and podcast for you. This takes about 30 seconds.
              </p>
            </div>
            {interest && <PendingCard category={interest} type="article" />}
            {interest && <PendingCard category={interest} type="podcast" />}
          </div>
        )}

        {/* Ready */}
        {status === "ready" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {article && <ArticleCard article={article} />}
            {podcast && <PodcastCard podcast={podcast} />}
            {generatedAt && (
              <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)", paddingTop: 8 }}>
                Curated at {new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Refreshes tomorrow at 07:00
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 20px" }}>
            <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#991b1b" }}>Failed to load content.</p>
            <button onClick={() => setStatus("loading")} style={{ marginTop: 8, fontSize: "0.875rem", color: "#991b1b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Try again
            </button>
          </div>
        )}

      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <RequireAuth><DashboardContent /></RequireAuth>;
}
