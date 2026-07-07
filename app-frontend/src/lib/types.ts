// Mirrors app-backend/shared/types.ts — keep in sync when fields change.

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
  PK:          string;
  SK:          string;
  articles:    Article[];
  podcast:     Podcast | null;
  podcasts?:   Podcast[];
  generatedAt: string;
  ttl:         number;
}

export const Keys = {
  userPK:    (sub: string)             => `USER#${sub}`,
  dateSK:    (date: Date = new Date()) => `DATE#${date.toISOString().slice(0, 10)}`,
  ttl30Days: ()                        => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
};

export interface TrendInterest {
  category:  string;
  themes:    string[];
  topTitle:  string;
  topUrl:    string;
  topSource: string;
}

export interface WeeklyTrendReport {
  weekLabel:   string;
  interests:   TrendInterest[];
  generatedAt: string | null;
}
