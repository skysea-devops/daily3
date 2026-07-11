/**
 * Shared types used by Lambda functions and the frontend.
 * Import from "@/lib/types" in the frontend (symlinked or copied at build time).
 */

export interface Article {
  category:    string;
  title:       string;
  summary:     string;
  reason:      string;
  url:         string;
  source:      string;
  readingTime: string;
  publishedAt: string;
  audioUrl?:   string;
  subTopics?:   string[];
  poolRank?:    number;
  qualityScore?: number;
}

export interface Podcast {
  category:    string;
  title:       string;
  summary:     string;
  reason:      string;
  url:         string;
  source:      string;
  duration:    string;
  publishedAt: string;
  subTopics?:   string[];
  poolRank?:    number;
  qualityScore?: number;
}

export interface DailyArticles {
  /** DynamoDB PK — USER#<cognito-sub> */
  PK:          string;
  /** DynamoDB SK — DATE#YYYY-MM-DD  e.g. DATE#2026-06-06 */
  SK:          string;
  articles:    Article[];
  /** Backward-compat: first podcast (or null). Prefer `podcasts`. */
  podcast:     Podcast | null;
  /** Pro users get one podcast per interest; free users get one. */
  podcasts?:   Podcast[];
  generatedAt: string;
  /** Unix timestamp — item auto-deletes after 30 days */
  ttl:         number;
}

/** Key helpers — keep date formatting in one place */
export const Keys = {
  userPK:     (sub: string)            => `USER#${sub}`,
  /** Kategori havuzu anahtarı — free plan günlük ortak seçim, ör. CATEGORY#Technology */
  categoryPK: (category: string)       => `CATEGORY#${category}`,
  dateSK:    (date: Date = new Date()) => `DATE#${date.toISOString().slice(0, 10)}`,
  ttl30Days: ()                        => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  // Haftalık trend raporu anahtarı: ISO yıl-hafta (ör. TREND#2026-W27)
  weekSK:    (date: Date = new Date()) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;            // Pazar=7
    d.setUTCDate(d.getUTCDate() + 4 - day);    // ISO: haftanın Perşembesi
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `TREND#${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  },
};

/**
 * Free plan kategori havuzu — kategori başına günde tek seçim.
 * DailyArticles ile aynı içerik şekli: deliver-daily alan dönüştürmeden
 * USER# kaydına kopyalar. status/generatingAt yalnızca "generating"
 * placeholder aşamasında bulunur (conditional-write lock).
 */
export interface CategoryDailyPicks {
  /** DynamoDB PK — CATEGORY#<name>  e.g. CATEGORY#Technology */
  PK:          string;
  /** DynamoDB SK — DATE#YYYY-MM-DD */
  SK:          string;
  articles:    Article[];
  podcast:     Podcast | null;
  podcasts:    Podcast[];
  generatedAt: string;
  ttl:         number;
  /** "generating" iken placeholder; gerçek içerik yazılınca kaldırılır */
  status?:       string;
  generatingAt?: number;
  activeSubTopics?: string[];
  unrepresentedSubTopics?: string[];
  poolVersion?: number;
}

// Haftalık trend raporu (Pro, her Pazar)
export interface TrendInterest {
  category:  string;      // kullanıcının ilgi alanı
  themes:    string[];    // haftanın 2-3 teması (birer cümle)
  topTitle:  string;      // haftanın öne çıkan tek makalesi
  topUrl:    string;
  topSource: string;
}

export interface WeeklyTrendReport {
  PK:          string;    // USER#<sub>
  SK:          string;    // TREND#<YYYY-Www>
  weekLabel:   string;    // insan-okur etiket, ör. "Jun 30 – Jul 6"
  interests:   TrendInterest[];
  generatedAt: string;
  ttl:         number;
}
