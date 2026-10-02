#!/usr/bin/env node
// Draws the site's scenery: the hero's three depth layers and the projects banner,
// as SVG files in src/assets/art/ (committed, so builds never run this).
//
// Usage: node scripts/art.mjs
//
// The art is layered, not flat, so the hero can move each layer by a different
// amount (src/scripts/world.ts). To use your own artwork instead, replace the files
// below with images of the same proportions (1600 x 700 for the hero layers, 1600 x
// 280 for the banner); the pages reference them by name and need no other change.
//
// Colours are the palette's near-black and violet-blue, written out here because an
// SVG loaded as an image can't read the page's CSS variables.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "src", "assets", "art");
mkdirSync(OUT, { recursive: true });

const C = {
  void: "#06060a",
  deep: "#0b0c13",
  wall: "#10121c",
  stone: "#161927",
  far: "#1b1f31",
  rim: "#3a4066",
  rimHi: "#5b6494",
  glow: "#8fa3dd",
  pale: "#dedcea",
  paleShade: "#a9a8bd",
};

const f = (n) => Math.round(n * 10) / 10;

// mulberry32
function rng(seed) {
  let h = seed | 0;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An open Catmull-Rom curve through the points, as cubic Béziers (no leading M).
function smooth(points) {
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

// A row of teeth hanging from y = base between x0 and x1 (stalactites).
function teeth(rand, x0, x1, base, { minW = 10, maxW = 40, minL = 26, maxL = 180 } = {}) {
  let d = "";
  let x = x0;
  while (x < x1) {
    const w = minW + rand() * (maxW - minW);
    const len = minL + Math.pow(rand(), 1.7) * (maxL - minL);
    const tip = x + w + (rand() - 0.5) * w * 0.7;
    d += ` L${f(x)} ${f(base + (rand() - 0.5) * 8)} Q${f(x + w * 0.72)} ${f(base + len * 0.5)} ${f(tip)} ${f(base + len)} Q${f(x + w * 1.28)} ${f(base + len * 0.5)} ${f(x + 2 * w)} ${f(base)}`;
    x += 2 * w;
  }
  return d;
}

const svg = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;

const gradient = (id, stops, dir = "v") =>
  `<linearGradient id="${id}" ${dir === "v" ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"'}>${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join("")}</linearGradient>`;

const radial = (id, stops) =>
  `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;

// A pointed arch window, base centred at (cx, y), `h` tall.
const arch = (cx, y, w, h) =>
  `M${f(cx - w / 2)} ${f(y)}V${f(y - h * 0.62)}Q${f(cx - w / 2)} ${f(y - h * 0.9)} ${f(cx)} ${f(y - h)}Q${f(cx + w / 2)} ${f(y - h * 0.9)} ${f(cx + w / 2)} ${f(y - h * 0.62)}V${f(y)}Z`;

// A tower: a shaft, a needle of a roof, small pinnacles, a lit window and ledges.
function tower(cx, base, w, shaft, roof, { window = true } = {}) {
  const top = base - shaft;
  const tip = top - roof;
  let out = `<path fill="${C.far}" stroke="${C.rim}" stroke-opacity=".55" stroke-width="1" d="M${f(cx - w / 2)} ${base}V${f(top)}L${f(cx - w * 0.16)} ${f(top - roof * 0.42)}L${f(cx)} ${f(tip)}L${f(cx + w * 0.16)} ${f(top - roof * 0.42)}L${f(cx + w / 2)} ${f(top)}V${base}Z"/>`;
  // pinnacles at the shoulders
  for (const s of [-1, 1]) {
    const px = cx + s * (w / 2 + 3);
    out += `<path fill="${C.far}" stroke="${C.rim}" stroke-opacity=".5" d="M${f(px - 3)} ${f(top + 14)}L${f(px)} ${f(top - 22)}L${f(px + 3)} ${f(top + 14)}Z"/>`;
  }
  // ledges
  for (const t of [0.28, 0.55, 0.8]) {
    out += `<path stroke="${C.rim}" stroke-opacity=".4" stroke-width="1" d="M${f(cx - w / 2)} ${f(top + shaft * t)}H${f(cx + w / 2)}"/>`;
  }
  if (window) {
    out += `<path fill="url(#lamp)" d="${arch(cx, top + shaft * 0.5, w * 0.34, shaft * 0.34)}"/>`;
    out += `<path fill="${C.glow}" fill-opacity=".25" d="${arch(cx, top + shaft * 0.5, w * 0.34, shaft * 0.34)}"/>`;
  }
  return out;
}

// A curved spike (a thorn or a blade of rock) from (x, y), leaning by `lean`.
function spike(x, y, length, width, lean) {
  const tipX = x + lean;
  const tipY = y - length;
  return `M${f(x - width / 2)} ${f(y)}Q${f(x - width * 0.3 + lean * 0.3)} ${f(y - length * 0.55)} ${f(tipX)} ${f(tipY)}Q${f(x + width * 0.3 + lean * 0.6)} ${f(y - length * 0.5)} ${f(x + width / 2)} ${f(y)}Z`;
}

// The small horned wanderer, feet at (x, y), `s` times its natural size (about 46 tall).
function wanderer(x, y, s) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">
<path fill="${C.void}" stroke="${C.rimHi}" stroke-opacity=".55" stroke-width=".8" d="M-9.5 -30Q-15 -14 -17 0L-9 -3.5L-4 0H4L9 -3.5L17 0Q15 -14 9.5 -30Z"/>
<path fill="${C.void}" d="M-5 -30h10v13h-10z"/>
<path fill="${C.paleShade}" d="M-6.5 -35Q-12 -43 -10.5 -52Q-5.5 -46 -2.4 -37Z"/>
<path fill="${C.paleShade}" d="M6.5 -35Q12 -43 10.5 -52Q5.5 -46 2.4 -37Z"/>
<path fill="url(#mask)" d="M0 -40C6.6 -40 10 -35.5 10 -29.5 0 -19 0 -19 0 -19S0 -19 -10 -29.5C-10 -35.5 -6.6 -40 0 -40Z" transform="translate(0 -1)"/>
<path fill="${C.void}" d="M-5.6 -33.4c1.6-.2 3 1.6 3.4 4-1.6.8-3.6.2-4.4-1.2-.6-1-.2-2.6 1-2.8ZM5.6 -33.4c-1.6-.2-3 1.6-3.4 4 1.6.8 3.6.2 4.4-1.2.6-1 .2-2.6-1-2.8Z"/>
<path stroke="${C.pale}" stroke-opacity=".75" stroke-width="1" stroke-linecap="round" d="M12.5 -14L16.5 -41"/>
</g>`;
}

function motes(rand, count, w, h, { min = 0.7, max = 1.7, opacity = [0.25, 0.8] } = {}) {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${f(rand() * w)}" cy="${f(rand() * h)}" r="${f(min + rand() * (max - min))}" fill="${C.glow}" fill-opacity="${f(opacity[0] + rand() * (opacity[1] - opacity[0]))}"/>`;
  }
  return out;
}

