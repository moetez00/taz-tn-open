import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "./routes";

// Entries are found in the build, so the same tests cover every real entry.
const html = (route: string) => readFileSync(`dist${route}index.html`, "utf8");
const all = routes();
const entries = all.filter((route) => /^\/journal\/[^/]+\/[^/]+\/$/.test(route));
const drafts = entries.filter((route) => html(route).includes('class="badge badge-draft"'));
const withCode = entries.find((route) => html(route).includes('class="astro-code'));
const withDiff = entries.find((route) => html(route).includes('class="tk-mark"'));
const withFlag = entries.find((route) => html(route).includes('class="dream-nail"'));
const withToc = entries.find((route) => html(route).includes('class="toc"'));

test("the build has an entry for every component under test", () => {
  expect(entries.length).toBeGreaterThan(0);
  expect({ withCode, withFlag, withToc }).toEqual({
    withCode: expect.any(String),
    withFlag: expect.any(String),
    withToc: expect.any(String),
  });
});

for (const route of entries) {
  test(`${route} has its title, details and a way back`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("complementary", { name: "About this entry" })).toBeAttached();
    await expect(page.locator(".stamp time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
    const area = await page.locator(".crumb a").getAttribute("href");
    expect(all).toContain(area);
    for (const link of await page.locator(".series-nav a").all()) {
      expect(all).toContain(await link.getAttribute("href"));
    }
  });
}

for (const route of drafts) {
  test(`draft ${route} is marked and kept out of indexes`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(".stamp .badge-draft")).toHaveText("Draft");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
}

test("every visible entry is listed on the Journal index and on its area page", async ({ page }) => {
  await page.goto("/journal/");
  for (const route of entries) await expect(page.locator(`main a.row-title[href="${route}"]`)).toHaveCount(1);
  for (const route of entries) {
    const area = route.split("/").slice(0, 3).join("/") + "/";
    await page.goto(area);
    await expect(page.locator(`main a[href="${route}"]`)).toHaveCount(1);
  }
});

test("the Journal index is a scrolling list with a preview beside it, and no Authored for list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journal/");
  await expect(page.getByText("Authored for")).toHaveCount(0);
  expect(await page.locator(".jr-list").evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  const card = page.locator(".jr-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".jr-fig")).toBeVisible();
  // The preview mirrors the newest entry (published date, not route alphabetical order).
  const newest = await page.locator(".row-title").first().getAttribute("href");
  await expect(card.getByRole("link", { name: /Read full article/ })).toHaveAttribute("href", newest!);
  await page.locator(".jr-list > li").first().hover();
  await expect(card).toBeVisible();
});

test("the Journal preview follows the pointer, a click pins it, and the last rows preview too", async ({ page, isMobile }) => {
  test.skip(isMobile, "the previews step aside on touch widths");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journal/");
  const rows = page.locator(".jr-list > li");
  const shown = page.locator(".jr-pv.on .jr-title");
  const last = rows.last();
  await last.scrollIntoViewIfNeeded();
  await last.hover();
  await expect(shown).toHaveText((await last.locator(".row-title").innerText()).trim());
  // Leaving without a click goes back to the first entry.
  await page.mouse.move(700, 5);
  await expect(shown).toHaveText((await rows.first().locator(".row-title").innerText()).trim());
  // A click pins: the page stays, and the preview stays when the pointer leaves.
  const before = page.url();
  await last.locator(".row-title").click();
  await page.mouse.move(700, 5);
  expect(page.url()).toBe(before);
  await expect(shown).toHaveText((await last.locator(".row-title").innerText()).trim());
  // Clicking the pinned row again opens it.
  await last.locator(".row-title").click();
  await expect(page).not.toHaveURL(before);
});

