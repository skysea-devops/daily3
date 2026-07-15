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
    slug: "why-read-three-articles-a-day",
    title: "Why Read Three Articles a Day?",
    description:
      "A short essay on why small, consistent reading habits matter more than ambitious goals, and why three thoughtful articles every morning can be enough.",
    date: "2026-07-15",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "People love big goals. A hundred books this year. Three hundred and sixty-five days of exercise. An hour of meditation every morning. We reach for the number that sounds impressive — and then, somewhere around week two, we quietly let it go.",
      },
      {
        type: "p",
        text: "Behavioral science keeps pointing at the same quiet truth: the habits that actually last are almost always small. Ten minutes of walking. Making the bed each morning. A few lines written before the day begins. They look like nothing. But repeated, day after day, they stop being tasks and start becoming part of who you are.",
      },

      { type: "h2", text: "Why three?" },

      {
        type: "p",
        text: "Three is a strange and useful number. Do something once and it might be luck. Set yourself ten and it starts to feel like a wall. But three feels finishable.",
      },
      {
        type: "p",
        text: "Three small things beside your morning coffee. Three new words. Three thank-yous. Three pages. Three articles. Small enough to actually do. Big enough to change the direction of a day.",
      },

      { type: "h2", text: "Why articles?" },

      {
        type: "p",
        text: "Because reading is still one of the most powerful ways we have of becoming a little more than we were yesterday. Read every day and you meet new ideas, widen your vocabulary, sharpen your focus, and borrow perspectives you'd never have arrived at alone.",
      },
      {
        type: "p",
        text: "None of it happens overnight. Reading works much like exercise. One session won't change you. A hundred will. The value isn't in a single article—it's in returning tomorrow, and the day after that.",
      },

      { type: "h2", text: "The real problem today" },

      {
        type: "p",
        text: "The problem was never that people stopped reading. It's that choosing what to read has quietly become exhausting. Thousands of articles are published every day, each claiming to be essential. Faced with endless choice, we save more, open more tabs, and somehow finish less.",
      },
      {
        type: "p",
        text: "We're not suffering from a lack of information. We're suffering from too much of it. Finding something worth reading has become harder than reading itself.",
      },

      { type: "h2", text: "A Daily 3" },

      {
        type: "p",
        text: "That's where the idea of a Daily 3 came from. Not to give you more content — the internet already does that relentlessly. The idea was to give you less, but make every choice count.",
      },
      {
        type: "p",
        text: "Every morning, three thoughtfully selected articles based on the subjects you care about. Enough to learn something new. Enough to stay curious. Enough to begin the day with intention instead of an endless feed.",
      },
      {
        type: "p",
        text: "The goal was never to help people keep up with everything. It was to make reading feel manageable again — something you can actually finish before your day begins.",
      },

      { type: "h2", text: "Final thoughts" },

      {
        type: "p",
        text: "Maybe the habit that changes your life isn't reading everything. Maybe it's simply reading three things well.",
      },
      {
        type: "p",
        text: "Three articles won't make you an expert overnight. But read three thoughtful articles every morning for a year, and you'll be surprised how much you've learned, remembered, and enjoyed along the way.",
      },
      {
        type: "p",
        text: "Three articles. Every morning. It turns out that's enough.",
      },
    ],
  },
  {
    slug: "we-didnt-stop-reading",
    title: "We Didn't Stop Reading. We Stopped Choosing What to Read.",
    description:
      "A short essay on fragmented attention, the loss of reading habits, and why finding a few good articles has become harder than reading them.",
    date: "2026-07-09",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Here's something I've been thinking about. We might actually be reading more than ever before. Every day we move through hundreds of messages, headlines, social media posts, comments, and emails — perhaps no generation has ever been exposed to this much written content. But if we stopped at the end of the day and asked ourselves, “What did I actually learn today?”, it would often be difficult to answer.",
      },
      {
        type: "p",
        text: "We didn't stop reading. But our relationship with reading has changed.",
      },
      { type: "h2", text: "Consuming isn't the same as reading" },
      {
        type: "p",
        text: "We look at screens. We read words. Our thumb keeps scrolling. But the two experiences are completely different: one keeps placing something new in front of us, the other asks us to stay with a single idea for a little longer. One simply fills time. The other leaves us with something.",
      },
      {
        type: "p",
        text: "I think that's what many of us have been missing.",
      },
      { type: "h2", text: "I first noticed it in myself" },
      {
        type: "p",
        text: "Some time ago, I realized something. I could spend hours on my phone, put it down, and barely remember anything I had just read. I was constantly seeing new things — but I wasn't really reading. What surprised me even more was that, for a long time, I thought the problem was me.",
      },
      {
        type: "quote",
        text: "I need to be more disciplined. I should spend less time on my phone. I should read more books.",
      },
      { type: "h2", text: "Maybe the problem wasn't us" },
      {
        type: "p",
        text: "Most of the products we use today are designed to keep our attention for as long as possible. That doesn't make them malicious — it's simply what they were built to do. A feed is never supposed to end, because the moment it does, you leave. So there's always one more post. Then another. Then another.",
      },
      {
        type: "p",
        text: "After a while, reading starts to feel less like thinking and more like consuming.",
      },
      { type: "h2", text: "What magazines got right" },
      {
        type: "p",
        text: "I only understood this later. I used to buy magazines, or spend Sunday mornings reading the newspaper supplements. Whenever I came across an article about something I cared about, I'd read it with genuine curiosity, trying to understand it rather than simply get through it. More often than not, I'd finish thinking, “I'm glad I read that.”",
      },
      {
        type: "p",
        text: "Today, there are millions of thoughtful articles on the internet — probably more than ever before. But finding them has become more exhausting than reading them.",
      },
      { type: "h2", text: "I wanted my reading habit back" },
      {
        type: "p",
        text: "What I missed was the habit of regularly reading thoughtful, up-to-date articles about the subjects I genuinely care about. Not feeling like I had to keep up with everything — just starting the day with a few carefully chosen articles.",
      },
      {
        type: "p",
        text: "Cogletta wasn't built to create more content; the internet already has more than enough of that. Its purpose is simply to bring together a small collection of thoughtfully selected articles every morning. Not out of nostalgia for paper, and not because we should abandon our screens — but because technology can help us build better reading habits instead of constantly competing for our attention.",
      },
      { type: "h2", text: "Final thoughts" },
      {
        type: "p",
        text: "Maybe rebuilding a reading habit isn't about having more discipline. Maybe it's about having a simple starting point that helps us find a few things worth reading among the thousands competing for our attention every day. Life is already complicated enough. Learning doesn't have to be.",
      },
      {
        type: "p",
        text: "I built Cogletta because I wanted to rebuild the reading habit I had gradually lost — not by going backwards, but by making better use of the tools we already have.",
      },
      {
        type: "p",
        text: "Maybe what we're missing isn't more content. Maybe it's simply a few good articles that make us want to read again.",
      },
    ],
  },
];

export function getEssay(slug: string): Essay | undefined {
  return ESSAYS.find((e) => e.slug === slug);
}