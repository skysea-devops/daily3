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
  /**
   * Sosyal paylasim gorseli (og:image / twitter:image).
   *
   * Yazi GOVDESINDEKI img bloklari burada ISE YARAMAZ: Twitter, LinkedIn ve
   * WhatsApp onizlemeyi sayfanin <head> bolumundeki meta etiketlerinden okur,
   * govdeyi hic taramaz. Gorselin paylasimda cikmasi icin bu alan doldurulmali.
   *
   * public/ altindan koke gore yol: "/essays/platonCave/platonCave.jpg".
   * Bos birakilirsa paylasimda gorselsiz kart cikar.
   */
  coverImage?: string;
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
    slug: "the-wooden-horse-and-the-burden-we-carry",
    title: "The Wooden Horse and the Burden We Carry: Knowing or Becoming?",
    description:
      "Rumi imagined a child carrying the stick he believes is carrying him. Read alongside Socrates and Spinoza, it becomes a question about all of us.",
    date: "2026-08-31",
    readingMinutes: 8,
    coverImage: "/essays/mevlanaTahtaAt/mavlanaTahtaAtMetaforu.jpg",
    blocks: [
      {
        type: "p",
        text: "In the Masnavi, the masterpiece of Mevlana Jalal al-Din Rumi, there is a powerful metaphor about the relationship between human beings and knowledge: children riding wooden horses.",
      },
      {
        type: "p",
        text: "A child takes a stick, places it between his legs, and runs through the streets pretending to ride a horse. In the child's imagination, that simple piece of wood has transformed into a real horse. It carries him, gives him speed, and takes him somewhere.",
      },
      {
        type: "p",
        text: "Yet from the perspective of an observer, reality is quite different.",
      },
      {
        type: "quote",
        text: "The child is not riding a horse. He is carrying the very thing he believes is carrying him.",
      },
      {
        type: "p",
        text: "Rumi applies this simple childhood game to the workings of the human mind. Human beings often see their thoughts, concepts, and accumulated knowledge as tools that elevate them. The books they have read, the ideas they have learned, and the opinions they defend give them a sense of intellectual height.",
      },
      {
        type: "p",
        text: "However, they often fail to notice something important: they themselves are the ones carrying the weight of this intellectual accumulation.",
      },
      {
        type: "p",
        text: "This leads to a fundamental question: does knowledge always liberate us, or can it sometimes become another burden that we carry on our shoulders?",
      },
      {
        type: "p",
        text: "Rumi offers a remarkably concise yet profound answer to this question in the first volume of the Masnavi:",
      },
      {
        type: "quote",
        text: "When knowledge reaches the heart, it becomes a friend; when it reaches only the body, it becomes a burden.",
        cite: "Rumi, Masnavi, Book I",
      },
      {
        type: "p",
        text: "The wordplay in the original Persian is significant. Yar means friend or companion, while bar means burden or weight. The difference between them is only one letter. Yet for Rumi, this small linguistic distinction represents two completely different outcomes of knowledge in human life.",
      },
      {
        type: "p",
        text: "When knowledge enters a person's inner being, transforming their character and actions, it becomes a companion. But when knowledge remains only an intellectual possession, serving pride, status, or a sense of superiority, it becomes a heavy burden.",
      },

      {
        type: "h2",
        text: "Three Philosophical Approaches to the Transformative Power of Knowledge",
      },
      {
        type: "p",
        text: "The idea that knowledge should liberate human beings is one of the oldest questions in the history of philosophy. Yet Socrates, Spinoza, and Rumi approach this transformation from different directions.",
      },
      {
        type: "quote",
        text: "Human beings are not transformed simply by possessing knowledge. What truly matters is what knowledge does to the person who possesses it.",
      },

      { type: "h2", text: "Socrates: Knowing That You Do Not Know" },
      {
        type: "p",
        text: "Socrates' central concern was not ignorance itself, but the illusion of knowledge.",
      },
      {
        type: "p",
        text: "In his conversations with people who considered themselves knowledgeable, Socrates questioned the very things they claimed to understand. A person might speak confidently about courage, justice, or virtue; yet through careful questioning, Socrates would reveal that their understanding was often incomplete or based on assumptions they had never examined.",
      },
      {
        type: "p",
        text: "The purpose of this method, known as elenchus, was not humiliation. Socratic questioning aimed to free the mind from false beliefs and unexamined assumptions.",
      },
      {
        type: "p",
        text: "This is where Socrates' famous wisdom appears: he was considered wise because he recognized the limits of his own knowledge.",
      },
      {
        type: "quote",
        text: "The problem is not simply being ignorant. The deeper problem is believing that we know when we actually do not.",
      },
      {
        type: "p",
        text: "This perspective strongly connects with Rumi's criticism of knowledge that becomes a burden. When people turn their knowledge into a part of their identity and stop questioning themselves, knowledge no longer serves as a path toward growth. Instead, it becomes a defense mechanism for the ego.",
      },
      {
        type: "p",
        text: "For Socrates, genuine knowledge must transform the way a person lives. If someone truly understands what is good, that understanding must appear in their actions. Otherwise, what they possess is not wisdom but merely information stored in the mind.",
      },

      { type: "h2", text: "Spinoza: Becoming Free Through Understanding" },
      {
        type: "p",
        text: "Spinoza approaches human freedom through the power of understanding.",
      },
      {
        type: "p",
        text: "According to him, human beings are often controlled by their emotions, desires, and external influences. Fear, ambition, and prejudice can shape our decisions without us fully realizing it. However, when we truly understand something, our relationship with it begins to change.",
      },
      {
        type: "quote",
        text: "Freedom does not mean simply doing whatever we desire. True freedom comes from understanding causes.",
      },
      {
        type: "p",
        text: "When an emotion or thought controls us, we merely experience its effects. But when we understand why it exists and what causes it, we gain a more conscious position toward it. We are no longer completely governed by it.",
      },
      {
        type: "p",
        text: "In this sense, Spinoza's philosophy also depends on the relationship between knowledge and transformation. Knowledge is not merely an intellectual possession; it is a force capable of changing the way we exist in the world.",
      },
      {
        type: "p",
        text: "However, Spinoza's path primarily moves through reason. His goal is to understand the order of nature, recognize our place within it, and reach a higher form of awareness.",
      },

      { type: "h2", text: "Rumi: When Knowledge Reaches the Heart" },
      {
        type: "p",
        text: "Rumi's approach moves in a different direction. For him, the question is not only whether knowledge is correct or accurate. The deeper question is where that knowledge has reached. Has it reached the mind, or has it reached the heart?",
      },
      {
        type: "p",
        text: "For Rumi, true knowledge (irfan) is revealed not by how much a person knows, but by what that knowledge has transformed them into.",
      },
      {
        type: "p",
        text: "A person surrounded by books is not necessarily a wise person. Knowledge can remain trapped in memory or language. Someone may speak about many ideas, use sophisticated concepts, and impress others with their intellectual ability; yet if none of this produces a change in their character, the knowledge has not reached its true purpose.",
      },
      {
        type: "p",
        text: "This is why Rumi's image of the donkey carrying books is so significant. The donkey carries the weight of the books but never reaches their meaning. There is a burden, but there is no transformation.",
      },
      {
        type: "quote",
        text: "The essential journey is not from ignorance to knowledge, but from knowing to becoming.",
      },
      {
        type: "p",
        text: "Knowing the value of compassion is different from becoming a compassionate person. Explaining the importance of humility is different from actually becoming humble.",
      },
      {
        type: "p",
        text: "Knowing is only the beginning. The true measure of knowledge is the person it creates.",
      },

      { type: "h2", text: "The New Burden of Knowledge in the Modern World" },
      {
        type: "p",
        text: "Today, this question may be more important than ever, because never before in human history has knowledge been so easily accessible.",
      },
      {
        type: "p",
        text: "With a single screen, we can reach thousands of books, articles, lectures, and experts within seconds. Yet the expansion of access to information does not necessarily mean an increase in wisdom. Sometimes, the opposite may even be true.",
      },
      {
        type: "p",
        text: "Knowledge is no longer used only for learning; it is also used for constructing identity. The books we read, the thinkers we follow, and the concepts we use can sometimes give us an image of who we are rather than genuinely transform who we become.",
      },
      {
        type: "ul",
        items: [
          "We learn how to defend an idea instead of allowing that idea to shape our lives.",
          "We learn how to use concepts instead of truly understanding them.",
          "We collect perspectives, opinions, and intellectual references, yet remain unchanged at the deepest level.",
        ],
      },
      {
        type: "quote",
        text: "Is the knowledge we carry carrying us forward, or are we simply carrying its weight on our shoulders?",
      },

      { type: "h2", text: "Putting Down the Weight We Carry" },
      {
        type: "p",
        text: "Plato asks human beings to free their minds from illusions. Spinoza argues that we become free by understanding causes. Rumi invites us to look more deeply into ourselves.",
      },
      {
        type: "p",
        text: "Because the most difficult question is not how much we have learned. The more difficult question is whether we have truly changed as a result of what we have learned.",
      },
      {
        type: "ul",
        items: [
          "Have we become more patient?",
          "More compassionate?",
          "More humble?",
          "Or have we simply become people who know more things?",
        ],
      },
      {
        type: "p",
        text: "If what we learn does not make us lighter, does not transform our actions, and does not reach our hearts, perhaps we are still trying to ride a wooden horse. Perhaps the thing we believe is carrying us is, in reality, something we are carrying ourselves.",
      },
      {
        type: "p",
        text: "As Rumi reminds us, the purpose is not to accumulate more knowledge. The true question is what knowledge becomes within us.",
      },
      {
        type: "quote",
        text: "Genuine knowledge should not be a burden that we carry on our backs; it should become a companion that carries us forward.",
      },

      {
        type: "img",
        src: "/essays/mevlanaTahtaAt/mavlanaTahtaAtMetaforu.jpg",
        alt: "A child running with a wooden stick held between his legs as if riding a horse",
        caption:
          "The essential journey is not from ignorance to knowledge, but from knowing to becoming.",
      },

      { type: "h2", text: "References" },
      {
        type: "ul",
        items: [
          "Rumi, Jalal al-Din Muhammad. The Masnavi: Book I. Translated by Veled Izbudak. Istanbul: Ministry of Education / Ministry of Culture Publications, verses 3435-3440. (The metaphor of children riding a wooden stick and imagining it as a horse.)",
          "Rumi, Jalal al-Din Muhammad. The Masnavi: Book I, verse 3446. (The original couplet on knowledge reaching the heart or the body.)",
          "Plato. The Apology of Socrates. Translated by Ari Cokona. Istanbul: Turkiye Is Bankasi Cultural Publications, 2015, 21d-22e. (Socratic examination and the method of intellectual purification.)",
          "Plato. The Apology of Socrates, 23b. (The awareness of knowing one's own ignorance and the criticism of false knowledge.)",
          "Plato. Protagoras. Translated by Nursah Yilmaz. Istanbul: Turkiye Is Bankasi Cultural Publications, 2018, 352b-c. (The idea that virtue is connected with knowledge and must be expressed through action.)",
          "Spinoza, Baruch. Ethics. Translated by Hilmi Ziya Ulken. Istanbul: Dost Kitabevi Publications, Part II, Proposition 40, Scholium 2. (The third kind of knowledge: intuitive knowledge, scientia intuitiva.)",
          "Spinoza, Baruch. Ethics, Part IV, Proposition 7 and Part V, Proposition 3. (The bondage caused by emotions and the liberating power of understanding.)",
          "Spinoza, Baruch. Ethics, Part V, Propositions 32 and 42. (The intellectual love of God and the idea that virtue itself constitutes the highest form of happiness.)",
          "Rumi, Jalal al-Din Muhammad. The Masnavi, Book II, verses 2520-2525. (The dissolution of the ego and transformation through love and surrender.)",
          "Rumi, Jalal al-Din Muhammad. The Masnavi, Book I, verses 3441-3445. (Knowledge that does not reach the heart becoming a source of arrogance and a burden carried by the body.)",
        ],
      },
    ],
  },

  {
    slug: "escaping-the-pixelated-cave",
    title: "Escaping the Pixelated Cave: Why Plato's Allegory Still Matters",
    description:
      "Plato imagined prisoners who mistook shadows for reality. Twenty-four centuries later, the shadows are algorithmic — and the harder question is whether we are outside the cave at all.",
    date: "2026-08-30",
    readingMinutes: 6,
    coverImage: "/essays/platonCave/platonCave2.jpg",
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
        src: "/essays/platonCave/platonCave2.jpg",
        alt: "Why Plato's Allegory Still Matters",
        caption: "The technology has changed. The problem may not have changed as much as we think.",
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
