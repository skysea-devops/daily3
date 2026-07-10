"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireOnboarding } from "@/components/Guards";
import { CATEGORIES } from "@/lib/constants";

function OnboardingForm() {
  const router = useRouter();
  const { user, plan, markInterestsSaved } = useAuth();

  const isPro = plan === "pro";
  const maxTopics = isPro ? 3 : 1;

  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function toggleCategory(id: string) {
    if (selected.includes(id)) { setSelected(selected.filter(c => c !== id)); return; }
    if (selected.length >= maxTopics) {
      if (maxTopics === 1) { setSelected([id]); } // free: seçimi değiştir (radyo davranışı)
      return;
    }
    setSelected([...selected, id]);
  }

  async function continueToDashboard() {
    if (selected.length !== maxTopics || !user) return;
    setLoading(true);
    try {
      await updateUserInterests(selected, user.accessToken, user.email);
      localStorage.setItem("cogletta-categories", JSON.stringify(selected));
      markInterestsSaved();
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to save interests:", error);
      alert("Failed to save interests. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>

        <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-muted)", marginBottom: 12 }}>
          Step 1 of 1
        </p>

        <h1 style={{ fontSize: "2.25rem", fontWeight: 700, color: "var(--ink)", marginBottom: 12, lineHeight: 1.2 }}>
          Choose your interests
        </h1>

        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: isPro ? 32 : 8 }}>
          {isPro
            ? "Pick 3 topics. Every morning, Cogletta selects an article for each, plus two podcasts."
            : "Pick one topic to start. Every morning, Cogletta selects an article and a podcast episode about it."}
        </p>
        {!isPro && (
          <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", marginBottom: 32 }}>
            Pro readers follow 3 topics — with an article for each, every morning. You can upgrade anytime in Settings.
          </p>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}>
          {CATEGORIES.map((cat) => {
            const isSelected = selected.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                style={{
                  border: `1.5px solid ${isSelected ? "var(--ink)" : "var(--rule)"}`,
                  borderRadius: 16,
                  padding: "16px",
                  textAlign: "left",
                  cursor: "pointer",
                  background: isSelected ? "var(--ink)" : "var(--white)",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>{cat.emoji}</span>
                <p style={{
                  marginTop: 8, marginBottom: 4,
                  fontWeight: 600, fontSize: "0.9375rem",
                  color: isSelected ? "var(--white)" : "var(--ink)",
                }}>
                  {cat.label}
                </p>
                <p style={{
                  fontSize: "0.75rem",
                  color: isSelected ? "rgba(255,255,255,0.65)" : "var(--ink-muted)",
                  lineHeight: 1.4,
                  margin: 0,
                }}>
                  {cat.description}
                </p>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
            {selected.length === maxTopics
              ? `Ready! ${maxTopics === 1 ? "Topic" : `${maxTopics} topics`} selected`
              : `${selected.length}/${maxTopics} selected`}
          </p>

          <button
            onClick={continueToDashboard}
            disabled={selected.length !== maxTopics || loading}
            style={{
              background: "var(--ink)",
              color: "var(--white)",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: selected.length !== maxTopics || loading ? "not-allowed" : "pointer",
              opacity: selected.length !== maxTopics || loading ? 0.3 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Saving..." : "Continue →"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireOnboarding>
      <OnboardingForm />
    </RequireOnboarding>
  );
}
