"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { CATEGORIES } from "@/app/onboarding/page";

function ProSubtopicOverlay({ category, onClose }: { category: string; onClose: () => void }) {
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
        width: "100%", maxWidth: 400,
        background: "var(--white)",
        border: "1px solid var(--rule)",
        borderRadius: 16, padding: "36px 32px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "1.5rem", marginBottom: 12 }}>✦</p>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
          Sub-topics are a Pro feature
        </h3>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 24 }}>
          With Pro, you can narrow down <strong style={{ color: "var(--ink)" }}>{category}</strong> to the specific areas you care about most — so every article is even more relevant.
        </p>
        <a href="/register#pro" style={{
          display: "inline-block",
          background: "var(--accent)", color: "var(--white)",
          borderRadius: 10, padding: "11px 24px",
          fontSize: "0.9375rem", fontWeight: 600,
          textDecoration: "none", marginBottom: 12,
        }}>
          Learn about Pro →
        </a>
        <br />
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: "0.875rem", color: "var(--ink-muted)", marginTop: 4,
        }}>
          Continue with Free
        </button>
      </div>
    </div>
  );
}

function InterestsForm() {
  const router = useRouter();
  const { user, markInterestsSaved } = useAuth();

  const [selected, setSelected]         = useState<string[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [proOverlay, setProOverlay]     = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cogletta-categories");
    if (stored) setSelected(JSON.parse(stored));
  }, []);

  function toggleCategory(id: string) {
    if (selected.includes(id)) { setSelected(selected.filter(c => c !== id)); setSaved(false); return; }
    if (selected.length >= 3) return;
    setSelected([...selected, id]);
    setSaved(false);
  }

  async function handleSave() {
    if (selected.length !== 3 || !user) return;
    setLoading(true);
    setSaved(false);
    setShowTomorrow(false);
    try {
      const result = await updateUserInterests(selected, user.accessToken, user.email);
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

      {proOverlay && (
        <ProSubtopicOverlay
          category={proOverlay}
          onClose={() => setProOverlay(null)}
        />
      )}

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 5vw" }}>

        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
          Your interests
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>
          Pick 3 topics. Your content refreshes every morning at 07:00.
        </p>

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
            const isSelected = selected.includes(cat.id);
            return (
              <div key={cat.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
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

                {/* Sub-topics butonu — sadece seçili kategorilerde */}
                {isSelected && (
                  <button
                    onClick={() => setProOverlay(cat.label)}
                    style={{
                      borderRadius: "0 0 12px 12px",
                      padding: "10px 20px",
                      textAlign: "left",
                      cursor: "pointer",
                      border: "2px solid var(--accent)",
                      borderTop: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(124,92,62,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)" }}>
                      Add sub-topics
                    </span>
                    <span style={{ fontSize: "0.7rem", background: "var(--accent)", color: "var(--white)", padding: "2px 7px", borderRadius: 10, fontWeight: 700, letterSpacing: "0.05em" }}>
                      PRO
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
            {selected.length === 3 ? "Ready! 3 topics selected" : `${selected.length}/3 selected`}
          </p>
          <button onClick={handleSave} disabled={selected.length !== 3 || loading || showTomorrow}
            style={{
              background: saved ? "#166534" : "var(--ink)",
              color: "var(--white)", border: "none", borderRadius: 10,
              padding: "12px 28px", fontSize: "0.9375rem", fontWeight: 600,
              cursor: "pointer", opacity: (selected.length !== 3 || loading || showTomorrow) ? 0.3 : 1,
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
