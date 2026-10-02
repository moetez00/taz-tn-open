import { expect, test } from "@playwright/test";
import { routes } from "./routes";

for (const route of routes()) {
  test(`no CSP or Trusted Types violations on ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __violations: string[] };
      w.__violations = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        w.__violations.push(`${e.effectiveDirective} ${e.blockedURI}`);
      });
    });

    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-security-policy"]).toContain("default-src 'none'");
    await page.waitForLoadState("networkidle");

    const violations = await page.evaluate(
      () => (window as unknown as { __violations: string[] }).__violations,
    );
    expect(violations).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
