// src/services/articleService.ts

import { articlesByCategory } from "@/data/mockArticles";

export async function getDailyArticles(categories: string[]) {
  return categories
    .map((category) => ({
      category,
      ...articlesByCategory[
        category as keyof typeof articlesByCategory
      ],
    }))
    .filter((article) => article.title);
}