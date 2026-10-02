#!/usr/bin/env node
// Until launch (M5), deploys live on a *.netlify.app address. Keep those out of
// search indexes; setting the repository variable SITE_STAGE=live turns this off.
import { appendFile } from "node:fs/promises";

if ((process.env.SITE_STAGE ?? "preview") === "live") {
  console.log("stage-headers: SITE_STAGE=live, headers unchanged");
} else {
  await appendFile(
    "dist/_headers",
    "\n# Added by scripts/stage-headers.mjs for pre-launch deploys.\n/*\n  X-Robots-Tag: noindex\n",
  );
  console.log("stage-headers: pre-launch deploy, added X-Robots-Tag: noindex");
}
