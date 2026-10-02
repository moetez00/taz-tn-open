#!/usr/bin/env node
// Imports every writeup listed in imports.json, in one run: npm run import:all
//
//   npm run import:all                 import what isn't imported yet
//   npm run import:all -- --force      re-import everything, replacing entries
//   npm run import:all -- --manifest other.json
//
// For each source it clones the repository into .imports/ (or pulls it), finds
// each listed challenge's folder by name, and hands the Markdown file to
// scripts/import-entry.mjs with the area, event and role from the manifest.
// The published date is the day the writeup was first committed. Everything
// lands as a draft; nothing is published until `draft: true` is removed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    manifest: { type: "string", default: "imports.json" },
    force: { type: "boolean", default: false },
  },
});

const CONTENT = resolve(process.env.TAZ_CONTENT_DIR ?? "src/content");
const CACHE = resolve(process.env.TAZ_IMPORT_CACHE ?? ".imports");
const ENTRY = resolve("scripts/import-entry.mjs");

const manifest = JSON.parse(readFileSync(opts.manifest, "utf8"));
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// A source is a git URL (cloned into .imports/) or a local folder, used as it is.
function checkout(source) {
  if (existsSync(source.repo) && statSync(source.repo).isDirectory()) return resolve(source.repo);
  const dir = join(CACHE, basename(source.repo).replace(/\.git$/, ""));
  if (existsSync(dir)) git(["pull", "--ff-only", "--quiet"], dir);
  else git(["clone", "--quiet", source.repo, dir]);
  return dir;
}

const folders = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

// The writeup in a challenge folder: README.md, else writeup.md, else its only Markdown file.
function writeupIn(dir) {
  const markdown = readdirSync(dir).filter((name) => /\.md$/i.test(name));
  const pick =
    markdown.find((name) => /^readme\.md$/i.test(name)) ??
    markdown.find((name) => /^write-?up\.md$/i.test(name)) ??
    (markdown.length === 1 ? markdown[0] : undefined);
  if (!pick) throw new Error(`no single writeup in ${dir} (found: ${markdown.join(", ") || "no .md files"}); give "file" in the manifest`);
  return join(dir, pick);
}

// Exact name first, then a folder ending with the name (cheat_code_FULLCLIP for "Full Clip"), then containing it.
function locate(name, checkouts) {
  const wanted = normalize(name);
  for (const test of [(f) => f === wanted, (f) => f.endsWith(wanted), (f) => f.includes(wanted)]) {
    const hits = checkouts.flatMap(({ dir, source }) =>
      folders(dir)
        .filter((folder) => test(normalize(folder)))
        .map((folder) => ({ dir: join(dir, folder), source })),
    );
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`"${name}" matches ${hits.map((h) => relative(CACHE, h.dir)).join(", ")}; give "file" in the manifest`);
  }
  throw new Error(`no folder matches "${name}"`);
}

// The day the file first appeared in the repository's history.
function firstCommitted(file) {
  try {
    const days = git(["log", "--follow", "--diff-filter=A", "--format=%cs", "--", basename(file)], resolve(file, ".."));
    return days.split("\n").filter(Boolean).at(-1);
  } catch {
    return undefined;
  }
}

const checkouts = manifest.sources.map((source) => ({ source, dir: checkout(source) }));
const results = [];
for (const [area, items] of Object.entries(manifest.areas)) {
  for (const item of items) {
    const spec = typeof item === "string" ? { name: item } : item;
    const slug = spec.slug ?? slugify(spec.name);
    const target = join(CONTENT, "journal", area, slug, "index.md");
    try {
      if (existsSync(target) && !opts.force) {
        results.push([spec.name, "skipped", `${relative(".", target)} exists`]);
        continue;
      }
      // "file" (relative to a source checkout) overrides the folder lookup.
      const found = spec.file
        ? checkouts
            .map(({ source, dir }) => ({ source, file: join(dir, spec.file) }))
            .find(({ file }) => existsSync(file))
        : (({ source, dir }) => ({ source, file: writeupIn(dir) }))(locate(spec.name, checkouts));
      if (!found) throw new Error(`${spec.file} is in none of the sources`);
      const event = spec.event ?? found.source.event;
      const published = spec.published ?? firstCommitted(found.file) ?? new Date().toISOString().slice(0, 10);
      const args = [ENTRY, found.file, "--area", area, "--slug", slug, "--title", spec.name, "--published", published];
      if (event) args.push("--event", event);
      if (spec.role ?? manifest.role) args.push("--role", spec.role ?? manifest.role);
      if (opts.force) args.push("--force");
      const run = spawnSync(process.execPath, args, { encoding: "utf8" });
      if (run.status !== 0) throw new Error(run.stderr.trim().split("\n").at(-1) || `exit ${run.status}`);
      results.push([spec.name, "imported", `${relative(".", target)} (${published})`]);
      // The importer's notes: structural fixes it made, or an unclosed code fence.
      for (const line of run.stderr.split("\n").filter(Boolean)) console.log(`  ${spec.name}: ${line.replace(/^import-entry: /, "")}`);
    } catch (error) {
      results.push([spec.name, "failed", (error.message ?? String(error)).replace(/^import-entry: /, "")]);
    }
  }
}

const width = Math.max(...results.map(([name]) => name.length));
for (const [name, status, detail] of results) console.log(`${status.padEnd(9)} ${name.padEnd(width)}  ${detail}`);
const failed = results.filter(([, status]) => status === "failed").length;
const imported = results.filter(([, status]) => status === "imported").length;
console.log(`\nimport-all: ${imported} imported, ${results.length - imported - failed} skipped, ${failed} failed`);
if (imported) console.log("Next: fill in summary and techniques in each draft, check them with `npm run dev`, then commit.");
process.exit(failed ? 1 : 0);
