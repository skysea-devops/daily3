"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { CATEGORIES } from "@/app/onboarding/page";

function InterestsForm() {
  const router = useRouter();
  const { user, markInterestsSaved } = useAuth();

  const [selected, setSelected]         = useState<string[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showTomorrow, setShowTomorrow] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cogletta-categories");
    if (stored) setSelected(JSON.parse(stored));
  }, []);

  function toggleCategory(id: string) {
    if (selected.includes(id)) { setSelected(selected.filter(c => c !== id)); setSaved(false); return; }
    if (selected.length === 3) return;
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
      <main style={{ maxWidth: 780, margin: "0 auto", padding: "56px 5vw" }}>

        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
          Your interests
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>
          Select exactly 3 topics. Your articles refresh every morning at 07:00.
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

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: 40 }}>
          {CATEGORIES.map(cat => {
            const isSelected = selected.includes(cat.id);
            const isDisabled = !isSelected && selected.length === 3;
            return (
              <button key={cat.id} onClick={() => toggleCategory(cat.id)} disabled={isDisabled}
                style={{
                  borderRadius: 12, padding: "18px 20px", textAlign: "left",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--rule)",
                  background: isSelected ? "var(--accent)" : isDisabled ? "var(--paper-warm)" : "var(--white)",
                  opacity: isDisabled ? 0.45 : 1,
                  transition: "all 0.15s",
                }}>
                <span style={{ fontSize: "1.5rem" }}>{cat.emoji}</span>
                <p style={{ marginTop: 10, fontWeight: 600, fontSize: "0.9375rem", color: isSelected ? "var(--white)" : "var(--ink)" }}>
                  {cat.label}
                </p>
                <p style={{ marginTop: 3, fontSize: "0.8rem", color: isSelected ? "rgba(255,255,255,0.75)" : "var(--ink-muted)", lineHeight: 1.4 }}>
                  {cat.description}
                </p>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
            {selected.length === 3 ? "Ready to save." : `Select ${3 - selected.length} more`}
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

