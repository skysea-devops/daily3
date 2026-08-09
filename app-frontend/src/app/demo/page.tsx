"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

// STATİK SNAPSHOT — bilerek constants'tan bağımsız. Demo bir pazarlama anlık
// görüntüsü; canlı kategoriler değişse bile burası sabit kalır. Gerekirse ELLE güncelle.
const DEMO_CATEGORIES: { id: string; label: string; emoji: string; description: string; subTopics: string[] }[] = [
  { id: "technology", label: "Technology & Software", emoji: "💡", description: "AI, engineering, hardware, and the industry around them", subTopics: ["Software & DevOps", "Emerging Tech", "AI & Machine Learning", "Security & Cybersecurity", "Hardware & Semiconductors", "Tech Policy & Society"] },
  { id: "geopolitics", label: "Geopolitics & Security", emoji: "🌍", description: "Strategy, defence, and how states contend with each other", subTopics: ["World Politics", "Military & Defence", "Europe", "Middle East", "Asia & the Pacific", "Russia & Eurasia"] },
  { id: "business_economics", label: "Business & Economics", emoji: "📈", description: "Markets, management, and the forces behind them", subTopics: ["Business", "Economics", "Startups & Venture", "Strategy & Leadership", "Markets & Finance", "Future of Work"] },
  { id: "science_environment", label: "Science & Environment", emoji: "🔬", description: "Research, discovery, climate, and the natural world", subTopics: ["Science", "Environment", "Space & Astronomy", "Biology & Life Sciences", "Climate & Energy", "Physics & Mathematics"] },
  { id: "life_work", label: "Life, Work & Wellbeing", emoji: "💛", description: "Focus, habits, relationships, and living well", subTopics: ["Productivity", "Life & Relationships", "Focus & Deep Work", "Habits & Systems", "Career & Life Balance", "Self-Development"] },
  { id: "culture_style", label: "Culture & Style", emoji: "🎭", description: "Literature, film, art, design, and what we wear", subTopics: ["Arts & Culture", "Fashion & Style", "Literature & Books", "Film & Music", "Menswear", "Womenswear"] },
  { id: "philosophy", label: "Philosophy & Ethics", emoji: "🧠", description: "Moral thought, political philosophy, and how to think", subTopics: ["Moral Philosophy", "Political Philosophy", "Existentialism", "Applied Ethics", "Philosophy of Mind", "Logic & Epistemology"] },
  { id: "history", label: "History", emoji: "🏛️", description: "Ancient to modern — events, people, civilisations", subTopics: ["Ancient History", "Medieval", "Modern History", "Military History", "Social History", "Cultural History"] },
  { id: "health", label: "Health", emoji: "🧬", description: "Medicine, longevity, mental health, public health", subTopics: ["Nutrition & Longevity", "Mental Health", "Neuroscience", "Exercise Science", "Medicine & Research", "Public Health"] },
];

// Statik, gerçekçi örnek kartlar. CANLI ÜRETİM DEĞİL — demo amaçlı sabit veri.
const SAMPLE_ARTICLES = [
  {
    emoji: "💛",
    category: "Life, Work & Wellbeing",
    title: "How Can We Feel Loved If We Don’t Feel Known?",
    source: "Behavioral Scientist",
    readingTime: "8 min read",
    summary:
      "Many of us have felt, at one point or another, that success, beauty, and status would make us feel more loved. It’s understandable—our culture constantly reinforces the idea that being admired will translate into feeling cherished. If you were wealthier, sexier, or had more renown, wouldn’t the people in your life appreciate you more?",
    reason:
      "Explores decades of psychological research and argues that the deepest relationships begin with something surprisingly simple: feeling genuinely known by another person..",
  },
  {
    emoji: "🔬",
    category: "Science & Environment",
    title: "The Quiet Revolution in How We Map the Brain",
    source: "Quanta Magazine",
    readingTime: "6 min read",
    summary:
      "New imaging techniques are changing what neuroscientists can see, opening fresh questions about memory, attention, and how the brain reorganizes itself.",
    reason:
      "A deep, well-sourced explainer that fits your Neuroscience sub-topic without drowning you in jargon.",
  },
];

