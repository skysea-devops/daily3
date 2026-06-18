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
}

export interface DailyArticles {
  /** DynamoDB PK — USER#<cognito-sub> */
  PK:          string;
  /** DynamoDB SK — DATE#YYYY-MM-DD  e.g. DATE#2026-06-06 */
  SK:          string;
  articles:    Article[];
  podcast:     Podcast | null;
  generatedAt: string;
  /** Unix timestamp — item auto-deletes after 30 days */
  ttl:         number;
}

/** Key helpers — keep date formatting in one place */
export const Keys = {
  userPK:    (sub: string)             => `USER#${sub}`,
  dateSK:    (date: Date = new Date()) => `DATE#${date.toISOString().slice(0, 10)}`,
  ttl30Days: ()                        => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
};
