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
  imageQuery?:  string;
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
  /** Pazar Eki — TÜM kullanıcılar için ortak tek kayıt (haftaya göre SK) */
  sundayPK:  ()                        => `SUNDAY#issue`,
  /** Pazar Eki tekrar koruması — son N haftanın secilmis URL'leri */
  sundayHistoryPK: ()                  => `SUNDAY#history`,
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

// ─── Pazar Eki (The Sunday Supplement) ────────────────────────────────────────
//
// Pro üyelere her Pazar gönderilen tek makale + tek podcast. Hafta içi akıştan
// TAMAMEN bağımsız: ayrı kaynak listesi, ayrı yaş penceresi, kullanıcının ilgi
// alanlarından etkilenmez. Tüm Pro üyeler aynı içeriği alır, bu yüzden haftada
// bir kez üretilip paylaşılır (conditional-write kilidi).

export interface SundayPick {
  title:       string;
  summary:     string;
  url:         string;
  source:      string;
  /** Makale için "8 min read", podcast için "42 min". */
  duration:    string;
}

/**
 * Haftanın Pazar Eki. PK sabit (SUNDAY#issue), SK hafta anahtarı.
 * generate-category-picks ile aynı kilit desenini kullanır.
 */
export interface SundayIssue {
  PK:            string;   // SUNDAY#issue
  SK:            string;   // TREND#<YYYY-Www>
  weekLabel:     string;   // insan-okur etiket, ör. "16 Aug – 22 Aug"
  article:       SundayPick | null;
  podcast:       SundayPick | null;
  generatedAt:   string;
  ttl:           number;
  status?:       string;   // "generating" iken placeholder
  generatingAt?: number;
}

/**
 * Tekrar koruması. Pazar Eki penceresi 90 gün olduğu için aynı yazının
 * birkaç ay sonra yeniden seçilmesi mümkün — bu kayıt son seçimleri tutar ve
 * seçim sırasında dışlanır. Kullanıcıdan bağımsız, tek kayıt.
 */
export interface SundayHistory {
  PK:        string;       // SUNDAY#history
  SK:        string;       // "URLS"
  /** En yeni önde; SUNDAY_HISTORY_LIMIT kadarı tutulur. */
  urls:      string[];
  /** Kaynak çeşitliliği için: aynı yayının üst üste gelmesini engeller. */
  sources:   string[];
  updatedAt: string;
}

/** @deprecated 2026-08-16 öncesi haftalık rapor şekilleri. TTL 30 gün olduğu
 *  için eski kayıtlar bir süre daha gelmeye devam eder. */
export interface TrendPick {
  title:       string;
  summary:     string;
  url:         string;
  source:      string;
  readingTime: string;
  category?:   string;
}

/** @deprecated */
export interface TrendInterest {
  category:  string;
  themes:    string[];
  topTitle:  string;
  topUrl:    string;
  topSource: string;
  topIsListen?: boolean;
}

/** @deprecated Yerini SundayIssue aldı. */
export interface WeeklyTrendReport {
  PK:          string;
  SK:          string;
  weekLabel:   string;
  picks?:      TrendPick[];
  bonus?:      TrendPick | null;
  generatedAt: string;
  ttl:         number;
  interests?:  TrendInterest[];
}
