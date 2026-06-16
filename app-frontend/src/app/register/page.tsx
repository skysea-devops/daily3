"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/cognito";
import Navbar from "@/components/Navbar";

const FREE_FEATURES = [
  "3 curated long-form articles in your interests daily",
  "1 podcast recommendation daily",
  "15 interest categories to choose from",
  "Daily email digest",
  "Editorial commentary on each article",
];

const PRO_FEATURES = [
  "Everything in Free",
  "6 sub-topics per category (granular selection)",
  "Personalised prompt — AI picks articles for your specific focus",
  "3 podcast recommendations daily",
  "3 video recommendations daily",
  "Weekly trend report every Sunday",
];

const input: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: "0.9375rem",
  background: "var(--white)",
  color: "var(--ink)",
  outline: "none",
};

const label: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--ink-soft)",
};

function RegisterModal({ plan, onClose }: { plan: "free" | "pro"; onClose: () => void }) {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(name, email, password);
      localStorage.setItem("pending_verification_email", email);
      localStorage.setItem("selected_plan", plan);
      router.push("/verify-email");
    } catch (err: any) {
      setError(err?.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(26,23,20,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 440,
        background: "var(--white)",
        border: "1px solid var(--rule)",
        borderRadius: 16, padding: "40px 36px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)" }}>
              Create your account
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", marginTop: 4 }}>
              Starting with <strong style={{ color: plan === "pro" ? "var(--accent)" : "var(--ink)" }}>
                {plan === "pro" ? "Pro" : "Free"} plan
              </strong>
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", fontSize: "1.25rem", lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={label}>Name</label>
            <input style={input} type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label style={label}>Email</label>
            <input style={input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={label}>Password</label>
            <input style={input} type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>

          {error && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem" }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            background: plan === "pro" ? "var(--accent)" : "var(--ink)",
            color: "var(--white)", border: "none", borderRadius: 10,
            padding: "13px 24px", fontSize: "0.9375rem", fontWeight: 600,
            cursor: "pointer", opacity: loading ? 0.5 : 1,
          }}>
            {loading ? "Creating account..." : "Create account →"}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [modal, setModal] = useState<"free" | "pro" | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      {modal && <RegisterModal plan={modal} onClose={() => setModal(null)} />}

      {/* Hero */}
      <div style={{ borderBottom: "1px solid var(--rule)", background: "var(--white)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "72px 5vw 64px", textAlign: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
            Join Cogletta
          </span>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 600, color: "var(--ink)", marginTop: 16, marginBottom: 16, lineHeight: 1.2 }}>
            Read what matters to you.
          </h1>
          <p style={{ fontSize: "1.0625rem", color: "var(--ink-soft)", maxWidth: 500, margin: "0 auto", lineHeight: 1.75 }}>
            Every morning, three long-form articles selected for your interests — delivered to your inbox before you start your day.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 5vw" }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>

          {/* Free */}
          <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, padding: 36, display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Free</span>
              <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginTop: 8, marginBottom: 8 }}>Start reading today</h2>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.65 }}>Everything you need to build a daily reading habit. No credit card required.</p>
            </div>
            <ul style={{ flex: 1, listStyle: "none", marginBottom: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {FREE_FEATURES.map(f => (
                <li key={f} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 1, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{f}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setModal("free")} style={{
              width: "100%", background: "var(--ink)", color: "var(--white)",
              border: "none", borderRadius: 10, padding: "13px 24px",
              fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer",
            }}>
              Get started for free →
            </button>
          </div>

          {/* Pro */}
          <div style={{ background: "var(--white)", border: "2px solid var(--accent)", borderRadius: 16, padding: 36, display: "flex", flexDirection: "column", position: "relative" }}>
            <div style={{
              position: "absolute", top: -13, left: 28,
              background: "var(--accent)", color: "var(--white)",
              fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: 20,
            }}>
              Coming soon
            </div>
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>Pro</span>
              <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginTop: 8, marginBottom: 8 }}>Go deeper</h2>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.65 }}>For serious readers. Granular personalisation, podcasts, videos, and weekly reports.</p>
            </div>
            <ul style={{ flex: 1, listStyle: "none", marginBottom: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {PRO_FEATURES.map(f => (
                <li key={f} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 1, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{f}</span>
                </li>
              ))}
            </ul>
            <button disabled style={{
              width: "100%", background: "var(--paper-warm)", color: "var(--ink-muted)",
              border: "none", borderRadius: 10, padding: "13px 24px",
              fontSize: "0.9375rem", fontWeight: 600, cursor: "not-allowed",
            }}>
              Notify me when Pro launches
            </button>
          </div>

        </div>

        <p style={{ marginTop: 32, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-muted)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
