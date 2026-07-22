"use client";

import Link from "next/link";
import { useState } from "react";
import Navbar from "@/components/Navbar";

const prose: React.CSSProperties = {
  fontSize: "0.9375rem",
  lineHeight: 1.8,
  color: "var(--ink-soft)",
};

const h2: React.CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 700,
  color: "var(--ink)",
  marginTop: 36,
  marginBottom: 8,
};

const h3: React.CSSProperties = {
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--ink)",
  marginTop: 20,
  marginBottom: 4,
};

const ul: React.CSSProperties = {
  paddingLeft: 20,
  margin: "8px 0",
  color: "var(--ink-soft)",
  fontSize: "0.9375rem",
  lineHeight: 1.8,
};

const TERMS = (
  <>
    <p style={prose}>Last Updated: July 2026</p>
    <p style={{ ...prose, marginTop: 12 }}>Welcome to Cogletta. By accessing or using Cogletta, you agree to these Terms of Use.</p>

    <h2 style={h2}>1. Acceptance of Terms</h2>
    <p style={prose}>By creating an account, subscribing to our newsletter, or using our services, you agree to be bound by these Terms. If you do not agree, please do not use Cogletta.</p>

    <h2 style={h2}>2. Description of Service</h2>
    <p style={prose}>Cogletta curates and delivers content recommendations based on user-selected interests and preferences. The service may include:</p>
    <ul style={ul}>
      <li>Personalized newsletters</li>
      <li>Reading recommendations</li>
      <li>Content summaries and metadata</li>
      <li>User accounts and preference management</li>
      <li>Future premium features</li>
    </ul>
    <p style={prose}>We may modify, suspend, or discontinue any part of the service at any time.</p>

    <h2 style={h2}>3. User Accounts</h2>
    <p style={prose}>You are responsible for:</p>
    <ul style={ul}>
      <li>Maintaining the confidentiality of your account credentials</li>
      <li>Providing accurate information</li>
      <li>All activities occurring under your account</li>
    </ul>
    <p style={prose}>You must notify us immediately of any unauthorized use of your account.</p>

    <h2 style={h2}>4. Intellectual Property</h2>
    <p style={prose}>Cogletta and its original content, branding, software, design, and functionality are owned by Cogletta and protected by applicable intellectual property laws. Articles, images, and external content recommended through Cogletta remain the property of their respective publishers and rights holders. Cogletta does not claim ownership of third-party content.</p>

    <h2 style={h2}>5. Content Recommendations</h2>
    <p style={prose}>Cogletta provides recommendations for informational purposes only. We do not guarantee accuracy, completeness, availability, or suitability of any recommended content. Users are responsible for evaluating information obtained through recommended sources.</p>

    <h2 style={h2}>6. Acceptable Use</h2>
    <p style={prose}>You agree not to:</p>
    <ul style={ul}>
      <li>Use the service unlawfully</li>
      <li>Attempt to gain unauthorized access to systems</li>
      <li>Reverse engineer the platform</li>
      <li>Interfere with service operation</li>
      <li>Scrape or bulk-download content from Cogletta</li>
    </ul>

    <h2 style={h2}>7. Subscription and Payments</h2>

    <h3 style={h3}>7.A. Billing</h3>
    <p style={prose}>Certain features require a paid Cogletta Pro subscription. Pricing is shown before purchase. You may choose monthly or yearly billing, and fees are charged in advance for each billing period. Your subscription renews automatically — monthly or yearly, depending on the plan you select — until you or we cancel it. Subscription charges are fully earned upon payment.</p>
    <p style={prose}>Payments are processed by our Merchant of Record, Lemon Squeezy, which acts as the authorized reseller of Cogletta Pro. Lemon Squeezy's Buyer Terms also apply to your purchase, and Lemon Squeezy handles billing, payment card storage, taxes (such as VAT and sales tax), and refund and chargeback processing. To update your payment method, use the billing portal linked from your account settings.</p>

    <h3 style={h3}>7.B. No Refunds</h3>
    <p style={prose}>You may cancel your subscription at any time from your account settings. Except where a refund is required by applicable law, subscription fees are non-refundable, and there are no refunds or credits for partially used billing periods. If you cancel before the end of your billing period, you keep Pro access for the remainder of that period, after which your account reverts to the Free plan. If we suspend or terminate your account for breach of these Terms, you will receive no refund for any unused portion of your subscription.</p>

    <h3 style={h3}>7.C. Plan Changes</h3>
    <p style={prose}>You may switch from monthly to yearly billing at any time; your plan changes immediately and the price difference is prorated automatically. We do not offer downgrades from yearly to monthly billing — to move to monthly billing, cancel your yearly subscription and subscribe again after your current period ends.</p>

    <h3 style={h3}>7.D. Price Changes</h3>
    <p style={prose}>We may change subscription prices. Any price change applies only to future billing periods; existing subscriptions continue at the price at which they were created until they renew.</p>

    <h3 style={h3}>7.E. Payment Information and Taxes</h3>
    <p style={prose}>All information you provide in connection with a transaction must be accurate, complete, and current. You agree to pay all charges incurred under your payment method at the prices in effect when the charges are incurred, plus any applicable taxes.</p>

    <h2 style={h2}>8. Third-Party Links</h2>
    <p style={prose}>Cogletta may link to external websites and publishers. We are not responsible for third-party content, privacy practices, or availability of external services. Your interactions with third-party websites are governed by their own terms and policies.</p>

    <h2 style={h2}>9. Disclaimer</h2>
    <p style={prose}>The service is provided "as is" and "as available." To the fullest extent permitted by law, Cogletta disclaims all warranties, express or implied. We do not guarantee uninterrupted or error-free operation.</p>

    <h2 style={h2}>10. Limitation of Liability</h2>
    <p style={prose}>To the maximum extent permitted by law, Cogletta shall not be liable for indirect or consequential damages, loss of profits, loss of data, or business interruption arising from use of the service.</p>

    <h2 style={h2}>11. Termination</h2>
    <p style={prose}>We may suspend or terminate access to the service if these Terms are violated. You may stop using the service at any time.</p>

    <h2 style={h2}>12. Changes to Terms</h2>
    <p style={prose}>We may update these Terms periodically. Continued use of the service after changes become effective constitutes acceptance of the revised Terms.</p>

    <h2 style={h2}>13. Contact</h2>
    <p style={prose}>For questions regarding these Terms: <a href="mailto:admin@cogletta.com" style={{ color: "var(--ink)" }}>admin@cogletta.com</a></p>
  </>
);

