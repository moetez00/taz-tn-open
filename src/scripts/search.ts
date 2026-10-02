// The search layer's matcher, loaded on first open. Every term must match
// somewhere; title matches rank first. Results are built with DOM APIs only.
type Item = { t: string; u: string; m: string; x: string };

let index: Promise<Item[]> | undefined;
const LIMIT = 8;

function score(item: Item, terms: string[]): number {
  const title = item.t.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.split(/\s+/).some((word) => word.startsWith(term))) total += 4;
    else if (title.includes(term)) total += 3;
    else if (item.x.includes(term)) total += 1;
    else return 0;
  }
  return total;
}

export function attach(dialog: HTMLDialogElement) {
  if (dialog.dataset.ready) return;
  dialog.dataset.ready = "";
  const input = dialog.querySelector("input")!;
  const status = dialog.querySelector('[role="status"]')!;
  const list = dialog.querySelector("ol")!;
  index ??= fetch("/search.json").then((response) => response.json() as Promise<Item[]>);

  const render = async () => {
    const items = await index!;
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const found = terms.length
      ? items
          .map((item, order) => ({ item, order, score: score(item, terms) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score || a.order - b.order)
          .map(({ item }) => item)
      : items;
    list.replaceChildren(
      ...found.slice(0, LIMIT).map((item) => {
        const link = document.createElement("a");
        link.href = item.u;
        const title = document.createElement("span");
        title.textContent = item.t;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = item.m;
        link.append(title, meta);
        const row = document.createElement("li");
        row.append(link);
        return row;
      }),
    );
    status.textContent = terms.length ? `${found.length} ${found.length === 1 ? "result" : "results"}` : "";
  };

  input.addEventListener("input", render);
  // The quick filters fill the field with a word and search it.
  dialog.addEventListener("click", (event) => {
    const word = (event.target as Element).closest<HTMLElement>("[data-q]")?.dataset.q;
    if (word === undefined) return;
    input.value = input.value.trim() === word ? "" : word;
    input.focus();
    void render();
  });
  // ↓ from the field enters the results; ↑ and ↓ move through them; ↑ from the first returns.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [...list.querySelectorAll("a")];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = at + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) input.focus();
    else if (links[next]) links[next].focus();
    else return;
    event.preventDefault();
  });
  void render();
}
