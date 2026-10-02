#!/usr/bin/env node
// Imports one existing Markdown writeup as a Journal draft.
//
//   node scripts/import-entry.mjs <file.md> --area <area> --slug <slug>
//        [--title "…"] [--event <event>] [--role author|player|found]
//        [--published YYYY-MM-DD] [--force]
//
// Writes src/content/journal/<area>/<slug>/index.md with draft front matter,
// drops the file's own front matter and leading "# Title" (the layout renders
// the title), and copies local images beside the entry, rewriting their paths.
// Two structural fixes, both reported: HTML <img> tags with local files become
// Markdown images (Astro only processes those), and if the body still uses "#"
// headings, every heading moves down a level so the page keeps one h1. The
// text is otherwise kept as written. Nothing is published: the entry stays a
// draft until `draft: true` is removed.
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const CONTENT = resolve(process.env.TAZ_CONTENT_DIR ?? "src/content");
const ROLES = ["author", "player", "found"];

const fail = (message) => {
  console.error(`import-entry: ${message}`);
  process.exit(1);
};
const exists = (path) => stat(path).then(() => true, () => false);

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    area: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    event: { type: "string" },
    role: { type: "string" },
    published: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const [sourceFile] = positionals;
if (!sourceFile || !opts.area || !opts.slug) {
  fail("usage: import-entry.mjs <file.md> --area <area> --slug <slug> [--title …] [--event …] [--role …] [--published YYYY-MM-DD] [--force]");
}
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
if (!ID.test(opts.slug)) fail(`--slug "${opts.slug}" must be lowercase words joined by hyphens`);
if (!ID.test(opts.area)) fail(`--area "${opts.area}" is not an area id`);
if (opts.event && !ID.test(opts.event)) fail(`--event "${opts.event}" is not an event id`);
if (!(await exists(join(CONTENT, "areas", `${opts.area}.yaml`)))) fail(`unknown area "${opts.area}" (see ${join(CONTENT, "areas")})`);
if (opts.event && !(await exists(join(CONTENT, "events", `${opts.event}.yaml`)))) fail(`unknown event "${opts.event}" (see ${join(CONTENT, "events")})`);
if (opts.role && !ROLES.includes(opts.role)) fail(`--role must be one of ${ROLES.join(", ")}`);
const published = opts.published ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(published) || Number.isNaN(Date.parse(published))) fail(`--published "${published}" is not a YYYY-MM-DD date`);

const sourcePath = resolve(sourceFile);
const sourceDir = dirname(sourcePath);
let body = (await readFile(sourcePath, "utf8").catch(() => fail(`cannot read ${sourceFile}`))).replace(/\r\n/g, "\n");

// The writeup's own front matter, if any, belongs to its old home.
body = body.replace(/^---\n[\s\S]*?\n---\n/, "");

// A leading "# Title" duplicates the page title; it also supplies one if --title is missing.
let title = opts.title;
const heading = body.match(/^\s*#[ \t]+(.+?)[ \t#]*\n/);
if (heading) {
  title ??= heading[1].trim();
  body = body.slice(heading[0].length);
}
if (!title) fail("no --title given and the file has no leading \"# Title\"");

const entryDir = join(CONTENT, "journal", opts.area, opts.slug);
const target = join(entryDir, "index.md");
if ((await exists(target)) && !opts.force) fail(`${relative(".", target)} exists; pass --force to replace it`);

// Local images: Markdown ![alt](path "title") and HTML <img src="path">.
const isLocal = (url) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
const copies = new Map();
async function localise(url) {
  if (!isLocal(url)) return url;
  const clean = decodeURI(url.split(/[?#]/)[0]);
  const from = resolve(sourceDir, clean);
  if (!(await exists(from))) {
    console.warn(`import-entry: warning: image ${url} not found next to the source; left as is`);
    return url;
  }
  // Keep paths inside the source folder; anything outside it lands beside index.md.
  const inside = !relative(sourceDir, from).startsWith("..");
  const rel = inside ? normalize(relative(sourceDir, from)) : basename(from);
  copies.set(from, join(entryDir, rel));
  return "./" + rel.split(sep).map(encodeURIComponent).join("/");
}

const replaceAsync = async (text, re, fn) => {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  return parts.join("") + text.slice(last);
};

// Skip fenced code so code that merely looks like an image or a heading is left alone.
let converted = 0;
const headings = [];
const segments = body.split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)[^\n]*$)/m);
for (let i = 0; i < segments.length; i += 2) {
  segments[i] = await replaceAsync(segments[i], /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(\s+"[^"]*")?\s*\)/g,
    async (_, alt, url, titlePart = "") => `![${alt}](${await localise(url)}${titlePart})`);
  segments[i] = await replaceAsync(segments[i], /<img\b[^>]*>/gi, async (tag) => {
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((v) => v !== undefined);
    const src = attr("src");
    if (!src || !isLocal(src)) return tag;
    converted++;
    return `![${(attr("alt") ?? "").replace(/[[\]]/g, "")}](${await localise(src)})`;
  });
  segments[i] = segments[i].replace(/^(#{1,5})(?=[ \t])/gm, (hashes) => {
    headings.push(hashes);
    return hashes;
  });
}
if (headings.includes("#")) {
  for (let i = 0; i < segments.length; i += 2) segments[i] = segments[i].replace(/^(#{1,5})(?=[ \t])/gm, "#$1");
  console.warn("import-entry: note: the body used \"#\" headings; every heading moved down one level");
}
if (converted) console.warn(`import-entry: note: ${converted} HTML <img> tag(s) became Markdown images (size attributes dropped)`);
body = segments.join("").replace(/^\n+/, "");

const fences = body.split("\n").filter((line) => /^\s*(```|~~~)/.test(line)).length;
if (fences % 2 !== 0) {
  console.warn("import-entry: warning: an odd number of code fences; one block is probably not closed");
}

const frontMatter = [
  "---",
  `title: ${JSON.stringify(title)}`,
  `area: ${opts.area}`,
  opts.role && `role: ${opts.role}`,
  opts.event && `event: ${opts.event}`,
  `published: ${published}`,
  'summary: ""',
  "techniques: []",
  "draft: true",
  "---",
  "",
].filter((line) => line !== undefined && line !== false).join("\n");

await mkdir(entryDir, { recursive: true });
for (const [from, to] of copies) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}
await writeFile(target, `${frontMatter}\n${body.replace(/\s*$/, "\n")}`);

console.log(`import-entry: wrote ${relative(".", target)}${copies.size ? ` and ${copies.size} image(s)` : ""}`);
console.log("  still to do: summary, techniques, the real published date, then review and remove draft: true");
