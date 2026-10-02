import { expect, test } from "@playwright/test";
import { routes } from "./routes";

const FONT_BUDGET = 100 * 1024;

for (const route of routes()) {
  test(`${route} loads only first-party resources within the font budget`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const foreign: string[] = [];
    const failed: string[] = [];
    const fonts: Promise<number>[] = [];

    page.on("request", (req) => {
      if (!req.url().startsWith(origin) && !req.url().startsWith("data:")) foreign.push(req.url());
    });
    page.on("response", (res) => {
      if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
      if (res.url().endsWith(".woff2")) fonts.push(res.body().then((b) => b.length));
    });

    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);

    const fontBytes = (await Promise.all(fonts)).reduce((a, b) => a + b, 0);
    expect(foreign).toEqual([]);
    expect(failed).toEqual([]);
    expect(fontBytes).toBeLessThanOrEqual(FONT_BUDGET);
  });
}
