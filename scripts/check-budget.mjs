#!/usr/bin/env node
// Gate: page-weight budgets from PLAN.md §6, measured on the built files.
// Font bytes actually downloaded per page are checked in tests/budget.spec.ts.
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { walk } from "./lib/walk.mjs";

const DIST = "dist";
const KB = 1024;
const BUDGET = { html: 8 * KB, css: 16 * KB, js: 3 * KB, fonts: 100 * KB };

const gz = async (path) => gzipSync(await readFile(path)).length;

// PLAN.md §6 budgets the template, excluding post content: drop what is inside the
// entry body (<div data-prose>) before measuring.
function withoutProse(html) {
  const start = html.search(/<div\b[^>]*\bdata-prose\b[^>]*>/);
  if (start === -1) return html;
  const open = html.indexOf(">", start) + 1;
  const tags = /<\/?div\b[^>]*>/g;
  tags.lastIndex = open;
  let depth = 1;
  for (let m; (m = tags.exec(html)); ) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(0, open) + html.slice(m.index);
  }
  throw new Error("check-budget: unclosed <div data-prose>");
}
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
const problems = [];

const files = await walk(DIST);
const pages = files.filter((f) => f.endsWith(".html"));
for (const page of pages) {
  const html = await readFile(page, "utf8");
  const refs = (re) => [...html.matchAll(re)].map((m) => join(DIST, m[1]));
  const css = refs(/<link[^>]+rel="stylesheet"[^>]+href="(\/[^"]+)"/g);
  const js = refs(/<script[^>]+src="(\/[^"]+)"/g);
  const sizes = {
    html: gzipSync(withoutProse(html)).length,
    css: (await Promise.all(css.map(gz))).reduce((a, b) => a + b, 0),
    js: (await Promise.all(js.map(gz))).reduce((a, b) => a + b, 0),
  };
  const name = relative(DIST, page);
  console.log(`${name.padEnd(28)} html ${fmt(sizes.html).padStart(8)}  css ${fmt(sizes.css).padStart(8)}  js ${fmt(sizes.js).padStart(8)}`);
  for (const key of ["html", "css", "js"]) {
    if (sizes[key] > BUDGET[key]) problems.push(`${name}: ${key} ${fmt(sizes[key])} > ${fmt(BUDGET[key])}`);
  }
}

// Every page could use every face, so the whole font set must fit the per-page budget.
const fonts = files.filter((f) => f.endsWith(".woff2"));
let fontTotal = 0;
for (const f of fonts) fontTotal += (await readFile(f)).length;
console.log(`fonts (${fonts.length} files)`.padEnd(28) + ` ${fmt(fontTotal)}`);
if (fontTotal > BUDGET.fonts) problems.push(`fonts: ${fmt(fontTotal)} > ${fmt(BUDGET.fonts)}`);

if (problems.length) {
  console.error("check-budget: over budget\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log("check-budget: every page within budget");
