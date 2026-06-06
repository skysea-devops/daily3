const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function updateUserInterests(
  interests: string[],
  accessToken: string
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
    body: JSON.stringify({ interests }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);

    throw new Error(
      errorBody?.message || "Failed to update user interests"
    );
  }

  return response.json();
}
export async function getUserProfile(accessToken: string): Promise<{
  interests: string[];
  email: string | null;
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

  if (!response.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return response.json();
}

export interface ArticleResponse {
  status:      "ready" | "pending";
  articles:    import("./types").Article[];
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

  if (!response.ok) throw new Error("Failed to fetch articles");
  return response.json();
}
