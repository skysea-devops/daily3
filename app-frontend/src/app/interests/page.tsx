"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { CATEGORIES, SUB_TOPICS } from "@/lib/constants";

// ─── Saat dilimi → gönderim bölgesi ───────────────────────────────────────────
// Kullanıcının tarayıcı saat dilimini 4 kovadan birine eşler. Backend her bölge
// için ayrı bir cron'da (EU≈07:00 TR, ABD-Doğu, ABD-Batı, Asya) mail gönderir.
function detectRegion(): "EU" | "US_EAST" | "US_WEST" | "ASIA" {
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* ignore */ }

  if (tz.startsWith("America/")) {
    const west = [
      "Los_Angeles", "Tijuana", "Vancouver", "Denver", "Phoenix", "Edmonton",
      "Boise", "Chihuahua", "Mazatlan", "Hermosillo", "Anchorage", "Juneau",
      "Dawson", "Whitehorse",
    ];
    return west.some(c => tz.includes(c)) ? "US_WEST" : "US_EAST";
  }
  if (
    tz.startsWith("Asia/") || tz.startsWith("Australia/") ||
    tz.startsWith("Pacific/") || tz.startsWith("Indian/")
  ) {
    return "ASIA";
  }
  // Europe/, Africa/, Atlantic/ veya bilinmeyen → EU (varsayılan)
  return "EU";
}

// ─── Free kullanıcı overlay ───────────────────────────────────────────────────

function ProSubtopicOverlay({ category, onClose }: { category: string; onClose: () => void }) {
  const subTopics = SUB_TOPICS[category] ?? [];
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(26,23,20,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 20px",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 420,
        background: "var(--white)",
        border: "1px solid var(--rule)",
        borderRadius: 16, padding: "36px 32px",
      }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>Pro feature</p>
          <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
            {category} — sub-topics
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
            With Pro, choose the areas within {category} you want to focus on. Every article will be even more relevant.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {subTopics.map(topic => (
            <span key={topic} style={{
              padding: "6px 14px",
              border: "1px solid var(--rule)",
              borderRadius: 20,
              fontSize: "0.8125rem",
              color: "var(--ink-soft)",
              background: "var(--paper-warm)",
            }}>
              {topic}
            </span>
          ))}
        </div>
        <a href="/register#pro" style={{
          display: "block", textAlign: "center",
          background: "var(--accent)", color: "var(--white)",
          borderRadius: 10, padding: "11px 24px",
          fontSize: "0.9375rem", fontWeight: 600,
          textDecoration: "none", marginBottom: 10,
        }}>
          Unlock with Pro →
        </a>
        <button onClick={onClose} style={{
          display: "block", width: "100%", textAlign: "center",
          background: "none", border: "none", cursor: "pointer",
          fontSize: "0.875rem", color: "var(--ink-muted)",
        }}>
          Continue with Free
        </button>
      </div>
    </div>
  );
}

// ─── Pro sub-topic seçim modal ────────────────────────────────────────────────

