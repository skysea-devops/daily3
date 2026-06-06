"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";

const CATEGORIES = [
  "Cloud Computing",
  "DevOps",
  "Artificial Intelligence",
  "Cyber Security",
  "Software Engineering",
  "Startups",
  "World Politics",
  "Business",
  "Technology",
  "Economics",
  "Science",
  "Productivity",
];

function InterestsForm() {
  const router = useRouter();
  const { user, markInterestsSaved } = useAuth();

  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Pre-select existing interests
  useEffect(() => {
    const stored = localStorage.getItem("daily3-categories");
    if (stored) {
      setSelected(JSON.parse(stored));
    }
  }, []);

  function toggleCategory(category: string) {
    if (selected.includes(category)) {
      setSelected(selected.filter((c) => c !== category));
      return;
    }
    if (selected.length === 3) return;
    setSelected([...selected, category]);
  }

  async function handleSave() {
    if (selected.length !== 3 || !user) return;

    setLoading(true);
    setSaved(false);

    try {
      await updateUserInterests(selected, user.accessToken);
      localStorage.setItem("daily3-categories", JSON.stringify(selected));
      markInterestsSaved();
      setSaved(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (error) {
      console.error("Failed to save interests:", error);
      alert("Failed to save interests. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <Navbar />

      <section className="mx-auto max-w-4xl">
        <h1 className="mt-8 text-4xl font-bold">Your interests</h1>

        <p className="mt-3 text-gray-600">
          Select exactly 3 topics. Your daily articles will be chosen from these.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {CATEGORIES.map((category) => {
            const isSelected = selected.includes(category);

            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`rounded-2xl border px-5 py-4 text-left transition ${
                  isSelected
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white text-gray-800 hover:border-black"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-gray-500">Selected: {selected.length}/3</p>

          <button
            onClick={handleSave}
            disabled={selected.length !== 3 || loading}
            className={`rounded-xl px-6 py-3 text-white transition disabled:cursor-not-allowed disabled:bg-gray-300 ${
              saved ? "bg-green-600" : "bg-black"
            }`}
          >
            {loading ? "Saving..." : saved ? "Saved!" : "Save interests"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function InterestsPage() {
  return (
    <RequireAuth>
      <InterestsForm />
    </RequireAuth>
  );
}
