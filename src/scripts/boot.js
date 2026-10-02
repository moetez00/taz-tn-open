// Render-blocking, shipped as written: comments cost bytes. Sets the flags CSS reads
// and types each view transition open, close, next or prev (PLAN.md §3.2).
(() => {
  const root = document.documentElement;
  root.dataset.js = "";
  if (/Mac|iPhone|iPad/.test(navigator.userAgent)) root.dataset.mac = "";
  try {
    if (localStorage.getItem("taz:motion") === "off") root.dataset.motion = "off";
  } catch {}
  const still = () => root.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;

  const list = (key) => JSON.parse(localStorage.getItem(key) || "[]");
  const save = (key, items) => localStorage.setItem(key, JSON.stringify([...new Set(items)]));
  // Waits until the page is shown, not merely prerendered.
  const shown = () => {
    try {
      if (!sessionStorage.getItem("taz:seen")) {
        root.dataset.first = "";
        sessionStorage.setItem("taz:seen", "1");
      }
      // The map: an entry you open is read; coming home inks it.
      const path = location.pathname;
      if (/^\/journal\/[^/]+\/[^/]+\/$/.test(path)) save("taz:read", [...list("taz:read"), path]);
      else if (path === "/") save("taz:inked", [...list("taz:inked"), ...list("taz:read")]), localStorage.removeItem("taz:read");
    } catch {}
    root.dataset.ready = "";
  };
  if (document.prerendering) document.addEventListener("prerenderingchange", shown, { once: true });
  else shown();

  // Sections follow nav order; a detail page is an entry or a project sheet.
  const SECTION = { "": 1, projects: 2, journal: 3, about: 4 };
  const place = (url) => {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const head = parts[0] || "";
    const detail = (head === "journal" && parts.length === 3) || (head === "projects" && parts.length === 2);
    return [SECTION[head] || 0, parts.length, detail];
  };
  const typed = (event) => {
    const transition = event.viewTransition;
    if (!transition) return;
    if (still()) return transition.skipTransition();
    const nav = event.activation || (window.navigation && navigation.activation);
    if (!nav?.from || !nav.entry || !transition.types) return;
    const [fromSection, fromDepth, fromDetail] = place(nav.from.url);
    const [toSection, toDepth, toDetail] = place(nav.entry.url);
    let type = "";
    if (toDetail !== fromDetail) type = toDetail ? "open" : "close";
    else if (fromSection !== toSection) type = toSection > fromSection ? "next" : "prev";
    else if (fromDepth !== toDepth) type = toDepth > fromDepth ? "open" : "close";
    if (!type) return;
    transition.types.add(type);
    // The veil crosses the arriving page on a change of section.
    if (event.type === "pagereveal" && (type === "next" || type === "prev")) root.dataset.nav = type;
  };
  addEventListener("pageswap", typed);
  addEventListener("pagereveal", typed);
})();