const commonDefs = `${radial("lamp", [[0, "#dfe6ff", 0.95], [1, C.glow, 0.35]])}${gradient("mask", [[0, "#f3f1f9"], [1, C.paleShade]])}`;

// ---------------------------------------------------------------- hero, 1600 x 700
const W = 1600;
const H = 700;

// Far: the sky of the cavern, a shaft of light and the spire in the mist.
{
  const rand = rng(11);
  const cx = 840;
  const defs =
    commonDefs +
    gradient("sky", [[0, C.void], [0.55, "#0c0e18"], [1, "#171b2c"]]) +
    radial("haze", [[0, C.glow, 0.28], [1, C.glow, 0]]) +
    gradient("ray", [[0, C.glow, 0.09], [1, C.glow, 0]]) +
    gradient("mist", [[0, C.glow, 0], [0.7, "#2a3050", 0.5], [1, "#1c2036", 0.85]]);
  let body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  body += `<ellipse cx="${cx}" cy="330" rx="520" ry="330" fill="url(#haze)"/>`;
  body += `<path fill="url(#ray)" d="M${cx - 90} -20L${cx + 110} -20L${cx + 420} ${H}L${cx - 380} ${H}Z"/>`;
  body += motes(rand, 46, W, 430);
  // distant ridges either side of the spire
  body += `<path fill="#121525" d="M0 470${smooth([[0, 470], [140, 440], [300, 468], [470, 430], [620, 470], [700, 500]])}L700 ${H}L0 ${H}Z"/>`;
  body += `<path fill="#121525" d="M980 500${smooth([[980, 500], [1120, 452], [1260, 476], [1420, 430], [1600, 462]])}L1600 ${H}L980 ${H}Z"/>`;
  // the spire and its neighbours
  body += tower(cx - 150, 590, 46, 190, 118, { window: false });
  body += tower(cx + 150, 590, 46, 210, 130, { window: false });
  body += tower(cx - 78, 600, 54, 250, 150, { window: false });
  body += tower(cx + 80, 600, 54, 240, 146, { window: false });
  // buttresses between the towers
  for (const [a, b] of [[-150, -78], [80, 150]]) {
    body += `<path fill="none" stroke="${C.rim}" stroke-opacity=".45" d="M${cx + a + 23} 430Q${cx + (a + b) / 2} 388 ${cx + b - 27} 396"/>`;
  }
  body += tower(cx, 610, 92, 330, 200);
  // a low wall of masonry to seat them
  body += `<path fill="${C.far}" stroke="${C.rim}" stroke-opacity=".35" d="M${cx - 260} 640V585H${cx + 260}V640Z"/>`;
  body += `<rect y="470" width="${W}" height="${H - 470}" fill="url(#mist)"/>`;
  writeFileSync(join(OUT, "hero-far.svg"), svg(W, H, defs, body));
}

