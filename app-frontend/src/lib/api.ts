// app-frontend/src/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// 401 gelince otomatik sign-out + login'e yönlendir
function handleUnauthorized() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("id_token");
  localStorage.removeItem("cogletta-categories");
  window.location.href = "/login";
}

export async function updateUserInterests(
  interests: string[],
  accessToken: string,
  email?: string,
  subTopics?: Record<string, string[]>,
  region?: string
) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  }

  const response = await fetch(`${API_BASE_URL}/me/interests`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ interests, email, subTopics, region }),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to update user interests");
  }

  return response.json();
}

/**
 * Deneme durumu — backend'in hesapladigi EFEKTIF durum.
 *
 * "none"    → bu hesap hic deneme gormemis
 * "active"  → deneme suruyor (daysLeft dolu)
 * "expired" → deneme kullanilmis/bitmis; bir daha verilmez
 *
 * `eligible` yalnizca arayuz icindir; asil deneme hakki backend'de e-posta
 * seviyesinde bir defterde tutulur.
 */
export interface TrialState {
  status:     "none" | "active" | "expired";
  eligible:   boolean;
  endsAt:     string | null;
  startedAt:  string | null;
  consumedAt: string | null;
  daysLeft:   number | null;
}

export interface UserProfile {
  interests: string[];
  email: string | null;
  /** EFEKTIF plan: denemesi bitmis kullanici cron calismamis olsa da "free" doner. */
  plan?: "free" | "pro";
  subTopics?: Record<string, string[]>;
  lsPortalUrl?: string | null;
  lsVariantId?: string | null;
  /** "trial" = 14 gunluk deneme suruyor, "paid" = odeme yapilmis abonelik. */
  planSource?: "trial" | "paid" | null;
  /** ISO tarih; yalnizca planSource === "trial" iken anlamli. */
  trialEndsAt?: string | null;
  /** /register sayfasinin 4 durumu bu blok uzerinden ayrilir. */
  trial?: TrialState;
}

export async function getUserProfile(accessToken: string): Promise<UserProfile> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  }

  const response = await fetch(`${API_BASE_URL}/me/profile`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
     
    },
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return response.json();
}

export interface ArticleResponse {
  status:      "ready" | "pending";
  articles:    import("./types").Article[];
  podcast:     import("./types").Podcast | null;
  podcasts?:   import("./types").Podcast[];
  generatedAt: string | null;
}

export async function getDailyArticles(
  accessToken: string,
  date?: string
): Promise<ArticleResponse> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");

  const url = date
    ? `${API_BASE_URL}/me/articles?date=${date}`
    : `${API_BASE_URL}/me/articles`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  if (!response.ok) throw new Error("Failed to fetch articles");
  return response.json();
}


// ─── Lemon Squeezy checkout (backend Checkouts API) ──────────────────────────
// Checkout URL'ini artık BACKEND üretir (POST /me/checkout). Backend seçilen
// variant'a özel (enabled_variants → tek periyot), kullanıcıya bağlı
// (custom.user_id + email), kısa ömürlü bir checkout açar ve mükerrer abonelik
// guard'ından geçirir. Frontend yalnızca interval yollar, dönen url'i açar.
export interface CreateCheckoutResult {
  url: string;
  interval: "monthly" | "yearly";
}

export type CheckoutError = Error & { code?: string; status?: number };

export async function createCheckout(
  interval: "monthly" | "yearly",
  accessToken: string
): Promise<CreateCheckoutResult> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");

  const response = await fetch(`${API_BASE_URL}/me/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ interval }),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(body?.message || "Could not start checkout") as CheckoutError;
    err.code = body?.code;
    err.status = response.status;
    throw err;
  }
  return body as CreateCheckoutResult;
}

// ─── The Sunday Supplement (Pro) ──────────────────────────────────────────────
export async function getTrendReport(
  accessToken: string
): Promise<{ report: import("./types").SundayIssue | null }> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");

  const response = await fetch(`${API_BASE_URL}/me/trend-report`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }
  if (!response.ok) throw new Error("Failed to fetch trend report");
  return response.json();
}

// ─── Lemon Squeezy subscription management ───────────────────────────────────
export interface BillingSubscription {
  status: string;
  cancelled: boolean;
  renewsAt: string | null;
  endsAt: string | null;
  productId: string;
  variantId: string;
  billingCycle: "monthly" | "yearly" | "unknown";
  portalUrl: string | null;
  updatePaymentUrl: string | null;
}

export async function getBillingSubscription(accessToken: string): Promise<BillingSubscription> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  const response = await fetch(`${API_BASE_URL}/me/subscription`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "Failed to load subscription");
  return body;
}

export async function cancelBillingSubscription(accessToken: string): Promise<{ status: string; endsAt: string | null }> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  const response = await fetch(`${API_BASE_URL}/me/subscription`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "Failed to cancel subscription");
  return body;
}

export async function switchBillingCycle(
  interval: "monthly" | "yearly",
  accessToken: string
): Promise<{ status: string; billingCycle: "monthly" | "yearly" | "unknown"; renewsAt: string | null; endsAt: string | null; message?: string }> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  const response = await fetch(`${API_BASE_URL}/me/subscription`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ interval }),
  });
  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(body?.message || "Could not switch billing cycle") as Error & { code?: string; status?: number };
    err.code = body?.code;
    err.status = response.status;
    throw err;
  }
  return body;
}

export async function resumeSubscription(
  accessToken: string
): Promise<{ status: string; cancelled: boolean; renewsAt: string | null; endsAt: string | null; message?: string }> {
  if (!API_BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  const response = await fetch(`${API_BASE_URL}/me/subscription`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: "resume" }),
  });
  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(body?.message || "Could not resume subscription") as Error & { code?: string; status?: number };
    err.code = body?.code;
    err.status = response.status;
    throw err;
  }
  return body;
}
