// The /theme exports (PLAN.md §2): the site's palette and motion as config for
// other tools. Everything is read from tokens.css, so the exports can't drift
// from the site. Formats were checked against upstream docs on 2026-09-29:
// tinted-theming/schemes (base16), Hyprland's example/hyprland.lua and wiki,
// and niri's Configuration:-Animations and Configuration:-Layout pages.
import tokensCss from "../styles/tokens.css?raw";

const root = tokensCss.slice(tokensCss.indexOf(":root"), tokensCss.indexOf("}", tokensCss.indexOf(":root")));
const token = (name: string) => {
  const value = root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`theme export: --${name} is missing from tokens.css`);
  return value;
};

export const PALETTE = ["void", "raised", "line", "line-2", "soul", "ash", "dust", "cloak-deep", "cloak"].map((name) => ({
  name,
  hex: token(name),
}));

const hex = (name: string) => token(name).toLowerCase();
const ms = (name: string) => Number.parseFloat(token(name));
const bezier = (name: string) => token(name).match(/cubic-bezier\(([^)]+)\)/)![1]!.split(",").map((n) => Number(n));

// The spring behind --spring (tokens.css): critically damped, stiffness 800, mass 1.
const SPRING = { mass: 1, stiffness: 800, dampingRatio: 1 };
const criticalDamping = (2 * Math.sqrt(SPRING.stiffness * SPRING.mass)).toFixed(2);

// base16 slots. The site has one accent, so the scheme stays in its palette:
// greys, the parchment of code literals, and the cloak's amber. No new hues.
const BASE16: [string, string, string][] = [
  ["base00", "void", "background"],
  ["base01", "raised", "raised surfaces, status bars"],
  ["base02", "line", "selection"],
  ["base03", "dust", "comments"],
  ["base04", "ash", "secondary text"],
  ["base05", "code-text", "text"],
  ["base06", "soul", "bright text"],
  ["base07", "code-strong", "brightest text"],
  ["base08", "cloak", "errors, deletions"],
  ["base09", "code-literal", "numbers, constants"],
  ["base0A", "code-strong", "types, search"],
  ["base0B", "code-literal", "strings, insertions"],
  ["base0C", "ash", "escapes, regular expressions"],
  ["base0D", "code-strong", "functions, headings"],
  ["base0E", "soul", "keywords"],
  ["base0F", "cloak", "deprecated"],
];
const slot = Object.fromEntries(BASE16.map(([slot, name]) => [slot, hex(name)]));

export const base16 = [
  'system: "base16"',
  'name: "taz"',
  'author: "Moetez Zouari (https://taz.tn)"',
  'variant: "dark"',
  "palette:",
  ...BASE16.map(([slotName, name, use]) => `  ${slotName}: "${hex(name)}" # ${name}: ${use}`),
].join("\n");

// kitty: the usual base16 → ANSI mapping, with the cursor and the active border in the cloak's amber.
const ANSI = ["base00", "base08", "base0B", "base0A", "base0D", "base0E", "base0C", "base05"];
const BRIGHT = ["base03", "base08", "base0B", "base0A", "base0D", "base0E", "base0C", "base07"];
export const kitty = [
  "# taz, for kitty.conf",
  `foreground ${slot.base05}`,
  `background ${slot.base00}`,
  `selection_foreground ${slot.base06}`,
  `selection_background ${slot.base02}`,
  `cursor ${hex("cloak")}`,
  `cursor_text_color ${slot.base00}`,
  `url_color ${slot.base0D}`,
  `active_border_color ${hex("cloak")}`,
  `inactive_border_color ${hex("line")}`,
  ...[...ANSI, ...BRIGHT].map((name, i) => `color${i} ${slot[name]}`),
].join("\n");

const deciseconds = (name: string) => +(ms(name) / 100).toFixed(2);
const points = (name: string) => {
  const [x1, y1, x2, y2] = bezier(name);
  return `{ {${x1}, ${y1}}, {${x2}, ${y2}} }`;
};
const rgba = (name: string) => `rgba(${hex(name).slice(1)}ff)`;

export const hyprland = [
  "-- taz, for hyprland.lua. Durations are in deciseconds (Hyprland's speed).",
  `hl.curve("taz",         { type = "spring", mass = ${SPRING.mass}, stiffness = ${SPRING.stiffness}, damping = ${criticalDamping} }) -- critically damped: no bounce`,
  `hl.curve("tazDecel",    { type = "bezier", points = ${points("decel")} })`,
  `hl.curve("tazAccel",    { type = "bezier", points = ${points("accel")} })`,
  `hl.curve("tazStandard", { type = "bezier", points = ${points("standard")} })`,
  "",
  `hl.animation({ leaf = "windows",    enabled = true, speed = ${deciseconds("t-spatial")}, spring = "taz" })`,
  `hl.animation({ leaf = "windowsIn",  enabled = true, speed = ${deciseconds("t-spatial")}, spring = "taz",         style = "popin 98%" })`,
  `hl.animation({ leaf = "windowsOut", enabled = true, speed = ${deciseconds("t-exit")},  bezier = "tazAccel",    style = "popin 98%" })`,
  `hl.animation({ leaf = "layersIn",   enabled = true, speed = ${deciseconds("t-layer")},    bezier = "tazDecel",    style = "fade" })`,
  `hl.animation({ leaf = "layersOut",  enabled = true, speed = ${deciseconds("t-exit")},  bezier = "tazAccel",    style = "fade" })`,
  `hl.animation({ leaf = "fade",       enabled = true, speed = ${deciseconds("t-effect")},  bezier = "tazStandard" })`,
  `hl.animation({ leaf = "border",     enabled = true, speed = ${deciseconds("t-effect")},  bezier = "tazStandard" })`,
  `hl.animation({ leaf = "workspaces", enabled = true, speed = ${deciseconds("t-spatial")}, spring = "taz",         style = "slide" })`,
  "",
  "hl.config({",
  "    general = {",
  "        border_size = 2,",
  "        col = {",
  `            active_border   = "${rgba("cloak")}",`,
  `            inactive_border = "${rgba("line")}",`,
  "        },",
  "    },",
  "})",
].join("\n");

const spring = `spring damping-ratio=${SPRING.dampingRatio.toFixed(1)} stiffness=${SPRING.stiffness} epsilon=0.0001`;
const curve = (name: string) => `curve "cubic-bezier" ${bezier(name).join(" ")}`;

export const niri = [
  "// taz, for niri's config.kdl",
  "layout {",
  "    focus-ring {",
  "        width 2",
  `        active-color "${hex("cloak")}"`,
  `        inactive-color "${hex("line")}"`,
  "    }",
  "}",
  "",
  "animations {",
  `    workspace-switch { ${spring}; }`,
  `    horizontal-view-movement { ${spring}; }`,
  `    window-movement { ${spring}; }`,
  `    window-resize { ${spring}; }`,
  "    window-open {",
  `        duration-ms ${ms("t-spatial")}`,
  `        ${curve("decel")}`,
  "    }",
  "    window-close {",
  `        duration-ms ${ms("t-exit")}`,
  `        ${curve("accel")}`,
  "    }",
  "}",
].join("\n");
