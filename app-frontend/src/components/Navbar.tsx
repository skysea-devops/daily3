import Link from "next/link";

export default function Navbar() {
  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold">
          Daily3
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/dashboard" className="text-gray-600 hover:text-black">
            Dashboard
          </Link>

          <Link href="/onboarding" className="text-gray-600 hover:text-black">
            Interests
          </Link>

          <Link href="/login" className="text-gray-600 hover:text-black">
            Sign In
          </Link>

          <Link
            href="/register"
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}