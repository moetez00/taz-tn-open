// The index behind the / layer: pages, areas and every entry this build shows.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { areaUrl, entryUrl, groupByArea, visibleEntries } from "../lib/journal";

export const GET: APIRoute = async () => {
  const entries = await visibleEntries();
  const groups = await groupByArea(entries);
  const areaName = new Map(groups.map(({ area }) => [area.id, area.data.name]));
  const projects = (await getCollection("projects", (project) => !project.data.draft)).sort(
    (a, b) => a.data.order - b.data.order,
  );

  const items = [
    ...entries.map((entry) => ({
      t: entry.data.title,
      u: entryUrl(entry),
      m: [areaName.get(entry.data.area.id), ...entry.data.techniques, entry.data.draft ? "draft" : ""]
        .filter(Boolean)
        .join(" · "),
      // "journal" and "pwn" are the search layer's quick filters, so entries carry them.
      x: [
        "journal",
        entry.data.area.id === "web" ? "" : "pwn",
        areaName.get(entry.data.area.id),
        ...entry.data.techniques,
        entry.data.summary,
      ]
        .join(" ")
        .toLowerCase(),
    })),
    ...projects.map(({ id, data }) => ({
      t: data.title,
      u: `/projects/${id}/`,
      m: ["Project", ...data.stack.slice(0, 3)].join(" · "),
      x: ["projects", data.summary, ...data.stack].join(" ").toLowerCase(),
    })),
    ...groups.map(({ area, entries }) => ({
      t: area.data.name,
      u: areaUrl(area.id),
      m: `Area · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`,
      x: area.data.blurb.toLowerCase(),
    })),
    ...[
      ["Journal", "/journal/", "writeups index"],
      ["Projects", "/projects/", "web apps field notes"],
      ["About", "/about/", "bio results contact keys keyboard"],
    ].map(([t, u, x]) => ({ t, u, m: "Page", x })),
  ];

  return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
