import { expect, test } from "@playwright/test";

test("the skip link is the first stop and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("focus shows the amber active border", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
  });
  expect(outline).toEqual({ style: "solid", width: "2px", color: "rgb(198, 142, 88)" });
});

for (const [path, label] of [
  ["/journal/", "Journal"],
  ["/projects/", "Projects"],
  ["/about/", "About"],
] as const) {
  test(`${label} is marked as the current page on ${path}`, async ({ page }) => {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  });
}

test("unknown paths return the 404 page, out of search indexes", async ({ page }) => {
  const response = await page.goto("/not-a-real-page/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This path isn’t on the map.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("paths without a trailing slash redirect to the canonical form", async ({ request }) => {
  const response = await request.get("/journal", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toBe("/journal/");
});
