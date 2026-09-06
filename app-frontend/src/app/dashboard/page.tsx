"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ShareCard from "@/components/ShareCard";
import { getDailyArticles, getTrendReport } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import type { Article, Podcast, SundayPick, SundayIssue } from "@/lib/types";
import { categoryEmoji, categoryLabel } from "@/lib/categories";

const UNSPLASH_ACCESS_KEY = "rp-OBp3MMcxOlSCIV6GyPh3DOkX4IgmEGq8XBJQVnvs";



function extractKeywords(title: string, category: string): string {
  const stop = new Set(["the","a","an","of","in","on","at","to","for","is","are","was","were","and","or","but","how","why","what","when","who","will","can","has","have","its","by","with","from","as","this","that","these","those","be","been","being","do","you","lose","when","says","why","new","your"]);
  const titleWords = title.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!stop.has(w)).slice(0,2).join(" ");
  const catWord = category.split(" ")[0].toLowerCase();
  return titleWords ? `${titleWords} ${catWord}` : catWord;
}

interface UnsplashPhoto { url: string; authorName: string; authorUrl: string; }

function useUnsplashPhoto(article: Article): UnsplashPhoto | null {
  const [photo, setPhoto] = useState<UnsplashPhoto | null>(null);
  useEffect(() => {
    // Bedrock'un tema bazlı sorgusu varsa onu kullan (başlık kelimeleri çift
    // anlamlıdır: 'How to Bear Your Sorrows' → ayı fotoğrafı vakası, 2026-07-17)
    const kw = article.imageQuery?.trim() || extractKeywords(article.title, article.category);
    const key = `unsplash:${kw}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { setPhoto(JSON.parse(cached)); return; }
    fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(kw)}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } })
      .then(r => r.json()).then(data => {
        const hit = data?.results?.[0];
        if (hit?.urls?.regular) {
          if (hit.links?.download_location) fetch(hit.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }).catch(()=>{});
          const p = { url: hit.urls.regular, authorName: hit.user?.name ?? "Unsplash", authorUrl: `${hit.user?.links?.html ?? "https://unsplash.com"}?utm_source=cogletta&utm_medium=referral` };
          sessionStorage.setItem(key, JSON.stringify(p));
          setPhoto(p);
        }
      }).catch(()=>{});
  }, [article]);
  return photo;
}

function ArticleCard({ article }: { article: Article }) {
  const emoji = categoryEmoji(article.category);
  const isFallback = !article.url || article.url === "https://news.ycombinator.com";
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const photo = useUnsplashPhoto(article);

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
                {categoryLabel(article.category)}
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
  return (
    <article style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "28px 28px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: "0.9rem" }}>🎙</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
                Podcast · {categoryLabel(podcast.category)}
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
  const emoji = type === "podcast" ? "🎙" : categoryEmoji(category);
  const label = type === "podcast" ? `Podcast · ${categoryLabel(category)}` : categoryLabel(category);
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

const PRO_NUDGES = [
  { text: "Loved today's edition? Start every morning with 3 thoughtfully selected articles for every interest you follow.", cta: "Unlock Cogletta Pro →" },
  { text: "Enjoyed today's read? Pro delivers 3 articles for each of your interests — every morning.", cta: "Explore Cogletta Pro →" },
];

function ProNudge() {
  const nudge = PRO_NUDGES[Math.floor(Math.random() * PRO_NUDGES.length)];
  return (
    <div style={{
      borderTop: "1px solid var(--rule)",
      paddingTop: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", lineHeight: 1.6 }}>
        {nudge.text}
      </p>
      <a href="/register#pro" style={{
        flexShrink: 0,
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--accent)",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}>
        {nudge.cta}
      </a>
    </div>
  );
}

// Haftalık "Your week in review" kartı yalnızca PAZAR günü görünür
// (kullanıcının yerel saatiyle; JS'te getDay() === 0 pazar demektir).
function isWeeklyReviewDay(): boolean {
  return new Date().getDay() === 0;
}

function SundayItem({ pick, isFirst }: { pick: SundayPick; isFirst: boolean }) {
  return (
    <div style={{ borderTop: isFirst ? "none" : "2px solid var(--rule)", paddingTop: isFirst ? 0 : 24, marginTop: isFirst ? 0 : 24 }}>
      <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.0625rem", fontWeight: 600, lineHeight: 1.4, margin: "0 0 4px" }}>
        <a href={pick.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "none" }}>
          {pick.title}
        </a>
      </h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "0 0 8px" }}>
        {pick.source}
      </p>
      <p style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>
        {pick.summary}
      </p>
    </div>
  );
}

/**
 * Pazar Eki kartı. Hafta içi kartlarından ayrışması için kategori rozeti YOK —
 * ekin tamamı kullanıcının ilgi alanlarından bağımsız.
 */
function SundayCard({ issue }: { issue: SundayIssue }) {
  if (!issue.article && !issue.podcast) return null;

  return (
    <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, padding: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
          ✦ Sunday
        </span>
        <span style={{ fontSize: "0.8125rem", color: "var(--ink-muted)" }}>{issue.weekLabel}</span>
      </div>
      <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.375rem", fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
        The Sunday Supplement
      </h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "0 0 24px", lineHeight: 1.5 }}>
        Something to read, something to listen to. Enjoy your Sunday.
      </p>

    </div>
  );
}

function DashboardContent() {
  const { user, plan, hasInterests, loading: authLoading } = useAuth();
  const router = useRouter();
  // Interest seçmemiş kullanıcı: makale durumları yerine seçim CTA'sı göster (boş dashboard olmasın)
  const noInterests = !authLoading && !hasInterests;
  const [articles, setArticles]       = useState<Article[]>([]);
  const [podcasts, setPodcasts]       = useState<Podcast[]>([]);
  const [status, setStatus]           = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [trend, setTrend]             = useState<SundayIssue | null>(null);

  // Haftalık trend raporu (sadece Pro) — dashboard'un üstünde "This week" kartı
  useEffect(() => {
    // Haftalık özet yalnızca pazar günü gösterildiği için diğer günlerde çekmiyoruz.
    if (!user?.accessToken || plan !== "pro" || !isWeeklyReviewDay()) { setTrend(null); return; }
    let cancelled = false;
    getTrendReport(user.accessToken)
      .then((r) => { if (!cancelled) setTrend(r.report); })
      .catch(() => { /* sessiz geç */ });
    return () => { cancelled = true; };
  }, [user, plan]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await getDailyArticles(user!.accessToken);
        if (cancelled) return;
        if (data.status === "ready" && data.articles.length > 0) {
          setArticles(data.articles);
          // Geriye uyumluluk: yeni item'lar `podcasts` dizisi, eskiler tekil `podcast`
          setPodcasts(data.podcasts ?? (data.podcast ? [data.podcast] : []));
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

        <div style={{ margin: "24px 0 32px" }}>
          <ShareCard compact />
        </div>

        {noInterests && (
          <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, padding: 28, textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
              You haven&apos;t selected any topics yet
            </h2>
            <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 20 }}>
              {plan === "pro"
                ? "Choose up to 3 topics and we'll start curating your daily reading each morning."
                : "Choose a topic and we'll start curating your daily reading each morning."}
            </p>
            <button onClick={() => router.push("/interests")} style={{ border: "none", borderRadius: 10, padding: "12px 22px", background: "var(--accent)", color: "var(--white)", fontWeight: 600, cursor: "pointer" }}>
              Choose your topics →
            </button>
          </div>
        )}

        {!noInterests && (<>
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
            <PendingCard category="" type="article" />
            <PendingCard category="" type="podcast" />
          </div>
        )}

        {/* Ready */}
        {status === "ready" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {plan === "pro" && isWeeklyReviewDay() && trend && <SundayCard issue={trend} />}
            {articles.map((a, i) => <ArticleCard key={`a-${i}`} article={a} />)}
            {plan !== "pro" && <ProNudge />}
            {podcasts.map((p, i) => <PodcastCard key={`p-${i}`} podcast={p} />)}
            {generatedAt && (
              <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)", paddingTop: 4 }}>
                Curated at {new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Refreshes tomorrow morning
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
        </>)}

        <div style={{ marginTop: 40 }}>
          <ShareCard />
        </div>

      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <RequireAuth><DashboardContent /></RequireAuth>;
}
