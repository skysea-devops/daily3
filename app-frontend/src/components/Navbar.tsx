"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.push("/");
  }

  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold">
          Daily3
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          {!loading && user ? (
            <>
              <Link href="/dashboard" className="text-gray-600 hover:text-black">
                Dashboard
              </Link>

              <Link href="/interests" className="text-gray-600 hover:text-black">
                Interests
              </Link>

              <button
                onClick={handleSignOut}
                className="text-gray-600 hover:text-black"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-black">
                Sign In
              </Link>

              <Link
                href="/register"
                className="rounded-xl bg-black px-4 py-2 text-white"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
