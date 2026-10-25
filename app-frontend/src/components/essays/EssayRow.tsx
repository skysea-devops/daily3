// src/components/essays/EssayRow.tsx
// Arşiv satırı: tarih, küçük görsel, başlık, kısa açıklama, etiketler, okuma süresi.

import Link from "next/link";
import { formatDate, tagLabel, type Essay } from "@/lib/essays";
import styles from "@/app/essays/essays.module.css";

export default function EssayRow({ essay, showTags = true }: { essay: Essay; showTags?: boolean }) {
  const href = `/essays/${essay.slug}/`;
  return (
    <article className={styles.row}>
      <time className={styles.day} dateTime={essay.date}>
        {formatDate(essay.date, { month: "short", day: "numeric", timeZone: "UTC" })}
      </time>
      {/* Görsel dekoratif: başlık linki aynı yere gidiyor, ekran okuyucuya iki kez okunmasın. */}
      <Link href={href} className={styles.rowThumb} aria-hidden="true" tabIndex={-1}>
        {essay.thumbImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={essay.thumbImage} alt="" width={224} height={168} loading="lazy" decoding="async" />
        ) : (
          <span className={styles.rowThumbEmpty} style={{ width: "100%", height: "100%" }}>
            {essay.title.charAt(0)}
          </span>
        )}
      </Link>
      <div className={styles.rowBody}>
        <h3 className={styles.rowTitle}>
          <Link href={href}>{essay.title}</Link>
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
