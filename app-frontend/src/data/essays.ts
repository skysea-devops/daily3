// src/data/essays.ts
//
// Essay registry for cogletta.com/essays
//
// To publish a new essay:
//   1. Add a new object to the ESSAYS array below (newest first).
//   2. Merge to `prod` — the static export rebuilds every page,
//      including /essays/, /essays/<slug>/ and sitemap.xml.
//
// Content is written as typed blocks so pages render as clean,
// semantic HTML (good for readers, Google, and AI crawlers alike).

export type EssayBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "ul"; items: string[] };

export interface Essay {
  slug: string;          // URL segment: /essays/<slug>/
  title: string;
  description: string;   // Used for <meta description> and list page — keep under ~160 chars
  date: string;          // ISO format: "2026-07-08"
  readingMinutes: number;
  blocks: EssayBlock[];
}

export const ESSAYS: Essay[] = [
  {
    slug: "reading-without-a-feed",
    title: "Reading Without a Feed",
    description:
      "Why we built Cogletta around a fixed daily ration of long-form reading — and what infinite scroll quietly took from us.",
    date: "2026-07-08",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "There is a particular kind of tiredness that comes not from reading too much, but from deciding too much. Every feed is a slot machine of decisions: read this? skip that? save for later? The content itself is rarely the exhausting part. The choosing is.",
      },
      {
        type: "p",
        text: "For most of the history of reading, this problem did not exist. A newspaper arrived once a day and was finite. A book sat on the nightstand and did not update itself overnight. You could finish. Finishing mattered — it created a natural boundary between reading and living.",
      },
      { type: "h2", text: "The disappearance of 'done'" },
      {
        type: "p",
        text: "Feeds removed the concept of done. There is no last tweet, no final video, no bottom of the page. Products are honest about this in their metrics — 'time spent' is the number that gets celebrated — but dishonest about it in their framing, which still borrows the language of reading: stories, articles, editions.",
      },
      {
        type: "quote",
        text: "The scarcest resource is no longer information. It is the attention required to make sense of it.",
      },
      {
        type: "p",
        text: "What gets lost is not just time. It is the specific mental state that long-form reading requires: the willingness to stay with one argument for twenty minutes, to let an author build something slowly, to be occasionally bored on the way to being changed. That state does not survive next to an infinite alternative.",
      },
      { type: "h2", text: "A fixed ration" },
      {
        type: "p",
        text: "This is why Cogletta delivers a fixed number of pieces each morning and then stops. Not because more would be expensive, but because more would be worse. A bounded reading list restores the possibility of finishing — and finishing restores the possibility of actually thinking about what you read.",
      },
      {
        type: "ul",
        items: [
          "A finite list can be completed; a feed can only be abandoned.",
          "Fewer choices per day means more attention per piece.",
          "What you finish, you remember. What you scroll, you don't.",
        ],
      },
      {
        type: "p",
        text: "None of this is nostalgia for print. It is an argument about design: the container shapes the reading. Build the container for depth, and depth becomes the default again.",
      },
    ],
  },
];

export function getEssay(slug: string): Essay | undefined {
  return ESSAYS.find((e) => e.slug === slug);
}
