"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, forgotPassword, confirmForgotPassword } from "@/lib/cognito";
import { useAuth } from "@/lib/auth-context";
import { RequireGuest } from "@/components/Guards";

// Üç aşama: giriş, şifre sıfırlama e-postası, yeni şifre belirleme
type View = "login" | "forgot" | "reset";

function LoginForm() {
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [view, setView]               = useState<View>("login");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [code, setCode]               = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  // ── Login ──────────────────────────────────────────────────────────────────

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      await refreshSession();
      const saved = localStorage.getItem("daily3-categories");
      router.push(saved ? "/dashboard" : "/onboarding");
    } catch (err: any) {
      setError(err?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password: kod gönder ────────────────────────────────────────────

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSuccess("Check your email for the reset code.");
      setView("reset");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  }

  // ── Reset password: kodu ve yeni şifreyi onayla ────────────────────────────

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      setSuccess("Password updated! You can now sign in.");
      setView("login");
      setPassword("");
      setCode("");
      setNewPassword("");
    } catch (err: any) {
      setError(err?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">

        {/* LOGIN */}
        {view === "login" && (
          <>
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-2 text-gray-600">
              Sign in to continue your Daily3 journey.
            </p>

            <button
              type="button"
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border px-6 py-3 font-medium hover:bg-gray-50"
            >
              <span className="text-lg">G</span>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => { setError(""); setSuccess(""); setView("forgot"); }}
                    className="text-xs text-gray-400 hover:text-black"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {success && (
                <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                  {success}
                </p>
              )}

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-black">
                Create one
              </Link>
            </p>
          </>
        )}

        {/* FORGOT PASSWORD */}
        {view === "forgot" && (
          <>
            <button
              type="button"
              onClick={() => { setError(""); setView("login"); }}
              className="mb-6 text-sm text-gray-400 hover:text-black"
            >
              ← Back to sign in
            </button>

            <h1 className="text-3xl font-bold">Reset password</h1>
            <p className="mt-2 text-gray-600">
              Enter your email and we'll send you a reset code.
            </p>

            <form onSubmit={handleForgot} className="mt-8 space-y-5">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {loading ? "Sending..." : "Send reset code"}
              </button>
            </form>
          </>
        )}

        {/* RESET PASSWORD */}
        {view === "reset" && (
          <>
            <button
              type="button"
              onClick={() => { setError(""); setView("forgot"); }}
              className="mb-6 text-sm text-gray-400 hover:text-black"
            >
              ← Back
            </button>

            <h1 className="text-3xl font-bold">New password</h1>
            <p className="mt-2 text-gray-600">
              Enter the code we sent to <span className="font-medium">{email}</span> and choose a new password.
            </p>

            <form onSubmit={handleReset} className="mt-8 space-y-5">
              <div>
                <label className="text-sm font-medium">Reset code</label>
                <input
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="text-sm font-medium">New password</label>
                <input
                  type="password"
                  placeholder="Min. 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {loading ? "Updating..." : "Set new password"}
              </button>
            </form>
          </>
        )}

      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <RequireGuest>
      <LoginForm />
    </RequireGuest>
  );
}
