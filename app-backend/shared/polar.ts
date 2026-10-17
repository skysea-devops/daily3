// app-backend/shared/polar.ts
/**
 * Polar (Merchant of Record) için ince REST istemcisi + ortak yardımcılar.
 *
 * SDK yerine düz fetch: Lambda paketleri küçük kalsın, timeout kontrolü bizde olsun.
 *
 * ORTAM:
 *   POLAR_ACCESS_TOKEN_PARAM — token'ı tutan SSM SecureString adı (bkz. polar-secrets.ts)
 *   POLAR_SERVER         — "sandbox" | "production" (varsayılan: sandbox)
 *   POLAR_PRODUCT_ID     — tek ürün: Cogletta Pro yıllık ($48/yıl, trial'sız)
 *
 * Kullanıcı eşlemesi: Cognito sub === Polar customer.external_id.
 */

import { getPolarAccessToken } from "./polar-secrets";

export const POLAR_TIMEOUT_MS = 8000; // Polar asılırsa Lambda kilitlenmesin

const POLAR_SERVER = (process.env.POLAR_SERVER ?? "sandbox").toLowerCase();
export const POLAR_API_BASE =
  POLAR_SERVER === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

/** Tek ürün: Cogletta Pro, yalnızca yıllık. Aylık plan yok. */
export const POLAR_PRODUCT_ID = process.env.POLAR_PRODUCT_ID ?? "";

/** Abonelik eşleme kaydı: PK = SUBMAP_PREFIX + subscriptionId, SK = "MAP". */
export const SUBMAP_PREFIX = "BILLSUB#";

export type BillingCycle = "yearly" | "unknown";

export class PolarError extends Error {
  status: number;
  type?: string;
  constructor(status: number, message: string, type?: string) {
    super(message);
    this.name = "PolarError";
    this.status = status;
    this.type = type;
  }
}

/**
 * Polar API isteği. 2xx dışı yanıtlar PolarError fırlatır (status + error tipi ile).
 * 204 → null döner.
 */
export async function polarRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getPolarAccessToken();
  if (!token) throw new PolarError(500, "Polar access token is not configured");

  const res = await fetch(`${POLAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(POLAR_TIMEOUT_MS),
  });

  if (res.status === 204) return null as T;

  const payload: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.detail)
          ? payload.detail.map((d: any) => d?.msg).filter(Boolean).join("; ")
          : `HTTP ${res.status}`;
    throw new PolarError(res.status, `Polar request failed: ${detail}`, payload?.error);
  }
  return payload as T;
}

/** Ürün ID'sinden faturalama periyodu. Bilinmeyen ID → "unknown" (UI tahmin etmez). */
export function billingCycleForProduct(productId: string | null | undefined): BillingCycle {
  if (productId && productId === POLAR_PRODUCT_ID) return "yearly";
  return "unknown";
}

/**
 * Polar abonelik durumu → Pro erişimi var mı?
 *
 *  active   → var (cancel_at_period_end=true olsa bile dönem sonuna kadar active kalır)
 *  past_due → var (grace: kullanıcı kartını güncelleyebilir)
 *  trialing → var (bizde Polar trial'ı kurulmuyor; yine de güvenli taraf)
 *  canceled / unpaid / incomplete / incomplete_expired / paused → yok
 */
export function hasAccessForStatus(status: string | null | undefined): boolean {
  switch (String(status ?? "").toLowerCase()) {
    case "active":
    case "past_due":
    case "trialing":
      return true;
    default:
      return false;
  }
}

/** Kullanıcının Polar'daki aktif abonelikleri (external_customer_id = Cognito sub). */
export async function listActiveSubscriptions(userId: string): Promise<any[]> {
  const qs = new URLSearchParams({ external_customer_id: userId, active: "true", limit: "10" });
  const res = await polarRequest<any>(`/v1/subscriptions/?${qs.toString()}`);
  return Array.isArray(res?.items) ? res.items : [];
}

/** Aboneliği getir; 404 → null. */
export async function getSubscription(subscriptionId: string): Promise<any | null> {
  try {
    return await polarRequest<any>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch (err) {
    if (err instanceof PolarError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Aboneliği ANINDA sonlandır (revoke). İdempotent:
 * zaten sonlanmış (403 AlreadyCanceledSubscription / InactiveSubscription) ya da yok (404) → sorun değil.
 */
export async function revokeSubscription(subscriptionId: string): Promise<void> {
  try {
    await polarRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof PolarError && (err.status === 404 || err.status === 403)) return;
    throw err;
  }
}

/** Polar abonelik nesnesinden profilde tutulan alanlar. */
export function subscriptionProfileFields(sub: any): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {
    billingProvider:    "polar",
    subscriptionStatus: String(sub?.status ?? ""),
    billingCycle:       billingCycleForProduct(sub?.product_id),
    cancelAtPeriodEnd:  Boolean(sub?.cancel_at_period_end),
  };
  if (sub?.product_id)         fields.billingProductId  = String(sub.product_id);
  if (sub?.customer_id)        fields.billingCustomerId = String(sub.customer_id);
  if (sub?.current_period_end) fields.currentPeriodEnd  = String(sub.current_period_end);
  if (sub?.ends_at)            fields.subscriptionEndsAt = String(sub.ends_at);
  return fields;
}

/** Ayarlar sayfasının beklediği abonelik görünümü (frontend BillingSubscription ile aynı şekil). */
export function subscriptionView(sub: any) {
  const cancelled = Boolean(sub?.cancel_at_period_end) || String(sub?.status ?? "") === "canceled";
  const periodEnd = sub?.current_period_end ? String(sub.current_period_end) : null;
  return {
    status:       String(sub?.status ?? ""),
    cancelled,
    renewsAt:     cancelled ? null : periodEnd,
    endsAt:       cancelled ? (sub?.ends_at ? String(sub.ends_at) : periodEnd) : null,
    productId:    String(sub?.product_id ?? ""),
    billingCycle: billingCycleForProduct(sub?.product_id),
  };
}
