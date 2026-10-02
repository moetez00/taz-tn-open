#!/usr/bin/env node
// Gate: every text colour pair the design uses must meet WCAG 2.2 AA.
// Colours are read from src/styles/tokens.css so the check can't drift.
import { readFile } from "node:fs/promises";

const css = await readFile("src/styles/tokens.css", "utf8");
const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
);

// [foreground, background, minimum ratio, where it is used]
const PAIRS = [
  ["soul", "void", 4.5, "body text"],
  ["ash", "void", 4.5, "secondary text, nav"],
  ["dust", "void", 4.5, "meta text, area rules"],
  ["soul", "raised", 4.5, "text on raised surfaces"],
  ["ash", "raised", 4.5, "secondary text on raised surfaces"],
  ["dust", "raised", 4.5, "meta text on raised surfaces"],
  ["cloak", "void", 4.5, "accent text, hover, focus ring"],
  ["cloak", "raised", 4.5, "accent text on raised surfaces"],
  ["soul", "cloak-deep", 4.5, "text on deep amber fills, selection"],
  ["void", "soul", 4.5, "skip link"],
  ["code-text", "raised", 4.5, "code: identifiers and keywords"],
  ["code-strong", "raised", 4.5, "code: definitions"],
  ["code-literal", "raised", 4.5, "code: strings and numbers"],
  ["code-comment", "raised", 4.5, "code: comments"],
  ["code-punct", "raised", 4.5, "code: punctuation, operators, diff signs"],
];

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failed = 0;
for (const [fg, bg, min, use] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) {
    console.error(`check-contrast: missing token --${!tokens[fg] ? fg : bg}`);
    failed++;
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  (${use})`);
}
if (failed) {
  console.error(`check-contrast: ${failed} pair(s) below the minimum`);
  process.exit(1);
}
console.log("check-contrast: all pairs pass");