// Mid: the cavern walls, stalactites and hanging roots.
{
  const rand = rng(23);
  const defs = gradient("wallL", [[0, C.deep], [1, C.wall]], "h") + gradient("fog", [[0, C.glow, 0], [1, "#2c3354", 0.35]]);
  let body = "";
  // ceiling with teeth
  body += `<path fill="${C.deep}" d="M-20 -20L-20 44${teeth(rand, -20, 560, 44, { minW: 12, maxW: 44, minL: 30, maxL: 230 })}L560 44${teeth(rand, 560, 1100, 34, { minW: 10, maxW: 30, minL: 18, maxL: 110 })}L1100 34${teeth(rand, 1100, 1620, 46, { minW: 12, maxW: 46, minL: 30, maxL: 250 })}L1620 46V-20Z" stroke="${C.rim}" stroke-opacity=".28"/>`;
  // left wall
  const left = [[210, -20], [250, 90], [196, 210], [242, 330], [170, 450], [214, 580], [160, 720]];
  body += `<path fill="url(#wallL)" stroke="${C.rim}" stroke-opacity=".3" d="M-40 -20L210 -20${smooth(left)}L-40 720Z"/>`;
  // right wall
  const right = [[1390, -20], [1350, 100], [1408, 230], [1360, 350], [1420, 480], [1370, 600], [1430, 720]];
  body += `<path fill="url(#wallL)" stroke="${C.rim}" stroke-opacity=".3" d="M1640 -20L1390 -20${smooth(right)}L1640 720Z"/>`;
  // hanging roots
  for (const [x, len, bow] of [[330, 230, 26], [372, 150, -18], [1180, 250, -30], [1240, 170, 22], [1290, 300, -24]]) {
    body += `<path fill="none" stroke="${C.rim}" stroke-opacity=".55" stroke-width="1.2" d="M${x} 40Q${x + bow} ${40 + len * 0.55} ${x + bow * 0.4} ${40 + len}"/>`;
    body += `<circle cx="${x + bow * 0.4}" cy="${40 + len}" r="2" fill="${C.rimHi}" fill-opacity=".7"/>`;
  }
  body += motes(rand, 22, W, 520, { opacity: [0.2, 0.55] });
  body += `<rect y="380" width="${W}" height="320" fill="url(#fog)"/>`;
  writeFileSync(join(OUT, "hero-mid.svg"), svg(W, H, defs, body));
}

// Near: the bridge, the wanderer, the rocks and thorns in front.
{
  const rand = rng(37);
  const defs = commonDefs + gradient("rock", [[0, "#0b0c14"], [1, C.void]]);
  let body = "";
  // the left mound
  body += `<path fill="url(#rock)" stroke="${C.rim}" stroke-opacity=".4" d="M-40 ${H}L-40 560${smooth([[-40, 560], [90, 548], [210, 566], [330, 540], [450, 566], [520, 590]])}L520 ${H}Z"/>`;
  // the bridge: a humped deck with an arch cut under it
  body += `<path fill="${C.stone}" stroke="${C.rimHi}" stroke-opacity=".5" stroke-width="1.2" d="M440 596Q740 478 1040 596L1040 632Q740 522 440 632Z"/>`;
  body += `<path fill="none" stroke="${C.rim}" stroke-opacity=".45" d="M450 610Q740 500 1030 610"/>`;
  body += `<path fill="${C.void}" d="M520 ${H}Q520 600 740 600Q960 600 960 ${H}Z"/>`;
  // the right mound and its thorns
  body += `<path fill="url(#rock)" stroke="${C.rim}" stroke-opacity=".4" d="M980 ${H}L980 600${smooth([[980, 600], [1090, 574], [1200, 596], [1330, 566], [1460, 594], [1640, 560]])}L1640 ${H}Z"/>`;
  let thorns = "";
  for (let i = 0; i < 16; i++) {
    const x = 1130 + i * 30 + rand() * 14;
    const len = 60 + rand() * 120 * (0.5 + Math.sin((i / 15) * Math.PI));
    thorns += `<path fill="${C.void}" stroke="${C.rimHi}" stroke-opacity=".5" stroke-width=".9" d="${spike(x, 640 - Math.sin((i / 15) * Math.PI) * 10, len, 16 + rand() * 10, -14 + rand() * 60)}"/>`;
  }
  body += thorns;
  // grass and leaves on the left mound
  for (let i = 0; i < 26; i++) {
    const x = 20 + i * 20 + rand() * 12;
    body += `<path fill="${C.void}" d="${spike(x, 560 + rand() * 24, 26 + rand() * 60, 5 + rand() * 4, -10 + rand() * 20)}"/>`;
  }
  // the wanderer, standing on the crest of the bridge
  body += wanderer(732, 519, 1.22);
  body += `<ellipse cx="732" cy="521" rx="26" ry="3" fill="${C.void}" fill-opacity=".8"/>`;
  // a few foreground specks
  body += motes(rand, 14, W, H, { min: 1, max: 2.4, opacity: [0.15, 0.45] });
  writeFileSync(join(OUT, "hero-near.svg"), svg(W, H, defs, body));
}

