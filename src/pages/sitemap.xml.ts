// Sitemap of every public page. Static pages are discovered from src/pages, so a
// new page is listed without editing this file; drafts and the 404 page are not.
import type { APIRoute } from "astro";
import { areaUrl, entryUrl, groupByArea, publishedEntries } from "../lib/journal";
import { isoDate } from "../lib/format";

// The map is a hidden extra (PLAN.md §2), so it stays out like the 404 page.
const HIDDEN = ["/404.astro", "/journal/map.astro"];
const staticPages = Object.keys(import.meta.glob("./**/*.astro"))
  .filter((file) => !file.includes("[") && !HIDDEN.some((hidden) => file.endsWith(hidden)))
  .map((file) => file.slice(1).replace(/(index)?\.astro$/, "").replace(/([^/])$/, "$1/"))
  .sort();

export const GET: APIRoute = async ({ site: base }) => {
  if (!base) throw new Error("sitemap: `site` must be set in astro.config.mjs");
  const entries = await publishedEntries();
  const areas = (await groupByArea(entries)).map(({ area }) => areaUrl(area.id));

  const urls: { path: string; lastmod?: Date }[] = [
    ...staticPages.map((path) => ({ path })),
    ...areas.map((path) => ({ path })),
    ...entries.map((entry) => ({ path: entryUrl(entry), lastmod: entry.data.updated ?? entry.data.published })),
  ];

  const body = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      ({ path, lastmod }) =>
        `<url><loc>${new URL(path, base).href}</loc>${lastmod ? `<lastmod>${isoDate(lastmod)}</lastmod>` : ""}</url>`,
    ),
    "</urlset>",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
