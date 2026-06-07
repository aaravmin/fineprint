// Screenshot a URL with Playwright (chromium) for the design-review loop.
//   node screenshot.mjs http://localhost:3000 [label]
// Saves a full-page PNG to ./temporary screenshots/screenshot-N[-label].png
// (auto-incremented, never overwritten). Captures desktop (1280) + mobile (390).
//
// Playwright is loaded from /tmp/shots/node_modules (shared install); if absent:
//   cd /tmp/shots && npx playwright install chromium
import { createRequire } from "node:module";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/tmp/shots/node_modules/");
const { chromium } = require("playwright");

const TARGET = process.argv[2] || "http://localhost:3000";
const LABEL = process.argv[3] ? `-${process.argv[3]}` : "";
const OUT = fileURLToPath(new URL("./temporary screenshots", import.meta.url));
mkdirSync(OUT, { recursive: true });

// Next index across existing screenshot-N*.png so nothing is overwritten.
function nextN() {
  let max = 0;
  for (const f of readdirSync(OUT)) {
    const m = /^screenshot-(\d+)/.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

const browser = await chromium.launch();
async function shoot(suffix, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: "networkidle", timeout: 30000 });
  // Force every scroll-reveal element visible so the full-page capture shows all
  // sections (the IntersectionObserver only fires for content in the viewport).
  await page.evaluate(() => {
    document.querySelectorAll(".rise").forEach(el => el.classList.add("in"));
  });
  await page.waitForTimeout(900); // let reveal + bar transitions settle
  const n = nextN();
  const file = join(OUT, `screenshot-${n}${LABEL}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  await ctx.close();
}

await shoot("desktop", 1280, 900);
await shoot("mobile", 390, 844);
await browser.close();
console.log("DONE");
