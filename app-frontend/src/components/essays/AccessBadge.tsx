"use client";

// src/components/essays/AccessBadge.tsx
//
// Listelerde "Pro" rozeti. Pro denemeler ilk 7 gün herkese açık olduğu için
// rozet build zamanında değil TARAYICIDA hesaplanır: statik HTML günlerce
// CDN'de durur, build anındaki durum bayatlardı.

import { useSyncExternalStore } from "react";
import { isInFreeWindow } from "@/lib/essay-access";
import styles from "@/app/essays/essays.module.css";

const noSubscribe = () => () => {};

export default function AccessBadge({ access, date }: { access: "free" | "pro"; date: string }) {
  // Sunucu/statik render'da rozet yok (null); tarayıcıda o anki saate göre hesaplanır.
  // useSyncExternalStore hydration uyumsuzluğu yaratmadan bu ayrımı yapar.
  const state = useSyncExternalStore(
    noSubscribe,
    () => (access === "pro" ? (isInFreeWindow(date) ? "window" : "pro") : null),
    () => null,
  );

  if (state === "pro") {
    return (
      <span className={styles.proBadge} title="Full essay for Cogletta Pro readers">
        Pro
      </span>
    );
  }
  if (state === "window") {
    return (
      <span className={styles.freeBadge} title="New essays are free for everyone for their first week">
        Free this week
      </span>
    );
  }
  return null;
}
