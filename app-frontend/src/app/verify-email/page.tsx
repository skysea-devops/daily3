"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmSignUp, resendConfirmationCode } from "@/lib/cognito";
import Navbar from "@/components/Navbar";

const RESEND_COOLDOWN_SEC = 60;

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

export default function VerifyEmailPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const pendingEmail = localStorage.getItem("pending_verification_email");
    if (pendingEmail) setEmail(pendingEmail);
  }, []);

  // Resend sonrası geri sayım (spam ve Cognito rate limit'e karşı)
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      localStorage.removeItem("pending_verification_email");
      router.push("/login");
    } catch (err: any) {
      setError(err?.message || "Failed to verify email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || resending || cooldown > 0) return;
    setError("");
    setResendMessage("");
    setResending(true);
    try {
      await resendConfirmationCode(email);
      setResendMessage("A new code is on its way — check your inbox (and spam folder).");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err: any) {
      // LimitExceededException vb. Cognito hataları
      setError(err?.message || "Couldn't resend the code. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <Navbar />
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "var(--white)", borderRadius: 20, padding: "40px 36px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
            Verify your email
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", marginBottom: 32 }}>
            Enter the verification code we sent to your email address.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={input}
              />
            </div>

            <div>
              <label style={label}>Verification Code</label>
              <input
                type="text"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputMode="numeric"
                maxLength={6}
                style={{ ...input, letterSpacing: "0.2em", fontSize: "1.125rem" }}
              />
            </div>

            {error && (
              <p style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 10, padding: "12px 16px", fontSize: "0.875rem" }}>
                {error}
              </p>
            )}
            {resendMessage && (
              <p style={{ background: "#f0fdf4", color: "#166534", borderRadius: 10, padding: "12px 16px", fontSize: "0.875rem" }}>
                ✓ {resendMessage}
              </p>
            )}

            <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Verifying…" : "Verify email"}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={!email || resending || cooldown > 0}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--ink)",
                cursor: !email || resending || cooldown > 0 ? "not-allowed" : "pointer",
                opacity: !email || resending || cooldown > 0 ? 0.5 : 1,
                textDecoration: "underline",
              }}
            >
              {resending ? "Sending…" : cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
            </button>
          </p>

          <p style={{ marginTop: 16, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
            Already verified?{" "}
            <Link href="/login" style={{ color: "var(--ink)", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
