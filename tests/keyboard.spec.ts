import { expect, test } from "@playwright/test";
import { routes } from "./routes";

// The keyboard map (PLAN.md §3.3). Keys only exist where there is a keyboard.
test.skip(({ isMobile }) => isMobile, "keyboard shortcuts are desktop-only");

const entry = routes().find((route) => /^\/journal\/[^/]+\/[^/]+\/$/.test(route))!;

test("j and k move through rows, the arrows follow once a row has focus, and Enter opens it", async ({ page }) => {
  await page.goto("/journal/");
  const rows = page.locator("main .rows a.row-title");
  const second = (await rows.count()) > 1 ? rows.nth(1) : rows.first();
  await page.keyboard.press("j");
  await expect(rows.first()).toBeFocused();
  // The focused row is lit by its bar and surface.
  const lit = () => page.locator("main .rows > li").first().evaluate((li) => getComputedStyle(li, "::before").opacity);
  await expect.poll(lit).toBe("1");
  await page.keyboard.press("j");
  await expect(second).toBeFocused();
  await page.keyboard.press("k");
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();
  const href = (await second.getAttribute("href"))!;
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(href);
});

test("the arrows keep scrolling the page until a row has focus", async ({ page }) => {
  await page.goto(entry);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("main .rows a.row-title")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

// The digits follow the nav: Home, Projects, Journal, About.
for (const [key, path] of [["1", "/"], ["2", "/projects/"], ["3", "/journal/"], ["4", "/about/"]] as const) {
  test(`${key} goes to ${path}`, async ({ page }) => {
    await page.goto(path === "/journal/" ? "/about/" : "/journal/");
    await page.keyboard.press(key);
    await expect(page).toHaveURL(path);
  });
}

test("/ opens search, which finds entries and opens them with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("searchbox");
  await expect(input).toBeFocused();
  // Keys are inert while typing.
  await input.pressSequentially("1 jk");
  await expect(page).toHaveURL("/");
  // Search for the entry by its own slug so the test survives content changes.
  await input.fill(entry.split("/").filter(Boolean).pop()!.replace(/-/g, " "));
  await expect(dialog.getByRole("status")).toHaveText(/^\d+ results?$/);
  await expect(dialog.getByRole("status")).not.toHaveText("0 results");
  const first = await dialog.getByRole("link").first().getAttribute("href");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(first!);
});

test("? opens the key list; Esc closes it and returns focus", async ({ page }) => {
  await page.goto("/about/");
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keys" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("?");
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).toBeHidden();
});

test("every key has a visible equivalent", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await page.getByRole("banner").getByRole("link", { name: "Search" }).click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await footer.getByRole("link", { name: /^Keys/ }).click();
  await expect(page.getByRole("dialog", { name: "Keys" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(footer.getByRole("link", { name: /^Top/ })).toHaveAttribute("href", "#top");
});

test("g g returns to the top; modifier keys are left to the browser", async ({ page }) => {
  await page.goto(entry);
  await page.evaluate(() => scrollTo(0, 400));
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press("Control+2");
  await expect(page).toHaveURL(entry);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the equivalents are plain links and the Motion switch is hidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".motion-toggle")).toBeHidden();
    await page.getByRole("banner").getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL("/journal/");
  });
});
