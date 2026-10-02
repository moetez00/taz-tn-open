// Layout for the hidden map (/journal/map, PLAN.md §2): each area with entries is
// an ink-drawn region around "you are here", and each entry a pin inside it.
// Shapes are seeded by the area's id, so the map only changes when content does.
import type { Area, Entry } from "./journal";

export const VIEW = { width: 1000, height: 640 };
export const HOME = { x: VIEW.width / 2, y: VIEW.height / 2 };

export interface Pin {
  entry: Entry;
  x: number;
  y: number;
  route: string;
}

export interface Region {
  area: Area;
  outline: string;
  label: { x: number; y: number };
  pins: Pin[];
}

// mulberry32, seeded from the id: deterministic "hand-drawn" wobble.
function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

// A closed Catmull-Rom curve through the points, as cubic Béziers.
function closedCurve(points: { x: number; y: number }[]): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n]!;
  let d = `M${round(at(0).x)} ${round(at(0).y)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(p2.x)} ${round(p2.y)}`;
  }
  return `${d} Z`;
}

// A gently curved route from home to a pin, bowed to one side like a path on paper.
function route(to: { x: number; y: number }, bend: number): string {
  const mid = { x: (HOME.x + to.x) / 2, y: (HOME.y + to.y) / 2 };
  const dx = to.x - HOME.x;
  const dy = to.y - HOME.y;
  const control = { x: mid.x - dy * bend, y: mid.y + dx * bend };
  return `M${HOME.x} ${HOME.y} Q${round(control.x)} ${round(control.y)} ${round(to.x)} ${round(to.y)}`;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function layout(groups: { area: Area; entries: Entry[] }[]): Region[] {
  const n = groups.length;
  return groups.map(({ area, entries }, i) => {
    const rand = random(area.id);
    // Regions sit on an ellipse around home, starting at the top.
    const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
    const spread = n === 1 ? 0.55 : 1;
    const centre = {
      x: HOME.x + Math.cos(angle) * 330 * spread,
      y: HOME.y + Math.sin(angle) * 195 * spread,
    };
    const radius = Math.min(118, 58 + 16 * Math.sqrt(entries.length));
    const outline = closedCurve(
      Array.from({ length: 13 }, (_, k) => {
        const a = (k / 13) * Math.PI * 2;
        const r = radius * (0.84 + rand() * 0.3);
        return { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r * 0.82 };
      }),
    );
    // Pins spread like sunflower seeds inside the region.
    const pins = entries.map((entry, j) => {
      const r = radius * 0.55 * Math.sqrt((j + 0.5) / entries.length);
      const a = j * GOLDEN + rand() * 0.4;
      const at = { x: round(centre.x + Math.cos(a) * r), y: round(centre.y + Math.sin(a) * r * 0.82) };
      return { entry, ...at, route: route(at, (rand() - 0.5) * 0.5) };
    });
    // The name sits above its region, kept inside the frame.
    return { area, outline, label: { x: round(centre.x), y: round(Math.max(26, centre.y - radius * 0.82 - 16)) }, pins };
  });
}
