import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight">Daily3</h1>

        <p className="mt-6 max-w-2xl text-xl text-gray-600">
          Choose 3 interests. Get 3 high-quality articles every day. No
          information overload.
        </p>

        <div className="mt-10 flex gap-4">
          <Link
            href="/onboarding"
            className="rounded-xl bg-black px-6 py-3 text-white"
          >
            Get Started
          </Link>

          <Link href="/dashboard" className="rounded-xl border px-6 py-3">
            View Demo
          </Link>
        </div>
      </section>
    </main>
  );
}