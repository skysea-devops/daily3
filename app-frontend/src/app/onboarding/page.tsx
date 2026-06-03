"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const categories = [
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

export default function OnboardingPage() {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  function toggleCategory(category: string) {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(
        selectedCategories.filter((item) => item !== category)
      );
      return;
    }

    if (selectedCategories.length === 3) {
      return;
    }

    setSelectedCategories([...selectedCategories, category]);
  }

  function continueToDashboard() {
  if (selectedCategories.length !== 3) {
    return;
  }

  localStorage.setItem(
    "daily3-categories",
    JSON.stringify(selectedCategories)
  );

  router.push("/dashboard");
}

  return (
    <main className="min-h-screen bg-white px-6 py-12">
        <Navbar />
      <section className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-gray-500">Step 1 of 1</p>

        <h1 className="mt-3 text-4xl font-bold">
          Choose your 3 interests
        </h1>

        <p className="mt-3 text-gray-600">
          Daily3 will use these topics to recommend your daily articles.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {categories.map((category) => {
            const isSelected = selectedCategories.includes(category);

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
          <p className="text-sm text-gray-500">
            Selected: {selectedCategories.length}/3
          </p>

          <button
            onClick={continueToDashboard}
            disabled={selectedCategories.length !== 3}
            className="rounded-xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Continue
          </button>
        </div>
      </section>
    </main>
  );
}