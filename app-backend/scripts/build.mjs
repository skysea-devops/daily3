/**
 * Build script for all Lambda functions.
 * Auto-discovers lambdas by scanning for index.ts entry points,
 * then bundles each with esbuild into its own dist/ folder.
 *
 * Usage:
 *   node scripts/build.mjs           # one-shot build
 *   node scripts/build.mjs --watch   # rebuild on change
 */

import { build, context } from "esbuild";
import { readdir, stat } from "fs/promises";
import path from "path";

const watch = process.argv.includes("--watch");

async function findEntryPoints(dir) {
  const entries = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const nested = await findEntryPoints(fullPath);
      entries.push(...nested);
    } else if (item.name === "index.ts") {
      entries.push(fullPath);
    }
  }

  return entries;
}

const lambdasDir = path.resolve("lambdas");
const entryFiles = await findEntryPoints(lambdasDir);

if (entryFiles.length === 0) {
  console.error("No lambda entry points found.");
  process.exit(1);
}

console.log(`Building ${entryFiles.length} Lambda function(s)...\n`);
entryFiles.forEach((f) => console.log(`  - ${path.relative(".", f)}`));
console.log();

const entryPoints = Object.fromEntries(
  entryFiles.map((entry) => {
    const dir = path.dirname(entry);
    const outKey = path.join(dir, "dist", "index");
    return [outKey, entry];
  })
);

const buildOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // AWS SDK v3 ships with Lambda nodejs20.x runtime — keep it external
  external: ["@aws-sdk/*"],
  entryPoints,
  outdir: ".",
  sourcemap: "linked",
  minify: process.env.NODE_ENV === "production",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(buildOptions);
  console.log("\nAll Lambda functions built successfully.");
}