const PRIVACY = (
  <>
    <p style={prose}>Last Updated: July 2026</p>
    <p style={{ ...prose, marginTop: 12 }}>At Cogletta, we respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard information when you use our services.</p>

    <h2 style={h2}>1. Information We Collect</h2>
    <h3 style={h3}>Information You Provide</h3>
    <ul style={ul}>
      <li>Name and email address</li>
      <li>Reading interests and preferences</li>
      <li>Account information</li>
      <li>Communication preferences</li>
    </ul>
    <h3 style={h3}>Automatically Collected Information</h3>
    <ul style={ul}>
      <li>Device information and browser type</li>
      <li>IP address and pages visited</li>
      <li>Referral information</li>
      <li>Newsletter engagement metrics</li>
    </ul>

    <h2 style={h2}>2. How We Use Information</h2>
    <ul style={ul}>
      <li>Deliver personalized recommendations</li>
      <li>Send newsletters and product updates</li>
      <li>Improve our algorithms and services</li>
      <li>Measure engagement and performance</li>
      <li>Prevent abuse and fraud</li>
      <li>Respond to support requests</li>
    </ul>

    <h2 style={h2}>3. Email Communications</h2>
    <p style={prose}>If you subscribe to our newsletter, we may send daily recommendations, product updates, and service-related notices. You can unsubscribe at any time using the unsubscribe link in our emails.</p>

    <h2 style={h2}>4. Analytics</h2>
    <p style={prose}>We may use analytics tools to understand newsletter performance, user engagement, and product usage trends. Analytics data may be aggregated and anonymized.</p>

    <h2 style={h2}>5. Cookies</h2>
    <p style={prose}>We may use cookies to remember preferences, maintain sessions, improve functionality, and analyze usage patterns. You can control cookies through your browser settings.</p>

    <h2 style={h2}>6. Sharing Information</h2>
    <p style={prose}>We do not sell personal information. We may share information with trusted service providers (email delivery, cloud hosting, analytics) that help operate the platform. These providers are permitted to use information only as necessary to provide their services.</p>

    <h2 style={h2}>7. Data Retention</h2>
    <p style={prose}>We retain personal information only for as long as necessary to provide services, meet legal obligations, resolve disputes, and enforce agreements.</p>

    <h2 style={h2}>8. Security</h2>
    <p style={prose}>We implement reasonable technical and organizational measures to protect personal information. However, no system can guarantee absolute security.</p>

    <h2 style={h2}>9. Your Rights</h2>
    <p style={prose}>Depending on your location, you may have rights to access, correct, delete, or restrict processing of your information, object to processing, or request data portability. To exercise these rights, contact us at <a href="mailto:admin@cogletta.com" style={{ color: "var(--ink)" }}>admin@cogletta.com</a>.</p>

    <h2 style={h2}>10. International Users</h2>
    <p style={prose}>Your information may be processed and stored in countries different from your country of residence. We take reasonable measures to ensure appropriate safeguards are in place.</p>

    <h2 style={h2}>11. Children's Privacy</h2>
    <p style={prose}>Cogletta is not intended for children under the age of 13. We do not knowingly collect personal information from children.</p>

    <h2 style={h2}>12. Changes to This Policy</h2>
    <p style={prose}>We may update this Privacy Policy from time to time. Changes become effective when published on this page.</p>

    <h2 style={h2}>13. Contact</h2>
    <p style={prose}>For privacy-related questions: <a href="mailto:admin@cogletta.com" style={{ color: "var(--ink)" }}>admin@cogletta.com</a></p>
  </>
);

export default function LegalPage() {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
          Legal
        </h1>
        <p style={{ ...prose, marginBottom: 32 }}>
          Questions? Email us at <a href="mailto:admin@cogletta.com" style={{ color: "var(--ink)" }}>admin@cogletta.com</a>
        </p>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 40, borderBottom: "1px solid var(--rule)", paddingBottom: 0 }}>
          {(["terms", "privacy"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 20px",
                fontSize: "0.9375rem",
                fontWeight: 600,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: tab === t ? "var(--ink)" : "var(--ink-muted)",
                borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t === "terms" ? "Terms of Use" : "Privacy Policy"}
            </button>
          ))}
        </div>

        {tab === "terms" ? TERMS : PRIVACY}

      </main>
    </>
  );
}
