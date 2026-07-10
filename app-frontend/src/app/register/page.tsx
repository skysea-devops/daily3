"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/cognito";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";

const FREE_FEATURES = [
  "1 curated article daily on your chosen topic",
  "1 podcast recommendation daily",
  "Choose 1 of 15 interest categories",
  "Daily email digest",
  "Editorial commentary on each article",
];

const PRO_FEATURES = [
  "Everything in Free",
  "3 interests, 3 articles daily",
  "6 sub-topics per interest category",
  "2 podcast recommendations daily",
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
  const [showPassword, setShowPassword] = useState(false);

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
            <div style={{ position: "relative" }}>
              <input style={{ ...input, paddingRight: 44, boxSizing: "border-box" }} type={showPassword ? "text" : "password"} placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", display: "flex", alignItems: "center" }}>
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
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

function ProNotifyButton() {
  const { user } = useAuth();
  const [notified, setNotified] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cogletta-pro-notify") === "true";
  });

  // Sign in olmamışsa eski disabled buton
  if (!user) {
    return (
      <button disabled style={{
        width: "100%", background: "var(--paper-warm)", color: "var(--ink-muted)",
        border: "none", borderRadius: 10, padding: "13px 24px",
        fontSize: "0.9375rem", fontWeight: 600, cursor: "not-allowed",
      }}>
        Notify me when Pro launches
      </button>
    );
  }

  // Sign in olmuş — aktif buton
  if (notified) {
    return (
      <div style={{
        width: "100%", background: "#f0fdf4", border: "1px solid #bbf7d0",
        borderRadius: 10, padding: "13px 24px", textAlign: "center",
        fontSize: "0.9375rem", fontWeight: 600, color: "#166534",
        boxSizing: "border-box",
      }}>
        ✓ We'll let you know when Pro launches
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        localStorage.setItem("cogletta-pro-notify", "true");
        setNotified(true);
      }}
      style={{
        width: "100%", background: "var(--accent)", color: "var(--white)",
        border: "none", borderRadius: 10, padding: "13px 24px",
        fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer",
      }}
    >
      Notify me when Pro launches →
    </button>
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
            Every morning, a curated article and a podcast episode selected for your interests — delivered to your inbox before you start your day.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "60px 5vw" }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(2, 1fr)" }}>

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
          <div id="pro" style={{ background: "var(--white)", border: "2px solid var(--accent)", borderRadius: 16, padding: 36, display: "flex", flexDirection: "column", position: "relative" }}>
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
              <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginTop: 8, marginBottom: 4 }}>Go deeper</h2>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                <span style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)" }}>$5.80</span>
                <span style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>/ month</span>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.65 }}>For serious readers. More interests, deeper personalisation, and weekly reading reports.</p>
            </div>
            <ul style={{ flex: 1, listStyle: "none", marginBottom: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {PRO_FEATURES.map(f => (
                <li key={f} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 1, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{f}</span>
                </li>
              ))}
            </ul>
            <ProNotifyButton />
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
