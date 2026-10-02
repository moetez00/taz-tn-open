// Content model (PLAN.md §5). Front matter is checked at build time, so a
// malformed entry fails the build instead of rendering wrong.
import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const areas = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/areas" }),
  schema: z.object({
    name: z.string(),
    blurb: z.string(),
    order: z.number().int(),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/events" }),
  schema: z.object({
    name: z.string(),
    organizer: z.string().optional(),
    year: z.number().int().optional(),
    role: z.enum(["author", "player"]),
    note: z.string().optional(),
    result: z.object({ rank: z.number().int(), of: z.number().int().optional() }).optional(),
    ctftime: z.url().optional(),
    url: z.url().optional(),
    order: z.number().int().default(0),
  }),
});

const journal = defineCollection({
  // One folder per entry, images beside index.md: journal/<area>/<entry>/index.md.
  loader: glob({
    pattern: "**/index.md",
    base: "./src/content/journal",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ""),
  }),
  schema: z
    .object({
      title: z.string(),
      area: reference("areas"),
      // Challenge writeups say whose challenge it was; general notes leave it out.
      role: z.enum(["author", "player", "found"]).optional(),
      event: reference("events").optional(),
      published: z.coerce.date(),
      updated: z.coerce.date().optional(),
      summary: z.string().default(""),
      techniques: z.array(z.string()).default([]),
      difficulty: z.enum(["easy", "medium", "hard", "insane"]).optional(),
      arch: z.enum(["amd64", "aarch64", "i386", "arm", "other"]).optional(),
      points: z.number().int().optional(),
      series: z.object({ id: z.string(), part: z.number().int() }).optional(),
      source: z.url().optional(),
      solver: z.url().optional(),
      runLocally: z.boolean().default(false),
      flag: z.string().optional(),
      draft: z.boolean().default(false),
      lang: z.literal("en").default("en"),
    })
    .refine((entry) => entry.draft || entry.summary.trim().length > 0, {
      message: "a published entry needs a summary (it is the index line and the meta description)",
      path: ["summary"],
    }),
});

// Field notes (PLAN.md §2). Facts only where they can be checked; the case study
// itself is the Markdown body, and a project gets its own page once it has one.
const projects = defineCollection({
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/projects",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(["live", "archived", "course"]).optional(),
    url: z.url().optional(),
    repo: z.url().optional(),
    stack: z.array(z.string()).default([]),
    role: z.string().optional(),
    period: z.object({ from: z.coerce.date(), to: z.coerce.date().optional() }).optional(),
    commits: z
      .object({ mine: z.number().int(), total: z.number().int(), contributors: z.number().int().optional() })
      .optional(),
    facts: z.array(z.string()).default([]),
    order: z.number().int(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { areas, events, journal, projects };
