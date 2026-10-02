import { readdirSync } from "node:fs";
import { join } from "node:path";

// Every built page, derived from dist/ so new content is tested automatically.
export function routes(dir = "dist", prefix = "/"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith("_")) {
      found.push(...routes(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name === "index.html") {
      found.push(prefix);
    }
  }
  return found.sort();
}
