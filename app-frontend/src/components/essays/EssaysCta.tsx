"use client";

// src/components/essays/EssaysCta.tsx
//
// Deneme listesi / konu sayfası sonundaki kayıt kutusu. Statik HTML misafir
// metnini taşır; hydrate olunca giriş yapmış kullanıcıya uygun hedef gösterilir.

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import styles from "@/app/essays/essays.module.css";

export default function EssaysCta({ topicLabel }: { topicLabel?: string }) {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);

  if (topicLabel) {
    return (
      <div className={styles.cta}>
        <p className={styles.ctaText}>
          <strong>Get {topicLabel} reading every morning.</strong>
          Cogletta picks thoughtful articles and podcasts on {topicLabel.toLowerCase()} and delivers them to your inbox
          each morning.
        </p>
        <Link href={signedIn ? "/interests/" : "/register/"} className={styles.btn}>
          {signedIn ? "Add this topic →" : "Start reading for free →"}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.cta}>
      <p className={styles.ctaText}>
        <strong>{signedIn ? "Your daily picks are waiting." : "Read more of what interests you."}</strong>
        Cogletta delivers three curated articles and two podcast episodes on your interests, every morning.
      </p>
      <Link href={signedIn ? "/dashboard/" : "/register/"} className={styles.btn}>
        {signedIn ? "Go to your dashboard →" : "Start reading for free →"}
      </Link>
    </div>
  );
}
