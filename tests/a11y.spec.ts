import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { routes } from "./routes";

for (const route of [...routes(), "/not-a-real-page/"]) {
  test(`axe finds no WCAG 2.2 AA issues on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Measure the settled page: an entrance animation mid-fade would read as low contrast.
    // The atmosphere (drifting art, motes) loops for ever and is decoration, so it is not waited for.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)).toEqual([]);
  });
}

for (const [key, name] of [["/", "Search"], ["?", "Keys"]] as const) {
  test(`axe finds no WCAG 2.2 AA issues with the ${name} layer open`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the layers are opened from the keyboard here");
    await page.goto("/");
    await page.keyboard.press(key);
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    if (name === "Search") await page.getByRole("searchbox").fill("a");
    // Let the entrance transition finish so contrast is measured on the settled layer.
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)).toEqual([]);
  });
}
