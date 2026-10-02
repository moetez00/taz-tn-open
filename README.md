# taz.tn

The source of [taz.tn](https://taz.tn): a personal site with a journal of CTF writeups, a projects page and an About page. Astro, static output, TypeScript, no UI framework.

What makes it unusual:

- **A strict, hash-free CSP.** `script-src 'self'; style-src 'self'` with Trusted Types enforced. No inline scripts, styles or `data:` URIs anywhere, and build gates fail if any appear.
- **Almost no JavaScript.** At most 3 KB gzipped per page up front. Search, the cursor and the parallax load on demand.
- **Motion in CSS only.** Cross-document view transitions, `linear()` springs, `@starting-style` and scroll-driven animations. Reduced motion and a footer switch turn it all off.
- **Keyboard first.** `?` shows the keys, `1`–`4` switch pages, `Ctrl/⌘ K` opens search.
- **Accessible and measured.** Text contrast is checked at build time, axe runs on every page, and Lighthouse runs in CI.

## Quick start

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Static build into `dist/` |
| `npm run check` | Type check (`astro check`) |
| `npm run test:unit` | Unit tests for the importers (`node --test`) |
| `npm run gates` | The four build gates on `dist/` (see below) |
| `npm run serve` | Serves `dist/` with the `_headers` rules applied (port 4322) |
| `npm run test:e2e` | Playwright: CSP and Trusted Types violations, axe (WCAG 2.2 AA), keyboard, budgets, reduced motion |
| `npm run lhci` | Lighthouse CI, mobile |
| `npm run verify` | `check`, unit tests, build, gates, e2e |
| `npm run import -- …` | Import one Markdown writeup as a draft |
| `npm run import:all` | Import every writeup listed in your own `imports.json` |

**Rebuild before `test:e2e`.** It serves `dist/`, so it tests whatever was built last.

If Playwright has no downloaded browsers on your machine, point it at an installed one:

```sh
PW_CHROMIUM_PATH=/path/to/chromium npm run test:e2e
CHROME_PATH=/path/to/chromium npm run lhci
```

## Making it yours

The repository still holds the original author's identity and writing. Before publishing your own site, replace:

| What | Where |
|---|---|
| Name, handle, email, links, nav order, hero copy | `src/data/site.ts` |
| Site URL | `site` in `astro.config.mjs` |
| About page (bio, results table) | `src/pages/about.astro` |
| Security contact | `securityEmail` in `site.ts`; the `/security` page and `/.well-known/security.txt` use it |
| Journal entries | `src/content/journal/<area>/<entry>/` |
| Areas, events | `src/content/areas/*.yaml`, `src/content/events/*.yaml` |
| Projects | `src/content/projects/<slug>/index.md` |
| Share image | `public/og.png` (drawn by `scripts/og.py`) |
| Hostnames in headers | `public/_headers` |

Nav order lives in `site.ts` only. It also sets the direction pages slide in and the `1`–`4` keys.

## Writing entries

Each entry is a folder, `src/content/journal/<area>/<entry>/index.md`, with its images beside it. The folder names become the URL.

```yaml
---
title: "Challenge name"
area: the-stack          # must match the folder
role: author             # author | player | found; leave out for notes that aren't writeups
event: pioneers25        # optional, a file in src/content/events/
published: 2025-11-02
summary: One line. It is the index line and the meta description.
techniques: [first technique, second technique]
difficulty: easy         # optional: easy | medium | hard | insane
arch: amd64              # optional: amd64 | aarch64 | i386 | arm | other
source: https://github.com/…   # optional: challenge files
solver: https://github.com/…   # optional: solve script
runLocally: true         # optional: the source runs locally
flag: "FLAG{…}"          # optional: shown only behind the Dream Nail
draft: true
---
```

The build rejects a malformed entry, an entry whose folder and `area` disagree, and a published entry without a summary. The schemas are in `src/content.config.ts`.

**Drafts** show in previews and `npm run dev`, marked Draft and `noindex`. They never reach the feed or the sitemap, and disappear everywhere once `SITE_STAGE=live`.

**Importing a writeup:**

```sh
npm run import -- ../writeups/challenge-name/README.md --area the-stack \
  --slug challenge-name --event pioneers25 --role author --published 2025-11-02
```

It drops the file's own front matter and leading `# Title`, copies local images beside the entry and rewrites their paths, and warns about an unclosed code fence. HTML `<img>` tags become Markdown images (Astro only optimises those), and `#` headings move down a level so the page keeps one h1. Then fill in `summary` and `techniques`, check it with `npm run dev`, and remove `draft: true`.

**Importing many at once:** `npm run import:all` reads an `imports.json` in the repository root (not shipped; write your own) listing source repositories and which challenge goes in which area. It clones them into `.imports/` (git-ignored) and imports each writeup as a draft. See `scripts/import-all.mjs` and `tests/unit/import-all.test.mjs` for the manifest format.

**Code highlighting** is Shiki with the `taz` theme from `src/lib/code-theme.mjs`, converted to classes so no `style=` reaches the page. Astro caches rendered Markdown in `node_modules/.astro`; delete that folder after changing the theme.

## Project layout

```
src/
  pages/        index, projects, journal (index, [area], map), about, security,
                theme, 404, feed.xml, search.json, sitemap.xml, security.txt
  content/      journal/, projects/, areas/, events/ (schemas in content.config.ts)
  layouts/      Base.astro (the only file that renders <html>), Entry.astro
  components/   shell/, overlays/, journal/
  data/         site.ts: identity, links, nav, hero copy
  styles/       tokens, base, world, layers, motion, prose, code, journal, fonts
  scripts/      boot.js (ships unminified), keys, world, search, journal, map, copy
  lib/          glyphs, code theme, view-transition names, theme export, helpers
scripts/        build gates, deploy, importers, font/art/share-image generators
tests/          Playwright specs and unit tests
public/         _headers (CSP and friends), robots.txt, speculation rules
```

`PLAN.md` records the design decisions, budgets and milestones behind all of this. Comments in the code cite its sections.

## Build gates

Each gate fails the build. Details are in [PLAN.md](PLAN.md) §6–7.

- **`check-inline.mjs`:** no inline `<script>`, `<style>`, `style=`, `on*=` or `javascript:` in built HTML or SVG, and no third-party resources.
- **`check-contrast.mjs`:** every text colour pair in `src/styles/tokens.css`, code colours included, meets WCAG AA.
- **`check-budget.mjs`:** per page, HTML ≤ 8 KB (entry text excluded), CSS ≤ 16 KB and JS ≤ 3 KB gzipped; all fonts together ≤ 100 KB.
- **`check-headers.mjs`:** the CSP, HSTS and the rest of the header set in `dist/_headers`, and on live responses after a deploy.

## Motion

Pages change through cross-document view transitions (`src/styles/motion.css`). `src/scripts/boot.js` types each one as `open`, `close`, `next` or `prev`, and CSS selects them with `:active-view-transition-type()`. Animations are declared through `--a-*` variables that are `none` until the page is ready and motion is allowed, so reduced motion and the footer switch need no JavaScript. Firefox gets plain navigation without transitions.

## Deploys

`.github/workflows/ci.yml` runs every check on each push and on a monthly schedule (so the `security.txt` expiry never lapses). On `main` it deploys **the exact build that passed** to Netlify through the API (`scripts/deploy-netlify.mjs`), then checks that production serves it and sends the expected headers.

- It needs `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`, ideally as secrets of a `production` environment limited to `main`.
- **Don't link the Netlify project to the repository.** A linked project would run its own Git builds and publish the raw repo. `netlify.toml` cancels such builds, and the deploy job fails while the project can build from Git.
- Until launch, deploys carry `X-Robots-Tag: noindex`. Set the repository variable `SITE_STAGE=live` to go live.

Any static host that can set response headers will work; the CSP has to be sent as a header, not a `<meta>` tag. Adapt `public/_headers` and the deploy script to your host.

## Regenerating assets

```sh
node scripts/art.mjs                                # hero and banner scenery in src/assets/art/
python3 scripts/og.py /path/to/google-fonts-checkout  # public/og.png (needs pillow)
python3 scripts/fonts.py /path/to/google-fonts-checkout  # subset fonts into src/assets/fonts/
```

Rerun `og.py` when the one-liner in `src/data/site.ts` or the palette changes.

## Fonts

Built by `scripts/fonts.py` from [google/fonts](https://github.com/google/fonts): subset, renamed, with metric-matched fallbacks written to `src/styles/fonts.css`.

| Site name | Original | Licence |
|---|---|---|
| Taz Read | Newsreader, Production Type | SIL OFL 1.1 |
| Taz Display | Marcellus, Astigmatic | SIL OFL 1.1 |
| Taz Mono | IBM Plex Mono, IBM | SIL OFL 1.1 |

Marcellus and IBM Plex reserve their names under the OFL, so the subsets carry new names. The licences are in `src/assets/fonts/LICENSES/`.

## License

Code: MIT. Writing (`src/content/` and the About text): CC BY-NC 4.0. Fonts keep their own OFL licences. See [LICENSE](LICENSE).
