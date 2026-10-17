"use client";

// src/components/essays/EssayContinuation.tsx
//
// access: "pro" denemelerde statik sayfa yalnızca ÖNİZLEMEYİ taşır. Bu bileşen
// tarayıcıda GET /essays/{slug}/body çağırır:
//   200 → kilitli bölüm aynı blok stilleriyle önizlemenin devamına eklenir
//         (free penceresindeki deneme, Pro ya da deneme süresindeki kullanıcı)
//   403 → önizlemenin sonunda solan geçiş + paywall kutusu
// Yetki kararını SUNUCU verir; burada yalnızca sonucu gösteriyoruz.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { essayBodyUrl } from "@/lib/essay-access";
import type { EssayBlock } from "@/lib/essays";
import EssayBlocks from "./EssayBlocks";

type Result =
  | { kind: "unlocked"; blocks: EssayBlock[] }
  | { kind: "locked" }
  | { kind: "error" };

async function fetchBody(slug: string, token?: string): Promise<Result> {
  const url = essayBodyUrl(slug);
  if (!url) return { kind: "error" };

  const request = (auth?: string) =>
    fetch(url, { headers: auth ? { Authorization: `Bearer ${auth}` } : {}, cache: "no-store" });

  try {
    let res = await request(token);
    // Süresi geçmiş/bozuk token: misafir olarak tekrar dene. Free penceresindeki
    // deneme yine açılır; değilse paywall gösterilir (kullanıcı tekrar giriş yapabilir).
    if (res.status === 401 && token) res = await request();

    if (res.ok) {
      const body = await res.json();
      return { kind: "unlocked", blocks: Array.isArray(body?.blocks) ? body.blocks : [] };
    }
    if (res.status === 401 || res.status === 402 || res.status === 403) return { kind: "locked" };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export default function EssayContinuation({ slug }: { slug: string }) {
  const { user, loading } = useAuth();
  const token = user?.accessToken;
  const [attempt, setAttempt] = useState(0);
  // Sonuç, hangi istek için alındığıyla birlikte tutulur: anahtar değişince
  // (giriş/çıkış, yeniden deneme) eski sonuç gösterilmez, "yükleniyor" görünür.
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const key = `${slug}:${token ?? "guest"}:${attempt}`;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    fetchBody(slug, token).then((value) => {
      if (!cancelled) setResult({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [loading, slug, token, key]);

  const state = result && result.key === key ? result.value : null;

  if (!state) {
    return (
      <p aria-live="polite" style={{ marginTop: 28, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        Loading the rest of the essay…
      </p>
    );
  }

  if (state.kind === "unlocked") return <EssayBlocks blocks={state.blocks} />;

  if (state.kind === "error") {
    return (
      <div style={{ marginTop: 28, fontSize: "0.9375rem", color: "var(--ink-soft)" }}>
        We couldn&apos;t load the rest of this essay.{" "}
        <button
          onClick={() => setAttempt((n) => n + 1)}
          style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    );
  }

  return <Paywall signedIn={Boolean(user)} />;
}

function Paywall({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      {/* Önizlemenin son satırları kağıt rengine doğru solar */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          marginTop: -140,
          height: 140,
          background: "linear-gradient(to bottom, rgba(247,244,238,0), var(--paper) 85%)",
          pointerEvents: "none",
        }}
      />
      <aside
        aria-label="Cogletta Pro"
        style={{
          marginTop: 8,
          padding: "28px 28px 26px",
          background: "var(--white)",
          border: "1px solid var(--rule)",
          borderTop: "3px solid var(--accent)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "'Lora', serif",
            fontWeight: 600,
            fontSize: "1.375rem",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Keep reading with Cogletta Pro
        </h2>
        <p style={{ margin: "10px auto 0", maxWidth: 460, fontSize: "0.9375rem", lineHeight: 1.65, color: "var(--ink-soft)" }}>
          This essay continues for Pro readers, along with the full essay archive, 3 curated articles and 2 podcasts
          every morning.
        </p>
        {signedIn ? (
          // Giriş yapmış Free kullanıcı deneme hakkını kayıt anında kullandı:
          // ona deneme vaat edilmez, doğrudan mevcut checkout akışına gider.
          <Link href="/checkout-complete?plan=yearly" style={buttonStyle}>
            Upgrade to Pro →
          </Link>
        ) : (
          <>
            <Link href="/register/" style={buttonStyle}>
              Start your 14-day free trial →
            </Link>
            <p style={{ margin: "14px 0 0", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
              Already a member?{" "}
              <Link href="/login/" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </aside>
    </>
  );
}

const buttonStyle = {
  display: "inline-block",
  marginTop: 20,
  background: "var(--ink)",
  color: "var(--white)",
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.9375rem",
} as const;
