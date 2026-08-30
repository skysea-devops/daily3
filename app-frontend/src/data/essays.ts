// src/data/essays.ts
//
// Essay registry for cogletta.com/essays
//
// To publish a new essay:
//   1. Add a new object to the ESSAYS array below (newest first).
//      `author` alanini BOS BIRAK — varsayilan yazar otomatik gelir.
//      Yalnizca misafir yazar icin: author: { name, role, avatar?, url? }
//   2. Merge to `prod` — the static export rebuilds every page,
//      including /essays/, /essays/<slug>/ and sitemap.xml.
//
// Content is written as typed blocks so pages render as clean,
// semantic HTML (good for readers, Google, and AI crawlers alike).

export type EssayBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "ul"; items: string[] }
  | { type: "img"; src: string; alt: string; caption?: string };

export interface Author {
  name: string;
  role: string;
  /** Opsiyonel. Foto yoksa ismin bas harfi daire icinde gosterilir —
   *  boylece misafir yazar foto vermediginde kirik resim ikonu cikmaz. */
  avatar?: string;
  /** Opsiyonel. Verilirse yazar adi bu adrese link olur. */
  url?: string;
}

/**
 * Yazilarin cogunu Ismail yaziyor. Bu yuzden `author` OPSIYONEL: kendi
 * yazilarinda alani hic doldurma, sistem otomatik olarak DEFAULT_AUTHOR'u
 * gosterir. Yalnizca MISAFIR yazar geldiginde o yaziya `author` ekle.
 */
export const DEFAULT_AUTHOR: Author = {
  name: "Ismail Gokdeniz",
  role: "Founder of Cogletta",
  url: "https://www.linkedin.com/in/samuel80/",
  // avatar: "/authors/ismail.jpg",  // dosya eklendiginde bu satiri ac
};

export interface Essay {
  slug: string;          // URL segment: /essays/<slug>/
  title: string;
  description: string;   // Used for <meta description> and list page — keep under ~160 chars
  date: string;          // ISO format: "2026-07-09"
  readingMinutes: number;
  /** Bos birakilirsa DEFAULT_AUTHOR kullanilir. Sadece misafir yazarda doldur. */
  author?: Author;
  blocks: EssayBlock[];
  
}

/** Yazinin yazari — alan bos ise varsayilan yazar. */
export function essayAuthor(essay: Essay): Author {
  return essay.author ?? DEFAULT_AUTHOR;
}

/** Foto yoksa gosterilecek bas harf. */
export function authorInitial(author: Author): string {
  return author.name.trim().charAt(0).toUpperCase() || "?";
}

