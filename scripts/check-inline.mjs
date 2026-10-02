#!/usr/bin/env node
// Gate: fail the build on anything a hash-free CSP would block or that loads
// from another origin. Checks every HTML and SVG file in dist/.
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { walk } from "./lib/walk.mjs";

const DIST = "dist";
const problems = [];
const report = (file, text, index, message) => {
  const line = text.slice(0, index).split("\n").length;
  problems.push(`${relative(".", file)}:${line}  ${message}`);
};

const files = (await walk(DIST)).filter((f) => /\.(html|svg)$/.test(f));
for (const file of files) {
  const text = await readFile(file, "utf8");

  for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const isData = /\btype\s*=\s*["']?application\/ld\+json/i.test(attrs);
    const hasSrc = /\bsrc\s*=/i.test(attrs);
    if (isData) continue;
    if (!hasSrc) report(file, text, m.index, "inline <script> (CSP script-src 'self' blocks it)");
    else if (m[2].trim()) report(file, text, m.index, "<script src> with inline content");
    const src = attrs.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
    if (/^(https?:)?\/\//i.test(src)) report(file, text, m.index, `third-party script ${src}`);
  }

  for (const m of text.matchAll(/<style\b/gi)) {
    report(file, text, m.index, "<style> element (CSP style-src 'self' blocks it)");
  }

  for (const m of text.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const tag = m[0];
    if (/\sstyle\s*=/i.test(tag)) report(file, text, m.index, "style= attribute");
    const handler = tag.match(/\s(on[a-z]+)\s*=/i);
    if (handler) report(file, text, m.index, `${handler[1]}= event handler`);
    if (/\s(href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(tag)) {
      report(file, text, m.index, "javascript: URL");
    }
    const isResource = /^<(link|img|source|video|audio|iframe|embed|object)\b/i.test(tag);
    const url = tag.match(/\s(?:src|href|srcset)\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
    const isNavLink = /^<link\b/i.test(tag) && /\brel\s*=\s*["']?(canonical|alternate|me)\b/i.test(tag);
    if (isResource && !isNavLink && /^(https?:)?\/\//i.test(url)) {
      report(file, text, m.index, `third-party resource ${url}`);
    }
  }
}

if (problems.length) {
  console.error(`check-inline: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`check-inline: ${files.length} files clean (no inline script or style, no third-party resources)`);
