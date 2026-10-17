// src/components/essays/EssayRow.tsx
// Arşiv satırı: tarih, başlık, kısa açıklama, etiketler, okuma süresi.

import Link from "next/link";
import { formatDate, tagLabel, type Essay } from "@/lib/essays";
import styles from "@/app/essays/essays.module.css";

export default function EssayRow({ essay, showTags = true }: { essay: Essay; showTags?: boolean }) {
  return (
    <article className={styles.row}>
      <time className={styles.day} dateTime={essay.date}>
        {formatDate(essay.date, { month: "short", day: "numeric", timeZone: "UTC" })}
      </time>
      <div>
        <h3 className={styles.rowTitle}>
          <Link href={`/essays/${essay.slug}/`}>{essay.title}</Link>
        </h3>
        <p className={styles.rowDesc}>{essay.description}</p>
        <div className={styles.rowTags}>
          {showTags &&
            essay.tags.map((t) => (
              <Link key={t} href={`/essays/tag/${t}/`} className={styles.tag}>
                {tagLabel(t)}
              </Link>
            ))}
        </div>
      </div>
      <span className={styles.min}>{essay.readingMinutes} min</span>
    </article>
  );
}

export function Archive({ groups, showTags = true }: {
  groups: { year: string; months: { month: string; essays: Essay[] }[] }[];
  showTags?: boolean;
}) {
  return (
    <>
      {groups.map((y) => (
        <div key={y.year} style={{ marginBottom: 28 }}>
          <h2 className={styles.year}>{y.year}</h2>
          {y.months.map((m) => (
            <div key={m.month}>
              <p className={styles.month}>{m.month}</p>
              {m.essays.map((e) => (
                <EssayRow key={e.slug} essay={e} showTags={showTags} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
