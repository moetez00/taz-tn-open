import { expect, test } from "@playwright/test";
import { routes } from "./routes";

// M4 extras (PLAN.md §2): security.txt, the theme exports, the hidden map, projects.
const entry = routes().find((route) => /^\/journal\/[^/]+\/[^/]+\/$/.test(route))!;

test("security.txt follows RFC 9116 and points at the policy", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const fields = Object.fromEntries(
    (await response.text())
      .trim()
      .split("\n")
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]),
  );
  expect(fields.Contact).toMatch(/^mailto:security@/);
  expect(fields.Canonical).toMatch(/\/\.well-known\/security\.txt$/);
  expect(new URL(fields.Policy!).pathname).toBe("/security/");
  // The RFC recommends expiry less than a year out; it must also still be in the future.
  const expires = Date.parse(fields.Expires!);
  expect(expires).toBeGreaterThan(Date.now());
  expect(expires - Date.now()).toBeLessThan(365 * 24 * 3600 * 1000);
});

test("the theme page's exports are copyable and match the tokens", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/theme/");
  const blocks = page.locator("pre.astro-code");
  await expect(blocks).toHaveCount(4);
  for (const label of ["taz.yaml", "kitty.conf", "hyprland.lua", "config.kdl"]) {
    await expect(page.locator(`pre[data-language="${label}"]`)).toHaveCount(1);
  }
  const cloak = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--cloak").trim());
  await expect(page.locator('pre[data-language="kitty.conf"]')).toContainText(`cursor ${cloak}`);
  await page.locator('pre[data-language="config.kdl"]').locator("..").getByRole("button", { name: "Copy code" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('active-color "' + cloak + '"');
});

test("reading an entry and coming home inks its pin on the hidden map", async ({ page }) => {
  await page.goto("/journal/map/");
  const pin = page.locator(`.pin[href="${entry}"]`);
  await expect(pin).not.toHaveClass(/inked/);
  await page.goto(entry);
  await page.goto("/journal/map/");
  await expect(pin).not.toHaveClass(/inked/); // read, but not yet brought home
  await page.goto("/");
  await page.goto("/journal/map/");
  await expect(pin).toHaveClass(/inked/);
  await expect(page.locator(".count")).toHaveText(/^1 of \d+ inked\.$/);
});

test("the map is reachable from the footer's mark and stays out of the sitemap", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Map" }).click();
  await expect(page).toHaveURL("/journal/map/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/journal/map/");
});

test("projects show their checked facts, and link out only where there is something to link to", async ({ page }) => {
  await page.goto("/projects/");
  const rows = page.locator(".cards > li");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const link of await page.locator(".cards .links a").all()) {
    expect(await link.getAttribute("href")).toMatch(/^https:\/\//);
  }
});

test("pages carry a share image", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\.png$/);
  const response = await page.request.get("/og.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});
