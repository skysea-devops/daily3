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
  date: string;          // ISO format: "2026-07-09"
  readingMinutes: number;
  blocks: EssayBlock[];
}

export const ESSAYS: Essay[] = [
  {
    slug: "we-didnt-stop-reading",
    title: "We Didn't Stop Reading. We Lost the Habit.",
    description:
      "We consume more text than any generation before us, yet remember less of it. On fragmented attention, the quiet death of the reading habit — and how to get it back.",
    date: "2026-07-09",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Somewhere along the way, many of us stopped reading regularly. Not reading in the literal sense — by that measure we read more than any generation in history. Messages, captions, headlines, threads. Hours of text pass through us every day. But at the end of most days, it is strangely hard to name a single thing we actually learned.",
      },
      {
        type: "p",
        text: "Reading itself didn't disappear. The habit did.",
      },
      { type: "h2", text: "Consumption is not the same as reading" },
      {
        type: "p",
        text: "The difference is easy to miss because both look identical from the outside: eyes on a screen, thumb occasionally moving. But they are opposite activities. Consumption is reactive — something appears, you respond to it, it is replaced. Reading is cumulative — you stay with one line of thought long enough for it to connect with what you already know. One fills time. The other builds something.",
      },
      {
        type: "p",
        text: "Fragmented attention is not a personal failure. It is the intended outcome of products engineered by thousands of very smart people whose success is measured in minutes of your day. A feed that let you finish would be, by its own metrics, a broken feed. The fragmentation is the feature.",
      },
      { type: "h2", text: "What the old habit actually gave us" },
      {
        type: "p",
        text: "I keep returning to how I used to read. I would pick up a magazine or a newspaper, discover articles I never would have searched for, and gradually build knowledge around the topics that interested me. Nobody optimized that experience. And that was precisely its value.",
      },
      {
        type: "p",
        text: "Three things made it work. It was bounded — an issue had a last page, so reading had a natural end. It was chosen — I picked the magazine, and everything in it flowed from that one deliberate decision, not from a thousand micro-decisions made under pressure. And it was slow — long pieces asked for twenty minutes of my attention, and in return they left something behind.",
      },
      {
        type: "quote",
        text: "A habit is not built on willpower. It is built on a container — a fixed time, a fixed amount, a natural end.",
      },
      {
        type: "p",
        text: "That is why 'read more' fails as a resolution. Willpower loses to an infinite feed every single time, because the feed never gets tired and you do. The old reading habit didn't survive on discipline. It survived on structure — and when the structure disappeared, the habit went with it.",
      },
      { type: "h2", text: "Rebuilding the container" },
      {
        type: "p",
        text: "This is the idea Cogletta is built on. Every morning it delivers a small, fixed collection of thoughtfully selected long-form articles based on your interests — and then it stops. No algorithm competing for your attention. No endless feed to scroll through. Just a bounded, chosen, slow ration of reading, the way a good magazine used to be.",
      },
      {
        type: "ul",
        items: [
          "Bounded: a fixed daily ration you can actually finish.",
          "Chosen: one deliberate decision — your interests — instead of a thousand impulsive ones.",
          "Slow: long-form pieces that reward attention rather than harvest it.",
        ],
      },
      {
        type: "p",
        text: "None of this is nostalgia. The old media world had plenty of problems, and the internet gives us access to more good writing than any newsstand ever could. The problem was never the supply of things worth reading. It was the loss of a structure that let us read them. Rebuild the container, and the habit follows. If you think like me — you're in the right place.",
      },
    ],
  },
];

export function getEssay(slug: string): Essay | undefined {
  return ESSAYS.find((e) => e.slug === slug);
}