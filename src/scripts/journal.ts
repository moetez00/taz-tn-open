// The Journal index: the row under the pointer is previewed, and a click pins it, so the
// preview stays when the pointer leaves. The first row is .on in the markup (no script, first).
const split = document.querySelector<HTMLElement>(".jr-split");
if (split) {
  const rows = [...split.querySelectorAll<HTMLElement>(".jr-list > li")];
  const cards = split.querySelectorAll<HTMLElement>(".jr-pv");
  // Only the first card has its chrome in the markup, to keep the page in its HTML budget
  // (PLAN.md §6). The rest are only ever shown by this script, so they get copies first.
  const [first, ...rest] = cards;
  if (first) {
    const corners = [...first.querySelectorAll(".pc")];
    const stars = first.querySelector(".jr-stars")!;
    for (const card of rest) {
      card.firstElementChild!.prepend(...corners.map((corner) => corner.cloneNode(true)));
      card.firstElementChild!.append(stars.cloneNode(true));
    }
  }
  const at = (target: EventTarget | null) => rows.indexOf((target as Element).closest(".jr-list > li")!);
  let pin = 0;
  let over = -1;
  const show = () =>
    rows.forEach((row, i) => {
      const on = i === (over < 0 ? pin : over);
      row.classList.toggle("on", on);
      cards[i]?.classList.toggle("on", on);
    });

  split.addEventListener("pointerover", (e) => {
    const card = (e.target as Element).closest(".jr-pv");
    over = card ? [...cards].indexOf(card as HTMLElement) : at(e.target);
    show();
  });
  split.addEventListener("pointerleave", () => ((over = -1), show()));
  split.addEventListener("focusin", (e) => {
    const i = at(e.target);
    // Keyboard focus selects; a mouse click's focus must not, or its click would open the entry.
    if (i >= 0 && (e.target as Element).matches(":focus-visible")) (pin = i), (over = -1), show();
  });
  // Up and down walk the list from anywhere on the page (keys.ts takes over once a row has
  // focus). At either end they fall through, so the page still scrolls to its edges.
  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if ((e.target as Element).closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
    if (getComputedStyle(split.querySelector(".jr-pvs")!).display === "none") return;
    const next = pin + (e.key === "ArrowDown" ? 1 : -1);
    if (!rows[next]) return;
    e.preventDefault();
    pin = next;
    over = -1;
    show();
    rows[next]!.querySelector("a")!.focus({ preventScroll: true });
    rows[next]!.scrollIntoView({ block: "nearest" });
  });
  split.addEventListener("click", (e) => {
    const i = at(e.target);
    // A plain pointer click on a row pins it; a second one on the pinned row, the preview's
    // link and the keyboard open the entry.
    if (i < 0 || i === pin || e.detail === 0 || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (getComputedStyle(split.querySelector(".jr-pvs")!).display === "none") return;
    e.preventDefault();
    pin = i;
    show();
  });
}
export {};
