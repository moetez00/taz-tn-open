# PLAN — taz.tn

Phase 4 · 2026-09-28 · **Direction B "Hunter's Journal"**, plus C's keyboard model and A's hidden map.

**No code is written until you approve this plan.**

Inputs (research, interview log and design directions) are not part of the open-source copy.

---

## 1. Stack decision

| Choice | Decision | Why (evidence) |
|---|---|---|
| Framework | **Astro 7, static output**, TypeScript | Measured: a Markdown page ships **0 scripts**, and with Shiki classes **0 inline styles**, so the CSP needs no hashes [M]. Next.js 16 static export ships 2 inline scripts + 133 KB gz JS, and its own no-nonce CSP uses `'unsafe-inline'` [M][D]. Hugo would mean learning Go templates. |
| UI framework | **None.** Astro components + ~3 KB of vanilla TS modules | Near-zero JS on article pages is a non-negotiable. No hydration runtime. |
| Content | Astro **content collections** with Zod schemas; Markdown by default, MDX only for posts that embed components | Schema-checked front matter, so a bad post fails the build |
| Highlighting | **Shiki 4** with a `themes: {dark}` object + `transformerStyleToClass`; CSS emitted to a file at build | The only configuration I verified to produce 0 inline `style=` [M]. Astro's own CSP helper doesn't support Shiki [D]. Expressive Code emits inline styles [M]. |
| Motion | **Native CSS**: cross-document View Transitions, `linear()` springs, `@starting-style`, scroll-driven animations | 0 KB motion JS. Firefox gets instant navigation (accepted in Round 1). |
| Search | Prebuilt **JSON index** + a ~1.5 KB matcher, loaded only when the palette opens | Pagefind needs `'wasm-unsafe-eval'` and its UI uses `innerHTML` [M] |
| Diagrams | Authored in D2 or Excalidraw, **committed as SVG**, optimised with SVGO, styles converted to attributes | Mermaid at runtime costs up to 1.48 MB gz [M], and inline `<style>` inside SVG would violate the CSP |
| Hosting | **Netlify**; apex A record `75.2.60.5` at OVH; `_headers` | Round 4 decision [I] |
| CI/CD | **GitHub Actions** builds, runs every gate, then `netlify deploy`. Netlify's own build is off. | Gates run *before* anything is public. Playwright and Chromium are available in Actions. |

---

## 2. Direction B, refined page by page

**Shell on every page:**
- **Ribbon:** the red bookmark hanging at the left of the masthead.
- **Masthead:** `TAZ` in Marcellus caps, tracked; `Moetez Zouari` in Newsreader.
- **Nav:** Journal · Projects · About, with the stretching indicator.
- **Footer:** RSS · security · theme · source · a small unlabeled mark leading to the hidden map.

