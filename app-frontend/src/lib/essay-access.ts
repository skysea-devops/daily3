// src/lib/essay-access.ts
//
// Erişim kuralının istemci tarafı GÖRÜNTÜ hesabı (rozet ve metin seçimi için).
// Asıl karar sunucuda verilir: app-backend/lambdas/essays/get-body.
// Bu dosya deneme verisi import etmez; client bileşenlerinde güvenle kullanılır.

/** Pro denemeler yayın tarihinden (00:00 UTC) itibaren bu kadar gün herkese açık. */
export const FREE_WINDOW_DAYS = 7;

export function freeWindowEndsAt(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) + FREE_WINDOW_DAYS * 86_400_000;
}

export function isInFreeWindow(date: string, now: number = Date.now()): boolean {
  return now < freeWindowEndsAt(date);
}

export function essayBodyUrl(slug: string): string | null {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/essays/${encodeURIComponent(slug)}/body`;
}
