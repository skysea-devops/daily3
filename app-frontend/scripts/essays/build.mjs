// app-frontend/scripts/essays/build.mjs
//
// `npm run build` / `npm run dev` öncesinde çalışır (prebuild / predev).
//
// Çıktılar:
//   src/generated/essays.json   → Next.js sayfalarının okuduğu HERKESE AÇIK veri
//                                 (free denemelerde tam metin, pro'da yalnızca önizleme)
//   .essays-private/<slug>.json → pro denemelerin KİLİTLİ bölümü. out/ dışında,
//                                 gitignore'lu; CI bunu private S3 bucket'ına yükler.
//
// Kilitli metin hiçbir zaman src/ altına yazılmaz; Next.js onu import edemez.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllEssays } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contentDir = path.join(root, "content/essays");
const categoriesFile = path.join(root, "src/lib/categories.ts");
const publicOut = path.join(root, "src/generated/essays.json");
const privateDir = path.join(root, ".essays-private");

const essays = loadAllEssays(contentDir, categoriesFile);

// Arşiv satırlarındaki küçük görseller. Kapak dosyaları 300 KB civarında; listede
// 112 px'lik kutuda göstermek için her birini indirmek gereksiz. sharp (Next.js'in
// opsiyonel bağımlılığı) varsa 2x boyutta küçük bir kopya üretilir, yoksa kapak kullanılır.
const thumbsDir = path.join(root, "public/essays/thumbs");
const THUMB_W = 224;
const THUMB_H = 168;
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("[essays] sharp not available; archive thumbnails fall back to cover images");
}
fs.rmSync(thumbsDir, { recursive: true, force: true });
const thumbs = new Map();
for (const e of essays) {
  if (!e.coverImage) continue;
  const src = path.join(root, "public", e.coverImage);
  if (!fs.existsSync(src)) throw new Error(`${e.slug}: coverImage not found at public${e.coverImage}`);
  if (!sharp) {
    thumbs.set(e.slug, e.coverImage);
    continue;
  }
  fs.mkdirSync(thumbsDir, { recursive: true });
  await sharp(src)
    .resize(THUMB_W, THUMB_H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(path.join(thumbsDir, `${e.slug}.jpg`));
  thumbs.set(e.slug, `/essays/thumbs/${e.slug}.jpg`);
}

const publicData = essays.map(({ lockedBlocks, publicBlocks, ...meta }) => ({
  ...meta,
  ...(thumbs.has(meta.slug) ? { thumbImage: thumbs.get(meta.slug) } : {}),
  blocks: publicBlocks,
  hasLockedPart: lockedBlocks.length > 0,
}));

fs.mkdirSync(path.dirname(publicOut), { recursive: true });
fs.writeFileSync(publicOut, JSON.stringify(publicData, null, 2) + "\n");

fs.rmSync(privateDir, { recursive: true, force: true });
fs.mkdirSync(privateDir, { recursive: true });
let lockedCount = 0;
for (const e of essays) {
  if (e.access !== "pro") continue;
  lockedCount++;
  // Lambda 7 günlük pencereyi bu dosyadaki access + date ile hesaplar:
  // istemciden gelen hiçbir bilgiye güvenmez.
  fs.writeFileSync(
    path.join(privateDir, `${e.slug}.json`),
    JSON.stringify({ slug: e.slug, access: e.access, date: e.date, blocks: e.lockedBlocks }) + "\n",
  );
}

// Manifest: dizin hiç boş kalmasın (CI artifact'ı) ve S3'te neyin yüklü olduğu görülsün.
fs.writeFileSync(
  path.join(privateDir, "_manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), locked: essays.filter((e) => e.access === "pro").map((e) => e.slug) }) + "\n",
);

console.log(
  `[essays] ${essays.length} essays → src/generated/essays.json; ` +
    `${lockedCount} locked bodies → .essays-private/; ${thumbs.size} thumbnails`,
);
