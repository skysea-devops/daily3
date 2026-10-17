// app-frontend/src/app/page.tsx
"use client";

import Link from "next/link";
import { useState, MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import RegisterModal from "@/components/RegisterModal";
import { CATEGORIES } from "@/lib/categories";


export default function HomePage() {
  const [showModal, setShowModal] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  /**
   * Tüm "kayıt ol" CTA'larının ortak davranışı.
   *
   * - Misafir → kayıt modalı açılır (sayfa değişmez).
   * - Giriş yapmış kullanıcı → dashboard'a gider; mevcut hesabı varken yeni
   *   hesap açmaya davet edilmez (/register sayfasındaki mantığın aynısı).
   * - Oturum henüz yükleniyorsa → /register'a gider; o sayfa beş durumu da
   *   doğru şekilde ele alıyor, yani yanlış ekran gösterme riski yok.
   *
   * Ctrl/Cmd/orta tık ile yeni sekmede açma korunur ve JS yüklenmemişse
   * href devrede kalır — statik export'ta bu önemli.
   */
  function handleSignupCta(e: ReactMouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();

    if (loading) { router.push("/register"); return; }
    if (user)    { router.push("/dashboard"); return; }
    setShowModal(true);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

        :root {
          --ink:       #1a1714;
          --ink-soft:  #4a4540;
          --ink-muted: #8c8278;
          --paper:     #f7f4ee;
          --paper-warm:#ede9e0;
          --rule:      #ddd8ce;
          --accent:    #7c5c3e;
          --white:     #ffffff;
        }

        .lp-body { background: var(--paper); color: var(--ink); }

        .lp-nav {
          border-bottom: 1px solid var(--rule);
          padding: 0 5vw;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--paper);
        }
        .lp-logo { font-family: 'Lora', serif; font-weight: 600; font-size: 1.1rem; color: var(--ink); text-decoration: none; }
        .lp-nav-links { display: flex; gap: 20px; align-items: center; }
        .lp-nav-links a { font-size: 0.875rem; color: var(--ink-soft); text-decoration: none; }
        .lp-btn-nav { background: var(--ink); color: var(--white) !important; padding: 8px 18px; border-radius: 6px; font-weight: 500; }

        .lp-hero { max-width: 1180px; margin: 0 auto; padding: 88px 5vw 72px; text-align: center; }
        .lp-eyebrow { display: inline-block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 28px; }
        .lp-h1 { font-family: 'Lora', serif; font-size: clamp(2.4rem, 6vw, 4.25rem); font-weight: 600; line-height: 1.12; letter-spacing: -0.015em; color: var(--ink); max-width: 1040px; margin: 0 auto; text-wrap: balance; }
        .lp-h1 em { font-style: italic; color: var(--accent); }
        .lp-sub { font-size: 1.125rem; color: var(--ink-soft); max-width: 540px; margin: 0 auto 40px; line-height: 1.75; }
        .lp-hero-sub { font-size: 1.125rem; color: var(--ink-soft); max-width: 560px; margin: 24px auto 0; line-height: 1.75; }
        .lp-cta { display: inline-block; background: var(--ink); color: var(--white); padding: 14px 32px; border-radius: 8px; font-size: 0.9375rem; font-weight: 600; text-decoration: none; border: none; cursor: pointer; }
        .lp-cta-hero { margin-top: 36px; }
        .lp-note { display: block; margin-top: 14px; font-size: 0.8125rem; color: var(--ink-muted); }

        /* Hero konu kartları — onboarding'deki 9 kategorinin önizlemesi.
           align-items:start bilinçli: satırdaki kartlar kendi yüksekliğinde kalır
           (tasarımda uzun başlıklı kart diğerlerinden uzun). */
        .lp-topics { max-width: 960px; margin-left: auto; margin-right: auto; margin-top: 64px; border-top: 1px solid var(--rule); padding-top: 48px; }
        .lp-topics-h2 { font-family: 'Lora', serif; font-size: clamp(1.4rem, 2.6vw, 1.75rem); font-weight: 600; color: var(--ink); margin: 0; }
        .lp-topics-intro { color: var(--ink-muted); margin: 8px 0 28px; font-size: 0.9375rem; }
        .lp-topic-grid { display: grid; grid-template-columns: 1fr; gap: 14px; max-width: 880px; margin: 0 auto; align-items: start; text-align: left; }
        @media (min-width: 560px) { .lp-topic-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 900px) { .lp-topic-grid { grid-template-columns: repeat(3, 1fr); } }
        .lp-topic {
          display: block;
          background: var(--white);
          border: 1px solid var(--rule);
          border-bottom: 3px solid var(--ink);
          border-radius: 12px;
          padding: 20px 22px;
          text-decoration: none;
          color: var(--ink);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lp-topic:hover, .lp-topic:focus-visible {
          border-color: #2f64c9;
          box-shadow: 0 0 0 1px #2f64c9;
          outline: none;
        }
        .lp-topic-icon { font-size: 1.5rem; line-height: 1; margin-bottom: 14px; display: block; }
        .lp-topic-title { display: block; font-size: 0.9375rem; font-weight: 600; line-height: 1.35; color: var(--ink); margin-bottom: 4px; }
        .lp-topic-desc { display: block; font-size: 0.8125rem; line-height: 1.5; color: var(--ink-muted); }

        @media (max-width: 760px) {
          .lp-hero { padding-top: 56px; }
          .lp-hero-sub { font-size: 1rem; }
        }

        .lp-divider { width: 48px; height: 2px; background: var(--accent); margin: 0 auto; }

        .lp-section { max-width: 640px; margin: 80px auto; padding: 0 5vw; }
        .lp-label { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: 24px; }
        .lp-accent-label { color: var(--accent); }
        .lp-p { font-family: 'Lora', serif; font-size: 1.1rem; line-height: 1.85; color: var(--ink-soft); margin-bottom: 20px; }
        .lp-p strong { color: var(--ink); }
        .lp-p em { font-style: italic; }
        .lp-sig { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--rule); font-size: 0.875rem; color: var(--ink-muted); font-style: italic; }

        .lp-band { background: var(--paper-warm); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 80px 5vw; }
        .lp-band-inner { max-width: 800px; margin: 0 auto; }
        .lp-h2 { font-family: 'Lora', serif; font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 600; color: var(--ink); margin-bottom: 40px; max-width: 480px; }

        .lp-quotes { display: grid; gap: 20px; }
        @media (min-width: 700px) { .lp-quotes { grid-template-columns: repeat(3, 1fr); } }
        .lp-quote { background: var(--white); border: 1px solid var(--rule); border-radius: 12px; padding: 28px; display: flex; flex-direction: column; text-align: left; }
        .lp-quote-stars { color: var(--accent); font-size: 0.8125rem; letter-spacing: 3px; margin-bottom: 14px; }
        .lp-quote-text { font-family: 'Lora', serif; font-size: 1rem; line-height: 1.75; color: var(--ink); margin: 0 0 20px; }
        .lp-quote-who { margin-top: auto; display: flex; align-items: center; gap: 12px; }
        .lp-quote-avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--paper-warm); color: var(--accent); font-weight: 600; font-size: 0.9375rem; display: flex; align-items: center; justify-content: center; font-family: 'Lora', serif; flex-shrink: 0; }
        .lp-quote-name { font-size: 0.875rem; font-weight: 600; color: var(--ink); display: block; }
        .lp-quote-role { font-size: 0.75rem; color: var(--ink-muted); }

        .lp-steps { display: grid; gap: 32px; }
        @media (min-width: 640px) { .lp-steps { grid-template-columns: repeat(3, 1fr); } }
        .lp-step-num { font-family: 'Lora', serif; font-size: 2rem; font-weight: 600; color: var(--rule); line-height: 1; margin-bottom: 12px; }
        .lp-step h3 { font-size: 0.9375rem; font-weight: 600; color: var(--ink); margin-bottom: 8px; }
        .lp-step p { font-size: 0.875rem; color: var(--ink-soft); line-height: 1.7; }

        .lp-features { display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
        @media (min-width: 640px) { .lp-features { grid-template-columns: repeat(2, 1fr); } }
        .lp-feature { background: var(--white); padding: 28px; }
        .lp-feature-icon { font-size: 1.5rem; margin-bottom: 12px; }
        .lp-feature h3 { font-size: 0.9375rem; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
        .lp-feature p { font-size: 0.875rem; color: var(--ink-soft); line-height: 1.65; }

        .lp-article { background: var(--white); border: 1px solid var(--rule); border-radius: 12px; padding: 28px; margin-bottom: 16px; }
        .lp-art-meta { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
        .lp-art-title { font-family: 'Lora', serif; font-size: 1.1rem; font-weight: 600; color: var(--ink); margin-bottom: 4px; line-height: 1.4; }
        .lp-art-source { font-size: 0.8125rem; color: var(--ink-muted); margin-bottom: 14px; }
        .lp-art-text { font-family: 'Lora', serif; font-size: 0.9375rem; color: var(--ink-soft); line-height: 1.75; }
        .lp-art-text a { color: var(--accent); font-weight: 600; text-decoration: none; }

        .lp-cta-bottom { text-align: center; padding: 96px 5vw; max-width: 560px; margin: 0 auto; }
        .lp-cta-bottom h2 { font-family: 'Lora', serif; font-size: clamp(1.8rem, 3.5vw, 2.6rem); font-weight: 600; color: var(--ink); margin-bottom: 16px; line-height: 1.25; }
        .lp-cta-bottom p { color: var(--ink-soft); margin-bottom: 36px; font-size: 1rem; line-height: 1.7; }

        .lp-footer { border-top: 1px solid var(--rule); padding: 32px 5vw; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .lp-footer p { font-size: 0.8125rem; color: var(--ink-muted); }
        .lp-footer a { color: var(--ink-muted); text-decoration: none; }
      `}</style>

      {showModal && <RegisterModal onClose={() => setShowModal(false)} />}

      <div className="lp-body">

        {/* Ortak Navbar auth durumu yüklenirken yanlışlıkla misafir
            menüsünü göstermez; kullanıcı durumu kesinleşince doğru menü açılır. */}
        <Navbar />

        {/* HERO */}
        <section className="lp-hero">
          <span className="lp-eyebrow">Curated for you. Every morning.</span>
          <h1 className="lp-h1">Spend less time scrolling.<br /><em>Read more of what interests you.</em></h1>
          <p className="lp-hero-sub">
            Thoughtfully selected articles around the topics you care about, ready for you every morning.
          </p>
          <a href="/register/" className="lp-cta lp-cta-hero" onClick={handleSignupCta}>
            Start reading for free →
          </a>
          <span className="lp-note">No credit card required.</span>
          <div style={{ marginTop: 14 }}>
            <Link href="/demo" style={{ color: "var(--ink-soft)", fontSize: "0.9375rem", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
              or see a demo →
            </Link>
          </div>

          {/* TOPICS — kartlar CATEGORIES'ten gelir; yeni kategori eklenince
              burası da otomatik güncellenir. Karta tıklamak kayıt akışını açar. */}
          <div className="lp-topics">
            <h2 className="lp-topics-h2">What do you want to read more about?</h2>
            <p className="lp-topics-intro">Choose the topics that genuinely interest you.</p>
            <div className="lp-topic-grid">
              {CATEGORIES.map(cat => (
                <a
                  key={cat.id}
                  href="/register/"
                  className="lp-topic"
                  onClick={handleSignupCta}
                >
                  <span className="lp-topic-icon" aria-hidden="true">{cat.emoji}</span>
                  <span className="lp-topic-title">{cat.label}</span>
                  <span className="lp-topic-desc">{cat.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
         <div className="lp-divider" />

        

        {/* TESTIMONIALS */}
        <section className="lp-band" style={{ background: "transparent", borderTop: "none", borderBottom: "none", padding: "20px 5vw 72px" }}>
          <div className="lp-band-inner">
            <h2 className="lp-h2" style={{ margin: "0 auto 12px", textAlign: "center" }}>
              The Coglettans
            </h2>
            <p className="lp-sub" style={{ margin: "0 auto 40px", textAlign: "center" }}>
              The people who start their mornings with us.
            </p>
            <div className="lp-quotes">
              {[
                {
                  stars: "★★★★★",
                  text: "I can't wait to see which articles arrive each morning.",
                  name: "Selin",
                  role: "Reads over morning coffee",
                  initial: "S",
                },
                {
                  stars: "★★★★★",
                  text: "I could never finish long articles before. The content chosen for me every day quietly helped me regain my reading habit.",
                  name: "Andy",
                  role: "Daily reader",
                  initial: "D",
                },
                {
                  stars: "★★★★★",
                  text: "No endless feed, no doomscrolling — just the topics I actually chose, curated for me each morning.",
                  name: "Melissa",
                  role: "Pro subscriber",
                  initial: "M",
                },
              ].map((q, i) => (
                <figure key={i} className="lp-quote">
                  <div className="lp-quote-stars">{q.stars}</div>
                  <blockquote className="lp-quote-text">“{q.text}”</blockquote>
                  <figcaption className="lp-quote-who">
                    <span className="lp-quote-avatar">{q.initial}</span>
                    <span>
                      <span className="lp-quote-name">{q.name}</span>
                      <span className="lp-quote-role">{q.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-divider" />

        

        {/* NAME STORY */}
        <section className="lp-section">
          <p className="lp-label">The name</p>
          <p className="lp-p">
            Cogletta is a name I made up around a simple belief:  <strong>Ability to read articles based on one's interests.</strong>
          </p>
          <p className="lp-p">
            The name blends two Latin roots. <em>Cognito</em> means "to know" or "to understand" — the origin of the modern word cognition. <em>Collecta</em> means "gathered together" or "carefully collected."
          </p>
          <p className="lp-p">
            Together, they express what Cogletta is built to do.
          </p>
          <p className="lp-p">
            Not endless scrolling.
            Not constant notifications.
            Just a few carefully chosen articles on the subjects you genuinely care about.
          </p>
          
        </section>

        <div className="lp-divider" />

        {/* FOUNDER STORY */}
        <section className="lp-section">
          <p className="lp-label">The Story Behind Cogletta</p>
          <p className="lp-p">
            Somewhere along the way,
            <strong> I realized </strong> I was consuming more content than ever — but reading less of what I actually cared about.
          </p>
          <p className="lp-p">
            I missed the habit of discovering something thoughtful, following my curiosity, and learning a little more each day.
          </p>
          <p className="lp-p">
            So I built Cogletta for myself. What started as a small side project became something I now look forward to every morning: opening my inbox and wondering, <strong>“What will I discover today?”</strong>
          </p>
          <Link href="/essays/chasing-an-idea" className="lp-p">
  Read the story behind Cogletta →
</Link>
          <p className="lp-sig">— Ismail Gokdeniz - Founder, Cogletta</p>
        </section>
        
        

        {/* WHAT YOU GET */}
        <section className="lp-section" style={{maxWidth: 800}}>
          <p className="lp-label lp-accent-label">What's included</p>
          <h2 className="lp-h2">Everything you need to build a reading habit.</h2>
          <div className="lp-features">
            {[
              { icon: "📰", title: "3 curated articles daily (1 in the free plan)" , body: "Substantive pieces from think-tanks, academic journals, and quality publications. Pro readers follow 3 interests and get an article for each." },
              { icon: "✉️", title: "Daily email digest", body: "Your article and podcast delivered to your inbox every morning. Clean, readable." },
              { icon: "💡", title: "Why we picked this for you", body: "Each article comes with a short editorial note — why this piece, why today, why it's worth your time." },
              { icon: "🎙", title: "2 podcast episodes daily (1 in the free plan)", body: "A carefully selected episode from top podcasts in your interest area — paired with your article every morning." },
              { icon: "✍️", title: "Cogletta Essays", body: "Weekly long-form essays that turn old ideas toward modern life, from Plato's cave to Rumi's wooden horse. Pro readers get the full archive.", wide: true },
            ].map(f => (
              // 5. kart 2 sütunlu grid'de tek kalmasın: tam genişlik
              <div key={f.title} className="lp-feature" style={"wide" in f && f.wide ? { gridColumn: "1 / -1" } : undefined}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

                {/* HOW IT WORKS */}
        <div className="lp-band">
          <div className="lp-band-inner">
            <p className="lp-label lp-accent-label">How it works</p>
            <h2 className="lp-h2">Simple for you. Thoughtful behind the scenes.</h2>
            <div className="lp-steps">
              {[
                { n: "01", title: "Pick your topics", body: "Pick three topics you genuinely want to read more about — from history and economics to science, philosophy, and more." },
                { n: "02", title: "We scan the web for you", body: "Every day, Cogletta searches trusted publications and selects one thoughtful article for each of your topics." },
                { n: "03", title: "Ready every morning", body: "Your three articles and podcast recommendations are waiting in your inbox and dashboard every morning." },
              ].map(s => (
                <div key={s.n} className="lp-step">
                  <div className="lp-step-num">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SAMPLE */}
        <div className="lp-band">
          <div className="lp-band-inner" style={{maxWidth: 640}}>
            <p className="lp-label lp-accent-label">A taste of what you'll read</p>
            <h2 className="lp-h2">This is what arrives in your inbox.</h2>
          <div style={{ marginTop: 14, marginBottom: 32 }}>
            <Link href="/demo" style={{ color: "var(--ink-soft)", fontSize: "1.1575rem", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
              See full demo page →
            </Link>
          </div>
            <div className="lp-article">
              <p className="lp-art-meta">🎨 Arts</p>
              <h3 className="lp-art-title">Why We Can't Stop Looking at Vermeer</h3>
              <p className="lp-art-source">The New Yorker · 9 min read</p>
              <p className="lp-art-text">
                Four centuries later, Johannes Vermeer's quiet interiors continue to captivate millions. But what exactly makes
                his paintings feel so modern? This essay explores the subtle psychology of light, attention, and why slowing
                down in front of a single painting can change the way we see the world.
                <a href="/register/" onClick={handleSignupCta}>Read full article →</a>
              </p>
            </div>

            <div className="lp-article">
              <p className="lp-art-meta">👗 Fashion</p>
              <h3 className="lp-art-title">Why Quiet Luxury Took Over Fashion</h3>
              <p className="lp-art-source">The Business of Fashion · 7 min read</p>
              <p className="lp-art-text">
                Logos are fading, craftsmanship is back, and understated elegance has become the industry's biggest statement.
                Beyond the trend, this piece explains the cultural and economic forces that made "quiet luxury" the defining
                aesthetic of the decade.
                <a href="/register/" onClick={handleSignupCta}>Read full article →</a>
              </p>
            </div>
          </div>
        </div>



        {/* BOTTOM CTA */}
        <div className="lp-cta-bottom">
          <h2>Start your morning ritual.</h2>
          
          <a href="/register/" className="lp-cta" onClick={handleSignupCta}>
            Try Pro free for 14 days →
          </a>
          <span className="lp-note">Takes 30 seconds to set up</span>
        </div>

        {/* FOOTER */}
        <footer className="lp-footer">
          <p>© 2026 Cogletta · 3 articles + 2 podcasts every morning</p>
          <p>
            <Link href="/login">Sign in</Link>
            {" · "}
            <Link href="/essays">Essays</Link>
            {" · "}
            <Link href="/legal">Terms</Link>
            {" · "}
            <Link href="/legal">Privacy</Link>
            {" · "}
            <a href="mailto:read@cogletta.com">read@cogletta.com</a>
          </p>
        </footer>

      </div>
    </>
  );
}
