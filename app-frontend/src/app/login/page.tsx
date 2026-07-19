"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, forgotPassword, confirmForgotPassword } from "@/lib/cognito";
import { useAuth } from "@/lib/auth-context";
import { RequireGuest } from "@/components/Guards";
import Navbar from "@/components/Navbar";

type View = "login" | "forgot" | "reset";

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
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--ink-soft)",
};

const btn: React.CSSProperties = {
  width: "100%",
  background: "var(--ink)",
  color: "var(--white)",
  border: "none",
  borderRadius: 10,
  padding: "13px 24px",
  fontSize: "0.9375rem",
  fontWeight: 600,
  cursor: "pointer",
};

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({ value, onChange, placeholder = "Your password", minLength }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...input, paddingRight: 44 }}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--ink-muted)", display: "flex", alignItems: "center",
        }}
        tabIndex={-1}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [view, setView]               = useState<View>("login");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [code, setCode]               = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      await refreshSession();
      // Kayıt akışından taşınan Pro niyeti varsa doğrudan checkout'a yönlendir
      let intent: "monthly" | "yearly" | null = null;
      try {
        const raw = localStorage.getItem("cogletta_plan_intent");
        if (raw) {
          const p = JSON.parse(raw);
          if ((p?.billing === "monthly" || p?.billing === "yearly") && p.exp > Date.now()) intent = p.billing;
          localStorage.removeItem("cogletta_plan_intent");
        }
      } catch {}
      if (intent) {
        router.push(`/settings?upgrade=${intent}`);
        return;
      }
      const saved = localStorage.getItem("cogletta-categories");
      router.push(saved ? "/dashboard" : "/onboarding");
    } catch (err: any) {
      setError(err?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSuccess("Check your email for the reset code.");
      setView("reset");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      setSuccess("Password updated! You can now sign in.");
      setView("login");
      setPassword("");
      setCode("");
      setNewPassword("");
    } catch (err: any) {
      setError(err?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      <main style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 5vw" }}>
        <section style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderRadius: 16,
          padding: "40px 36px",
        }}>

          {view === "login" && (
            <>
              <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                Welcome back
              </h1>
              <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>
                Sign in to continue reading.
              </p>

              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={label}>Email</label>
                  <input style={input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={label}>Password</label>
                    <button type="button" onClick={() => { setError(""); setSuccess(""); setView("forgot"); }}
                      style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", background: "none", border: "none", cursor: "pointer" }}>
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput value={password} onChange={setPassword} />
                </div>

                {success && <p style={{ background: "#f0fdf4", color: "#166534", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem" }}>{success}</p>}
                {error   && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem" }}>{error}</p>}

                <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.5 : 1 }}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <p style={{ marginTop: 24, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
                Don't have an account?{" "}
                <Link href="/register" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Create one</Link>
              </p>
            </>
          )}

          {view === "forgot" && (
            <>
              <button type="button" onClick={() => { setError(""); setView("login"); }}
                style={{ fontSize: "0.875rem", color: "var(--ink-muted)", background: "none", border: "none", cursor: "pointer", marginBottom: 24 }}>
                ← Back
              </button>
              <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Reset password</h1>
              <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>Enter your email and we'll send you a reset code.</p>
              <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={label}>Email</label>
                  <input style={input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                {error && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem" }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.5 : 1 }}>{loading ? "Sending..." : "Send reset code"}</button>
              </form>
            </>
          )}

          {view === "reset" && (
            <>
              <button type="button" onClick={() => { setError(""); setView("forgot"); }}
                style={{ fontSize: "0.875rem", color: "var(--ink-muted)", background: "none", border: "none", cursor: "pointer", marginBottom: 24 }}>
                ← Back
              </button>
              <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>New password</h1>
              <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>
                Enter the code sent to <strong>{email}</strong> and choose a new password.
              </p>
              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={label}>Reset code</label>
                  <input style={input} type="text" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required />
                </div>
                <div>
                  <label style={label}>New password</label>
                  <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Min. 8 characters" minLength={8} />
                </div>
                {error && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem" }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.5 : 1 }}>{loading ? "Updating..." : "Set new password"}</button>
              </form>
            </>
          )}

        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return <RequireGuest><LoginForm /></RequireGuest>;
}
