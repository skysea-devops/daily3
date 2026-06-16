import Link from "next/link";

export default function HomePage() {
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

        .lp-hero { max-width: 780px; margin: 0 auto; padding: 96px 5vw 80px; text-align: center; }
        .lp-eyebrow { display: inline-block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 28px; }
        .lp-h1 { font-family: 'Lora', serif; font-size: clamp(2.4rem, 5vw, 3.8rem); font-weight: 600; line-height: 1.18; color: var(--ink); margin-bottom: 24px; }
        .lp-h1 em { font-style: italic; color: var(--accent); }
        .lp-sub { font-size: 1.125rem; color: var(--ink-soft); max-width: 540px; margin: 0 auto 40px; line-height: 1.75; }
        .lp-cta { display: inline-block; background: var(--ink); color: var(--white); padding: 14px 32px; border-radius: 8px; font-size: 0.9375rem; font-weight: 600; text-decoration: none; }
        .lp-note { display: block; margin-top: 14px; font-size: 0.8125rem; color: var(--ink-muted); }

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

      <div className="lp-body">

        {/* NAV */}
        <nav className="lp-nav">
          <a href="/" className="lp-logo">Cogletta</a>
          <div className="lp-nav-links">
            <Link href="/login">Sign in</Link>
            <Link href="/register" className="lp-btn-nav">Start reading</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <span className="lp-eyebrow">Three articles. Every morning.</span>
          <h1 className="lp-h1">Read what<br /><em>matters to you.</em></h1>
          <p className="lp-sub">
            Every morning, three long-form articles on the topics you actually care about —
            carefully selected for your interests and delivered to your inbox.

          </p>
          <Link href="/register" className="lp-cta">Start reading for free →</Link>
          <span className="lp-note">Free forever · No credit card required</span>
        </section>

        <div className="lp-divider" />

        {/* NAME STORY */}
        <section className="lp-section">
          <p className="lp-label">The name</p>
          <p className="lp-p">
            Cogletta is a name we created to capture a simple idea: <strong>knowledge should be chosen, not chased.</strong>
          </p>
          <p className="lp-p">
            The name blends two Latin roots. <em>Cognito</em> means "to know" or "to understand" — the origin of the modern word cognition. <em>Collecta</em> means "gathered together" or "carefully collected."
          </p>
          <p className="lp-p">
            Together, they express what Cogletta is built to do.
          </p>
          <p className="lp-p">
            We live in a world with more information than we could ever consume. The challenge is no longer finding content — it's finding the right content. Cogletta helps by collecting, filtering, and presenting the few things that are truly worth your attention.
          </p>
          <p className="lp-p" style={{lineHeight: 2.2}}>
            Not more information.<br />
            <strong>Better information.</strong><br />
            Carefully selected. Thoughtfully curated. Delivered daily.
          </p>
        </section>

        <div className="lp-divider" />

        {/* FOUNDER STORY */}
        <section className="lp-section">
          <p className="lp-label">Why Cogletta exists</p>
          <p className="lp-p">
            I once realized that after spending time on my phone, when I put it down,
            <strong> I couldn't remember anything tangible.</strong> Social media, news sites, video platforms
            show me things — but are these things really what matters to me?
          </p>
          <p className="lp-p">
            And there's so much out there that choosing what to read has become stressful in itself.
          </p>
          <p className="lp-p">
            I thought about how I used to read. I would pick up a magazine, follow topics that made sense
            to me. <strong>That feeling was gone.</strong>
          </p>
          <p className="lp-p">
            That's why I built Cogletta. Three articles every morning on topics you choose.
            No noise. Focus. If you think like me — you're in the right place.
          </p>
          <p className="lp-sig">— The Cogletta team</p>
        </section>

        {/* HOW IT WORKS */}
        <div className="lp-band">
          <div className="lp-band-inner">
            <p className="lp-label lp-accent-label">How it works</p>
            <h2 className="lp-h2">Simple by design. Powerful under the hood.</h2>
            <div className="lp-steps">
              {[
                { n: "01", title: "Choose your topics", body: "Pick three interest areas from 15 categories — history, economics, science, world politics, and more." },
                { n: "02", title: "AI reads the web", body: "Every day, hundreds of sources are scanned. Only the best long-form article per category makes the cut." },
                { n: "03", title: "Read at 07:00", body: "Your three articles arrive every morning — on your dashboard and in your inbox, ready to read or listen to." },
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

        {/* WHAT YOU GET */}
        <section className="lp-section" style={{maxWidth: 800}}>
          <p className="lp-label lp-accent-label">What's included</p>
          <h2 className="lp-h2">Everything you need to build a reading habit.</h2>
          <div className="lp-features">
            {[
              { icon: "📰", title: "3 curated articles daily", body: "Long-form, substantive pieces from think-tanks, academic journals, and quality publications. No clickbait." },
              { icon: "🎧", title: "Audio edition", body: "Every article comes with a natural-voice audio version. Listen on your commute, walk, or while making coffee." },
              { icon: "✉️", title: "Daily email digest", body: "Your three articles delivered to your inbox every morning at 07:00. Clean, readable." },
              { icon: "💡", title: "Why we picked this for you", body: "Each article comes with a short editorial note — why this piece, why today, why it's worth your time." },
            ].map(f => (
              <div key={f.title} className="lp-feature">
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SAMPLE */}
        <div className="lp-band">
          <div className="lp-band-inner" style={{maxWidth: 640}}>
            <p className="lp-label lp-accent-label">A taste of what you'll read</p>
            <h2 className="lp-h2">This is what arrives in your inbox.</h2>

            <div className="lp-article">
              <p className="lp-art-meta">🏛️ History</p>
              <h3 className="lp-art-title">The Evolution of Britain's Invasion Fiction</h3>
              <p className="lp-art-source">JSTOR Daily · 8 min read</p>
              <p className="lp-art-text">
                Britain's invasion fiction tracks a fascinating arc — the 19th-century fear of foreign attack gradually morphed into
                something more psychologically complex, a fear of internal collapse dressed in external threat.
                If you've ever wondered why certain anxieties resurface in politics every generation,
                this is the literary genealogy that explains it. <a href="/register">Read full article →</a>
              </p>
            </div>

            <div className="lp-article">
              <p className="lp-art-meta">🌍 World Politics</p>
              <h3 className="lp-art-title">What the Lebanon Strikes Mean for the US-Iran Nuclear Deal</h3>
              <p className="lp-art-source">Chatham House · 6 min read</p>
              <p className="lp-art-text">
                Three powers, one calculation: as Israel intensifies strikes on Hezbollah, the calculus for a nuclear agreement
                shifts in real time. This piece cuts through the noise to show how tactical military decisions
                ripple into diplomatic channels in ways that aren't obvious from headlines alone. <a href="/register">Read full article →</a>
              </p>
            </div>
          </div>
        </div>

        {/* BOTTOM CTA */}
        <div className="lp-cta-bottom">
          <h2>Start your morning ritual.</h2>
          <p>
            We don't advertise, we don't manipulate algorithms.
            We grow because readers share us with people they trust.
          </p>
          <Link href="/register" className="lp-cta">Read your first three articles →</Link>
          <span className="lp-note">Free forever · Takes 30 seconds to set up</span>
        </div>

        {/* FOOTER */}
        <footer className="lp-footer">
          <p>© 2026 Cogletta · Curated by AI, delivered every morning at 07:00.</p>
          <p>
            <Link href="/login">Sign in</Link>
            {" · "}
            <Link href="/register">Register</Link>
            {" · "}
            <a href="mailto:hello@cogletta.com">Contact</a>
          </p>
        </footer>

      </div>
    </>
  );
}
