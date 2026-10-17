// src/app/essays/og/[file]/route.tsx
//
// Kapak görseli olmayan denemeler için başlıktan OG görseli (1200×630 PNG).
//
// Static export'ta GET route handler build sırasında dosyaya dönüşür
// (node_modules/next/dist/docs/01-app/02-guides/static-exports.md → Route Handlers).
// Parametre ".png" uzantısını taşıdığı için çıktı out/essays/og/<slug>.png olur;
// S3'e doğru Content-Type ile yüklenir. opengraph-image.tsx konvansiyonu
// uzantısız dosya ürettiği ve kapaklı denemelerde kapağı ezdiği için kullanılmadı.

import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { ESSAYS, essayAuthor, formatDate, getEssay, tagLabel } from "@/lib/essays";

export const dynamic = "force-static";
export const dynamicParams = false;

// Tüm denemeler için üretilir (boş liste static export'u kırar); yalnızca
// kapaksız denemelerin metadata'sı bu görsele işaret eder.
export function generateStaticParams() {
  return ESSAYS.map((e) => ({ file: `${e.slug}.png` }));
}

function font(file: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "node_modules/@fontsource/lora/files", file));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const essay = getEssay(file.replace(/\.png$/, ""));
  if (!essay) return new Response("Not found", { status: 404 });

  const title = essay.title;
  const titleSize = title.length > 90 ? 52 : title.length > 60 ? 60 : 68;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f4ee",
          padding: "72px 80px",
          borderBottom: "14px solid #7c5c3e",
          fontFamily: "Lora",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, color: "#7c5c3e", fontWeight: 600 }}>
          COGLETTA ESSAYS · {tagLabel(essay.tags[0]).toUpperCase()}
        </div>
        <div style={{ display: "flex", fontSize: titleSize, lineHeight: 1.18, color: "#1a1714", fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8c8278" }}>
          {essayAuthor(essay).name} · {formatDate(essay.date)} · {essay.readingMinutes} min read
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Lora", data: font("lora-latin-400-normal.woff"), weight: 400, style: "normal" },
        { name: "Lora", data: font("lora-latin-600-normal.woff"), weight: 600, style: "normal" },
      ],
    },
  );
}
