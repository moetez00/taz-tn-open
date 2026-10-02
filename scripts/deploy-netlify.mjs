#!/usr/bin/env node
// Deploys a zip of dist/ through Netlify's API and waits until it is live.
// No Netlify CLI: one HTTPS upload, then status polling.
// Needs NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID in the environment.
import { readFile, writeFile } from "node:fs/promises";

const token = process.env.NETLIFY_AUTH_TOKEN;
const site = process.env.NETLIFY_SITE_ID;
if (!token || !site) {
  console.error("deploy: NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID must be set");
  process.exit(1);
}

const API = "https://api.netlify.com/api/v1";
const auth = { Authorization: `Bearer ${token}` };
const fail = (message) => {
  console.error(`deploy: ${message}`);
  process.exit(1);
};

const zip = await readFile(process.argv[2] ?? "site.zip");
const created = await fetch(`${API}/sites/${encodeURIComponent(site)}/deploys`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/zip" },
  body: zip,
});
if (!created.ok) fail(`upload failed with HTTP ${created.status}`);

let deploy = await created.json();
const deadline = Date.now() + 5 * 60_000;
while (deploy.state !== "ready" && deploy.state !== "error") {
  if (Date.now() > deadline) fail(`still "${deploy.state}" after five minutes`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const res = await fetch(`${API}/deploys/${deploy.id}`, { headers: auth });
  if (!res.ok) fail(`status check failed with HTTP ${res.status}`);
  deploy = await res.json();
}
if (deploy.state === "error") fail(`Netlify reported: ${deploy.error_message ?? "unknown error"}`);

// "Ready" doesn't mean visitors get it: locked publishing, or a Git build that
// finished later, leaves production on another deploy.
let project;
for (let attempt = 1; ; attempt++) {
  const res = await fetch(`${API}/sites/${encodeURIComponent(site)}`, { headers: auth });
  if (!res.ok) fail(`project lookup failed with HTTP ${res.status}`);
  project = await res.json();
  if (project.published_deploy?.id === deploy.id) break;
  if (attempt === 10) fail(`deploy ${deploy.id} is ready, but production serves ${project.published_deploy?.id ?? "nothing"}`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

const result = {
  id: deploy.id,
  deployUrl: deploy.deploy_ssl_url ?? deploy.deploy_url,
  siteUrl: deploy.ssl_url ?? deploy.url,
};
await writeFile("deploy.json", JSON.stringify(result, null, 2) + "\n");
console.log(`deploy: live at ${result.siteUrl} (this deploy: ${result.deployUrl})`);

// A project linked to Git runs its own builds, and those publish the raw
// repository (README → Deploys). netlify.toml cancels them; this makes the link itself fail CI.
const repo = project.build_settings?.repo_url || project.build_settings?.repo_path;
if (repo && !project.build_settings?.stop_builds) {
  fail(`the Netlify project is linked to ${repo} and builds from it. Unlink it (README → Deploys).`);
}
