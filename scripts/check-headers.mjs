#!/usr/bin/env node
// Gate: the security headers from PLAN.md §7.
//   node scripts/check-headers.mjs              checks the rules in dist/_headers
//   node scripts/check-headers.mjs --url <url>  checks a live deploy's actual responses
import { readFile } from "node:fs/promises";
import { headersFor, parseHeadersFile } from "./lib/headers-file.mjs";

const PAGES = ["/", "/journal/", "/projects/", "/about/", "/404.html"];

const REQUIRED_CSP = {
  "default-src": "'none'",
  "script-src": "'self'",
  "style-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
  "require-trusted-types-for": "'script'",
};
const FORBIDDEN_SOURCES = new Set([
  "'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'",
  "data:", "blob:", "http:", "https:", "*",
]);
const EXACT = {
  "x-content-type-options": /^nosniff$/i,
  "x-frame-options": /^deny$/i,
  "referrer-policy": /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i,
  "cross-origin-opener-policy": /^same-origin$/i,
  "cross-origin-resource-policy": /^same-origin$/i,
  "permissions-policy": /camera=\(\).*geolocation=\(\).*microphone=\(\)/i,
};

function check(get) {
  const errors = [];
  const csp = get("content-security-policy");
  if (!csp) {
    errors.push("missing Content-Security-Policy");
  } else {
    const directives = new Map(
      csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name.toLowerCase(), values];
      }),
    );
    for (const [name, expected] of Object.entries(REQUIRED_CSP)) {
      const actual = directives.get(name)?.join(" ");
      if (actual === undefined) errors.push(`CSP lacks ${name}`);
      else if (actual !== expected) errors.push(`CSP ${name} is "${actual}", expected "${expected}"`);
    }
    for (const [name, values] of directives) {
      for (const value of values) {
        if (FORBIDDEN_SOURCES.has(value.toLowerCase())) errors.push(`CSP ${name} allows ${value}`);
      }
    }
  }

  const hsts = get("strict-transport-security") ?? "";
  if (Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0) < 31536000) errors.push("HSTS max-age below one year");
  if (!/includesubdomains/i.test(hsts)) errors.push("HSTS lacks includeSubDomains");
  if (!/\bpreload\b/i.test(hsts)) errors.push("HSTS lacks preload");

  for (const [name, re] of Object.entries(EXACT)) {
    const value = get(name);
    if (!value) errors.push(`missing ${name}`);
    else if (!re.test(value)) errors.push(`${name} is "${value}"`);
  }
  return errors;
}

const urlFlag = process.argv.indexOf("--url");
const problems = [];

if (urlFlag > -1) {
  const base = process.argv[urlFlag + 1];
  if (!base) {
    console.error("check-headers: --url needs a value");
    process.exit(1);
  }
  // Just after a publish, a CDN edge can serve the previous deploy for a moment,
  // so a failing live check is retried a few times before it counts.
  for (let attempt = 1; attempt <= 4; attempt++) {
    problems.length = 0;
    for (const path of PAGES) {
      const res = await fetch(new URL(path, base), { redirect: "manual" });
      for (const e of check((name) => res.headers.get(name))) problems.push(`${path}: ${e}`);
    }
    if (problems.length === 0 || attempt === 4) break;
    console.log(`check-headers: ${problems.length} problem(s) on attempt ${attempt}; retrying in 5 s`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
} else {
  const rules = parseHeadersFile(await readFile("dist/_headers", "utf8"));
  for (const path of PAGES) {
    const merged = headersFor(rules, path);
    for (const e of check((name) => merged.get(name))) problems.push(`${path}: ${e}`);
  }
}

if (problems.length) {
  console.error("check-headers: problems\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`check-headers: ${PAGES.length} paths carry the full header set${urlFlag > -1 ? " (live)" : ""}`);
