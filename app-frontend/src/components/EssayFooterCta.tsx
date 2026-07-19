"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

/**
 * Essay footer CTA — oturum farkındalıklı.
 * Sayfa statik üretildiği için (server component + output: "export") auth
 * kontrolü bu client bileşeninde yapılır: statik HTML ziyaretçi metnini taşır,
 * hydrate olunca üyeye dashboard yönlendirmesi gösterilir.
 */
export default function EssayFooterCta() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return (
      <p>
        Your daily picks are waiting for you.{" "}
        <Link href="/dashboard" style={{ color: "var(--accent)", textDecoration: "none" }}>
          Go to your dashboard →
        </Link>
      </p>
    );
  }

  return (
    <p>
      Cogletta delivers three curated articles and two podcast episodes
      on your interests, every morning.{" "}
      <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
        Start reading for free →
      </Link>
    </p>
  );
}
