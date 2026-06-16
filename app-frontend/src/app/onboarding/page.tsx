"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireOnboarding } from "@/components/Guards";

export const CATEGORIES: { id: string; label: string; emoji: string; description: string }[] = [
  {
    id:          "Software & DevOps",
    label:       "Software & DevOps",
    emoji:       "🛠️",
    description: "Architecture, system design, cloud, CI/CD",
  },
  {
    id:          "Technology",
    label:       "Technology",
    emoji:       "💡",
    description: "AI, product, innovation, industry trends",
  },
  {
    id:          "World Politics",
    label:       "World Politics",
    emoji:       "🌍",
    description: "Geopolitics, policy, international affairs",
  },
  {
    id:          "Business",
    label:       "Business",
    emoji:       "📈",
    description: "Strategy, leadership, management thinking",
  },
  {
    id:          "Economics",
    label:       "Economics",
    emoji:       "💰",
    description: "Markets, finance, economic trends",
  },
  {
    id:          "Science",
    label:       "Science",
    emoji:       "🔬",
    description: "Research, discoveries, physics, biology",
  },
  {
    id:          "Productivity",
    label:       "Productivity",
    emoji:       "⚡",
    description: "Focus, habits, tools, mental models",
  },
  {
    id:          "History",
    label:       "History",
    emoji:       "🏛️",
    description: "Ancient to modern, events, civilizations",
  },
  {
    id:          "Arts & Culture",
    label:       "Arts & Culture",
    emoji:       "🎭",
    description: "Literature, film, music, criticism",
  },
  {
    id:          "Military",
    label:       "Military",
    emoji:       "⚔️",
    description: "Strategy, defense policy, military history",
  },
  {
    id:          "Health",
    label:       "Health",
    emoji:       "🧬",
    description: "Medicine, mental health, longevity, well-being",
  },
  {
    id:          "Environment",
    label:       "Environment",
    emoji:       "🌿",
    description: "Climate, ecology, sustainability, energy",
  },
];

function OnboardingForm() {
  const router = useRouter();
  const { user, markInterestsSaved } = useAuth();

  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function toggleCategory(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter((c) => c !== id));
      return;
    }
    if (selected.length === 3) return;
    setSelected([...selected, id]);
  }

  async function continueToDashboard() {
    if (selected.length !== 3 || !user) return;
    setLoading(true);
    try {
      await updateUserInterests(selected, user.accessToken);
      localStorage.setItem("cogletta-categories", JSON.stringify(selected));
      markInterestsSaved();
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to save interests:", error);
      alert("Failed to save interests. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-medium text-gray-400">Step 1 of 1</p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          Choose your 3 interests
        </h1>

        <p className="mt-3 text-gray-500">
          Cogletta will curate one in-depth article per category, every day.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const isSelected = selected.includes(cat.id);
            const isDisabled = !isSelected && selected.length === 3;

            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                disabled={isDisabled}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-black bg-black text-white"
                    : isDisabled
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-40"
                    : "border-gray-200 bg-white hover:border-gray-400"
                }`}
              >
                <span className="text-2xl">{cat.emoji}</span>
                <p className={`mt-2 font-medium ${isSelected ? "text-white" : "text-gray-900"}`}>
                  {cat.label}
                </p>
                <p className={`mt-0.5 text-xs ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                  {cat.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {selected.length === 3
              ? "Perfect! Ready to continue."
              : `Select ${3 - selected.length} more`}
          </p>

          <button
            onClick={continueToDashboard}
            disabled={selected.length !== 3 || loading}
            className="rounded-xl bg-black px-6 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? "Saving..." : "Continue →"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireOnboarding>
      <OnboardingForm />
    </RequireOnboarding>
  );
}
