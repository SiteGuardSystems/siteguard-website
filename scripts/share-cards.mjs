#!/usr/bin/env node
// Dev only (W14): draw the share-card PNGs for Consulting and Education pages.
//   npm run build && npm run share-cards
// Reads dist/share-cards.json (written by the build), draws each card at 1200x630 with Playwright,
// writes assets/share/<slug>.png and assets/share/cards.json, and removes cards no page uses.
// Set CHROMIUM_PATH to use a local Chromium. Not part of the build or CI; commit the results.
import { readFile, writeFile, readdir, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { shareCardHtml, shareSlug, CARD_W, CARD_H } from "./lib/share-cards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets/share");
const manifest = JSON.parse(await readFile(path.join(ROOT, "dist/share-cards.json"), "utf8"));
const font = (await readFile(path.join(ROOT, "assets/fonts/barlow-condensed-latin-700-normal.woff2"))).toString("base64");
const fontCss = `@font-face{font-family:"Barlow Condensed";font-weight:700;src:url(data:font/woff2;base64,${font}) format("woff2")}`;
const lockups = {};
await mkdir(OUT, { recursive: true });
// --disable-gpu: on some Windows machines a GPU Chromium closes its first page.
const browser = await chromium.launch({ args: ["--disable-gpu"], timeout: 120000, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const record = {};
try {
  const page = await (await browser.newContext({ viewport: { width: CARD_W, height: CARD_H } })).newPage();
  for (const c of manifest) {
    lockups[c.module] ??= await readFile(path.join(ROOT, `assets/brand/sg-${c.module}-lockup.svg`), "utf8");
    await page.setContent(shareCardHtml({ ...c, lockupSvg: lockups[c.module], fontCss }));
    await page.evaluate(() => document.fonts.ready);
    const slug = shareSlug(c.url);
    await page.screenshot({ path: path.join(OUT, `${slug}.png`), clip: { x: 0, y: 0, width: CARD_W, height: CARD_H } });
    record[slug] = { title: c.title, description: c.description, module: c.module };
    console.log(`card: ${slug}.png`);
  }
} finally { await browser.close(); }
for (const f of await readdir(OUT)) if (f.endsWith(".png") && !record[f.slice(0, -4)]) { await rm(path.join(OUT, f)); console.log(`removed unused card ${f}`); }
await writeFile(path.join(OUT, "cards.json"), JSON.stringify(record, null, 2) + "\n");
