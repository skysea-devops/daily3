"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { RequireAuth } from "@/components/Guards";
import { useAuth } from "@/lib/auth-context";
import { buildLemonCheckoutUrl } from "@/lib/api";

function readPlanIntent(): "monthly" | "yearly" | null {
  try {
    const raw = localStorage.getItem("cogletta_plan_intent");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed?.billing === "monthly" || parsed?.billing === "yearly") && parsed.exp > Date.now()) {
      return parsed.billing;
    }
    localStorage.removeItem("cogletta_plan_intent");
  } catch {
    localStorage.removeItem("cogletta_plan_intent");
  }
  return null;
}

function CheckoutCompleteContent() {
  const router = useRouter();
  const { user, plan, hasInterests, refreshSession } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  // Retry için çevrimi önce URL (?plan=) üzerinden oku; login/onboarding niyeti
  // tek seferlik tükettiği için localStorage boş olabilir. localStorage yalnızca yedek.
  const intent = useMemo<"monthly" | "yearly" | null>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("plan");
      if (q === "monthly" || q === "yearly") return q;
    } catch {}
    return readPlanIntent();
  }, []);

  useEffect(() => {
    if (plan !== "pro") return;
    localStorage.removeItem("cogletta_plan_intent");
    router.replace(hasInterests ? "/dashboard" : "/onboarding");
  }, [hasInterests, plan, router]);

  useEffect(() => {
    if (plan === "pro") return;

    const delays = [0, 1500, 3000, 5000, 8000, 12000, 18000, 25000];
    const timers = delays.map((delay, index) =>
      window.setTimeout(async () => {
        setAttempt(index + 1);
        await refreshSession();
        if (index === delays.length - 1) setTimedOut(true);
      }, delay)
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [plan, refreshSession]);

  function retryCheckout() {
    if (!user || !intent) return;
    const url = buildLemonCheckoutUrl(intent, {
      userId: user.sub,
      email: user.email,
      redirectUrl: `${window.location.origin}/checkout-complete`,
    });
    window.location.href = url;
  }

  function continueFree() {
    localStorage.removeItem("cogletta_plan_intent");
    router.replace(hasInterests ? "/dashboard" : "/onboarding");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 18, padding: "48px 36px" }}>
          <div style={{ width: 34, height: 34, margin: "0 auto 24px", border: "3px solid var(--rule)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", marginBottom: 12 }}>
            Confirming your Pro membership
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: timedOut ? 28 : 0 }}>
            Your payment was received. We’re waiting for Lemon Squeezy to confirm it with Cogletta.
          </p>

          {timedOut && (
            <>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: 24 }}>
                Confirmation is taking longer than usual. You can retry checkout or continue with the Free plan instead.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {intent && (
                  <button onClick={retryCheckout} style={{ border: "none", borderRadius: 10, padding: "13px 20px", background: "var(--accent)", color: "var(--white)", fontWeight: 600, cursor: "pointer" }}>
                    Return to checkout
                  </button>
                )}
                <button onClick={() => void refreshSession()} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "12px 20px", background: "var(--white)", color: "var(--ink)", fontWeight: 600, cursor: "pointer" }}>
                  Check again
                </button>
                <button onClick={continueFree} style={{ border: "none", background: "none", color: "var(--ink-muted)", padding: 10, cursor: "pointer", textDecoration: "underline" }}>
                  Continue with Free instead
                </button>
              </div>
            </>
          )}

          {!timedOut && attempt > 0 && (
            <p style={{ marginTop: 20, color: "var(--ink-muted)", fontSize: "0.8125rem" }}>Confirmation check {attempt}…</p>
          )}
        </div>
      </main>
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function CheckoutCompletePage() {
  return (
    <RequireAuth>
      <CheckoutCompleteContent />
    </RequireAuth>
  );
}
