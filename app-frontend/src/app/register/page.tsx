"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/cognito";

const FREE_FEATURES = [
  "3 curated long-form articles in your interests daily",
  "1 podcast recommendation daily",
  "15 interest categories to choose from",
  "Daily email digest",
  "Editorial commentary on each article",
];

const PRO_FEATURES = [
  "Everything in Free",
  "6 sub-topics per category (granular selection)",
  "Personalised prompt — AI picks articles for your specific focus",
  "3 podcast recommendations daily",
  "3 video recommendations daily",
  "Weekly trend report every Sunday",
];

function RegisterModal({
  plan,
  onClose,
}: {
  plan: "free" | "pro";
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(name, email, password);
      localStorage.setItem("pending_verification_email", email);
      localStorage.setItem("selected_plan", plan);
      router.push("/verify-email");
    } catch (err: any) {
      setError(err?.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Create your account</h2>
            <p className="mt-1 text-sm text-gray-500">
              Starting with{" "}
              <span className={`font-semibold ${plan === "pro" ? "text-violet-600" : "text-black"}`}>
                {plan === "pro" ? "Pro" : "Free"} plan
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-xl px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-40 ${
              plan === "pro"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-black hover:bg-gray-800"
            }`}
          >
            {loading ? "Creating account..." : "Create account →"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-black">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [modal, setModal] = useState<"free" | "pro" | null>(null);

  return (
    <>
      {modal && <RegisterModal plan={modal} onClose={() => setModal(null)} />}

      <main className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-400">Daily3</p>
            <h1 className="mt-4 text-5xl font-bold tracking-tight text-gray-900 leading-tight">
              Read less.<br />Learn more.
            </h1>
            <p className="mt-5 text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
              Every morning, three long-form articles curated by AI — one for each topic you care about. No algorithm, no noise. Just reading worth your time.
            </p>
          </div>
        </div>

        {/* Plans */}
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-2">

            {/* Free Plan */}
            <div className="rounded-3xl border border-gray-200 bg-white p-8 flex flex-col">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Free</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900">Start reading today</h2>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                  Everything you need to build a daily reading habit. No credit card required.
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-0.5 text-green-500 text-sm">✓</span>
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setModal("free")}
                className="w-full rounded-xl border-2 border-black bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-black hover:text-white transition"
              >
                Get started for free →
              </button>
            </div>

            {/* Pro Plan */}
            <div className="rounded-3xl border-2 border-violet-600 bg-white p-8 flex flex-col relative">
              <div className="absolute -top-3 left-8">
                <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-bold text-white uppercase tracking-wide">
                  Coming soon
                </span>
              </div>

              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Pro</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900">Go deeper</h2>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                  For serious readers. Granular personalisation, multilingual audio, and weekly intelligence reports.
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-0.5 text-violet-500 text-sm">✓</span>
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled
                className="w-full rounded-xl bg-violet-100 px-6 py-3 text-sm font-semibold text-violet-400 cursor-not-allowed"
              >
                Notify me when Pro launches
              </button>
            </div>

          </div>

          <p className="mt-8 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-black">Sign in</Link>
          </p>
        </div>
      </main>
    </>
  );
}
