"use client";

// src/components/RegisterModal.tsx
//
// Kayıt penceresi (ana sayfadan taşındı). Ana sayfadaki "Start reading for free"
// ve deneme sayfalarındaki paywall kutusu aynı pencereyi kullanır: misafir
// bulunduğu sayfadan ayrılmadan hesap açar. Kayıt olan herkes 14 günlük Pro
// denemesi alır (post-confirmation → claimTrial; e-posta bazlı deneme defteri).

import Link from "next/link";
import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/cognito";

export default function RegisterModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Modal artık ana dönüşüm yolu: açılınca odak ilk alana gider ve arkadaki
  // sayfa kaymaz. Bu efekt onClose'a BAĞLANMAMALI — prop referansı her
  // render'da değişince odağı kullanıcının elinden geri alır.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(name, email, password);
    } catch (err: any) {
      setError(err?.message || "Failed to create account.");
      setLoading(false);
      return;
    }

    // Hesap AÇILDI. Buradan sonrası best-effort: localStorage yazımı Safari
    // gizli sekmesinde/kota dolduğunda throw edebiliyor ve eskiden bu, başarılı
    // bir kaydı "Failed to create account." hatasına çeviriyordu.
    try {
      localStorage.setItem("pending_verification_email", email);
      localStorage.setItem("selected_plan", "free");
    } catch {}

    router.push("/verify-email");
  }

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

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(26,23,20,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-signup-title"
        style={{
          width: "100%", maxWidth: 440,
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderRadius: 16, padding: "40px 36px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h2 id="lp-signup-title" style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)" }}>
              Create your account
            </h2>
            {/* Kayıt olan herkes backend'de 14 günlük Pro denemesi alıyor
                (post-confirmation → claimTrial). Eski "Free plan" metni yanlıştı
                ve /register modalıyla da çelişiyordu. */}
            <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", marginTop: 4 }}>
              Starting with <strong style={{ color: "var(--ink)" }}>a 14-day Pro trial</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", fontSize: "1.25rem", lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={label}>Name</label>
            <input ref={firstFieldRef} style={input} type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label style={label}>Email</label>
            <input style={input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={label}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, paddingRight: 44 }}
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", display: "flex", alignItems: "center" }}
              >
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
            background: "var(--ink)", color: "var(--white)",
            border: "none", borderRadius: 10,
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
