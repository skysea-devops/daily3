// app-backend/shared/webhook-signature.ts
/**
 * Polar webhook imza doğrulaması (Standard Webhooks spesifikasyonu).
 *
 * Başlıklar: webhook-id, webhook-timestamp, webhook-signature
 * İmzalanan içerik: `${id}.${timestamp}.${rawBody}`
 * İmza: base64(HMAC-SHA256(key, içerik)), başlıkta "v1,<imza>" (boşlukla ayrılmış birden çok olabilir)
 *
 * ANAHTAR TUZAĞI: Polar panelindeki secret base64 DEĞİL. Polar'ın resmi SDK'sı
 * (validateEvent) secret'ı önce base64'e çevirip Standard Webhooks kütüphanesine
 * veriyor; kütüphane de base64'ü çözüyor. Net etki: HMAC anahtarı secret
 * string'inin UTF-8 baytları. Burada da tam olarak bu yapılıyor. Secret'ı
 * base64-decode etmeye çalışmak her imzayı reddettirir.
 *
 * Gövde HAM olarak imzalanır: JSON.parse + JSON.stringify yapılmış gövde
 * doğrulamadan geçmez.
 */
import crypto from "crypto";

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SignatureResult =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: string };

export function verifyStandardWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureResult {
  if (!secret) return { ok: false, reason: "secret not configured" };

  const get = (name: string): string | undefined => {
    for (const [k, v] of Object.entries(headers ?? {})) {
      if (k.toLowerCase() === name) return v;
    }
    return undefined;
  };

  const id        = get("webhook-id");
  const tsRaw     = get("webhook-timestamp");
  const sigHeader = get("webhook-signature");
  if (!id || !tsRaw || !sigHeader) return { ok: false, reason: "missing headers" };

  const timestamp = Number(tsRaw);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const signedContent = `${id}.${Math.floor(timestamp)}.${rawBody}`;
  const expectedSigs = hmacKeys(secret).map((key) =>
    crypto.createHmac("sha256", key).update(signedContent).digest(),
  );

  for (const part of sigHeader.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    for (const expected of expectedSigs) {
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
        return { ok: true, id, timestamp };
      }
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

/**
 * Polar SDK (v1, validateWebhook) ile birebir aynı anahtar adayları:
 *  1) secret'ın UTF-8 baytları (Polar panelindeki secret'lar için geçerli olan)
 *  2) "whsec_" öneki atılmış secret'ın base64-çözülmüş hali (spesifikasyon biçimi)
 */
function hmacKeys(secret: string): Buffer[] {
  const utf8Key = Buffer.from(secret, "utf8");
  const keys = [utf8Key];
  const remainder = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(remainder) && remainder.length % 4 === 0) {
    const decoded = Buffer.from(remainder, "base64");
    if (decoded.length > 0 && !decoded.equals(utf8Key)) keys.push(decoded);
  }
  return keys;
}

/** Test/E2E için: aynı formatta imza üretir. */
export function signStandardWebhook(rawBody: string, id: string, timestamp: number, secret: string): string {
  const sig = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return `v1,${sig}`;
}
