// The "taz" Shiki theme and the transformer that turns its colours into classes.
//
// Shiki writes style="color:…" on every token, which the CSP (style-src 'self')
// blocks. The transformer replaces each colour with a class from code.css and
// throws on any style it doesn't know, so an unhandled case fails the build
// instead of shipping an inline style. Colours come from tokens.css, the same
// file the contrast gate checks.
//
// Astro caches rendered Markdown in node_modules/.astro and does not notice
// changes to this file: delete that folder before rebuilding.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
const token = (name) => {
  const value = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i"))?.[1];
  if (!value) throw new Error(`code theme: --${name} is missing from tokens.css`);
  return value.toLowerCase();
};

const color = {
  background: token("raised"),
  text: token("code-text"),
  strong: token("code-strong"),
  literal: token("code-literal"),
  comment: token("code-comment"),
  punct: token("code-punct"),
};

// Highlight what readers scan for (literals, comments, definitions) and leave
// keywords in the text colour: their shape already marks them.
/** @type {import("shiki").ThemeRegistration} */
export const tazTheme = {
  name: "taz",
  type: "dark",
  colors: { "editor.background": color.background, "editor.foreground": color.text },
  tokenColors: [
    { settings: { foreground: color.text, background: color.background } },
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: color.comment },
    },
    {
      scope: [
        "string",
        "punctuation.definition.string",
        "constant.numeric",
        "constant.language",
        "constant.character",
        "constant.other",
        "support.constant",
        "keyword.other.unit",
        "markup.inline.raw",
      ],
      settings: { foreground: color.literal },
    },
    {
      scope: [
        "entity.name.function",
        "entity.name.type",
        "entity.name.class",
        "entity.name.struct",
        "entity.name.section",
        "entity.name.tag",
        "markup.heading",
        "markup.inserted",
      ],
      settings: { foreground: color.strong },
    },
    {
      scope: ["punctuation", "keyword.operator", "meta.brace", "markup.deleted"],
      settings: { foreground: color.punct },
    },
  ],
};

const CLASS_FOR = new Map([
  [color.strong, "tk-strong"],
  [color.literal, "tk-literal"],
  [color.comment, "tk-comment"],
  [color.punct, "tk-punct"],
]);

function addClass(node, name) {
  const current = node.properties.class;
  const list = Array.isArray(current) ? current : typeof current === "string" ? current.split(/\s+/) : [];
  node.properties.class = [...list.filter(Boolean), name].join(" ");
}

function styleToClasses(node) {
  const style = node.properties?.style;
  if (style === undefined) return;
  delete node.properties.style;
  for (const declaration of String(style).split(";")) {
    const [property, value] = declaration.split(":").map((part) => part?.trim().toLowerCase());
    if (!property) continue;
    if (property === "color") {
      if (value === color.text) continue;
      const name = CLASS_FOR.get(value);
      if (!name) throw new Error(`code theme: no class for colour ${value}`);
      addClass(node, name);
    } else if (property === "user-select" && value === "none") {
      addClass(node, "tk-mark"); // diff +/- signs, which Astro splits into their own span
    } else {
      throw new Error(`code theme: unexpected inline style "${declaration.trim()}"`);
    }
  }
}

export function tokenClasses() {
  return {
    name: "taz:token-classes",
    // Runs after Astro's own pre hook, which adds background and overflow styles; code.css sets those.
    pre(node) {
      delete node.properties.style;
    },
    span(node) {
      styleToClasses(node);
    },
    // Astro's own line hook nests each diff sign in a styled span inside the first token.
    line(node) {
      const walk = (parent) => {
        for (const child of parent.children ?? []) {
          if (child.type !== "element") continue;
          styleToClasses(child);
          walk(child);
        }
      };
      walk(node);
    },
  };
}