function SubtopicModal({
  category,
  selectedSubTopics,
  onSave,
  onClose,
}: {
  category: string;
  selectedSubTopics: string[];
  onSave: (category: string, topics: string[]) => void;
  onClose: () => void;
}) {
  const allTopics = SUB_TOPICS[category] ?? [];
  const [picked, setPicked] = useState<string[]>(selectedSubTopics);

  function toggle(topic: string) {
    if (picked.includes(topic)) {
      setPicked(picked.filter(t => t !== topic));
    } else {
      if (picked.length >= 3) return;
      setPicked([...picked, topic]);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(26,23,20,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 20px",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 440,
        background: "var(--white)",
        border: "1px solid var(--rule)",
        borderRadius: 16, padding: "36px 32px",
      }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>Pro · Sub-topics</p>
          <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
            {category}
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
            Select up to 3 sub-topics. Leave all unselected to get content from across the whole category.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {allTopics.map(topic => {
            const isActive = picked.includes(topic);
            return (
              <button
                key={topic}
                onClick={() => toggle(topic)}
                style={{
                  padding: "7px 16px",
                  border: isActive ? "2px solid var(--accent)" : "1px solid var(--rule)",
                  borderRadius: 20,
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--accent)" : "var(--ink-soft)",
                  background: isActive ? "rgba(124,92,62,0.08)" : "var(--paper-warm)",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {isActive ? "✓ " : ""}{topic}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: "none",
            border: "1px solid var(--rule)", borderRadius: 10,
            padding: "11px 0", fontSize: "0.9375rem",
            fontWeight: 500, color: "var(--ink-muted)", cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={() => { onSave(category, picked); onClose(); }} style={{
            flex: 2, background: "var(--accent)", color: "var(--white)",
            border: "none", borderRadius: 10,
            padding: "11px 0", fontSize: "0.9375rem",
            fontWeight: 600, cursor: "pointer",
          }}>
            Save sub-topics
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ana form ─────────────────────────────────────────────────────────────────

function InterestsForm() {
  const router = useRouter();
  const { user, plan, markInterestsSaved } = useAuth();

  const isPro = plan === "pro";
  const maxTopics = isPro ? 3 : 1;

  const [selected, setSelected]           = useState<string[]>([]);
  const [subTopics, setSubTopics]         = useState<Record<string, string[]>>({});
  const [loading, setLoading]             = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [showTomorrow, setShowTomorrow]   = useState(false);
  const [activeModal, setActiveModal]     = useState<string | null>(null);   // category id
  const [freeOverlay, setFreeOverlay]     = useState<string | null>(null);   // category label

  useEffect(() => {
    if (!user) return;
    async function loadProfile() {
      try {
        const { getUserProfile } = await import("@/lib/api");
        const profile = await getUserProfile(user!.accessToken);
        if (profile.interests && profile.interests.length >= 1) {
          setSelected(profile.interests);
          localStorage.setItem("cogletta-categories", JSON.stringify(profile.interests));
        } else {
          const stored = localStorage.getItem("cogletta-categories");
          if (stored) setSelected(JSON.parse(stored));
        }
        if (profile.subTopics && Object.keys(profile.subTopics).length > 0) {
          setSubTopics(profile.subTopics);
          localStorage.setItem("cogletta-subtopics", JSON.stringify(profile.subTopics));
        } else {
          const storedSubs = localStorage.getItem("cogletta-subtopics");
          if (storedSubs) setSubTopics(JSON.parse(storedSubs));
        }
      } catch {
        const stored = localStorage.getItem("cogletta-categories");
        if (stored) setSelected(JSON.parse(stored));
        const storedSubs = localStorage.getItem("cogletta-subtopics");
        if (storedSubs) setSubTopics(JSON.parse(storedSubs));
      }
    }
    loadProfile();
  }, [user]);

  function toggleCategory(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter(c => c !== id));
      setSaved(false);
      return;
    }
    if (selected.length >= maxTopics) {
      if (maxTopics === 1) {
        setSelected([id]); // free: seçimi değiştir (radyo davranışı)
        setSaved(false);
      }
      return;
    }
    setSelected([...selected, id]);
    setSaved(false);
  }

  function handleSubtopicSave(category: string, topics: string[]) {
    const updated = { ...subTopics, [category]: topics };
    setSubTopics(updated);
    localStorage.setItem("cogletta-subtopics", JSON.stringify(updated));
    setSaved(false);
  }

  async function handleSave() {
    if (selected.length !== maxTopics || !user) return;
    setLoading(true);
    setSaved(false);
    setShowTomorrow(false);
    try {
      const result = await updateUserInterests(selected, user.accessToken, user.email, subTopics, detectRegion());
      localStorage.setItem("cogletta-categories", JSON.stringify(selected));
      markInterestsSaved();
      setSaved(true);
      if (result.articlesReady) {
        setShowTomorrow(true);
      } else {
        localStorage.setItem("cogletta-articles-invalidated", "true");
        setTimeout(() => router.push("/dashboard"), 1200);
      }
    } catch (error) {
      console.error("Failed to save interests:", error);
      alert("Failed to save interests. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />

      {/* Free kullanıcı overlay */}
      {freeOverlay && (
        <ProSubtopicOverlay
          category={freeOverlay}
          onClose={() => setFreeOverlay(null)}
        />
      )}

      {/* Pro sub-topic modal */}
      {activeModal && (
        <SubtopicModal
          category={activeModal}
          selectedSubTopics={subTopics[activeModal] ?? []}
          onSave={handleSubtopicSave}
          onClose={() => setActiveModal(null)}
        />
      )}

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 5vw" }}>

        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
          Your interests
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: isPro ? 32 : 8 }}>
          {isPro
            ? "Pick 3 topics. Your content refreshes every morning at 07:00."
            : "Pick your topic. Your content refreshes every morning at 07:00."}
        </p>
        {!isPro && (
          <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", marginBottom: 32 }}>
            Free plan follows one topic.{" "}
            <a href="/register#pro" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
              Upgrade to Pro
            </a>{" "}
            to follow 3 topics with an article for each, plus sub-topics and weekly trend reports.
          </p>
        )}

        {showTomorrow && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 12, padding: "16px 20px", marginBottom: 28,
          }}>
            <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#166534" }}>✓ Interests saved!</p>
            <p style={{ fontSize: "0.875rem", color: "#15803d", marginTop: 4 }}>
              Your new articles will arrive tomorrow at 07:00. Today's articles are still available.
            </p>
            <button onClick={() => router.push("/dashboard")}
              style={{ marginTop: 10, fontSize: "0.875rem", fontWeight: 600, color: "#166534", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Go to dashboard →
            </button>
          </div>
        )}

        <div style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, 1fr)",
          marginBottom: 40,
        }}>
          {CATEGORIES.map(cat => {
            const isSelected   = selected.includes(cat.id);
            const catSubTopics = subTopics[cat.id] ?? [];
            const hasSubTopics = catSubTopics.length > 0;

            return (
              <div key={cat.id} style={{ display: "flex", flexDirection: "column" }}>
                {/* Kategori butonu */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    borderRadius: isSelected ? "12px 12px 0 0" : 12,
                    padding: "18px 20px",
                    textAlign: "left",
                    cursor: "pointer",
                    border: isSelected ? "2px solid var(--accent)" : "1px solid var(--rule)",
                    borderBottom: isSelected ? "1px solid rgba(255,255,255,0.2)" : undefined,
                    background: isSelected ? "var(--accent)" : "var(--white)",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>{cat.emoji}</span>
                  <p style={{ marginTop: 10, fontWeight: 600, fontSize: "0.9375rem", color: isSelected ? "var(--white)" : "var(--ink)" }}>
                    {cat.label}
                  </p>
                  <p style={{ marginTop: 3, fontSize: "0.8rem", color: isSelected ? "rgba(255,255,255,0.75)" : "var(--ink-muted)", lineHeight: 1.4 }}>
                    {cat.description}
                  </p>
                </button>

                {/* Sub-topics butonu */}
                {isSelected && (
                  <button
                    onClick={() => isPro ? setActiveModal(cat.id) : setFreeOverlay(cat.label)}
                    style={{
                      borderRadius: "0 0 12px 12px",
                      padding: "10px 20px",
                      textAlign: "left",
                      cursor: "pointer",
                      border: "2px solid var(--accent)",
                      borderTop: "1px solid rgba(255,255,255,0.15)",
                      background: hasSubTopics ? "rgba(124,92,62,0.15)" : "rgba(124,92,62,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)", flex: 1, textAlign: "left" }}>
                      {hasSubTopics
                        ? catSubTopics.slice(0, 2).join(", ") + (catSubTopics.length > 2 ? ` +${catSubTopics.length - 2}` : "")
                        : "Add sub-topics"}
                    </span>
                    {isPro ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>✎</span>
                    ) : (
                      <span style={{ fontSize: "0.7rem", background: "var(--accent)", color: "var(--white)", padding: "2px 7px", borderRadius: 10, fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>
                        PRO
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
            {selected.length === maxTopics
              ? `Ready! ${maxTopics === 1 ? "Topic" : `${maxTopics} topics`} selected`
              : `${selected.length}/${maxTopics} selected`}
          </p>
          <button onClick={handleSave} disabled={selected.length !== maxTopics || loading || showTomorrow}
            style={{
              background: saved ? "#166534" : "var(--ink)",
              color: "var(--white)", border: "none", borderRadius: 10,
              padding: "12px 28px", fontSize: "0.9375rem", fontWeight: 600,
              cursor: "pointer", opacity: (selected.length !== maxTopics || loading || showTomorrow) ? 0.3 : 1,
            }}>
            {loading ? "Saving..." : saved ? "Saved! ✓" : "Save interests"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function InterestsPage() {
  return <RequireAuth><InterestsForm /></RequireAuth>;
}
