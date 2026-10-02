// Full-text RSS for published entries. Drafts never appear here, even on previews.
import type { APIRoute, ImageMetadata } from "astro";
import { getImage } from "astro:assets";
import { entryUrl, publishedEntries, type Entry } from "../lib/journal";
import { site } from "../data/site";

const images = import.meta.glob<ImageMetadata>("/src/content/journal/**/*.{png,jpg,jpeg,gif,webp,avif}", {
  eager: true,
  import: "default",
});

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

const decodeAttribute = (text: string) =>
  text.replace(/&(quot|amp|lt|gt|#x27|#39);/g, (_, name: string) =>
    ({ quot: '"', amp: "&", lt: "<", gt: ">", "#x27": "'", "#39": "'" })[name]!,
  );

// Rendered Markdown keeps local images as placeholders that pages resolve at render
// time; resolve them the same way, then make every link absolute for feed readers.
async function entryHtml(entry: Entry, base: URL): Promise<string> {
  const page = new URL(entryUrl(entry), base);
  let html = entry.rendered?.html ?? "";
  for (const [placeholder, json] of [...html.matchAll(/<img __ASTRO_IMAGE_="([^"]*)">/g)]) {
    const { src, alt = "" } = JSON.parse(decodeAttribute(json)) as { src: string; alt?: string };
    const file = decodeURI(new URL(src, new URL(`/src/content/journal/${entry.id}/`, "file:///")).pathname);
    const source = images[file];
    if (!source) throw new Error(`feed: journal/${entry.id} uses ${src}, which is not an image beside the entry`);
    const image = await getImage({ src: source });
    const width = image.attributes.width ?? source.width;
    const height = image.attributes.height ?? source.height;
    html = html.replace(
      placeholder,
      `<img src="${new URL(image.src, base).href}" alt="${escapeXml(alt)}" width="${width}" height="${height}">`,
    );
  }
  return html
    .replace(/(href|src)="\/(?!\/)/g, `$1="${base.origin}/`)
    .replace(/href="#/g, `href="${page.href}#`)
    .replaceAll("]]>", "]]]]><![CDATA[>");
}

export const GET: APIRoute = async ({ site: base }) => {
  if (!base) throw new Error("feed: `site` must be set in astro.config.mjs");
  const entries = await publishedEntries();
  const newest = entries
    .map((entry) => entry.data.updated ?? entry.data.published)
    .sort((a, b) => b.valueOf() - a.valueOf())[0];

  const items = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(entryUrl(entry), base).href;
      return [
        "<item>",
        `<title>${escapeXml(entry.data.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<pubDate>${entry.data.published.toUTCString()}</pubDate>`,
        `<description>${escapeXml(entry.data.summary)}</description>`,
        ...entry.data.techniques.map((technique) => `<category>${escapeXml(technique)}</category>`),
        `<content:encoded><![CDATA[${await entryHtml(entry, base)}]]></content:encoded>`,
        "</item>",
      ].join("");
    }),
  );

  const feed = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel>",
    `<title>${escapeXml(`${site.handle} · Journal`)}</title>`,
    `<link>${new URL("/journal/", base).href}</link>`,
    `<atom:link href="${new URL("/feed.xml", base).href}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml("Writeups for pwn challenges Taz wrote or solved, grouped by technique.")}</description>`,
    "<language>en</language>",
    newest ? `<lastBuildDate>${newest.toUTCString()}</lastBuildDate>` : "",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");

  return new Response(feed, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
