"use client";

import { useEffect, useState } from "react";
import { getDailyArticles } from "@/services/articleService";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function DashboardPage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<
    Awaited<ReturnType<typeof getDailyArticles>>
  >([]);

  useEffect(() => {
    async function loadDashboardData() {
      const storedCategories = localStorage.getItem("daily3-categories");

      if (!storedCategories) {
        return;
      }

      const categories = JSON.parse(storedCategories);

      setSelectedCategories(categories);

      const articles = await getDailyArticles(categories);

      setSelectedArticles(articles);
    }

    loadDashboardData();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <Navbar />
      <section className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-gray-500">Today</p>

          <h1 className="mt-2 text-4xl font-bold">Your Daily3</h1>

          <p className="mt-3 max-w-2xl text-gray-600">
            Three carefully selected articles based on your interests. No feed.
            No noise. Just what matters today.
          </p>
        </div>
        
        {selectedCategories.length === 0 && (
        <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">
            No interests selected yet
            </h2>

            <p className="mt-3 text-gray-600">
            Choose your interests to start receiving your Daily3 articles.
            </p>

            <Link
            href="/onboarding"
            className="mt-6 inline-block rounded-xl bg-black px-5 py-3 text-white"
            >
            Go to Onboarding
            </Link>
        </div>
        )}

        {selectedCategories.length > 0 && (
          <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">Your Interests</p>

            <div className="mt-3 flex flex-wrap gap-3">
              {selectedCategories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  {category}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {selectedArticles.map((article) => (
            <article
              key={article.category}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{article.emoji}</span>

                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {article.category}
                      </p>

                      <p className="text-sm text-gray-400">
                        {article.source} · {article.readingTime}
                      </p>
                    </div>
                  </div>

                  <h2 className="mt-5 text-2xl font-semibold">
                    {article.title}
                  </h2>

                  <p className="mt-3 text-gray-600">{article.summary}</p>

                  <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-900">
                      Why this article?
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      {article.reason}
                    </p>
                  </div>
                </div>

                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
                >
                  Read Article
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}