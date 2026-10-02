# taz.tn

Moetez Zouari's ("Taz") personal site: a journal of CTF writeups, a projects page and an About page. Astro 7, static output, TypeScript, no UI framework. `PLAN.md` is the source of truth for decisions and budgets. Hosted on Netlify.

## Commands

- `npm run dev` develops; `npm run build` writes `dist/`.
- `npm run verify` runs everything: `check`, `test:unit`, `build`, `gates`, `test:e2e`.
- `npm run gates` runs four checks on the built `dist/`: `gate:inline`, `gate:contrast`, `gate:budget`, `gate:headers`.
- `npm run test:e2e` is Playwright. It serves `dist/` with `scripts/serve.mjs` (real CSP and headers, port 4322), **so rebuild before testing**, or tests run against stale output.
- On this machine Playwright has no downloaded browsers: run `PW_CHROMIUM_PATH=/usr/bin/chromium npx playwright test`.
- `node scripts/art.mjs` regenerates the scenery SVGs in `src/assets/art/`. `npm run import` imports writeups.
- To free a port use `fuser -k 4322/tcp`. Never `pkill -f` with a pattern that also appears in your own command line: it kills the shell.

## Hard constraints (each is enforced by a gate or test)

- **CSP is `script-src 'self'; style-src 'self'`, Trusted Types enforced with no policies.** No inline `<script>`, `<style>` or `style=` attributes, no `data:` URIs, no `innerHTML`; use DOM APIs. Set CSS values from JS with `el.style.translate = ...` (CSSOM is allowed), not attributes. Code highlighting emits classes, not `style=`.
- **Eager JS ≤ 3 KB gzipped per page** (`gate:budget`, PLAN.md §6). The `journal/map` page has almost no headroom. `src/scripts/boot.js` ships as written, unminified, so comments cost bytes. Anything heavy loads on demand: search on first open, `world.ts` (cursor and parallax) 600 ms after load, from `keys.ts`.
- CSS ≤ 16 KB gz per page, HTML ≤ 8 KB gz (entry text excluded), fonts ≤ 100 KB.
- Text contrast is checked (`gate:contrast`) and axe runs on every page. Text must not be part-transparent while it animates in: use position-only keyframes (`--a-lift`) for text, not `rise`.
- No motion JS. Motion is native CSS: cross-document view transitions, `linear()` springs, `@starting-style`, scroll-driven animations.

## Structure

- `src/pages/`: `index` (hero), `projects/` (cards, plus `[slug]` case-study sheets), `journal/` (index, `[area]`, `map`), `about`, `security`, `theme`, `404`, `feed.xml`, `search.json`, `sitemap.xml`.
- `src/content/`: `journal/<area>/<entry>/`, `projects/<slug>/index.md`, plus `areas` and `events`. Schemas are in `src/content.config.ts`; a bad front matter fails the build.
- `src/layouts/Base.astro` composes everything: veil, dust, frame, page, cursor, and the two dialogs. Nothing else should render a `<html>`.
- `src/components/shell/` (Masthead, Footer, Mask, Corner, Hex), `overlays/` (SearchPalette, Keybinds, KeyMap), `journal/`.
- `src/data/site.ts`: handle, links, **nav order** and the hero copy. Nav order is also the page-slide direction (`boot.js`) and the 1 to 4 keys (`keys.ts`); change it in one place only.
- `src/styles/`: `tokens.css` (palette, type, layout, motion tokens), `motion.css` (animations and view transitions), `world.css` (frame, dust, cursor, shared `.chip .panel .hex`), `layers.css` (dialogs), `base.css`.
- `src/lib/vt-names.mjs`: a Vite plugin that writes one `view-transition-name` rule per journal entry (`.vt-*`) and project (`.vp-*`, `.vpt-*`), because names can't be set with `style=` under the CSP.
- `src/lib/glyphs.ts`: the site's own line icons. `scripts/art.mjs` draws the hero and banner art.

## Motion system

- Three levels, from tokens: micro (`--t-micro`, `--t-effect`, 120 to 250 ms), UI (`--t-layer`, `--t-spatial`, `--t-page`, 300 to 600 ms), atmosphere (`--t-breathe/mote/drift/light`, 5 to 26 s). `--spring` is critically damped; `--spring-soft` overshoots 4%.
- Animations are written `animation: var(--a-name) ...`. The `--a-*` variables in `motion.css` are `none` until `html[data-ready]` and motion is allowed (not `prefers-reduced-motion`, not `data-motion="off"`). That is the single gate: **don't put a bare `animation-name` on a component.** Transitions use `--t-*` tokens, which go to 0 in the same cases.
- Entrances: add `.enter` and `.i1` to `.i9`; delay is `--base + i * --step`, longer on `html[data-first]` (first page of a session).
- `boot.js` types each view transition `open`, `close`, `next` or `prev`; CSS selects them with `:active-view-transition-type()`.
- Scroll-driven animations need the timeline in a separate, more specific rule than the `animation` shorthand (minifiers fold it in and browsers drop the line). Copy the existing pattern.
- Looping atmosphere pauses unless its container has `data-atmos` and is on screen (`data-live`, set in `world.ts`). Playwright's a11y test ignores infinite animations.

## Gotchas

- **Class names are global across components.** Astro scopes `<style>`, but `world.css` and `layers.css` define global `.layer`, `.side`, `.corner`, `.tag`, `.chip`, `.panel`, `.hex`. Reusing one of those names for a different thing silently inherits its styles (the hero's `.layer` and a card's `.side` both broke this way, and later `EntryRow` and `Entry.astro` with `.side`). Pick a new name. Scoped selectors also don't reach another component's markup: use `:global()` for a child component's class.
- Accessible names: a flex-container button treats children as blocks, and Chrome adds spaces around block and inline-block children. The Motion button uses `font-size: 0` on the state text so its name stays "Motion: on". Tests rely on it.
- The Journal index preview (`journal.ts`, its own lazy chunk) is driven by `.on` on a row and its `.jr-pv`: hover previews, a click pins, a second click on the pinned row opens. No `:has()` per index.
- `keys.ts` and `world.ts` are modules (`export {}`), so their top-level names don't collide.
- The dialogs are `.layer`; open ones are found with `dialog[open]`. Keys ignore input fields, except Ctrl/⌘ K.
- `data-cursor="view|read|out|explore"` on an element sets the custom cursor's label; links off-origin get `out` automatically.
- `server_state.json` in the repo root is untracked and unrelated: leave it.

## Conventions

- Match the surrounding code's comment density and naming. Comments explain why, briefly, and reference `PLAN.md §` where a decision lives there.
- Content pages take `current` (`home`, `projects`, `journal`, `about`) so the nav underline lands on the right link.
- Commit or open a PR only when asked. Git commits end with the Co-Authored-By line the environment specifies.
