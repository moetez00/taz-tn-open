#!/usr/bin/env node
// Serves dist/ the way Netlify will: pretty URLs with trailing-slash
// redirects, 404.html, gzip, and every response header from dist/_headers.
// Playwright and Lighthouse CI run against this server, so local tests see
// the real Content-Security-Policy.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { extname, join, resolve, sep } from "node:path";
import { headersFor, parseHeadersFile } from "./lib/headers-file.mjs";

const root = resolve(process.env.DIST ?? "dist");
const port = Number(process.env.PORT ?? 4322);
const host = process.env.HOST ?? "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".xml", ".txt", ".svg"]);

const rules = parseHeadersFile(await readFile(join(root, "_headers"), "utf8").catch(() => ""));

async function isFile(path) {
  return stat(path).then((s) => s.isFile(), () => false);
}

async function resolvePath(pathname) {
  const target = resolve(root, "." + pathname);
  if (target !== root && !target.startsWith(root + sep)) return { status: 404 };
  if (pathname.endsWith("/")) {
    const index = join(target, "index.html");
    return (await isFile(index)) ? { status: 200, file: index } : { status: 404 };
  }
  if (await isFile(join(target, "index.html"))) return { status: 301, location: pathname + "/" };
  if (pathname === "/_headers") return { status: 404 };
  return (await isFile(target)) ? { status: 200, file: target } : { status: 404 };
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  let { status, file, location } = await resolvePath(pathname);
  if (status === 404) file = join(root, "404.html");

  for (const [name, value] of headersFor(rules, pathname)) res.setHeader(name, value);

  if (status === 301) {
    res.writeHead(301, { Location: location }).end();
    return;
  }

  const ext = extname(file);
  let body = await readFile(file);
  if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", TYPES[ext] ?? "application/octet-stream");
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    body = gzipSync(body);
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
  }
  res.writeHead(status);
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(port, host, () => {
  console.log(`listening on http://${host}:${port}`);
});
