"use client";

import { useState } from "react";

/**
 * "Cogletta'yı bir arkadaşına öner" kartı — dashboard ve essays'te kullanılır.
 * Tek tıkla linki panoya kopyalar; clipboard API yoksa linki seçili gösterir.
 */
export default function ShareCard({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = "https://cogletta.com";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API yoksa (eski tarayıcı/izin) prompt ile göster
      window.prompt("Copy this link:", shareUrl);
    }
  }

  return (
    <div style={{
      background: "var(--white)",
      border: "1px solid var(--rule)",
      borderRadius: 12,
      padding: compact ? "14px 18px" : "20px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{
          fontFamily: "'Lora', serif",
          fontSize: compact ? "0.9375rem" : "1.0625rem",
          fontWeight: 600,
          color: "var(--ink)",
          margin: 0,
        }}>
          Enjoying Cogletta?
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "2px 0 0", lineHeight: 1.5 }}>
          Share it with a friend who loves a good morning read.
        </p>
      </div>
      <button
        onClick={handleCopy}
        style={{
          flexShrink: 0,
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid var(--rule)",
          background: copied ? "var(--ink)" : "none",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: copied ? "var(--white)" : "var(--ink-soft)",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        {copied ? "✓ Link copied" : "Copy link"}
      </button>
    </div>
  );
}
