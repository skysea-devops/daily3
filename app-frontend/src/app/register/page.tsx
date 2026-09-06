// app-frontend/src/app/register/page.tsx
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/cognito";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";

// Kayıt→doğrulama→giriş zinciri boyunca Pro niyetini taşır (yeni sekmede
// açılan doğrulama linkine dayanıklı olması için localStorage; 1 saat geçerli).
function setPlanIntent(billing: "monthly" | "yearly") {
  try {
    localStorage.setItem("cogletta_plan_intent", JSON.stringify({ billing, exp: Date.now() + 3600_000 }));
  } catch {}
}

/**
 * Sayfanın gösterdiği 4 farklı kullanıcı durumu.
 *
 * Eskiden bu sayfa herkese aynı "yeni ziyaretçi" fiyat sayfası gibi davranıyordu:
 * denemesi bitmiş, giriş yapmış bir kullanıcı bile "Start my 14-day free trial →"
 * butonunu görüyordu. Buton onu kayıt modalına götürüyor, yani mevcut hesabı
 * varken yeni hesap açmaya çağırıyordu — hem yanıltıcı hem de deneme kötüye
 * kullanımına davetiye.
 *
 * Not: arayüzde gizlemek TEK BAŞINA yeterli değil. Asıl kontrol backend'de:
 * deneme hakkı e-posta seviyesinde bir defterde tutuluyor (bkz.
 * app-backend/shared/trial-ledger.ts) ve /me/profile efektif planı dönüyor.
 */
type ViewerState = "loading" | "guest" | "trial" | "free" | "pro";

// Sol sutun: yeni kullanici 14 gun boyunca tam Pro deneyimini ucretsiz kullanir,
// ardindan otomatik olarak Free plana gecer. Sag sutun: Pro deneyimini kesintisiz surdurur.
const TRIAL_FEATURES = [
  "Choose 3 topics",
  "3 curated articles every morning — one for each topic",
  "2 podcast recommendations daily",
  "Personalized sub-topics",
  "The Sunday Supplement every week",
];

const FREE_FEATURES = [
  "1 article every morning",
  "1 podcast recommendation daily",
  "Random topics",
];

const PRO_FEATURES = [
  "Choose 3 topics",
  "3 curated articles every morning — one for each topic",
  "2 podcast recommendations daily",
  "Personalized sub-topics",
  "The Sunday Supplement every week",
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

const cardStyle: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid var(--rule)",
  borderRadius: 16,
  padding: 36,
  display: "flex",
  flexDirection: "column",
};

const primaryBtn: React.CSSProperties = {
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

const secondaryBtn: React.CSSProperties = {
  width: "100%",
  background: "none",
  color: "var(--ink-soft)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  padding: "11px 24px",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
};

const eyebrow: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

const cardTitle: React.CSSProperties = {
  fontFamily: "'Lora', serif",
  fontSize: "1.5rem",
  fontWeight: 600,
  color: "var(--ink)",
  marginTop: 8,
  marginBottom: 8,
};

const cardBody: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "var(--ink-soft)",
  lineHeight: 1.65,
};

function FeatureList({ items, muted = false }: { items: string[]; muted?: boolean }) {
  return (
    <ul style={{ listStyle: "none", marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map(f => (
        <li key={f} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: muted ? "var(--ink-muted)" : "var(--accent)", marginTop: 1, fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{f}</span>
        </li>
      ))}
    </ul>
  );
}

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
                {plan === "pro" ? "Pro" : "a 14-day Pro trial"}
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

function ProNotifyButton({ onStart }: { onStart: (billing: "monthly" | "yearly") => void }) {
  const { user } = useAuth();
  const router = useRouter();

  // Checkout is always available (created by the backend). Visitors go through the
  // register modal; logged-in users go straight to the checkout hub.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        onClick={() => {
          if (user) { router.push("/checkout-complete?plan=yearly"); }
          else onStart("yearly");
        }}
        style={{
          width: "100%", background: "var(--accent)", color: "var(--white)",
          border: "none", borderRadius: 10, padding: "13px 24px",
          fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer",
        }}
      >
        Choose yearly &mdash; $58/year &rarr;
      </button>
      <button
        onClick={() => {
          if (user) { router.push("/checkout-complete?plan=monthly"); }
          else onStart("monthly");
        }}
        style={{
          width: "100%", background: "none", color: "var(--ink-soft)",
          border: "1px solid var(--rule)", borderRadius: 10, padding: "11px 24px",
          fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
        }}
      >
        Choose monthly &middot; $5.80/month
      </button>
    </div>
  );
}

// ─── Sol sütun kartları ───────────────────────────────────────────────────────

