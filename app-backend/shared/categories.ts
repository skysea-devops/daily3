/**
 * Kategorilerin TEK kaynağı.
 *
 * `id` kalıcıdır ve sistemin her yerinde anahtar olarak kullanılır:
 *   - DynamoDB partition key            → CATEGORY#technology
 *   - RSS_SOURCES / PODCAST_SOURCES     → RSS_SOURCES["technology"]
 *   - kullanıcı kaydındaki interests[]  → ["technology", "history", ...]
 *   - subTopics kaydındaki anahtarlar   → { technology: ["AI & Machine Learning"] }
 *
 * `label` yalnızca kullanıcıya gösterilir (onboarding, dashboard, e-posta).
 * Etiketi değiştirmek serbesttir ve hiçbir veri taşımayı gerektirmez —
 * ID/label ayrımının tek amacı budur. ID'yi ASLA değiştirme; değiştirmen
 * gerekirse bu bir veri migrasyonudur, isim değişikliği değil.
 *
 * Bu dosya frontend'de src/lib/categories.ts olarak birebir kopyalanır.
 */

export type CategoryId =
  | "technology"
  | "geopolitics"
  | "business_economics"
  | "science_environment"
  | "life_work"
  | "culture_style"
  | "philosophy"
  | "history"
  | "health";

export interface CategoryDefinition {
  id:          CategoryId;
  label:       string;
  emoji:       string;
  description: string;
  /** Pro kullanıcı kategori başına en fazla 3 tanesini seçer. */
  subTopics:   string[];
  /**
   * Bu kategoride bir makalenin havuza girebileceği azami yaş (gün).
   *
   * Ürün tezi evergreen: dar pencere havuzu zorunlu olarak en haber-benzeri
   * içeriğe iter. Birleştirilen kategorilerde iki eski pencereden GENİŞ olanı
   * alındı (ör. World Politics 14 ↔ Military 21 → 21).
   *
   * Podcast'ler için tek ve sabit bir pencere vardır (PODCAST_MAX_AGE_DAYS),
   * kategoriye göre değişmez.
   */
  maxAgeDays:  number;
}

/**
 * Alt konu tasarım kuralı: birleştirilen kategorilerde İLK İKİ alt konu eski
 * kategorilerin kendisidir. Sebebi teknik — Bedrock etiketlemeyi yalnızca
 * başlık, açıklama ve URL'den yapıyor, makale gövdesini görmüyor. Kaba ve
 * kaynak eşlemesi bilinen etiketler güvenilir şekilde ayrılabiliyor; ince
 * ayrımlar (ör. "Behavioural" ↔ "Development Economics") başlıktan
 * ayrılamıyor ve gürültü üretiyor.
 *
 * Alt konu sayısı 6'da tutulur: poolSizeFor = min(20, max(10, altKonu + 4))
 * olduğu için 6 alt konu 10 öğelik havuza rahat sığar, 8 sıkıştırır.
 */
