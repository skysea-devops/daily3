// src/components/essays/EssayBlocks.tsx
//
// Deneme gövdesinin blok render'ı. Hem statik sayfa (önizleme / free deneme)
// hem de client tarafında /body'den gelen kilitli bölüm AYNI bileşenle çizilir;
// böylece eklenen metin görsel olarak önizlemenin devamı gibi görünür.
//
// Bu dosya veri import ETMEZ (yalnızca tip): client bileşeninden kullanıldığında
// bundle'a deneme içeriği girmez.

import type { CSSProperties } from "react";
import type { EssayBlock } from "@/lib/essays";

const pStyle: CSSProperties = {
  fontSize: "1.0625rem",
  lineHeight: 1.85,
  color: "var(--ink-soft)",
  marginTop: 22,
};

export function Block({ block }: { block: EssayBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2
          style={{
            fontFamily: "'Lora', serif",
            fontWeight: 600,
            fontSize: "1.375rem",
            color: "var(--ink)",
            marginTop: 44,
          }}
        >
          {block.text}
        </h2>
      );
    case "img":
      return (
        <figure style={{ margin: "36px 0" }}>
          {/* next/image yerine <img>: statik export ile optimizasyon çalışmıyor. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            loading="lazy"
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 }}
          />
          {block.caption && (
            <figcaption
              style={{
                marginTop: 10,
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                color: "var(--ink-muted)",
                textAlign: "center",
              }}
            >
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "quote":
      return (
        <blockquote
          style={{
            margin: "32px 0",
            paddingLeft: 20,
            borderLeft: "3px solid var(--accent)",
            fontFamily: "'Lora', serif",
            fontStyle: "italic",
            fontSize: "1.1875rem",
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          {block.text}
          {block.cite && (
            <cite
              style={{
                display: "block",
                marginTop: 8,
                fontFamily: "'Inter', sans-serif",
                fontStyle: "normal",
                fontSize: "0.8125rem",
                color: "var(--ink-muted)",
              }}
            >
              — {block.cite}
            </cite>
          )}
        </blockquote>
      );
    case "ul":
      return (
        <ul
          style={{
            marginTop: 22,
            paddingLeft: 22,
            fontSize: "1.0625rem",
            lineHeight: 1.85,
            color: "var(--ink-soft)",
          }}
        >
          {block.items.map((item, i) => (
            <li key={i} style={{ marginTop: 6 }}>
              {item}
            </li>
          ))}
        </ul>
      );
    default:
      return <p style={pStyle}>{block.text}</p>;
  }
}

export default function EssayBlocks({ blocks }: { blocks: EssayBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}
