// app-frontend/scripts/essays/check-leaks.mjs
//
// `npm run build` sonrasında çalışır (postbuild). Kilitli deneme metni public
// çıktıya sızdıysa build'i BAŞARISIZ yapar.
//
// Her kilitli bölümden, gövdeye eşit aralıklarla dağılmış en fazla 12 örnek cümle seçilir (aynı denemenin herkese
// açık önizlemesinde de geçen cümleler yanlış alarm vermesin diye atlanır) ve
// out/ altındaki tüm metin dosyalarında (HTML, JS, RSC payload, JSON, XML, TXT)
// aranır. src/generated/essays.json da kontrol edilir.
//
// Kullanım: node scripts/essays/check-leaks.mjs [outDir]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "out"));
const privateDir = path.join(root, ".essays-private");
const publicJson = path.join(root, "src/generated/essays.json");

const TEXT_EXT = new Set([".html", ".js", ".json", ".txt", ".xml", ".rsc", ".css", ".map", ".webmanifest", ""]);
const MIN_SAMPLE = 40;
const SAMPLES_PER_ESSAY = 12;

function fail(message) {
  console.error(`\n[essays:leak-check] FAILED — ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fail(`${outDir} does not exist; run next build first`);
if (!fs.existsSync(privateDir)) fail(".essays-private/ missing; prebuild did not run");

function blockTexts(blocks) {
  return blocks.flatMap((b) =>
    b.type === "ul" ? b.items : b.type === "img" ? [b.caption ?? ""] : [b.text, b.cite ?? ""],
  );
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SAMPLE);
}

// HTML/JSON içinde kaçışlanmış biçimler de aranır (ör. ' → &#x27; , " → \")
function variants(sample) {
  const html = sample
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
  const json = JSON.stringify(sample).slice(1, -1);
  return [...new Set([sample, html, json])];
}

const publicEssays = JSON.parse(fs.readFileSync(publicJson, "utf8"));
const publicTextBySlug = new Map(publicEssays.map((e) => [e.slug, blockTexts(e.blocks).join("\n")]));

const samples = [];
for (const f of fs.readdirSync(privateDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
  const body = JSON.parse(fs.readFileSync(path.join(privateDir, f), "utf8"));
  const publicText = publicTextBySlug.get(body.slug) ?? "";
  const candidates = blockTexts(body.blocks)
    .flatMap(sentences)
    .filter((s) => !publicText.includes(s));
  if (candidates.length === 0) continue;
  // Kesim noktasının hemen ardından gövdenin sonuna kadar eşit aralıklı cümleler.
  const n = Math.min(SAMPLES_PER_ESSAY, candidates.length);
  const idx = new Set(Array.from({ length: n }, (_, k) => Math.round((k * (candidates.length - 1)) / Math.max(1, n - 1))));
  const picks = [...idx].map((i) => candidates[i]);
  for (const p of picks) samples.push({ slug: body.slug, text: p, variants: variants(p) });
}

if (samples.length === 0) {
  console.log("[essays:leak-check] no locked essays — nothing to check");
  process.exit(0);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const files = [...walk(outDir), publicJson];
let scanned = 0;
const leaks = [];
for (const file of files) {
  if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) continue; // ikili dosya (uzantısız PNG vb.)
  const content = buf.toString("utf8");
  scanned++;
  for (const s of samples) {
    if (s.variants.some((v) => content.includes(v))) {
      leaks.push(`${path.relative(root, file)} ← "${s.text.slice(0, 70)}…" (${s.slug})`);
    }
  }
}

if (leaks.length > 0) {
  fail(`locked essay text found in public output:\n  ${leaks.join("\n  ")}`);
}

console.log(
  `[essays:leak-check] OK — ${samples.length} locked samples from ${new Set(samples.map((s) => s.slug)).size} essays, ` +
    `${scanned} public files scanned, no leaks`,
);
