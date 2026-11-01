#!/usr/bin/env node
// Dev only: screenshots of the built site (npm run build first) for a PR.
//   node scripts/screenshots.mjs [outDir] [/path/ ...]
// Default: the App hub, the home page and one page per module, at 1280 px,
// into docs/screenshots/module-colour/. Set CHROMIUM_PATH to use a local
// Chromium. Not part of the build or CI.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const [outArg, ...paths] = process.argv.slice(2);
const OUT = path.resolve(ROOT, outArg ?? "docs/screenshots/module-colour");
const PAGES = paths.length ? paths : ["/app/", "/", "/app/safety/", "/app/quality/", "/app/environmental/", "/app/management/",
  "/audit/", "/education/", "/consulting/", "/app/trade-packages/", "/planning/inspections/"];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try { const body = await readFile(path.join(DIST, p)); res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  for (const p of PAGES) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    const name = p === "/" ? "home" : p.replace(/^\/|\/$/g, "").replace(/\//g, "-");
    // Planner pages: just the SiteGuard Audit cross-link card.
    const cross = p.startsWith("/planning/") ? await page.$(".plan-cross") : null;
    if (cross) { await cross.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`${name}.png`); continue; }
    // The App hub and the home page down to their cards; other pages: the head and first section.
    const card = p === "/" || p === "/app/" ? await page.$(".mod-cards") : null;
    const box = card ? await card.boundingBox() : null;
    const height = Math.min(2400, Math.max(1000, box ? Math.ceil(box.y + box.height + 40) : 1000));
    await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: 1280, height }, fullPage: true });
    console.log(`${name}.png`);
  }
} finally { await browser.close(); server.close(); }
