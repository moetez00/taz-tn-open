// The interaction engine (PLAN.md §3): one animation loop for everything that follows
// the pointer, the cursor and the hero's parallax, and one observer that lets the
// slow atmosphere rest while it is off screen. DOM APIs only, and nothing here is
// needed to use the site: without it the native cursor and the still art remain.
const root = document.documentElement;
const cursor = document.querySelector<HTMLElement>(".cursor");
const dot = cursor?.querySelector<HTMLElement>(".dot");
const follow = cursor?.querySelector<HTMLElement>(".follow");
const tag = cursor?.querySelector<HTMLElement>(".tag");
const layers = [...document.querySelectorAll<HTMLElement>("[data-depth]")];

// With reduced motion, or the Motion switch off, everything lands exactly where the pointer is.
const calm = () => root.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;

const pointer = { x: 0, y: 0 };
const ring = { x: 0, y: 0 };
const tilt = { x: 0, y: 0 };
const now = { x: 0, y: 0 };
let frame = 0;
let last = 0;
let heroShown = false;

function tick(time: number) {
  frame = 0;
  const dt = Math.min(64, time - last || 16);
  last = time;
  const still = calm();

  // The ring trails the point by about 60 ms.
  const trail = still ? 1 : 1 - Math.exp(-dt / 55);
  ring.x += (pointer.x - ring.x) * trail;
  ring.y += (pointer.y - ring.y) * trail;
  dot && (dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`);
  follow && (follow.style.transform = `translate3d(${ring.x.toFixed(2)}px, ${ring.y.toFixed(2)}px, 0)`);

  // Layers of the hero move 2 to 8 px against the pointer, the nearest most.
  const goal = still || !heroShown ? { x: 0, y: 0 } : tilt;
  const ease = still ? 1 : 1 - Math.exp(-dt / 180);
  now.x += (goal.x - now.x) * ease;
  now.y += (goal.y - now.y) * ease;
  for (const layer of layers) {
    const depth = Number(layer.dataset.depth);
    layer.style.translate = Math.abs(now.x) + Math.abs(now.y) < 0.002 ? "" : `${(-now.x * depth * 8).toFixed(2)}px ${(-now.y * depth * 5).toFixed(2)}px`;
  }

  const settled =
    Math.abs(pointer.x - ring.x) + Math.abs(pointer.y - ring.y) < 0.1 && Math.abs(goal.x - now.x) + Math.abs(goal.y - now.y) < 0.002;
  if (!settled) frame = requestAnimationFrame(tick);
}
const wake = () => frame || (frame = requestAnimationFrame(tick));

// What is under the pointer decides the ring and the word beside it.
const WORDS: Record<string, string> = { view: "◇ VIEW", read: "READ →", out: "↗", explore: "EXPLORE" };
function modeOf(el: Element): string {
  const link = el.closest<HTMLAnchorElement>("a[href]");
  if (link && link.origin !== location.origin) return "out";
  const marked = el.closest<HTMLElement>("[data-cursor]");
  if (marked) return marked.dataset.cursor ?? "";
  if (link) return "link";
  if (el.closest("button, summary, label, select, [role=button]")) return "button";
  if (el.closest("input, textarea")) return "text";
  return "";
}

if (cursor && tag && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  let shown = false;
  addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      tilt.x = (event.clientX / innerWidth - 0.5) * 2;
      tilt.y = (event.clientY / innerHeight - 0.5) * 2;
      if (!shown) {
        shown = true;
        ring.x = pointer.x;
        ring.y = pointer.y;
        root.dataset.cursor = "";
      }
      wake();
    },
    { passive: true },
  );
  document.addEventListener("pointerover", (event) => {
    const mode = modeOf(event.target as Element);
    if (cursor.dataset.mode === mode) return;
    cursor.dataset.mode = mode;
    tag.textContent = WORDS[mode] ?? "";
  });
  addEventListener("pointerdown", () => (cursor.dataset.down = ""));
  addEventListener("pointerup", () => delete cursor.dataset.down);
  // A pointer that has left the window has nothing to show.
  root.addEventListener("mouseleave", () => delete root.dataset.cursor);
  root.addEventListener("mouseenter", () => shown && (root.dataset.cursor = ""));
}

// The parallax only follows the pointer while the hero is on screen.
const hero = document.querySelector("[data-parallax]");
const rest = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (target === hero) heroShown = isIntersecting;
    if (isIntersecting) target.setAttribute("data-live", "");
    else target.removeAttribute("data-live");
  }
  wake();
});
document.querySelectorAll("[data-atmos]").forEach((el) => rest.observe(el));

export {};
