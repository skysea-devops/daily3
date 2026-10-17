// app-backend/scripts/test.mjs
//
// Birim testleri: tests/unit/*.test.ts dosyalarını esbuild ile paketleyip
// Node'un yerleşik test koşucusuyla (node --test) çalıştırır. Ek test
// framework'ü gerekmez. Kullanım: npm test

import { build } from "esbuild";
import { readdir, rm } from "fs/promises";
import { spawnSync } from "child_process";
import path from "path";

const testDir = path.resolve("tests/unit");
const outDir = path.resolve("tests/unit/.dist");

const files = (await readdir(testDir)).filter((f) => f.endsWith(".test.ts"));
if (files.length === 0) {
  console.error("No unit tests found in tests/unit");
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: files.map((f) => path.join(testDir, f)),
  outdir: outDir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  logLevel: "warning",
});

const result = spawnSync(
  process.execPath,
  ["--test", ...files.map((f) => path.join(outDir, f.replace(/\.ts$/, ".mjs")))],
  { stdio: "inherit" },
);
await rm(outDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
