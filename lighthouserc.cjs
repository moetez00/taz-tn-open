// Lighthouse CI runs against scripts/serve.mjs, so scores include the real headers.
const { existsSync, readdirSync, readFileSync } = require("node:fs");

// One area page and one entry, whichever the build has first, so entry pages are
// always scored without naming content here.
const dirs = (path) =>
  existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
// The first area folder that holds entries (journal/map is a page, not an area).
const area = dirs("dist/journal").find((name) => dirs(`dist/journal/${name}`).length > 0);
const entry = area && dirs(`dist/journal/${area}`)[0];
const journal = area ? [`/journal/${area}/`, ...(entry ? [`/journal/${area}/${entry}/`] : [])] : [];
const paths = ["/", "/journal/", "/projects/", "/about/", "/security/", "/theme/", "/journal/map/", ...journal];
const url = (path) => `http://127.0.0.1:4322${path}`;

// Drafts carry noindex on purpose, which fails the "is-crawlable" audit and with it the
// SEO category. They get every other SEO audit instead.
const noindex = (path) => /<meta name="robots" content="noindex"/.test(readFileSync(`dist${path}index.html`, "utf8"));
const exactly = (list) => `^(${list.map((path) => url(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
const SEO_BUT_CRAWLABLE = ["document-title", "meta-description", "http-status-code", "link-text", "crawlable-anchors", "robots-txt", "image-alt", "hreflang"];
const base = {
  "categories:performance": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
  "categories:accessibility": ["error", { minScore: 1 }],
  "categories:best-practices": ["error", { minScore: 1 }],
};
const groups = [
  { paths: paths.filter((path) => !noindex(path)), assertions: { ...base, "categories:seo": ["error", { minScore: 1 }] } },
  { paths: paths.filter(noindex), assertions: { ...base, ...Object.fromEntries(SEO_BUT_CRAWLABLE.map((id) => [id, ["error", { minScore: 1 }]])) } },
].filter((group) => group.paths.length > 0);

module.exports = {
  ci: {
    collect: {
      startServerCommand: "node scripts/serve.mjs",
      startServerReadyPattern: "listening",
      url: paths.map(url),
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--no-sandbox --headless=new",
        // Canonical URLs point at https://taz.tn, not the local server; that audit
        // is meaningful only on the live domain.
        skipAudits: ["canonical"],
      },
    },
    assert: {
      assertMatrix: groups.map(({ paths: list, assertions }) => ({ matchingUrlPattern: exactly(list), assertions })),
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
