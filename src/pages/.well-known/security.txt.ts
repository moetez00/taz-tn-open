// RFC 9116. Rebuilt on every deploy, and CI deploys at least monthly (ci.yml's
// schedule), so Expires never goes stale. It is six months out: the RFC
// recommends less than a year.
import type { APIRoute } from "astro";
import { site as config } from "../../data/site";

const MONTHS = 6;

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("security.txt: `site` must be set in astro.config.mjs");
  const expires = new Date();
  expires.setUTCMonth(expires.getUTCMonth() + MONTHS);
  const body = [
    `Contact: mailto:${config.securityEmail}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en",
    `Canonical: ${new URL("/.well-known/security.txt", site).href}`,
    `Policy: ${new URL("/security/", site).href}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
