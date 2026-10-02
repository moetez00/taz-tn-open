// Unit tests for scripts/import-entry.mjs, run with `node --test tests/unit/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = resolve("scripts/import-entry.mjs");
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "import-entry-"));
  const content = join(root, "content");
  await mkdir(join(content, "areas"), { recursive: true });
  await mkdir(join(content, "events"), { recursive: true });
  await writeFile(join(content, "areas", "the-stack.yaml"), "name: The Stack\nblurb: x\norder: 1\n");
  await writeFile(join(content, "events", "pioneers25.yaml"), "name: Pioneers25 CTF\nrole: author\n");

  const source = join(root, "writeup");
  await mkdir(join(source, "images"), { recursive: true });
  await writeFile(join(source, "images", "layout.png"), PNG);
  await writeFile(join(source, "shot one.png"), PNG);
  await writeFile(
    join(source, "README.md"),
    [
      "---",
      "tags: [old]",
      "---",
      "# A Sample Challenge",
      "",
      "Intro paragraph.",
      "",
      '![stack layout](images/layout.png "Layout")',
      '<img src="./shot%20one.png" alt="shot">',
      "![remote](https://example.com/remote.png)",
      "",
      "```python",
      "print('![not an image](nope.png)')",
      "```",
      "",
    ].join("\n"),
  );
  return { root, content, source };
}

const importEntry = (content, args) =>
  run(process.execPath, [SCRIPT, ...args], { env: { ...process.env, TAZ_CONTENT_DIR: content } });

test("imports a writeup as a draft with its images", async () => {
  const { content, source } = await fixture();
  const { stdout, stderr } = await importEntry(content, [
    join(source, "README.md"),
    "--area", "the-stack",
    "--slug", "sample",
    "--event", "pioneers25",
    "--role", "author",
    "--published", "2025-11-02",
  ]);
  assert.match(stdout, /wrote .*sample\/index\.md and 2 image\(s\)/);
  assert.match(stderr, /1 HTML <img> tag\(s\) became Markdown images/);

  const entryDir = join(content, "journal", "the-stack", "sample");
  const text = await readFile(join(entryDir, "index.md"), "utf8");
  assert.match(text, /^---\ntitle: "A Sample Challenge"\narea: the-stack\nrole: author\nevent: pioneers25\npublished: 2025-11-02\nsummary: ""\ntechniques: \[\]\ndraft: true\n---\n/);
  assert.doesNotMatch(text, /tags: \[old\]/, "the source's own front matter is dropped");
  assert.doesNotMatch(text, /^# A Sample Challenge/m, "the leading title is removed");
  assert.match(text, /!\[stack layout\]\(\.\/images\/layout\.png "Layout"\)/);
  assert.match(text, /!\[shot\]\(\.\/shot%20one\.png\)/, "HTML images become Markdown images");
  assert.match(text, /!\[remote\]\(https:\/\/example\.com\/remote\.png\)/, "remote images are left alone");
  assert.match(text, /print\('!\[not an image\]\(nope\.png\)'\)/, "code blocks are left alone");
  await stat(join(entryDir, "images", "layout.png"));
  await stat(join(entryDir, "shot one.png"));
});

test("refuses to overwrite an entry without --force", async () => {
  const { content, source } = await fixture();
  const args = [join(source, "README.md"), "--area", "the-stack", "--slug", "sample"];
  await importEntry(content, args);
  await assert.rejects(importEntry(content, args), /exists; pass --force/);
  await importEntry(content, [...args, "--force"]);
});

test("rejects unknown areas, events and roles", async () => {
  const { content, source } = await fixture();
  const file = join(source, "README.md");
  await assert.rejects(importEntry(content, [file, "--area", "nope", "--slug", "x"]), /unknown area "nope"/);
  await assert.rejects(importEntry(content, [file, "--area", "the-stack", "--slug", "x", "--event", "nope"]), /unknown event "nope"/);
  await assert.rejects(importEntry(content, [file, "--area", "the-stack", "--slug", "x", "--role", "boss"]), /--role must be one of/);
  await assert.rejects(importEntry(content, [file, "--area", "the-stack", "--slug", "Bad Slug"]), /must be lowercase words/);
});

test("warns about an unclosed code fence", async () => {
  const { root, content } = await fixture();
  const file = join(root, "broken.md");
  await writeFile(file, "# Broken\n\n```c\nint main(void) {}\n");
  const { stderr } = await importEntry(content, [file, "--area", "the-stack", "--slug", "broken"]);
  assert.match(stderr, /odd number of code fences/);
});

test("moves headings down a level when the body still uses h1", async () => {
  const { root, content } = await fixture();
  const file = join(root, "sections.md");
  await writeFile(file, "# Title\n\n# Part one\n\n## Detail\n\n```sh\n# a shell comment\n```\n");
  const { stderr } = await importEntry(content, [file, "--area", "the-stack", "--slug", "sections"]);
  assert.match(stderr, /every heading moved down one level/);
  const text = await readFile(join(content, "journal", "the-stack", "sections", "index.md"), "utf8");
  assert.match(text, /^## Part one$/m);
  assert.match(text, /^### Detail$/m);
  assert.match(text, /^# a shell comment$/m, "code is left alone");
});

test("leaves headings alone when the body has no h1", async () => {
  const { root, content } = await fixture();
  const file = join(root, "fine.md");
  await writeFile(file, "# Title\n\n## Part one\n");
  const { stderr } = await importEntry(content, [file, "--area", "the-stack", "--slug", "fine"]);
  assert.doesNotMatch(stderr, /moved down/);
  const text = await readFile(join(content, "journal", "the-stack", "fine", "index.md"), "utf8");
  assert.match(text, /^## Part one$/m);
});
