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

export async function getUserProfile(accessToken: string): Promise<{
  interests: string[];
  email: string | null;
  plan?: "free" | "pro";
  subTopics?: Record<string, string[]>;
  lsPortalUrl?: string | null;
  lsVariantId?: string | null;
}> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  }

  const response = await fetch(`${API_BASE_URL}/me/profile`, {
    method: "GET",
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


// ─── Lemon Squeezy checkout ───────────────────────────────────────────────────
// MoR modelinde backend'e gerek yok: kullanıcıyı LS'nin hosted checkout linkine
// yönlendiriyoruz. userId'yi custom_data ile geçiyoruz; webhook bunu meta.custom_data
// üzerinden okuyup DynamoDB'de plan'ı günceller.
//
// Env değişkenleri (LS panelindeki "Share → Buy link" tam URL'leri):
//   NEXT_PUBLIC_LS_CHECKOUT_MONTHLY = https://<store>.lemonsqueezy.com/buy/<uuid>
//   NEXT_PUBLIC_LS_CHECKOUT_YEARLY  = https://<store>.lemonsqueezy.com/buy/<uuid>

export function buildLemonCheckoutUrl(
  billing: "monthly" | "yearly",
  opts: { userId: string; email?: string; redirectUrl?: string }
): string {
  const base =
    billing === "yearly"
      ? process.env.NEXT_PUBLIC_LS_CHECKOUT_YEARLY
      : process.env.NEXT_PUBLIC_LS_CHECKOUT_MONTHLY;

  if (!base) {
    throw new Error(
      `Checkout link is not configured (NEXT_PUBLIC_LS_CHECKOUT_${billing.toUpperCase()})`
    );
  }

  const params = new URLSearchParams();
  if (opts.email) params.set("checkout[email]", opts.email);
  params.set("checkout[custom][user_id]", opts.userId);
  if (opts.redirectUrl) params.set("checkout[success_url]", opts.redirectUrl);
  // LS checkout'u ayrı sekmede/overlay yerine doğrudan aç
  params.set("embed", "0");

  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}`;
}
