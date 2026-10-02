import { expect, test, type Locator, type Page } from "@playwright/test";
import { routes } from "./routes";

// The motion layer (PLAN.md §3.2). View transitions exist only in Chromium-family
// and Safari; these tests run in Chromium, where they must be on.
const entry = routes().find((route) => /^\/journal\/[^/]+\/[^/]+\/$/.test(route))!;
const area = entry.split("/").slice(0, 3).join("/") + "/";

// Keep the page's view transition so its types can be read after boot.js has added them.
// Null means the page was revealed without one.
async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    addEventListener("pagereveal", (event) => {
      (window as unknown as { __vt: unknown }).__vt = (event as unknown as { viewTransition: unknown }).viewTransition ?? null;
    });
  });
}

// The URL changes when the new page commits, but pagereveal only fires at its first
// frame, after render-blocking resources; wait for it before reading.
const transition = async (page: Page) => {
  await page.waitForFunction(() => "__vt" in window);
  return page.evaluate(async () => {
    const vt = (window as unknown as { __vt?: ViewTransition & { types: Set<string> } }).__vt;
    if (!vt) return null;
    const skipped = await vt.ready.then(
      () => false,
      () => true,
    );
    await vt.finished;
    return { types: [...vt.types], skipped };
  });
};

// On wide screens a first click on a Journal row pins its preview; a second one opens the entry.
async function openRow(page: Page, row: Locator) {
  const split = await page.locator(".jr-pvs").isVisible();
  await row.click();
  if (split) await row.click();
}

test("opening an entry from its row is an 'open' transition; going back is 'close'", async ({ page }) => {
  await recordTransitions(page);
  await page.goto("/journal/");
  const row = page.locator(`main a.row-title[href="${entry}"]`);
  const name = await row.evaluate((el) => getComputedStyle(el).viewTransitionName);
  expect(name).toMatch(/^e-/);
  await openRow(page, row);
  await expect(page).toHaveURL(entry);
  expect(await transition(page)).toEqual({ types: ["open"], skipped: false });
  // The heading carries the same name as the row it came from.
  expect(await page.locator("h1").evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe(name);

  await page.goBack();
  await expect(page).toHaveURL("/journal/");
  expect((await transition(page))?.types).toEqual(["close"]);
});

test("moving between sections slides in nav order", async ({ page }) => {
  await recordTransitions(page);
  await page.goto("/journal/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about/");
  expect((await transition(page))?.types).toEqual(["next"]);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL("/projects/");
  expect((await transition(page))?.types).toEqual(["prev"]);
});

test("the Motion switch turns transitions off, and the choice persists", async ({ page }) => {
  await recordTransitions(page);
  await page.goto("/journal/");
  const toggle = page.getByRole("button", { name: "Motion: on" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Motion: off" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");

  await openRow(page, page.locator(`main a.row-title[href="${entry}"]`));
  await expect(page).toHaveURL(entry);
  // The old page skips it before capture, so the new page gets none (or, at most, a skipped one).
  expect([null, true]).toContain((await transition(page))?.skipped ?? null);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--t-spatial"))).toMatch(/^0m?s$/);
});

test("with reduced motion there is no view transition at all", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordTransitions(page);
  await page.goto("/journal/");
  await openRow(page, page.locator(`main a.row-title[href="${entry}"]`));
  await expect(page).toHaveURL(entry);
  expect(await transition(page)).toBeNull();
  await expect(page.locator(".motion")).toBeHidden();
});

test("the frame draws itself in on the first page of a session only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-first", "");
  await page.goto("/journal/");
  await expect(page.locator("html")).not.toHaveAttribute("data-first");
});

test("the reading line follows the scroll on entries, reduced motion included", async ({ page }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(entry);
    const scale = () =>
      page.locator(".progress").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(await scale()).toBeCloseTo(0, 2);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(scale).toBeCloseTo(1, 2);
  }
  await page.goto(area);
  await expect(page.locator(".progress")).toHaveCount(0);
});
