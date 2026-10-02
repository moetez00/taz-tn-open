import { getCollection, type CollectionEntry } from "astro:content";
import { vtName } from "./vt-names.mjs";

export type Entry = CollectionEntry<"journal">;
export type Area = CollectionEntry<"areas">;
export type Event = CollectionEntry<"events">;

// Drafts show in dev and on pre-launch previews, where they are reviewed.
// Once SITE_STAGE=live (PLAN.md §8, M5) they are left out of every page, the feed and the sitemap.
export const showDrafts = import.meta.env.DEV || process.env.SITE_STAGE !== "live";

export const entryUrl = (entry: Entry) => `/journal/${entry.id}/`;
/** Class carrying the entry's view-transition-name. Only one element per page may use it. */
export const vtClass = (entry: Entry) => `vt-${vtName(entry.id)}`;
export const areaUrl = (areaId: string) => `/journal/${areaId}/`;

const newestFirst = (a: Entry, b: Entry) =>
  b.data.published.valueOf() - a.data.published.valueOf() || a.data.title.localeCompare(b.data.title);

function checkPlacement(entry: Entry) {
  const parts = entry.id.split("/");
  if (parts.length !== 2) {
    throw new Error(`journal/${entry.id}: entries live at journal/<area>/<entry>/index.md`);
  }
  if (parts[0] !== entry.data.area.id) {
    throw new Error(`journal/${entry.id}: the folder says "${parts[0]}" but the front matter says area "${entry.data.area.id}"`);
  }
}

/** Entries this build shows, newest first. */
export async function visibleEntries(): Promise<Entry[]> {
  const entries = await getCollection("journal", (entry) => showDrafts || !entry.data.draft);
  entries.forEach(checkPlacement);
  return entries.sort(newestFirst);
}

/** Published entries only, whatever the stage: the feed and the sitemap use these. */
export async function publishedEntries(): Promise<Entry[]> {
  return (await visibleEntries()).filter((entry) => !entry.data.draft);
}

/** Areas that have at least one entry, in their set order, each with its entries. */
export async function groupByArea(entries: Entry[]): Promise<{ area: Area; entries: Entry[] }[]> {
  const areas = (await getCollection("areas")).sort((a, b) => a.data.order - b.data.order);
  return areas
    .map((area) => ({ area, entries: entries.filter((entry) => entry.data.area.id === area.id) }))
    .filter((group) => group.entries.length > 0);
}

export async function eventsById(): Promise<Map<string, Event>> {
  return new Map((await getCollection("events")).map((event) => [event.id, event]));
}

/** Minutes to read at 230 words a minute, code included. */
export function readingMinutes(body = ""): number {
  const words = body.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / 230));
}

export const ROLE = {
  author: { badge: "author", label: "Challenge author" },
  player: { badge: "player", label: "Solved in competition" },
  found: { badge: "found", label: "Found in the wild" },
} as const;