const SAMPLE_PODCAST = {
  emoji: "🎧",
  category: "Technology & Software",
  title: "What Small AI Models Change for Everyone",
  source: "The World Unpacked",
  readingTime: "42 min listen",
  summary:
    "A conversation on why compact, efficient models may matter more than the largest ones — for cost, privacy, and who gets to build with AI.",
  reason:
    "Picked for your Emerging Tech interest: a considered discussion, not a news recap.",
};

export default function DemoPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar />

      {/* Hero */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "56px 5vw 24px", textAlign: "center" }}>
        <p style={{ fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
          A preview of Cogletta Pro
        </p>
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "2.25rem", fontWeight: 600, color: "var(--ink)", margin: "10px 0 12px", lineHeight: 1.2 }}>
          This is what your morning looks like
        </h1>
        <p style={{ fontSize: "1.0625rem", color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: 540, margin: "0 auto" }}>
          A small, hand-picked selection each day &mdash; chosen for the topics you actually care about, with a note on why each piece made the cut. No feed, no noise.
        </p>
      </section>

      {/* Sample dashboard */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 5vw 8px" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
            Monday, 14 July
          </p>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
            Your Cogletta
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)" }}>Curated for you, every morning.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SAMPLE_ARTICLES.map((a, i) => <DemoCard key={i} item={a} kind="article" />)}
          <DemoCard item={SAMPLE_PODCAST} kind="podcast" />
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-muted)", paddingTop: 4 }}>
            Curated at 07:00 &middot; Refreshes tomorrow morning
          </p>
        </div>
      </main>

      {/* Sample email */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 5vw 8px" }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>
          Every morning, in your inbox
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", textAlign: "center", marginBottom: 24, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          The same picks arrive as a clean email at 7am &mdash; read them there or on your dashboard.
        </p>

        {/* Inbox frame */}
        <div style={{ border: "1px solid var(--rule)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--rule)", background: "var(--paper-warm)" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
              From <strong style={{ color: "var(--ink)" }}>Cogletta</strong> &lt;read@cogletta.com&gt;
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
              Your Cogletta for Monday, 14 July is ready
            </div>
          </div>

          {/* Email body — real SES template style */}
          <div style={{ background: "#f9fafb", padding: 18 }}>
            <div style={{ maxWidth: 600, margin: "0 auto", background: "#ffffff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ padding: "22px 26px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#111827" }}>Cogletta</span>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>Your daily read</span>
              </div>
              {SAMPLE_ARTICLES.map((a, i) => (
                <div key={i} style={{ padding: "20px 26px", borderTop: i === 0 ? "none" : "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af" }}>
                    {a.emoji} {a.category}
                  </span>
                  <h3 style={{ margin: "8px 0 4px", fontSize: "19px", fontWeight: 700, lineHeight: 1.3, color: "#111827" }}>{a.title}</h3>
                  <p style={{ margin: "0", fontSize: "13px", color: "#9ca3af", fontWeight: 500 }}>{a.source} &middot; {a.readingTime}</p>
                  <p style={{ margin: "8px 0 0", fontSize: "15px", lineHeight: 1.75, color: "#374151", fontFamily: "Georgia, 'Times New Roman', serif" }}>
                    {a.summary} <span style={{ color: "#111827", fontWeight: 600, whiteSpace: "nowrap" }}>Read full article &rarr;</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Free vs Pro */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 5vw 8px" }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>
          Free vs Pro
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", textAlign: "center", marginBottom: 24 }}>
          Start free with one interest, or unlock the full experience.
        </p>

        <div style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16, overflow: "hidden" }}>
          {[
            ["Interests you can follow", "1", "3"],
            ["Sub-topics within each interest", "—", "Yes"],
            ["Daily curated article", "Yes", "Yes"],
            ["Daily podcast pick", "1", "2"],
            ["Weekly trend report", "—", "Yes"],
          ].map((row, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr",
              padding: "13px 18px", alignItems: "center",
              borderTop: i === 0 ? "none" : "1px solid var(--rule)",
              fontSize: "0.875rem",
            }}>
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>{row[0]}</span>
              <span style={{ color: "var(--ink-muted)", textAlign: "center" }}>{row[1]}</span>
              <span style={{ color: "var(--accent)", fontWeight: 600, textAlign: "center" }}>{row[2]}</span>
            </div>
          ))}
          <div style={{
            display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr",
            padding: "13px 18px", borderTop: "1px solid var(--rule)", background: "var(--paper-warm)",
            fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span style={{ color: "var(--ink-muted)" }}></span>
            <span style={{ color: "var(--ink-muted)", textAlign: "center" }}>Free</span>
            <span style={{ color: "var(--accent)", textAlign: "center" }}>Pro</span>
          </div>
        </div>
      </section>

      {/* All interests + sub-topics */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 5vw 8px" }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6, textAlign: "center" }}>
          Choose what you follow
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--ink-soft)", textAlign: "center", marginBottom: 28, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          {DEMO_CATEGORIES.length} interests, each with focused sub-topics. On Pro, pick the sub-topics you want and every pick gets even more relevant.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {DEMO_CATEGORIES.map((cat) => (
            <div key={cat.id} style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 14, padding: "18px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: "1.1rem" }}>{cat.emoji}</span>
                <span style={{ fontFamily: "'Lora', serif", fontSize: "1.0625rem", fontWeight: 600, color: "var(--ink)" }}>{cat.label}</span>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", lineHeight: 1.5, marginBottom: 12 }}>{cat.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {cat.subTopics.map((sub) => (
                  <span key={sub} style={{
                    fontSize: "0.75rem", color: "var(--ink-soft)",
                    background: "var(--paper-warm)", border: "1px solid var(--rule)",
                    borderRadius: 999, padding: "3px 10px",
                  }}>
                    {sub}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 5vw 72px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.75rem", fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>
          Build your reading habit
        </h2>
        <p style={{ fontSize: "1rem", color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: 24, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          Start free with one interest, or go Pro for the full daily selection tailored to you.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/register" style={{
            background: "var(--ink)", color: "var(--white)", fontWeight: 600,
            padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontSize: "0.9375rem",
          }}>
            Start reading &rarr;
          </Link>
          <Link href="/register#pro" style={{
            background: "var(--accent)", color: "var(--white)", fontWeight: 600,
            padding: "13px 28px", borderRadius: 8, textDecoration: "none", fontSize: "0.9375rem",
          }}>
            See Pro plans
          </Link>
        </div>
      </section>
    </div>
  );
}

// Gerçek dashboard ArticleCard/PodcastCard'ının birebir sadeleştirilmiş kopyası.
function DemoCard({ item, kind }: { item: typeof SAMPLE_ARTICLES[number]; kind: "article" | "podcast" }) {
  return (
    <article style={{ background: "var(--white)", border: "1px solid var(--rule)", borderRadius: 16 }}>
      <div style={{ padding: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: "0.95rem" }}>{item.emoji}</span>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
              {kind === "podcast" ? "Podcast" : item.category}
            </span>
          </div>

          <h2 style={{ fontFamily: "'Lora', serif", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35, color: "var(--ink)", marginBottom: 6 }}>
            {item.title}
          </h2>

          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", fontWeight: 500, marginBottom: 16 }}>
            {item.source} &middot; {item.readingTime}
          </p>

          <p style={{ fontFamily: "'Lora', serif", fontSize: "0.9375rem", lineHeight: 1.75, color: "var(--ink-soft)", marginBottom: 16 }}>
            {item.summary}
          </p>

          <div style={{ background: "var(--paper-warm)", border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
              Why we picked this for you
            </p>
            <p style={{ fontSize: "0.875rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>{item.reason}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <span style={{
            flex: 1, textAlign: "center", background: "var(--ink)", color: "var(--white)",
            borderRadius: 10, padding: "10px 20px", fontSize: "0.875rem", fontWeight: 600, opacity: 0.9,
          }}>
            {kind === "podcast" ? "Listen →" : "Read Full Article →"}
          </span>
        </div>
      </div>
    </article>
  );
}
