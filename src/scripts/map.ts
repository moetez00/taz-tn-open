// Inks in the pins of entries read and brought home (boot.js keeps the lists).
let inked = new Set<string>();
try {
  inked = new Set(JSON.parse(localStorage.getItem("taz:inked") ?? "[]") as string[]);
} catch {}

for (const link of document.querySelectorAll<Element>(".pin, [data-entry]")) {
  if (inked.has(link.getAttribute("href") ?? "")) link.classList.add("inked");
}

const count = document.querySelector<HTMLElement>(".count");
if (count) {
  const total = Number(count.dataset.total);
  const done = document.querySelectorAll(".pin.inked").length;
  count.textContent = `${done} of ${total} inked.`;
}