export const ESSAYS: Essay[] = [
  {
    slug: "escaping-the-pixelated-cave",
    title: "Escaping the Pixelated Cave: Why Plato's Allegory Still Matters",
    description:
      "Plato imagined prisoners who mistook shadows for reality. Twenty-four centuries later, the shadows are algorithmic — and the harder question is whether we are outside the cave at all.",
    date: "2026-08-30",
    readingMinutes: 6,
    blocks: [
      {
        type: "p",
        text: "Sometimes, while scrolling through social media, I find myself wondering how much of what I am seeing actually represents the world outside my screen.",
      },
      {
        type: "p",
        text: "It sounds like a very modern problem, but the question behind it is surprisingly old.",
      },
      {
        type: "p",
        text: "More than 2,400 years ago, Plato explored something similar in his Allegory of the Cave, found in The Republic. His story is usually discussed in relation to knowledge, education, and the difference between appearance and reality. But it is difficult to read it today without thinking about social media, algorithms, news feeds, and the enormous amount of information that reaches us through screens.",
      },
      {
        type: "p",
        text: "The technology has changed. The problem may not have changed as much as we think.",
      },

      { type: "h2", text: "Plato's Cave" },
      {
        type: "p",
        text: "Plato asks us to imagine a group of people who have spent their entire lives chained inside a cave. They are facing a wall and cannot turn around.",
      },
      {
        type: "p",
        text: "Behind them is a fire. Between the fire and the prisoners, other people carry objects back and forth. The prisoners cannot see the objects themselves. They see only the shadows cast on the wall in front of them.",
      },
      {
        type: "p",
        text: "Because these shadows are all they have ever known, they naturally assume that the shadows are reality.",
      },
      {
        type: "p",
        text: "One prisoner is eventually freed. He turns around, sees the fire and the objects behind him, and slowly begins to understand that what he previously believed to be real was only an image of something else.",
      },
      { type: "p", text: "Then he leaves the cave." },
      {
        type: "p",
        text: "Outside, the sunlight is initially painful. He cannot immediately see clearly. Gradually, however, his eyes adjust, and he begins to see a much larger world.",
      },
      {
        type: "p",
        text: "What interests me most about the story is that the prisoner was not stupid while he was inside the cave. He simply had no reason to imagine a reality beyond the one available to him.",
      },
      { type: "p", text: "That is also what makes the allegory uncomfortable." },

      { type: "h2", text: "Our Own Shadows" },
      {
        type: "p",
        text: "Most of what we know about the world does not come from direct experience.",
      },
      {
        type: "p",
        text: "I have never personally witnessed most of the political events, wars, scientific discoveries, economic crises, or social movements I have opinions about. I know about them because someone reported them, filmed them, wrote about them, commented on them, or shared them.",
      },
      {
        type: "p",
        text: "That is unavoidable. No person can experience everything directly.",
      },
      {
        type: "p",
        text: "The problem is that today there is another layer between us and the world: algorithms.",
      },
      {
        type: "p",
        text: "Social-media platforms do not simply show us everything that happens. They choose what appears in front of us. What we see can depend on what we have clicked before, what makes us stay on a platform longer, what people similar to us engage with, and what generates a strong emotional reaction.",
      },
      {
        type: "p",
        text: "This does not mean everything on social media is false. That would be too simple. The more interesting problem is that even true information can create a distorted picture when it is selectively presented.",
      },
      {
        type: "p",
        text: "If I repeatedly see one kind of political opinion, one interpretation of an event, or one particular fear, after a while it can begin to feel like this is simply what everyone thinks.",
      },
      { type: "p", text: "My feed can start to look like the world." },
      { type: "p", text: "But it is not the world. It is a selection from it." },
      {
        type: "p",
        text: "In that sense, Plato's shadows have not disappeared. We have simply developed much more convincing ways of projecting them.",
      },

      { type: "h2", text: "Why Leaving the Cave Is Uncomfortable" },
      {
        type: "p",
        text: "Another part of Plato's allegory feels especially relevant today: leaving the cave hurts.",
      },
      {
        type: "p",
        text: "The prisoner does not step into the sunlight and immediately feel grateful. The light overwhelms him. His old reality, although false, was at least familiar.",
      },
      {
        type: "p",
        text: "Something similar happens when we encounter information that seriously challenges what we already believe.",
      },
      {
        type: "p",
        text: "It is easy to imagine ourselves as open-minded people who simply follow the evidence wherever it goes. In practice, changing our minds can be surprisingly difficult. Our opinions are often connected to our identities, friendships, political loyalties, communities, and past experiences.",
      },
      {
        type: "p",
        text: "Discovering that we may have been wrong is not just an intellectual experience. Sometimes it feels personal.",
      },
      {
        type: "p",
        text: "This may be one reason misinformation and echo chambers are so powerful. Information that confirms what we already believe asks very little from us. Information that contradicts us asks us to reconsider ourselves.",
      },
      {
        type: "p",
        text: "Education, at its best, should probably create some of this discomfort.",
      },
      {
        type: "p",
        text: "Learning is not only about gaining new information. Sometimes it means realizing that something we were confident about was incomplete, exaggerated, or simply wrong.",
      },

      { type: "h2", text: "But How Do We Know We Are Outside?" },
      {
        type: "p",
        text: "There is another problem, and I think it makes Plato's allegory even more relevant.",
      },
      { type: "p", text: "How do we know that we are the person who escaped?" },
      {
        type: "p",
        text: "It is very easy to use the cave as a metaphor for other people. We can look at someone whose politics, religion, lifestyle, or worldview is different from ours and think: they are still staring at the shadows.",
      },
      { type: "p", text: "But that interpretation misses something important." },
      { type: "p", text: "What if we are too?" },
      {
        type: "p",
        text: "Our understanding of reality is influenced by our culture, education, experiences, social environment, and the information we happen to encounter. Even when we become aware of one bias, there may be another one that we cannot yet see.",
      },
      {
        type: "ul",
        items: [
          "There are things we know.",
          "There are things we know we do not know.",
          "And, more disturbingly, there are probably things we do not even know that we do not know.",
        ],
      },
      {
        type: "p",
        text: "Those are the things that make the cave such a powerful metaphor. A prisoner cannot question what lies outside the cave if the idea of an outside has never occurred to him.",
      },
      {
        type: "p",
        text: "Perhaps the modern version of escaping the cave is therefore not reaching a point where we finally possess the truth. Maybe it is developing the habit of questioning how we arrived at what we think is true.",
      },
      {
        type: "ul",
        items: [
          "Who is giving me this information?",
          "What might be missing?",
          "Why does this particular story keep appearing in front of me?",
          "Would someone with different sources see the same event differently?",
          "And, most importantly: what could I currently be completely wrong about?",
        ],
      },

      { type: "h2", text: "The Digital Cave" },
      {
        type: "p",
        text: "We live in a strange period of history. More information is available to us than to almost any previous generation, yet access to information does not necessarily mean access to truth.",
      },
      {
        type: "p",
        text: "In fact, having so much information may create a new problem. We cannot examine everything ourselves, so we depend on filters — journalists, institutions, search engines, influencers, algorithms, and increasingly artificial intelligence — to decide what reaches us.",
      },
      {
        type: "p",
        text: "Some of those filters are useful. Some are unreliable. Most are imperfect.",
      },
      { type: "p", text: "That is why I think Plato's cave still matters." },
      {
        type: "p",
        text: "Its lesson is not simply \"do not trust social media\" or \"everyone else is manipulated.\" It is something more difficult: we should remain suspicious of our own certainty.",
      },
      { type: "p", text: "Perhaps we never completely leave the cave." },
      { type: "p", text: "But we can at least keep turning our heads." },
      {
        type: "p",
        text: "And every now and then, when the screen in front of us begins to feel like the whole world, it is worth asking:",
      },
      {
        type: "quote",
        text: "Am I seeing reality — or only one of its shadows?",
      },
      {
        type: "img",
        src: "/essays/platonCave/platonCave.jpg",
        alt: "Working on Cogletta, the app I built to bring reading back into my mornings",
        caption: "The technology has changed. The problem may not have changed as much as we think",
      },
    ],
  },
  {
    slug: "chasing-an-idea",
    title: "Chasing an Idea: The Morning Surprises of My Own Creation",
    description:
      "A personal essay on the quiet joy of waking up to something I built myself — and how a side project became a small, satisfying part of my daily routine.",
    date: "2026-08-08",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "You imagine something, you code it, you fix it, you test it again...",
      },
      {
        type: "p",
        text: "And then one day, that very thing becomes a quiet yet deeply satisfying part of your daily routine.",
      },
      {
        type: "p",
        text: "Lately, I've been waking up with a genuine sense of curiosity every morning.",
      },
      {
        type: "p",
        text: "Before I even grab my coffee, the first thing I do is check my inbox or dashboard, just to see the titles of the articles waiting for me.",
      },
      {
        type: "p",
        text: "Because every morning, a fresh batch of articles on the topics I'm passionate about is curated while I sleep.",
      },
      {
        type: "p",
        text: "And the best part? I'm experiencing all of this through an app I built myself.",
      },
      {
        type: "p",
        text: "I've always loved reading. But somewhere along the way, between endless feeds and the noise of the day, I stopped doing it as much as I wanted to. The desire never left—only the habit did. What I really missed wasn't just reading itself, but the quiet curiosity that comes with it: the pull to understand something a little more deeply than yesterday.",
      },
      {
        type: "p",
        text: "Ever since I finished the minimum viable product (MVP), the rhythm of my reading habit has changed. Sometimes I'm standing on a crowded subway train during my morning commute, reading a surprise article that just hit my email. Other times, I'm settled at my desk, diving deep straight from my dashboard.",
      },
      {
        type: "p",
        text: "The internet, and social media especially, is a vast ocean—but encountering high-quality content that speaks directly to your specific curiosities isn't always easy. Now, starting the day with that simple question—\"I wonder what I'll discover today?\"—adds a whole new layer of joy to my mornings.",
      },
      {
        type: "p",
        text: "Spotting a problem is one thing, but building a solution with your own hands and watching it enrich your everyday life is something else entirely.",
      },
      {
        type: "p",
        text: "I'm happy—not just because I'm learning, but because I became the architect of the very system that feeds my curiosity.",
      },
      {
        type: "p",
        text: "If you have a side project in mind—something you don't expect to change the world with, but simply want to build to bring a little joy into your own life—don't wait.",
      },
      {
        type: "p",
        text: "Take that first step.",
      },
      {
        type: "p",
        text: "Experiencing the fruits of your own creation is a feeling like no other.",
      },
      {
        type: "img",
        src: "/essays/chasing-an-idea/Cogletta-and-Me.jpg",
        alt: "Working on Cogletta, the app I built to bring reading back into my mornings",
        caption: "Working on Cogletta, the app I built to bring reading back into my mornings",
      },
    ],
  },
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
        text: "Behavioral science keeps pointing at the same quiet truth: the habits that actually last are almost always small. Ten minutes of walking. Making the bed each morning. A few lines written before the day begins. They look like nothing. But repeated, day after day, they stop being tasks and start becoming part of who you are. What changes people isn't the grand beginning. It's the small repetition.",
      },

      { type: "h2", text: "Why three?" },

      {
        type: "p",
        text: "Three is a strange and useful number. Do something once and it might be luck. Set yourself ten and it starts to feel like a wall. But three feels finishable. Three small things beside your morning coffee. Three new words. Three thank-yous. Three pages. Three articles. Small enough to actually do. Big enough to change the direction of a day.",
      },

      { type: "h2", text: "Why articles, though?" },

      {
        type: "p",
        text: "Because reading is still one of the most powerful ways we have of becoming a little more than we were yesterday. Read every day and you meet new ideas, widen your vocabulary, sharpen your focus, and borrow perspectives you'd never have arrived at alone. But none of it happens overnight. It's like training. One session won't change you. A hundred will.",
      },

      { type: "h2", text: "The real problem today" },

      {
        type: "p",
        text: "Here's the thing: the problem was never that people stopped reading. It's that we can't decide what to read. Thousands of pieces are published every day, and every single one insists it's essential. Overwhelmed by all of them, we finish none of them. This isn't a shortage of information. It's a flood of choice.",
      },

      { type: "h2", text: "Which is where Cogletta comes in" },

      {
        type: "p",
        text: "That's exactly where the idea of a Daily 3 came from. Not to give you more to read — the internet already does that, relentlessly. To give you less, and better. Every morning, three articles, chosen around what you actually care about. That's all. Because the goal was to build a habit you'll want to return to tomorrow morning — a small ritual instead of an endless feed.",
      },

      { type: "h2", text: "In the end" },

      {
        type: "p",
        text: "Maybe the thing that changes your life isn't reading everything. Maybe it's really reading three.",
      },
      {
        type: "p",
        text: "Three articles. Every morning.",
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
        text: "Here's something I've been thinking about. We might actually be reading more than ever before. Every day we move through hundreds of messages, headlines, social media posts, comments, and emails — perhaps no generation has ever been exposed to this much written content. But if we stopped at the end of the day and asked ourselves, \u201CWhat did I actually learn today?\u201D, it would often be difficult to answer.",
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
        text: "I only understood this later. I used to buy magazines, or spend Sunday mornings reading the newspaper supplements. Whenever I came across an article about something I cared about, I'd read it with genuine curiosity, trying to understand it rather than simply get through it. More often than not, I'd finish thinking, \u201CI'm glad I read that.\u201D",
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