| Page | Content |
|---|---|
| `/` | One-liner. A **Latest** line ("Latest: Hope Exploitation · The Heap · 9 min"), which is the call to action. The full Journal index grouped by area (rows: title · techniques · role badge · event). **Field notes** (top 4 projects) beside **Results** (plain table). |
| `/journal` | Master and detail, after the mockup: a timeline of entries on the left that scrolls on its own, and a preview card on the right (crumb, summary, meta, a figure drawn from the entry's headings and facts, "Read full article"). The **Authored for** list was removed 2026-09-29. |
| `/journal/<area>` | **Area title card** (H2) on arrival, a one-line area description, that area's entries |
| `/journal/<area>/<entry>` | Editorial column with **marginalia** on wide screens: event, role, techniques, difficulty, arch, source and solver links, "run it locally". On narrow screens it becomes a strip under the title. TOC in a `<details>` on long posts. Body. **Dream Nail** flag. Previous/next within the area. The ribbon at the left edge fills as you read. |
| `/projects`, `/projects/<slug>` | Field notes: case studies with numbers set inline (117 classmates, 41/108 commits), not stat tiles. Stack, role, links, "what I'd change". |
| `/about` | Short bio from the CV: INSAT software engineering (expected June 2029); Securinets INSAT technical team since Sep 2024 as pwn challenge author (20+ challenges) and workshop instructor (3 workshops); TPLUS Innovation internship (Aug 2026); IEEE Computer Society chapter (backend, logistics for AINS 4.0 and Xtreme). Also: Hackviser top 3%, results table, authored CTFs, contact `moetaz.zouari@insat.ucar.tn`, CV (public variant **without phone number**), keyboard map. |
| `/security` | Disclosure policy: scope (`taz.tn` + subdomains you run), safe harbour for good-faith testing, no bounty, no acknowledgments page |
| `/theme` | The palette as a base16 scheme, plus kitty, foot, Hyprland (Lua) and niri (KDL) snippets carrying **the site's own motion tokens**. Copy buttons. |
| `/journal/map` | Hidden. Map and quill: pins ink in after you've read an entry and rested at home (per-visitor `localStorage`; the page works without it). |
| `404` | "This path isn't on the map." Links home and to the index. |

---

## 3. The ricing layer: motion and behaviour

The rule from your non-negotiables: every animation serves **orientation, feedback or continuity**. Motion lives in the shell. Articles stay calm, with only focus, copy feedback and spoiler reveal.

### 3.1 Motion tokens

These map one-to-one onto a compositor's animation block. `/theme` exports them as real Hyprland and niri config.

```css
--spring:   linear(0, 0.0229, 0.079, …, 0.9988, 1);   /* ζ 1.0, k 800, m 1: niri-style, no overshoot */
--decel:    cubic-bezier(.05, .7, .1, 1);            /* layers in (Material 3 emphasised decelerate, as end-4 uses) */
--accel:    cubic-bezier(.3, 0, .8, .15);            /* exits (Material 3 emphasised accelerate) */
--standard: cubic-bezier(.2, 0, 0, 1);               /* effects: colour and opacity, never overshoot */

--t-spatial: 327ms;   /* anything that moves or resizes */
--t-trail:   490ms;   /* trailing edge = spatial × 1.5 (Caelestia's stretch) */
--t-layer:   300ms;   /* overlays in */
--t-effect:  150ms;   /* colour, opacity, focus */
--t-exit:    120ms;   /* overlays out */
--t-back:    140ms;   /* back navigation */
--t-card:    150ms in / 1200ms hold / 300ms out;   /* area title card, non-blocking */
--travel:    24px max for content offsets (shared elements morph freely)
```

**Exported to `/theme`:**
- **Hyprland:** `hl.curve("taz", { type = "spring", mass = 1, stiffness = 800, damping = 56.57 })`, where 56.57 = 2√800, i.e. critical damping [D].
- **niri:** `spring damping-ratio=1.0 stiffness=800 epsilon=0.0001` [D].

### 3.2 Choreography

| Moment (compositor analogue) | Trigger | What moves | Timing | Reduced motion |
|---|---|---|---|---|
| **Window open** | Index row → entry | The entry title morphs from the row into the H1 (shared element). The page body fades in and rises 8 px. | 327 ms spring; body 150 ms `--standard` | Instant |
| **Window close** | Back / entry → index | Title morphs back; old page fades | 140 ms `--accel` (faster out, as Hyprland's 149 ms `windowsOut`) [D] | Instant |
| **Workspace switch** | Journal ↔ Projects ↔ About | Main content slides 24 px in nav order (left or right) with a cross-fade. The nav indicator morphs to the new item. | 327 ms spring; fade 150 ms | Instant |
| **Stretching indicator** | Same | Two shared elements: the indicator (327 ms) and a 40%-opacity **trail** (490 ms), so the trailing edge catches up (Caelestia's workspace pill [S]) | 327 / 490 ms spring | Static underline |
| **Active border** | Keyboard focus anywhere | 2 px lit `--cloak` ring, with no offset jump | 150 ms `--standard` colour | Instant ring |
| **Dim inactive** | Moving through the index with `j`/`k` | The current row gets an inset lit bar and raised background. Other rows shift soul → ash (still 7.88:1, AA). CSS-only via `:focus-within`. | 150 ms | Instant |
| **Layer surface** | `/` search, `?` keybinds | `<dialog>` pops in from 98% scale + fade. Backdrop dims 0.2 (Hyprland's `dim_special` default [D]). `?` slides up from the bottom, like end-4's cheatsheet layer [S]. | In 300 ms `--decel`; out 120 ms `--accel` | Instant open and close |
| **Bar slide-in** | First page of a session only | The ribbon drops in from −100% (end-4's bar slide rule [S]) | 327 ms spring | Static |
| **Area title card** | Arriving at an area page | Name + ornament rule fade in over the page. Doesn't block input. | 150 / 1200 / 300 ms | Skipped |
| **Reading progress** | Scrolling an entry | The ribbon's red fill grows with scroll (scroll-driven; Chrome/Safari 26) | Tied to scroll | Stays (it's position, not motion) |
| **Dream Nail** | Opening a flag or spoiler | Content blooms (opacity + 3 px blur → 0) | 200 ms `--decel` | Instant |
| **Map ink** (hidden) | Resting at home after reading | Pins ink in; the route from home draws | 150 ms; route 327 ms | Instant |

**Never, by design:**
- no scroll-jacking or smooth-scroll libraries
- no cursor effects
- no sound
- no loops longer than 5 s (WCAG 2.2.2) [D]
- nothing that delays navigation (r3t0x holds navigation for 0.85–1.48 s [S])
- no bounce: ζ = 1

### 3.3 Keyboard map (from Direction C)

| Key | Action |
|---|---|
| `j` / `k` (↓ / ↑) | Move through index rows |
| `Enter` | Open the current row |
| `1` `2` `3` | Journal / Projects / About |
| `/` | Search |
| `?` | Keybind cheatsheet |
| `Esc` | Close the layer |
| `g` `g` | Top |

Keys are ignored while typing or with modifiers held, and every key has a visible, clickable equivalent.

### 3.4 How it runs under a strict CSP

- **Per-entry transition names:** a style attribute is blocked by the CSP. The build generates one CSS rule per entry into the external stylesheet (`.vt-<slug>{view-transition-name:e-<slug>}`). Zero JS.
- **Direction-aware transitions:** ~0.4 KB external module that adds `view-transition` types on `pageswap`/`pagereveal`. Styled with `:active-view-transition-type(forward|back)`, which became Baseline on 2026‑01‑13 [M]. Without it: a plain cross-fade.
- **Instant navigation:** served through a `Speculation-Rules` response header (Chrome 121+) [M] pointing at `/speculation-rules.json`. Prerender on hover (`eagerness: moderate`), so a transition starts from an already-loaded page. No inline script.
- **Reduced motion is one switch:**
  - `@media (prefers-reduced-motion: reduce)` sets `@view-transition { navigation: none }` and zeroes every duration token.
  - A footer toggle (`Motion: on/off`) persists the choice per visitor; `localStorage` is wrapped in try/catch.

---

## 4. File structure

```
taz.tn/
├─ astro.config.mjs            # static output; Shiki themes + style-to-class; assetsInlineLimit 0; inlineStylesheets 'never'
├─ package.json · tsconfig.json
├─ public/
│  ├─ _headers                 # security headers (§7)
│  ├─ speculation-rules.json
│  ├─ fonts/                   # subset woff2, committed
│  ├─ cv/moetez-zouari.pdf
│  └─ favicon.svg              # original ribbon mark
├─ src/
│  ├─ content.config.ts        # collections + Zod schemas (§5)
│  ├─ content/
│  │  ├─ journal/<area>/<entry>/index.md   # images beside the post
│  │  ├─ projects/<slug>/index.md
│  │  ├─ areas/*.yaml
│  │  └─ events/*.yaml
│  ├─ layouts/  Base.astro · Entry.astro · Project.astro · Page.astro
│  ├─ components/
│  │  ├─ shell/     Ribbon · Masthead · Nav · KeyHints · Footer · MotionToggle
│  │  ├─ journal/   JournalIndex · AreaRule · EntryRow · RoleBadge · AreaTitleCard · Marginalia · SeriesNav · Toc · Latest
│  │  ├─ prose/     CodeBlock · ShellSession · HttpExchange · HexDump · DreamNail · Callout · Figure · Diagram
│  │  ├─ projects/  FieldNotes · CaseFacts
│  │  ├─ about/     ResultsTable · AuthoredList · Contact
│  │  └─ overlays/  SearchPalette · Keybinds       (<dialog>, DOM APIs only, no innerHTML)
│  ├─ pages/  index · journal/[...] · projects/[...] · about · security · theme · journal/map · 404
│  │          feed.xml.ts · search.json.ts · .well-known/security.txt.ts · vt-names.css.ts
│  ├─ scripts/  keys.ts · copy.ts · search.ts · vt.ts · session.ts · ink.ts
│  ├─ styles/   tokens.css · base.css · prose.css · code.css · motion.css
│  └─ lib/      shiki.ts · theme-taz.json · hexdump.ts · reading-time.ts · theme-export.ts
├─ scripts/     subset-fonts.py · check-inline.mjs · check-contrast.mjs · check-headers.mjs · check-budget.mjs
├─ tests/       keyboard.spec.ts · a11y.spec.ts · csp.spec.ts · reduced-motion.spec.ts · vt.spec.ts
├─ .github/workflows/  ci.yml (checks on every push; deploy job on main; monthly schedule)
└─ PLAN.md
```

---

## 5. Content model (Zod, enforced at build)

```ts
areas:    { id, name: "The Heap", blurb: "tcache, safe-linking, UAF", order }
events:   { id, name, organizer?, year, role: "author" | "player",
            result?: { rank, of? }, ctftime?: url, url? }
journal:  { title, area: ref(areas), role: "author" | "player" | "found",
            event?: ref(events), published: date, updated?: date,
            summary,                       // index line + meta description
            techniques: string[],          // drives the technique index
            difficulty?: "easy" | "medium" | "hard" | "insane",
            arch?: "amd64" | "aarch64" | "i386" | "arm" | "other",
            points?, series?: { id, part },
            source?: url, solver?: url, runLocally?: boolean,
            flag?: string,                 // rendered only inside DreamNail
            draft: boolean = false, lang: "en" = "en" }
projects: { title, status: "live" | "archived" | "course", url?, repo?, stack: string[],
            role, period, facts: string[] /* "117 classmates" */, commits?: { mine, total }, order }
```

**Launch content: 19 Journal entries, about 13,000 words already written.**

- **Pioneers25:** 7 challenges, ~3,850 words, from `moetez00/Pioneers25CTF-PWN-WriteUps`.
- **Securinets Friendly 2026:** 11 challenges, ~9,200 words, from `moetez00/friendly-ctf-26-pwn-write-ups`. Every `challenge.yml` lists author Taz.
- **Web:** 1 entry, the INSAT Pulse file injection you found and fixed.

Entries are imported close to verbatim. Import fixes formatting only: some code fences are broken, so code comments render as headings. Every entry goes to you as a draft before publishing. Binaries, libc and flags files stay in the GitHub repos; entries link to them.

**Area map** (from each challenge's own tags):

| Area | Entries |
|---|---|
| **Format Strings** | print(xxx);, Full Clip, Rocketman, Radio Los Santos, Radio Vice City, Rootstar Games, Same Same But Different!, Short Fuse |
| **The Stack** | Fill me, ARMBLUSBLUS, Au Revoir, Wrong Turn |
| **Shellcode** *(new)* | Who likes assembly anw ?, The Safehouse |
| **Signals & Syscalls** *(renamed from Signals)* | 5959595959, Wrong Number |
| **The Heap** | Hope Exploitation |
| **Bit Flips** | Flip Flip Flip |
| **Web** | the INSAT Pulse post |

**Also:** 5–7 projects, results, authored events.

**Later:** the Mangekyo, iTeam and RedPointer sets, once you have access to that private repo.

---

## 6. Performance budget

Mobile, cold cache. Enforced by `check-budget.mjs` and Lighthouse CI; a failure blocks deploy.

| Metric | Budget |
|---|---|
| Lighthouse mobile | **≥ 95** Performance; 100 Accessibility, Best Practices, SEO |
| LCP / CLS / TBT | ≤ 1.8 s / ≤ 0.02 / ≤ 50 ms |
| JS on an article page (eager) | **≤ 3 KB gz**: keys, copy, vt, session. Search loads on demand (~1.5 KB + index). |
| CSS | ≤ 16 KB gz, one file per page, no `<style>` |
| Fonts | ≤ 100 KB woff2 total (2 preloaded): Newsreader 400/400i/600, Marcellus 400, Plex Mono 400/500, subset to Latin + the symbols used [M]. Metric-adjusted fallbacks for near-zero CLS. |
| HTML template overhead | ≤ 8 KB gz, excluding post content |
| Images | `astro:assets` → AVIF/WebP, explicit dimensions, lazy below the fold |
| Third-party requests | **0** |

---

## 7. Security headers (`public/_headers`)

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none
  Speculation-Rules: "/speculation-rules.json"    # added in M3 with the rules file
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/speculation-rules.json
  Content-Type: application/speculationrules+json
```

**Changes made during M1:**
- `upgrade-insecure-requests` was dropped. Every URL is same-origin and relative, and HSTS already forces HTTPS, so the directive added nothing. It would also upgrade requests on the plain-HTTP local test server and break it.
- `Speculation-Rules` arrives in M3 together with its rules file.
- The first production deploy revealed a Git-linked Netlify project: Netlify's own build published the raw repository. `netlify.toml` now cancels Git builds, the deploy job fails while the project can build from Git, and the live header check targets production instead of the deploy permalink, which can't show what visitors get.

**Guardrails in CI:**
- **`check-inline.mjs`** fails the build on any executable inline `<script>`, `<style>` element, `style=` attribute, `on*=` handler or `javascript:` URL in `dist/`. JSON-LD data blocks are allowed.
- **`csp.spec.ts`** crawls every page in Chromium and fails on any `securitypolicyviolation` event.
- **`check-headers.mjs`** runs against production after each deploy, once `deploy-netlify.mjs` has confirmed production serves that deploy, and asserts every header above.
- **`check-contrast.mjs`** verifies every token pair used for text against WCAG AA, including the Shiki theme's token colours.
- **`/.well-known/security.txt`** is generated at build: `Contact: mailto:security@taz.tn`, `Expires` = build + 1 year, `Canonical`, `Policy: https://taz.tn/security`, `Preferred-Languages: en`. **`monthly.yml`** rebuilds and redeploys so `Expires` never goes stale. No PGP at launch.

---

## 8. Milestones

| # | Milestone | Deliverables | Exit criteria |
|---|---|---|---|
| **M0** | DNS and hosting prep (you, with my checklist) | Delete `ctf.taz.tn`. Verify or delete `mail.taz.tn`. Confirm Brevo usage and insatpulse's certificate issuer. Add CAA. Create the `security@` alias and the Netlify site. Add `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` as GitHub secrets. | No dangling records; secrets present |
| **M1** ✅ | Skeleton + guardrails | Astro project, tokens, subset fonts, `_headers`, Base layout, empty pages, all CI gates, deploy to a Netlify preview | Preview scores **securityheaders.com A+**; Lighthouse 100/100/100/100 on the empty shell; every gate green |
| **M2** ✅ | Journal core | Collections and schemas; index, area and entry layouts; marginalia; Shiki `taz` theme with classes; copy button; Dream Nail; RSS; sitemap; import tooling for the Pioneers25, Friendly 2026 and INSAT Pulse writeups, which arrive as drafts for your review | Entry page JS ≤ 3 KB gz, 0 CSP violations, axe clean |
| **M3** ✅ | Ricing layer | Every row of §3.2 and every key in §3.3; search palette; keybind cheatsheet; direction types; speculation rules; motion toggle | Playwright passes keyboard, reduced-motion (no running animations) and VT-fallback tests; motion reviewed with you on the preview |
| **M4** ✅ | Projects, About, extras | Field notes, results table, authored list, `/security`, `security.txt`, `/theme` export (base16 + kitty/foot/Hyprland/niri), hidden map, 404, OG image | All pages within budget |
| **M5** | Launch | Content sign-off, link check, apex A record → Netlify, live headers verified, Search Console updated | A+ and Lighthouse ≥ 95 mobile **on taz.tn** |
| **Post** | Hardening | Audit every subdomain's HTTPS, then submit to the HSTS preload list; move DMARC to `quarantine` after DKIM checks | Preload accepted |

**Each milestone ends with a pushed branch and a preview URL for you to review.** Nothing reaches `taz.tn` before M5.

**M1 status (2026-09-29).** Built and verified locally:
- typecheck clean
- all four gates pass
- 48 browser tests pass (desktop + mobile)
- Lighthouse mobile 100/100/100/100 on every page (LCP ≤ 1.51 s, CLS 0)

Also as built:
- Fonts ship as "Taz Read", "Taz Display" and "Taz Mono", renamed for the OFL Reserved Font Name clause; 85.8 KB for all five files.
- Deploys use Netlify's zip API, with no Netlify CLI dependency.

The first live deploy, and the securityheaders.com A+ check, happen once this branch is merged to `main` with the Netlify secrets in place.

**M2 status (2026-09-29).** Built and verified locally:
- typecheck clean; 6 importer unit tests pass
- all four gates pass; entry page JS 0.5 KB gz, entry template HTML 1.5 KB gz, CSS 4.3 KB gz
- 84 browser tests pass (desktop + mobile): CSP and Trusted Types, axe on every page, copy button by keyboard, Dream Nail, contents links, feed and sitemap validity, drafts kept out of indexes
- Lighthouse mobile: performance 100 on every page including an entry (LCP ≤ 1.52 s, CLS 0)

Changes made during M2:
- **The writeups are not in this milestone's build.** `scripts/import-entry.mjs` (`npm run import`) brings each one in as a draft: it keeps the text as written, copies its images, turns local HTML `<img>` tags into Markdown images, moves headings down a level when the body uses h1, and flags unclosed code fences.
- **Drafts are visible on previews**, marked Draft and `noindex`, and never in the feed or sitemap. The build step now receives `SITE_STAGE`, so at launch (`live`) drafts drop out of every page.
- **Schema:** `role` is optional, for notes that aren't challenge writeups. Events gained `note` and `order`, and `year` is optional. Years confirmed 2026-09-29: 2026 for every authored event except RedPointer (2025).
- **Code colours:** greys plus one parchment tone for literals, and no red, which Direction B keeps for the ribbon, focus and links. Keywords stay in the text colour; literals, comments and definitions get colour. Every token colour is in `tokens.css` and passes the contrast gate on `--raised`.
- **Budget gate:** HTML is now measured without the entry text, as §6 always specified ("excluding post content").
- **Lighthouse:** draft pages are held to every SEO audit except `is-crawlable`, which their `noindex` fails by design.
- The feed carries full entry text, with images resolved to the same files the pages use.

**M3 status (2026-09-29).** Built and verified locally:
- 108 browser tests pass (keyboard and layer tests on desktop only):
  - transition types open, close, next and prev; a row's title and the entry heading share one name
  - the Motion switch persists and skips transitions; with reduced motion there is no view transition at all
  - the ribbon drops in on the first page of a session only; the reading line follows the scroll, reduced motion included
  - `j` `k`, arrows, Enter, `1` `2` `3`, `/` search, `?` keys, `g g`, the no-JS fallbacks, and axe with each layer open
- Lighthouse mobile: performance 100 on every page, CLS 0, TBT 0. LCP ≤ 1.66 s, on the entry page; the render-blocking boot script costs about 0.15 s there.
- Eager JS on an entry page: 2.8 KB gz (boot 0.9, keys 1.5, copy 0.5). The search matcher (0.7 KB) and its index load on first open.
- Speculation rules load under the CSP, and hovering a row starts a prerender. Chromium under automation then stops it (`PrerenderingDisabledByDevTools`), so activation can only be confirmed in a normal browser.

Changes made during M3:
- **Area title card:** the page's own header animates in (the letters draw in, the rule opens from its diamond) instead of a separate overlay that holds and fades. An overlay would have repeated the header directly under it.
- **Arrow keys** move through rows only once a row has focus (`j` or Tab starts it); otherwise they scroll the page as usual.
- Keys are read from `event.key`, so they work on AZERTY, where `/` and the digits need Shift.
- **Visible equivalents** sit in the footer: Search (the index without JS), Keys (the keyboard map on About without JS), Top, and the Motion switch, which is hidden without JS and when the system asks for reduced motion. The key hint hides on touch-only devices.
- **Per-entry transition names** come from a Vite virtual stylesheet (`src/lib/vt-names.mjs`) bundled into the page CSS, not a separate `vt-names.css` request.
- **The boot script** (`src/scripts/boot.js`) is render-blocking by design: it has to hook `pagereveal` and set flags before the first frame. It is fingerprinted and cached for a year.
- **Titles morph as one image:** `view-transition-class: entry-title` gives the text a quick cross-fade inside the slower move, and both boxes hug their text.
- A minifier folds `animation-timeline` into the `animation` shorthand, where browsers drop it; the reading line sets it in its own rule.

**M4 status (2026-09-29).** Built and verified locally:
- 144 browser tests pass (keyboard tests on desktop only), with axe, CSP and reduced motion on every new page; 9 unit tests pass.
- Lighthouse mobile on 9 pages: performance 99–100, CLS 0, LCP ≤ 1.66 s.
- `/security` and `/.well-known/security.txt`; `/theme` with the base16, kitty, Hyprland and niri exports; the hidden map; field notes on `/projects`; results, roles and the authored list on About, all from content collections; a site-wide share image.

Changes made during M4:
- **`security.txt` expires six months after each build**, not a year: RFC 9116 recommends less than a year, and CI deploys at least monthly, so it never goes stale.
- **foot isn't in the theme exports.** Its colour-section format couldn't be checked from here, and the exports ship only formats checked against upstream: tinted-theming's base16 schemes, Hyprland's `example/hyprland.lua` and wiki, and niri's wiki.
- **The base16 scheme stays in the site's palette**: greys, the code parchment and the cloak's red, with no new hues. Terminal colours 2–6 are therefore greys and parchment rather than green, blue and so on.
- **The map draws a pin's route on hover or focus**, not on click, so opening an entry never waits for it (§3.2's "nothing that delays navigation"). The text index under it is the source of truth.
- **Projects show only facts that can be checked**: stack from each repository's manifests, dates from its history, commit counts from the owner. A project gets its own page once its Markdown file has a case study in the body; none has one yet.
- **One share image for the whole site** (`scripts/og.py`, committed as `public/og.png`). Per-entry images would need drawing at build time.

---

## 9. Open items (not blocking M0–M3)

**Resolved 2026-09-29:**
- Brevo is no longer used, and insatpulse's certificate comes from Let's Encrypt, like Netlify's. One CAA record, `0 issue "letsencrypt.org"`, covers every host.
- Event years (see §8, changes made during M2).
- Friendly 2026 sources (repo above).
- Contact email for About: `moetaz.zouari@insat.ucar.tn`. `security.txt` keeps the `security@taz.tn` alias from Round 4.
- CV received.
- Area names approved. The new content adds one area (Shellcode) and renames one (Signals → Signals & Syscalls); see §5.

**Still open:**
- **`security@taz.tn`** is now published on `/security` and in `security.txt`. The OVH alias must exist before launch, or reports bounce.
- **Public CV:** a version **without the phone number**, exported from your LaTeX source. The site publishes only that one. Until then the CV stays out of the repo, so the number never enters git history.
- **TPLUS Innovation:** before any case study of the repair-shop finder you built there, confirm what the company allows you to publish. Until then it's a one-line mention on About.
- **CTFtime link** for "team 3rd in Tunisia" (not verifiable from this environment). Also confirm the spelling of G-CUP, which the CV uses.
- **Mangekyo, iTeam and RedPointer sources:** later.

## 10. M0 checklist (you, in OVH and Netlify)

1. **OVH DNS zone `taz.tn`:**
   - **Delete** the `ctf` A record (points to `131.163.89.176`; the service is dead).
   - **`mail` CNAME (Brevo):** if you no longer send through Brevo, delete it and the `brevo-code` TXT. If you still do, re-verify the branded domain in Brevo, because its target doesn't resolve today.
   - **Add CAA** `0 issue "letsencrypt.org"`. Netlify issues Let's Encrypt certificates (Netlify docs). If insatpulse's certificate comes from a different authority (check the padlock → certificate → issuer), add that authority too. A CAA on the root covers every subdomain, so a missing entry breaks renewals.
   - **SPF:** add your mail sender's documented include if it's not already there. Keep `~all` until DMARC reports look clean.
   - **Leave the root A record alone until M5.**
2. **OVH email:** create the alias `security@taz.tn` → your inbox.
3. **Netlify:** create a site **not connected to Git** (we deploy from Actions). Note its **Site ID** and create a **personal access token**.
4. **GitHub → this repo → Settings → Secrets:** add `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
5. **Tell me** insatpulse's certificate issuer, and whether Brevo stays.
