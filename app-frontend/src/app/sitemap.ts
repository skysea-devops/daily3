// src/app/sitemap.ts
// Generates /sitemap.xml at build time (works with `output: "export"`).
// Referenced from public/robots.txt.

import type { MetadataRoute } from "next";
import { ESSAYS, allSeries, essaysByTag, tagsWithCounts } from "@/lib/essays";

const BASE = "https://cogletta.com";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const latestEssayDate = ESSAYS.length > 0 ? new Date(ESSAYS[0].date) : new Date();

  return [
    {
      url: `${BASE}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${BASE}/essays/`,
      lastModified: latestEssayDate,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...ESSAYS.map((essay) => ({
      url: `${BASE}/essays/${essay.slug}/`,
      lastModified: new Date(essay.date),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    // Konu sayfaları: yalnızca denemesi olan kategoriler
    ...tagsWithCounts().map((t) => ({
      url: `${BASE}/essays/tag/${t.id}/`,
      lastModified: new Date(essaysByTag(t.id)[0].date),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    // Seri sayfaları (hiç seri yokken üretilen "_none" yer tutucusu buraya girmez)
    ...allSeries().map((s) => ({
      url: `${BASE}/essays/series/${s.slug}/`,
      lastModified: new Date(s.parts[s.parts.length - 1].date),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    {
      url: `${BASE}/legal/`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