// ---------------------------------------------------------------- banner, 1600 x 280
{
  const rand = rng(53);
  const BW = 1600;
  const BH = 280;
  const defs =
    commonDefs +
    gradient("dusk", [[0, "#0b0d17"], [1, "#161a2b"]]) +
    radial("moon", [[0, "#e6ecff", 0.55], [0.22, C.glow, 0.28], [1, C.glow, 0]]) +
    gradient("veil", [[0, C.glow, 0], [1, "#2a3050", 0.45]]);
  let body = `<rect width="${BW}" height="${BH}" fill="url(#dusk)"/>`;
  body += `<ellipse cx="560" cy="120" rx="360" ry="230" fill="url(#moon)"/>`;
  body += `<circle cx="560" cy="96" r="30" fill="#dfe6ff" fill-opacity=".42"/>`;
  body += motes(rand, 40, BW, 200);
  // far pillars
  for (const [x, w, top] of [[860, 30, 70], [930, 22, 110], [1010, 26, 60], [1100, 18, 120]]) {
    body += `<path fill="${C.far}" fill-opacity=".8" d="M${x} ${BH}V${top + 20}L${x + w / 2} ${top}L${x + w} ${top + 20}V${BH}Z"/>`;
  }
  body += `<rect y="120" width="${BW}" height="160" fill="url(#veil)"/>`;
  // ceiling
  body += `<path fill="${C.deep}" stroke="${C.rim}" stroke-opacity=".3" d="M-20 -10L-20 18${teeth(rand, -20, 500, 18, { minW: 10, maxW: 34, minL: 20, maxL: 120 })}L500 18${teeth(rand, 500, 1000, 12, { minW: 8, maxW: 24, minL: 10, maxL: 60 })}L1000 12${teeth(rand, 1000, 1620, 20, { minW: 10, maxW: 36, minL: 20, maxL: 130 })}L1620 20V-10Z"/>`;
  // the ledge the wanderer stands on, and the rocks below it
  body += `<path fill="${C.void}" stroke="${C.rimHi}" stroke-opacity=".45" d="M-20 ${BH}L-20 232${smooth([[-20, 232], [140, 218], [300, 226], [430, 206], [560, 210], [700, 222], [820, 246]])}L820 ${BH}Z"/>`;
  body += wanderer(560, 208, 1.35);
  for (let i = 0; i < 22; i++) {
    const x = 60 + i * 34 + rand() * 20;
    body += `<path fill="${C.void}" d="${spike(x, 226 + rand() * 10, 16 + rand() * 40, 5 + rand() * 4, -8 + rand() * 16)}"/>`;
  }
  // thorns bottom right
  for (let i = 0; i < 10; i++) {
    const x = 1350 + i * 26 + rand() * 10;
    body += `<path fill="${C.void}" stroke="${C.rimHi}" stroke-opacity=".4" stroke-width=".8" d="${spike(x, BH + 2, 30 + rand() * 70, 12 + rand() * 8, -8 + rand() * 30)}"/>`;
  }
  writeFileSync(join(OUT, "banner.svg"), svg(BW, BH, defs, body));
}

console.log("wrote hero-far.svg, hero-mid.svg, hero-near.svg and banner.svg to src/assets/art/");
