"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { updateUserInterests } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/Guards";
import { CATEGORIES } from "@/app/onboarding/page";

function InterestsForm() {
  const router = useRouter();
  const { user, markInterestsSaved } = useAuth();

  const [selected, setSelected]         = useState<string[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showTomorrow, setShowTomorrow] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("daily3-categories");
    if (stored) setSelected(JSON.parse(stored));
  }, []);

  function toggleCategory(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter((c) => c !== id));
      setSaved(false);
      return;
    }
    if (selected.length === 3) return;
    setSelected([...selected, id]);
    setSaved(false);
  }

  async function handleSave() {
    if (selected.length !== 3 || !user) return;
    setLoading(true);
    setSaved(false);
    setShowTomorrow(false);
    try {
      const result = await updateUserInterests(selected, user.accessToken);
      localStorage.setItem("daily3-categories", JSON.stringify(selected));
      markInterestsSaved();
      setSaved(true);

      // Eğer bugün zaten makale varsa (articlesReady: true) → "yarın gelecek" mesajı
      if (result.articlesReady) {
        setShowTomorrow(true);
        // Dashboard'a invalidated sinyali GÖNDERME — mevcut makaleler kalsın
      } else {
        // İlk kez / makale yoksa → normal akış, dashboard pending gösterecek
        localStorage.setItem("daily3-articles-invalidated", "true");
        setTimeout(() => router.push("/dashboard"), 1200);
      }
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
        <h1 className="text-4xl font-bold tracking-tight">Your interests</h1>

        <p className="mt-3 text-gray-500">
          Select exactly 3 topics. Your daily articles will be refreshed every morning.
        </p>

        {/* Yarın gelecek banner */}
        {showTomorrow && (
          <div className="mt-6 rounded-2xl bg-green-50 border border-green-100 px-5 py-4">
            <p className="text-sm font-medium text-green-700">
              ✓ Interests saved!
            </p>
            <p className="mt-1 text-xs text-green-600">
              Your new articles will arrive tomorrow at 07:00. Today's articles are still available on your dashboard.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-3 text-xs font-medium text-green-700 underline"
            >
              Go to dashboard →
            </button>
          </div>
        )}

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
              ? "Ready to save."
              : `Select ${3 - selected.length} more`}
          </p>

          <button
            onClick={handleSave}
            disabled={selected.length !== 3 || loading || showTomorrow}
            className={`rounded-xl px-6 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-30 ${
              saved ? "bg-green-600" : "bg-black"
            }`}
          >
            {loading ? "Saving..." : saved ? "Saved! ✓" : "Save interests"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function InterestsPage() {
  return (
    <RequireAuth>
      <InterestsForm />
    </RequireAuth>
  );
}
