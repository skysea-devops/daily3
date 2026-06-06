// Mirrors app-backend/shared/types.ts
// Keep in sync when Article fields change.

export interface Article {
  category:    string;
  title:       string;
  summary:     string;
  reason:      string;
  url:         string;
  source:      string;
  readingTime: string;
  publishedAt: string;
}
