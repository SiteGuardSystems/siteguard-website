#!/usr/bin/env node
// Browser check: phone layout, menu, and the enquiry form (the storefront's
// /api/lead is stubbed). npm run build first.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(path.join(DIST, p));
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(p)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }); res.end(body);
  } catch { res.writeHead(404); res.end(await readFile(path.join(DIST, "404.html"))); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["/", "/services/", "/services/iso-ims/", "/library/", "/about/", "/contact/", "/legal/privacy/"]) {
    await page.goto(base + p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${p} scrolls sideways at 360px`);
  }
  await page.goto(base + "/");
  await page.click(".menu-toggle");
  assert.ok(await page.locator("#site-nav").isVisible());

  let posted;
  await page.route("**/api/lead", async (route) => { posted = JSON.parse(route.request().postData()); await route.fulfill({ json: { ok: true } }); });
  await page.goto(base + "/contact/");
  await page.fill('input[name="name"]', "Test Person");
  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('textarea[name="need"]', "ISO 45001 gap analysis");
  await page.click('button[type="submit"]');
  await page.locator(".form-status.ok").waitFor();
  assert.equal(posted.source, "systems");
  assert.equal(posted.need, "ISO 45001 gap analysis");
  assert.deepEqual(errors, []);
  console.log("e2e: all checks passed");
} finally { await browser.close(); server.close(); }
