// @ts-check
import { defineConfig } from "astro/config";
import { tazTheme, tokenClasses } from "./src/lib/code-theme.mjs";
import { vtNames } from "./src/lib/vt-names.mjs";

// No inline code anywhere, so the CSP can stay `script-src 'self'; style-src 'self'`
// with no hashes (PLAN.md §3.4): stylesheets are always external files, assets are
// never inlined as data: URIs, and code highlighting emits classes, not style=.
export default defineConfig({
  site: "https://taz.tn",
  output: "static",
  trailingSlash: "always",
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    format: "directory",
    inlineStylesheets: "never",
  },
  markdown: {
    shikiConfig: {
      theme: tazTheme,
      transformers: [tokenClasses()],
    },
  },
  vite: {
    plugins: [vtNames()],
    build: {
      assetsInlineLimit: 0,
    },
  },
});
