/**
 * Kategori verisinin tek kaynağı src/lib/categories.ts'tir.
 * Bu dosya yalnızca mevcut sayfaların beklediği şekle uyarlar; yeni kod
 * doğrudan `@/lib/categories`'ten okumalıdır.
 */
import { CATEGORIES as CATEGORY_DEFS } from "./categories";

export { CATEGORIES } from "./categories";
export type { CategoryId, CategoryDefinition } from "./categories";

/** Kategori ID → alt konu listesi. */
export const SUB_TOPICS: Record<string, string[]> = Object.fromEntries(
  CATEGORY_DEFS.map((c) => [c.id, c.subTopics]),
);