test("the arrows walk the Journal list from anywhere and move the preview", async ({ page, isMobile }) => {
  test.skip(isMobile, "the previews step aside on touch widths");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journal/");
  const rows = page.locator(".jr-list > li");
  test.skip((await rows.count()) < 3, "needs three entries");
  const shown = page.locator(".jr-pv.on .jr-title");
  const title = async (i: number) => (await rows.nth(i).locator(".row-title").innerText()).trim();
  await page.waitForFunction(() => document.querySelector(".jr-list > li.on") && true);
  await page.keyboard.press("ArrowDown");
  await expect(shown).toHaveText(await title(1));
  await page.keyboard.press("ArrowDown");
  await expect(shown).toHaveText(await title(2));
  await page.keyboard.press("ArrowUp");
  await expect(shown).toHaveText(await title(1));
});

async function copyFrom(page: Page, index: number) {
  const block = page.locator(".code-block").nth(index);
  const button = block.getByRole("button", { name: "Copy code" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveText("Copied");
  await expect(page.getByRole("status")).toHaveText("Code copied to the clipboard.");
  return page.evaluate(() => navigator.clipboard.readText());
}

test("each code block gets a keyboard-operable copy button that copies its code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(withCode!);
  const blocks = page.locator(".prose pre.astro-code");
  await expect(page.locator(".code-block .copy")).toHaveCount(await blocks.count());
  const expected = await blocks.first().evaluate((pre) => pre.textContent);
  expect(await copyFrom(page, 0)).toBe(expected);
});

test("copied diffs leave out the +/- signs", async ({ page, context }) => {
  test.skip(!withDiff, "no entry in this build has a diff block");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(withDiff!);
  const index = await page
    .locator(".prose pre.astro-code")
    .evaluateAll((pres) => pres.findIndex((pre) => pre.querySelector(".tk-mark")));
  const copied = await copyFrom(page, index);
  expect(copied).not.toMatch(/^[+-]/m);
});

test("the Dream Nail keeps the flag hidden until opened, by keyboard too", async ({ page }) => {
  await page.goto(withFlag!);
  const nail = page.locator(".dream-nail");
  const flag = nail.locator(".thought code");
  await expect(nail).not.toHaveAttribute("open");
  await expect(flag).toBeHidden();
  await nail.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(nail).toHaveAttribute("open");
  await expect(flag).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(flag).toBeHidden();
});

test("contents links point at headings on the page", async ({ page }) => {
  await page.goto(withToc!);
  const targets = await page.locator(".toc a").evaluateAll((links) =>
    links.map((a) => decodeURIComponent((a as HTMLAnchorElement).hash.slice(1))),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const id of targets) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
});

async function parseXml(page: Page, path: string, type: RegExp) {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(type);
  const text = await response.text();
  // Parse on about:blank: the site's own pages enforce Trusted Types, which blocks DOMParser.
  await page.goto("about:blank");
  return page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return {
      error: doc.querySelector("parsererror")?.textContent ?? null,
      root: doc.documentElement.nodeName,
      links: [...doc.querySelectorAll("item > link, url > loc")].map((el) => new URL(el.textContent!).pathname),
    };
  }, text);
}

test("the feed is valid RSS with published entries only", async ({ page }) => {
  const feed = await parseXml(page, "/feed.xml", /^application\/rss\+xml/);
  expect(feed.error).toBeNull();
  expect(feed.root).toBe("rss");
  for (const path of feed.links) {
    expect(entries).toContain(path);
    expect(drafts).not.toContain(path);
  }
  expect(feed.links.length).toBe(entries.length - drafts.length);
});

test("the sitemap lists public pages only", async ({ page }) => {
  const sitemap = await parseXml(page, "/sitemap.xml", /^application\/xml/);
  expect(sitemap.error).toBeNull();
  expect(sitemap.root).toBe("urlset");
  expect(sitemap.links).toEqual(expect.arrayContaining(["/", "/journal/", "/projects/", "/about/"]));
  for (const path of sitemap.links) {
    expect(all).toContain(path);
    expect(drafts).not.toContain(path);
  }
});
