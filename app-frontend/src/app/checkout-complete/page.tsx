"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { RequireAuth } from "@/components/Guards";
import { useAuth } from "@/lib/auth-context";
import { buildLemonCheckoutUrl } from "@/lib/api";

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
  // paid=1 → bu sekme LS ödemesinden GERİ dönen (yeni) sekme.
  const paid = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("paid") === "1"; } catch { return false; }
  }, []);

  const [opened, setOpened] = useState(false);   // bu (hub) sekmesinden checkout açıldı mı

  // Seçilen plana göre açıklama metni (ürün İngilizce)
  const planWord = intent === "yearly" ? "yearly" : "monthly";
  const planPrice = intent === "yearly" ? "$58/year" : "$5.80/month";
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState("");

  function goNext() {
    localStorage.removeItem("cogletta_plan_intent");
    router.replace(hasInterests ? "/dashboard" : "/onboarding");
  }

  // Pro onaylandığında: hub sekmesi kullanıcıyı otomatik ilerletir. paid sekmesi
  // (LS dönüşü) otomatik ilerlemez — kullanıcı "Continue" ile ya da orijinal
  // cogletta sekmesine dönerek devam eder. Böylece iki sekme aynı anda onboarding'e atmaz.
  useEffect(() => {
    if (plan !== "pro") return;
    localStorage.removeItem("cogletta_plan_intent");
    if (!paid) router.replace(hasInterests ? "/dashboard" : "/onboarding");
  }, [plan, paid, hasInterests, router]);

  // Webhook onayını bekle: ödeme yapıldıysa (paid) ya da bu sekmeden checkout
  // açıldıysa (opened), plan pro olana kadar profili artan aralıklarla yenile.
  useEffect(() => {
    if (plan === "pro") return;
    if (!paid && !opened) return;
    // Ödeme LS sekmesinde dakikalarca sürebildiği için onay yoklamasını 5 dakikaya
    // kadar uzatıyoruz (mount anından itibaren mutlak gecikmeler, ms). Son adım (300000ms
    // = 5 dk) "timed out" durumunu tetikler; kullanıcı yine de Check again ile yoklayabilir.
    const delays = [
      0, 1500, 3000, 5000, 8000, 12000, 18000, 25000,
      35000, 50000, 70000, 95000, 125000, 160000, 200000, 245000, 300000,
    ];
    const timers = delays.map((delay, index) =>
      window.setTimeout(async () => {
        setAttempt(index + 1);
        await refreshSession();
        if (index === delays.length - 1) setTimedOut(true);
      }, delay)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [plan, paid, opened, refreshSession]);

  // Doğrudan bir tıklama içinden çağrılır → tarayıcı yeni sekmeyi engellemez.
  function openCheckout() {
    setError("");
    if (!user || !intent) {
      setError("Checkout is not available here. Please start again from Settings.");
      return;
    }
    let url: string;
    try {
      url = buildLemonCheckoutUrl(intent, {
        userId: user.sub,
        email: user.email,
        // Ödeme sonrası LS bu (yeni) sekmeyi buraya paid=1 ile geri getirir.
        redirectUrl: `${window.location.origin}/checkout-complete?plan=${intent}&paid=1`,
      });
    } catch (e: any) {
      setError(e?.message || "Checkout is not configured.");
      return;
    }
    // ÖNEMLİ: "noopener" verilirsek window.open spec gereği null döndürür (başarılı
    // açsa bile) ve aşağıdaki fallback yanlışlıkla bu sekmeyi de LS'e götürür.
    // Bu yüzden noopener'ı KALDIRIYORUZ; başarı/başarısızlığı gerçek dönüş değeriyle
    // ölçüp, reverse-tabnabbing'e karşı opener'ı elle koparıyoruz.
    const win = window.open(url, "_blank");
    if (!win) {
      // Popup gerçekten engellendi → aynı sekmede aç (fallback). Bu sekme LS'e gider.
      window.location.href = url;
      return;
    }
    try { (win as unknown as { opener: unknown }).opener = null; } catch {}
    localStorage.removeItem("cogletta_plan_intent"); // tek seferlik tüket
    setOpened(true);
  }

  // ── Görünüm durumları ──────────────────────────────────────────────────────

  // paid sekmesi + Pro onaylandı: manuel devam (orijinal sekme zaten ilerledi).
  if (paid && plan === "pro") {
    return (
      <Shell>
        <div style={{ ...card }}>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", marginBottom: 12 }}>
            You&apos;re Pro — welcome aboard
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 24 }}>
            Your payment is confirmed. You can continue here, or return to your original Cogletta tab.
          </p>
          <button onClick={goNext} style={{ ...primaryBtn, width: "100%" }}>Continue →</button>
        </div>
      </Shell>
    );
  }

  // paid sekmesi + henüz onay yok: bekleme.
  if (paid) {
    return (
      <Shell>
        <div style={{ ...card }}>
          <Spinner />
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", margin: "0 0 12px" }}>
            Payment received
          </h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
            We&apos;re confirming your Pro membership with Cogletta. You can also return to your original tab.
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

  // Hub sekmesi + plan yok (nadiren): kullanıcıyı plan seçmeye yönlendir.
  if (!opened && !intent) {
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

  // Hub sekmesi + checkout henüz açılmadı: seçilen plana göre açıklama + butonla yeni sekmede aç.
  if (!opened) {
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
            We&apos;ll take you to the <strong>{planWord}</strong> Cogletta Pro checkout ({planPrice}). It opens securely in a new tab so you keep your place here — this tab confirms your membership once payment completes.
          </p>
          {error && <p style={{ background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: "0.875rem", marginBottom: 16 }}>{error}</p>}
          <button onClick={openCheckout} style={{ ...primaryBtn, width: "100%" }}>
            Continue to secure checkout →
          </button>
          <button onClick={goNext} style={{ ...ghostBtn, width: "100%", marginTop: 10, border: "none", background: "none", color: "var(--ink-muted)", textDecoration: "underline" }}>
            Maybe later — continue with Free
          </button>
        </div>
      </Shell>
    );
  }

  // Hub sekmesi + checkout yeni sekmede açıldı: onay bekleniyor.
  return (
    <Shell>
      <div style={{ ...card }}>
        <Spinner />
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "1.8rem", color: "var(--ink)", margin: "0 0 12px" }}>
          Complete your payment in the new tab
        </h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
          We&apos;re waiting for your payment to be confirmed. This can take a few seconds after you finish checkout.
        </p>
        {attempt > 0 && !timedOut && (
          <p style={{ marginTop: 20, color: "var(--ink-muted)", fontSize: "0.8125rem" }}>Confirmation check {attempt}…</p>
        )}
        {timedOut && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
              Taking longer than usual. You can reopen checkout or check again.
            </p>
            <button onClick={openCheckout} style={{ ...primaryBtn, width: "100%" }}>Reopen checkout</button>
            <button onClick={() => void refreshSession()} style={{ ...ghostBtn, width: "100%" }}>Check again</button>
            <button onClick={goNext} style={{ ...ghostBtn, width: "100%", border: "none", background: "none", color: "var(--ink-muted)", textDecoration: "underline" }}>
              Continue with Free instead
            </button>
          </div>
        )}
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