/** Ziyaretçi (giriş yapmamış) — deneme CTA'sı YALNIZCA burada gösterilir. */
function GuestTrialCard({ onStart }: { onStart: () => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 24 }}>
        <span style={eyebrow}>14 days of Pro — free</span>
        <h2 style={cardTitle}>Try the full experience first</h2>
        <p style={cardBody}>
          Every new reader starts with Cogletta Pro for 14 days. No credit card required and nothing to cancel.
        </p>
      </div>

      <FeatureList items={TRIAL_FEATURES} />

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 22, marginTop: 2, marginBottom: 26 }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
          After your 14-day trial
        </span>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "1.05rem", fontWeight: 600, color: "var(--ink)", marginTop: 7, marginBottom: 7 }}>
          Continue free, automatically
        </h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 14 }}>
          You’ll move to the Free plan automatically. Upgrade only if you want to keep the full Pro experience.
        </p>
        <FeatureList items={FREE_FEATURES} muted />
      </div>

      <button onClick={onStart} style={primaryBtn}>
        Start my 14-day free trial →
      </button>
      <p style={{ marginTop: 10, textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
        No credit card required
      </p>
    </div>
  );
}

/** Denemesi süren kullanıcı. */
function ActiveTrialCard({ daysLeft, onDashboard }: { daysLeft: number | null; onDashboard: () => void }) {
  const dayText =
    daysLeft === null ? "Your Pro trial is running"
    : daysLeft === 1  ? "1 day left"
    : `${daysLeft} days left`;

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 24 }}>
        <span style={eyebrow}>Your Pro trial is active</span>
        <h2 style={cardTitle}>{dayText}</h2>
        <p style={cardBody}>
          You already have the full Cogletta Pro experience. Nothing to do here — your reading is waiting on the dashboard.
        </p>
      </div>

      <FeatureList items={TRIAL_FEATURES} />

      <div style={{ flex: 1 }} />

      <button onClick={onDashboard} style={primaryBtn}>
        Go to my dashboard →
      </button>
      <p style={{ marginTop: 10, textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
        When your trial ends you’ll move to the Free plan automatically
      </p>
    </div>
  );
}

/** Denemesi bitmiş / Free plandaki kullanıcı — deneme CTA'sı YOK. */
function FreePlanCard({ usedTrial, onDashboard }: { usedTrial: boolean; onDashboard: () => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ ...eyebrow, color: "var(--ink-muted)" }}>Your current plan</span>
        <h2 style={cardTitle}>You’re on the Free plan</h2>
        <p style={cardBody}>
          {usedTrial
            ? "Your Pro trial has ended, so you’re reading on the Free plan. The trial is a one-time thing — but Pro is here whenever you want it."
            : "You’re reading on the Free plan. Upgrade to Pro whenever you want the full experience."}
        </p>
      </div>

      <FeatureList items={FREE_FEATURES} muted />

      <div style={{ flex: 1 }} />

      <button onClick={onDashboard} style={primaryBtn}>
        Go to my dashboard →
      </button>
      <p style={{ marginTop: 10, textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
        Choose a Pro plan on the right to upgrade
      </p>
    </div>
  );
}

/** Ödeme yapmış Pro kullanıcı. */
function PaidProCard({ onDashboard, onManage }: { onDashboard: () => void; onManage: () => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 24 }}>
        <span style={eyebrow}>Your current plan</span>
        <h2 style={cardTitle}>You’re on Cogletta Pro</h2>
        <p style={cardBody}>
          Thanks for supporting Cogletta. Everything below is already included in your subscription.
        </p>
      </div>

      <FeatureList items={PRO_FEATURES} />

      <div style={{ flex: 1 }} />

      <button onClick={onDashboard} style={{ ...primaryBtn, marginBottom: 10 }}>
        Go to my dashboard →
      </button>
      <button onClick={onManage} style={secondaryBtn}>
        Manage subscription
      </button>
    </div>
  );
}

