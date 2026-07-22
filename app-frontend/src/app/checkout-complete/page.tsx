"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { RequireAuth } from "@/components/Guards";
import { useAuth } from "@/lib/auth-context";
import { createCheckout } from "@/lib/api";

// Çevrimi önce URL (?plan=) üzerinden oku; login/onboarding/settings niyeti buraya
// ?plan ile taşıyor. localStorage yalnızca yedek.
function readIntent(): "monthly" | "yearly" | null {
  try {
    const q = new URLSearchParams(window.location.search).get("plan");
    if (q === "monthly" || q === "yearly") return q;
  } catch {}
  try {
    const raw = localStorage.getItem("cogletta_plan_intent");
    if (raw) {
      const p = JSON.parse(raw);
      if ((p?.billing === "monthly" || p?.billing === "yearly") && p.exp > Date.now()) return p.billing;
    }
  } catch {}
  return null;
}

const card: React.CSSProperties = {
  background: "var(--white)", border: "1px solid var(--rule)",
  borderRadius: 18, padding: "48px 36px", textAlign: "center",
};
const primaryBtn: React.CSSProperties = {
  border: "none", borderRadius: 10, padding: "13px 20px",
  background: "var(--accent)", color: "var(--white)", fontWeight: 600, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid var(--rule)", borderRadius: 10, padding: "12px 20px",
  background: "var(--white)", color: "var(--ink)", fontWeight: 600, cursor: "pointer",
};

