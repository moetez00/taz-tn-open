// The keyboard layer (PLAN.md §3.3) and the two layers it opens. DOM APIs only:
// the CSP enforces Trusted Types with no policies.
const root = document.documentElement;
// The digits follow the nav: Home, Projects, Journal, About.
const NAV = ["/", "/projects/", "/journal/", "/about/"];
// Rows (journal, lists) and cards (projects) are the things j and k move through.
const ROWS = "main :is(.rows a.row-title, .cards a.card-title)";

type Layer = "search" | "keys";

function openLayer(id: Layer) {
  const dialog = document.getElementById(`layer-${id}`) as HTMLDialogElement | null;
  if (!dialog || dialog.open) return;
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((open) => open.close());
  dialog.showModal();
  if (id === "search") void import("./search").then(({ attach }) => attach(dialog));
}

// Rows are moved through by focus, so Enter opens them natively and the CSS
// :has(:focus-visible) rules light the current one.
function move(step: number): boolean {
  const rows = [...document.querySelectorAll<HTMLAnchorElement>(ROWS)];
  if (rows.length === 0) return false;
  const at = rows.indexOf(document.activeElement as HTMLAnchorElement);
  const next = at === -1 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
  rows[next]!.focus();
  rows[next]!.scrollIntoView({ block: "nearest" });
  return true;
}

let lastG = 0;
addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing) return;
  // Ctrl or ⌘ K opens search from anywhere, even from inside a field.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openLayer("search");
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;

  const onRow = document.activeElement?.matches(ROWS) ?? false;
  let handled = true;
  switch (event.key) {
    case "j":
      handled = move(1);
      break;
    case "k":
      handled = move(-1);
      break;
    // Arrows keep scrolling the page until a row has focus.
    case "ArrowDown":
      handled = onRow && move(1);
      break;
    case "ArrowUp":
      handled = onRow && move(-1);
      break;
    case "1":
    case "2":
    case "3":
    case "4":
      location.assign(NAV[Number(event.key) - 1]!);
      break;
    case "/":
      openLayer("search");
      break;
    case "?":
      openLayer("keys");
      break;
    case "g":
      handled = event.timeStamp - lastG < 500;
      lastG = handled ? 0 : event.timeStamp;
      if (handled) scrollTo({ top: 0 });
      break;
    default:
      handled = false;
  }
  if (handled) event.preventDefault();
});

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const opener = target.closest<HTMLElement>("[data-open]");
  // A modified click (new tab, new window) still follows the link.
  if (opener && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
    event.preventDefault();
    openLayer(opener.dataset.open as Layer);
    return;
  }
  // A click on the backdrop lands on the dialog itself; a click inside lands on its panel.
  if (target instanceof HTMLDialogElement || target.closest("[data-close]")) {
    target.closest("dialog")?.close();
    return;
  }
  if (target.closest(".motion-toggle")) {
    const off = root.dataset.motion !== "off";
    if (off) root.dataset.motion = "off";
    else delete root.dataset.motion;
    try {
      localStorage.setItem("taz:motion", off ? "off" : "on");
    } catch {}
  }
});

// The pointer engine (world.ts) is not needed to read or navigate, so it stays out of the
// eager budget: it loads once the page has settled, like the search matcher on first open.
setTimeout(() => void import("./world"), 600);

export {};
