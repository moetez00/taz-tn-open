// One view-transition-name per Journal entry, so a row's title can become the
// entry's heading (PLAN.md §3.4). A name can't come from a style attribute
// under the CSP, so this Vite plugin writes one rule per entry into a virtual
// stylesheet that Base.astro imports; it is bundled like any other CSS.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ID = "virtual:taz-vt-names.css";
// A path-like id ending in .css, so Vite's CSS pipeline takes it.
const RESOLVED = "/@taz/vt-names.css";

/** The name for a journal entry id ("area/entry"), shared by the CSS and the pages. */
export const vtName = (entryId) => entryId.replace("/", "--");

const folders = (path) =>
  existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];

export function vtNames() {
  return {
    name: "taz:vt-names",
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const base = join(process.cwd(), "src/content/journal");
      const entries = folders(base).flatMap((area) =>
        folders(join(base, area)).map((entry) => {
          const name = vtName(`${area}/${entry}`);
          return `.vt-${name}{view-transition-name:e-${name};view-transition-class:entry-title}`;
        }),
      );
      // A project card becomes its sheet (the box), and its title travels inside it.
      const projects = folders(join(process.cwd(), "src/content/projects")).flatMap((slug) => [
        `.vp-${slug}{view-transition-name:p-${slug};view-transition-class:card}`,
        `.vpt-${slug}{view-transition-name:pt-${slug};view-transition-class:entry-title}`,
      ]);
      return [...entries, ...projects].join("\n") + "\n";
    },
  };
}