/** Oturum yüklenirken iskelet — deneme CTA'sının bir an görünmesini engeller. */
function LoadingCard() {
  return (
    <div style={{ ...cardStyle, minHeight: 420, justifyContent: "center", alignItems: "center" }}>
      <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>Loading your plan…</p>
    </div>
  );
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [modal, setModal] = useState<"free" | "pro" | null>(null);
  const router = useRouter();
  const { user, loading, plan, planSource, trialEndsAt, trial } = useAuth();

  // `plan` artık backend'in hesapladığı EFEKTİF plan: denemesi bitmiş kullanıcı
  // cron çalışmamış olsa bile burada "free" görünür.
  const state: ViewerState =
    loading                                    ? "loading"
    : !user                                    ? "guest"
    : plan === "pro" && planSource === "paid"  ? "pro"
    : plan === "pro" && planSource === "trial" ? "trial"
    :                                            "free";

  // Kalan gün: backend daysLeft dönüyor; dönmezse trialEndsAt'ten hesapla.
  const daysLeft = (() => {
    if (typeof trial?.daysLeft === "number") return trial.daysLeft;
    if (!trialEndsAt) return null;
    const diff = Date.parse(trialEndsAt) - Date.now();
    if (Number.isNaN(diff) || diff <= 0) return null;
    return Math.max(1, Math.ceil(diff / 86_400_000));
  })();

  const usedTrial = trial ? trial.status === "expired" : false;

  const heroCopy: Record<ViewerState, { eyebrow: string; title: string; body: string }> = {
    loading: {
      eyebrow: "Cogletta",
      title:   "Your plan",
      body:    "One moment while we load your account.",
    },
    guest: {
      eyebrow: "Join Cogletta",
      title:   "Start with the full Cogletta experience.",
      body:    "Try Cogletta Pro free for 14 days. No credit card required. After your trial, continue free or keep the full experience with Pro.",
    },
    trial: {
      eyebrow: "Your trial",
      title:   "You’re already reading with Pro.",
      body:    "Your 14-day trial is running. Keep Pro after it ends by choosing a plan below — nothing is charged automatically.",
    },
    free: {
      eyebrow: "Your plan",
      title:   "Keep the full Cogletta experience.",
      body:    "You’re on the Free plan. Pro brings back your three topics, three daily articles, two podcasts, and the Sunday Supplement.",
    },
    pro: {
      eyebrow: "Your plan",
      title:   "You’re on Cogletta Pro.",
      body:    "Everything is already included. You can change or cancel your plan any time from Settings.",
    },
  };

  const hero = heroCopy[state];

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      {modal && <RegisterModal plan={modal} onClose={() => setModal(null)} />}

      {/* Hero */}
      <div style={{ borderBottom: "1px solid var(--rule)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "72px 5vw 64px", textAlign: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
            {hero.eyebrow}
          </span>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 600, color: "var(--ink)", marginTop: 16, marginBottom: 16, lineHeight: 1.2 }}>
            {hero.title}
          </h1>
          <p style={{ fontSize: "1.0625rem", color: "var(--ink-soft)", maxWidth: 500, margin: "0 auto", lineHeight: 1.75 }}>
            {hero.body}
          </p>
        </div>
      </div>

      {/* Plans */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "60px 5vw" }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(2, 1fr)" }}>

          {/* Sol sütun — kullanıcının mevcut durumu */}
          {state === "loading" && <LoadingCard />}
          {state === "guest"   && <GuestTrialCard onStart={() => setModal("free")} />}
          {state === "trial"   && <ActiveTrialCard daysLeft={daysLeft} onDashboard={() => router.push("/dashboard")} />}
          {state === "free"    && <FreePlanCard usedTrial={usedTrial} onDashboard={() => router.push("/dashboard")} />}
          {state === "pro"     && <PaidProCard onDashboard={() => router.push("/dashboard")} onManage={() => router.push("/settings")} />}

          {/* Pro */}
          <div id="pro" style={{ background: "var(--white)", border: "2px solid var(--accent)", borderRadius: 16, padding: 36, display: "flex", flexDirection: "column", position: "relative" }}>
            <div style={{
              position: "absolute", top: -13, left: 28,
              background: "var(--accent)", color: "var(--white)",
              fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: 20,
            }}>
              {state === "pro" ? "Your plan" : "Save 17% with yearly"}
            </div>

            <div style={{ marginBottom: 24 }}>
              <span style={eyebrow}>Cogletta Pro</span>
              <h2 style={cardTitle}>
                {state === "pro" ? "You’re all set" : "Keep the full experience"}
              </h2>
              <p style={{ ...cardBody, marginBottom: 18 }}>
                Keep all three topics, three daily articles, personalized sub-topics, two podcasts, and the Sunday Supplement.
              </p>

              {state !== "pro" && (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Lora', serif", fontSize: "2rem", fontWeight: 600, color: "var(--ink)" }}>$58</span>
                    <span style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>/ year</span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>
                    Save 17% vs monthly
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)" }}>
                    Equivalent to $4.83/month · Monthly plan $5.80
                  </p>
                </>
              )}
            </div>

            <ul style={{ flex: 1, listStyle: "none", marginBottom: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {PRO_FEATURES.map(f => (
                <li key={f} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 1, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{f}</span>
                </li>
              ))}
            </ul>

            {/* Zaten ödeme yapmış kullanıcıya checkout gösterme — ikinci abonelik
                backend'de zaten engelleniyor, arayüzde de teklif edilmemeli. */}
            {state === "pro" ? (
              <button onClick={() => router.push("/settings")} style={secondaryBtn}>
                Manage subscription
              </button>
            ) : state === "loading" ? (
              <div style={{ height: 92 }} />
            ) : (
              <ProNotifyButton onStart={(billing) => { setPlanIntent(billing); setModal("pro"); }} />
            )}
          </div>
        </div>

        <p style={{ marginTop: 32, textAlign: "center", fontSize: "0.875rem", color: "var(--ink-muted)" }}>
          {state === "guest" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
            </>
          ) : state === "loading" ? null : (
            <>
              Manage your account in{" "}
              <Link href="/settings" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Settings</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
