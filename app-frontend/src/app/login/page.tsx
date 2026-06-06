"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/cognito";
import { useAuth } from "@/lib/auth-context";
import { RequireGuest } from "@/components/Guards";

function LoginForm() {
  const router = useRouter();
  const { refreshSession, hasInterests } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      await signIn(email, password);
      await refreshSession();
      // hasInterests is stale here — read from localStorage directly
      const saved = localStorage.getItem("daily3-categories");
      router.push(saved ? "/dashboard" : "/onboarding");
    } catch (error: any) {
      console.error("Sign in error:", error);
      setErrorMessage(error?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
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

        <form onSubmit={handleSubmit} className="space-y-5">
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
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
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