export const CATEGORIES: CategoryDefinition[] = [
  {
    id: "technology",
    label: "Technology & Software",
    emoji: "💡",
    description: "AI, engineering, hardware, and the industry around them",
    subTopics: [
      "Software & DevOps",
      "Emerging Tech",
      "AI & Machine Learning",
      "Security & Cybersecurity",
      "Hardware & Semiconductors",
      "Tech Policy & Society",
    ],
    maxAgeDays: 21,
  },
  {
    id: "geopolitics",
    label: "Geopolitics & Security",
    emoji: "🌍",
    description: "Strategy, defence, and how states contend with each other",
    subTopics: [
      "World Politics",
      "Military & Defence",
      "Europe",
      "Middle East",
      "Asia & the Pacific",
      "Russia & Eurasia",
    ],
    maxAgeDays: 21,
  },
  {
    id: "business_economics",
    label: "Business & Economics",
    emoji: "📈",
    description: "Markets, management, and the forces behind them",
    subTopics: [
      "Business",
      "Economics",
      "Startups & Venture",
      "Strategy & Leadership",
      "Markets & Finance",
      "Future of Work",
    ],
    maxAgeDays: 21,
  },
  {
    id: "science_environment",
    label: "Science & Environment",
    emoji: "🔬",
    description: "Research, discovery, climate, and the natural world",
    subTopics: [
      "Science",
      "Environment",
      "Space & Astronomy",
      "Biology & Life Sciences",
      "Climate & Energy",
      "Physics & Mathematics",
    ],
    maxAgeDays: 45,
  },
  {
    id: "life_work",
    label: "Life, Work & Wellbeing",
    emoji: "💛",
    description: "Focus, habits, relationships, and living well",
    subTopics: [
      "Productivity",
      "Life & Relationships",
      "Focus & Deep Work",
      "Habits & Systems",
      "Career & Life Balance",
      "Self-Development",
    ],
    maxAgeDays: 45,
  },
  {
    id: "culture_style",
    label: "Culture & Style",
    emoji: "🎭",
    description: "Literature, film, art, design, and what we wear",
    subTopics: [
      "Arts & Culture",
      "Fashion & Style",
      "Literature & Books",
      "Film & Music",
      "Menswear",
      "Womenswear",
    ],
    maxAgeDays: 45,
  },
  {
    id: "philosophy",
    label: "Philosophy & Ethics",
    emoji: "🧠",
    description: "Moral thought, political philosophy, and how to think",
    subTopics: [
      "Moral Philosophy",
      "Political Philosophy",
      "Existentialism",
      "Applied Ethics",
      "Philosophy of Mind",
      "Logic & Epistemology",
    ],
    maxAgeDays: 60,
  },
  {
    id: "history",
    label: "History",
    emoji: "🏛️",
    description: "Ancient to modern — events, people, civilisations",
    subTopics: [
      "Ancient History",
      "Medieval",
      "Modern History",
      "Military History",
      "Social History",
      "Cultural History",
    ],
    maxAgeDays: 60,
  },
  {
    id: "health",
    label: "Health",
    emoji: "🧬",
    description: "Medicine, longevity, mental health, public health",
    subTopics: [
      "Nutrition & Longevity",
      "Mental Health",
      "Neuroscience",
      "Exercise Science",
      "Medicine & Research",
      "Public Health",
    ],
    maxAgeDays: 21,
  },
];

// ─── Türetilen tablolar ───────────────────────────────────────────────────────
// Aşağıdakiler elle YAZILMAZ; hepsi CATEGORIES'ten türer. Böylece bir kategori
// eklendiğinde güncellenmesi unutulabilecek ikinci bir liste oluşmaz.

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

const BY_ID = new Map<string, CategoryDefinition>(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): CategoryDefinition | undefined {
  return BY_ID.get(id);
}

/** Kullanıcı girdisini doğrulamak için — update-interests bunu kullanır. */
export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && BY_ID.has(value);
}

/** Kullanıcıya gösterilecek etiket. Bilinmeyen ID'de ID'nin kendisi döner. */
export function categoryLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function categoryEmoji(id: string): string {
  return BY_ID.get(id)?.emoji ?? "📄";
}

export function subTopicsFor(id: string): string[] {
  return BY_ID.get(id)?.subTopics ?? [];
}

/**
 * Bir alt konu adının o kategoriye ait olup olmadığı. subTopics kaydı
 * kullanıcıdan geldiği için doğrulanmadan yazılmamalı.
 */
export function isSubTopicOf(categoryId: string, subTopic: string): boolean {
  const normalise = (s: string) => s.trim().toLowerCase();
  return subTopicsFor(categoryId).some((s) => normalise(s) === normalise(subTopic));
}

/** scoreAndFilter'ın kullandığı yaş penceresi tablosu. */
export const ARTICLE_MAX_AGE_DAYS: Record<string, number> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.maxAgeDays]),
);

/**
 * Podcast'ler için tek pencere. 45 → 90: Philosophize This! gibi düzensiz ama
 * canlı programlar 45 günü aşan aralarla yayınlıyor ve tamamen görünmez
 * oluyordu.
 */
export const PODCAST_MAX_AGE_DAYS = 90;

/**
 * Hafif tonlu kategoriler — Bedrock prompt'una "uplifting, warm, practical;
 * avoid grief, trauma, serious illness" yönergesi bunlar için eklenir.
 */
export const LIGHT_CATEGORY_IDS: CategoryId[] = ["life_work"];

/**
 * Haftalık bonus okumanın alındığı kategoriler — haftaya göre dönüşümlü.
 */
export const BONUS_CATEGORY_IDS: CategoryId[] = ["life_work", "culture_style"];

/**
 * Kitle dengesi kuralının uygulandığı kategori: havuzda menswear ve womenswear
 * içerik dengeli dağılmalı, hiçbiri havuzun üçte ikisini aşmamalı
 * (2026-07-15: üç gün üst üste erkek giyimi vakası).
 */
export const AUDIENCE_BALANCED_CATEGORY_ID: CategoryId = "culture_style";
