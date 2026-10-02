// Unit tests for scripts/import-all.mjs against two throwaway git repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/import-all.mjs");
const DAY = "2026-03-14T12:00:00Z";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_AUTHOR_DATE: DAY,
  GIT_COMMITTER_DATE: DAY,
};

async function repo(root, name, files) {
  const dir = join(root, name);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  const git = (...args) => execFileSync("git", args, { cwd: dir, env: GIT_ENV, stdio: "ignore" });
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "-m", "writeups");
  return dir;
}

async function fixture(areas) {
  const root = await mkdtemp(join(tmpdir(), "import-all-"));
  const content = join(root, "content");
  await mkdir(join(content, "areas"), { recursive: true });
  await mkdir(join(content, "events"), { recursive: true });
  for (const area of ["the-stack", "the-heap"]) await writeFile(join(content, "areas", `${area}.yaml`), `name: ${area}\nblurb: x\norder: 1\n`);
  for (const event of ["first", "second"]) await writeFile(join(content, "events", `${event}.yaml`), `name: ${event}\nrole: author\n`);

  const first = await repo(root, "first", {
    "README.md": "# The repository's own readme\n",
    "Alpha One/README.md": "# Alpha One\n\nText.\n",
    "beta/writeup.md": "# Beta\n\nText.\n",
  });
  const second = await repo(root, "second", {
    "cheat_code_GAMMA/README.md": "# Gamma\n\nText.\n",
    "delta_task/notes.md": "# Delta\n\nText.\n",
    "delta_task/other.md": "Something else.\n",
  });
  const manifest = join(root, "imports.json");
  await writeFile(
    manifest,
    JSON.stringify({
      role: "author",
      sources: [
        { repo: first, event: "first" },
        { repo: second, event: "second" },
      ],
      areas,
    }),
  );
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, "--manifest", manifest, ...args], {
      encoding: "utf8",
      env: { ...process.env, TAZ_CONTENT_DIR: content, TAZ_IMPORT_CACHE: join(root, "cache") },
    });
  return { content, run };
}

const AREAS = {
  "the-stack": ["Alpha One", "Gamma"],
  "the-heap": ["Beta", { name: "Delta Task", file: "delta_task/notes.md" }],
};

test("imports every listed writeup with its area, event and first-commit date", async () => {
  const { content, run } = await fixture(AREAS);
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /4 imported, 0 skipped, 0 failed/);

  const read = (area, slug) => readFile(join(content, "journal", area, slug, "index.md"), "utf8");
  assert.match(await read("the-stack", "alpha-one"), /^---\ntitle: "Alpha One"\narea: the-stack\nrole: author\nevent: first\npublished: 2026-03-14\n/);
  assert.match(await read("the-stack", "gamma"), /event: second/, "a folder ending with the name matches (cheat_code_GAMMA)");
  assert.match(await read("the-heap", "beta"), /title: "Beta"/, "writeup.md is found when there is no README.md");
  assert.match(await read("the-heap", "delta-task"), /title: "Delta Task"/, "an explicit file wins over the lookup");
});

test("a second run skips what exists; --force replaces it", async () => {
  const { run } = await fixture(AREAS);
  run();
  assert.match(run().stdout, /0 imported, 4 skipped, 0 failed/);
  assert.match(run("--force").stdout, /4 imported, 0 skipped, 0 failed/);
});

test("an unknown name fails the run and says why, without stopping the others", async () => {
  const { run } = await fixture({ "the-stack": ["Alpha One", "Nowhere"] });
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /failed\s+Nowhere\s+no folder matches "Nowhere"/);
  assert.match(result.stdout, /1 imported, 0 skipped, 1 failed/);
});