function CheckoutCompleteContent() {
  const router = useRouter();
  const { user, plan, hasInterests, refreshSession } = useAuth();

  const intent = useMemo(readIntent, []);
  // paid=1 â Ã¶deme sonrasÄ± LS dÃ¶nÃ¼ÅÃ¼. Checkout artÄ±k AYNI sekmede aÃ§Ä±lÄ±yor (yeni
  // sekme/hub yok): kullanÄ±cÄ± Ã¶deyip aynÄ± sekmeye paid=1 ile geri dÃ¶ner.
  const paid = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("paid") === "1"; } catch { return false; }
  }, []);

  const planWord = intent === "yearly" ? "yearly" : "monthly";
  const planPrice = intent === "yearly" ? "$58/year" : "$5.80/month";
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  // "Maybe later" / Free ile devam
  function goFree() {
    localStorage.removeItem("cogletta_plan_intent");
    router.replace(hasInterests ? "/dashboard" : "/onboarding");
  }

  // Ãdeme onaylandÄ±ktan sonra: 3 topic seÃ§mek iÃ§in interests sayfasÄ±na
  function goToInterests() {
    localStorage.removeItem("cogletta_plan_intent");
    router.replace("/interests");
  }

  // Zaten Pro olup paid dÃ¶nÃ¼ÅÃ¼ olmadan bu sayfaya gelmiÅse ilerlet
  useEffect(() => {
    if (plan !== "pro") return;
    localStorage.removeItem("cogletta_plan_intent");
    if (!paid) router.replace(hasInterests ? "/dashboard" : "/interests");
  }, [plan, paid, hasInterests, router]);

  // Ãdeme dÃ¶nÃ¼ÅÃ¼nde (paid) webhook onayÄ±nÄ± bekle: plan pro olana kadar profili yenile.
  useEffect(() => {
    if (plan === "pro") return;
    if (!paid) return;
    const delays = [0, 1500, 3000, 5000, 8000, 12000, 18000, 25000, 40000, 60000];
    const timers = delays.map((delay, index) =>
      window.setTimeout(async () => {
        setAttempt(index + 1);
        await refreshSession();
        if (index === delays.length - 1) setTimedOut(true);
      }, delay)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [plan, paid, refreshSession]);

  // Checkout'u AYNI sekmede aÃ§. window.location.href jest gerektirmez â popup sorunu
  // yok. Ãdeme sonrasÄ± LS bizi buraya paid=1 ile geri getirir.
  async function openCheckout() {
    setError("");
    if (!user || !intent) {
      setError("Checkout is not available here. Please start again from Settings.");
      return;
    }
    setRedirecting(true);
    try {
      const { url } = await createCheckout(intent, user.accessToken);
      localStorage.removeItem("cogletta_plan_intent");
      window.location.href = url;
    } catch (e: any) {
      setRedirecting(false);
      if (e?.code === "already_subscribed") {
        setError("You already have an active Cogletta Pro subscription. You can manage it from Settings.");
      } else {
        setError(e?.message || "Could not start checkout. Please try again.");
      }
    }
  }

  // ââ GÃ¶rÃ¼nÃ¼m durumlarÄ± ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  // Ãdeme onaylandÄ± â Pro
  if (paid && plan === "pro") {
    return (
      <Shell>
        <div style={{ ...card }}>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", marginBottom: 12 }}>
            You&apos;re Pro â welcome aboard
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 24 }}>
            Your payment is confirmed. You can continue to the interests page to select your 3 topics.
          </p>
          <button onClick={goToInterests} style={{ ...primaryBtn, width: "100%" }}>Continue →</button>
        </div>
      </Shell>
    );
  }

  // Ãdeme dÃ¶nÃ¼ÅÃ¼, onay bekleniyor
  if (paid) {
    return (
      <Shell>
        <div style={{ ...card }}>
          <Spinner />
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", margin: "0 0 12px" }}>
            Confirming your payment
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
            We&apos;re checking your payment status. This can take a few seconds.
          </p>
          {attempt > 0 && !timedOut && (
            <p style={{ marginTop: 20, color: "var(--ink-muted)", fontSize: "0.8125rem" }}>Confirmation check {attempt}…</p>
          )}
          {timedOut && (
            <button onClick={() => void refreshSession()} style={{ ...ghostBtn, width: "100%", marginTop: 24 }}>
              Check again
            </button>
          )}
        </div>
      </Shell>
    );
  }

  // Plan yok
  if (!intent) {
    return (
      <Shell>
        <div style={{ ...card }}>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", margin: "0 0 12px" }}>
            Choose your plan
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 28 }}>
            Pick a Cogletta Pro plan to continue.
          </p>
          <button onClick={() => router.push("/register#pro")} style={{ ...primaryBtn, width: "100%" }}>
            See Pro plans →
          </button>
        </div>
      </Shell>
    );
  }

  // Checkout'a gitmeden Ã¶nceki adÄ±m â aynÄ± sekmede aÃ§Ä±lÄ±r
  return (
    <Shell>
      <div style={{ ...card }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>
          Cogletta Pro · {planWord}
        </span>
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", margin: "10px 0 12px" }}>
          One step left
        </h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 28 }}>
          We&apos;ll take you to the secure <strong>{planWord}</strong> Cogletta Pro checkout ({planPrice}). You&apos;ll come right back here once your payment completes.
        </p>
        {error && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem", marginBottom: 16 }}>{error}</p>}
        <button onClick={openCheckout} disabled={redirecting} style={{ ...primaryBtn, width: "100%", opacity: redirecting ? 0.7 : 1 }}>
          {redirecting ? "Redirecting…" : "Continue to secure checkout →"}
        </button>
        <button onClick={goFree} style={{ ...ghostBtn, width: "100%", marginTop: 10, border: "none", background: "none", color: "var(--ink-muted)", textDecoration: "underline" }}>
          Maybe later â continue with Free
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>{children}</main>
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 34, height: 34, margin: "0 auto 24px",
      border: "3px solid var(--rule)", borderTopColor: "var(--accent)",
      borderRadius: "50%", animation: "spin 0.9s linear infinite",
    }} />
  );
}

export default function CheckoutCompletePage() {
  return (
    <RequireAuth>
      <CheckoutCompleteContent />
    </RequireAuth>
  );
}
