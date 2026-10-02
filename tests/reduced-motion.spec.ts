import { expect, test } from "@playwright/test";
import { routes } from "./routes";

for (const route of routes()) {
  test(`nothing animates on ${route} with reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    const state = await page.evaluate(() => {
      const long = [...document.querySelectorAll("*")].filter((el) => {
        const s = getComputedStyle(el);
        const secs = (v: string) => Math.max(...v.split(",").map((t) => parseFloat(t) * (t.trim().endsWith("ms") ? 0.001 : 1)));
        return secs(s.transitionDuration) > 0.01 || secs(s.animationDuration) > 0.01;
      });
      // Scroll-driven animations follow the reader's own scrolling (the reading line), so they stay.
      const timed = document.getAnimations().filter((animation) => animation.timeline === document.timeline);
      return { running: timed.length, long: long.map((el) => el.tagName) };
    });
    expect(state).toEqual({ running: 0, long: [] });
  });
}
