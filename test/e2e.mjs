#!/usr/bin/env node
// Browser check: phone layout, menu, and the enquiry form (the storefront's
// /api/lead is stubbed). npm run build first. Then (WP-S12) the FORMS shop and
// the cart: a second build with the shop on, checking out against a mocked
// checkout engine (the real engine and Stripe test mode come with WP-S9).
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const serve = (DIST) => createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(path.join(DIST, p));
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(p)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }); res.end(body);
  } catch { res.writeHead(404); res.end(await readFile(path.join(DIST, "404.html"))); }
});
const server = serve(DIST);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
// The shop build: FORMS out of beta, checkout on, a mocked engine origin.
const ENGINE = "https://engine.example.test";
const SHOP_DIST = await mkdtemp(path.join(tmpdir(), "sg-e2e-shop-"));
execFileSync(process.execPath, [path.join(ROOT, "build.mjs"), "--beta=false", "--checkout=true"], { env: { ...process.env, DIST_DIR: SHOP_DIST, CHECKOUT_ENGINE: ENGINE }, stdio: "ignore" });
const shopServer = serve(SHOP_DIST);
await new Promise((r) => shopServer.listen(0, r));
const shop = `http://127.0.0.1:${shopServer.address().port}`;
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];
// Every page type at 360 px: no sideways scroll.
const PAGES_360 = ["/", "/consulting/", "/consulting/iso-ims/", "/consulting/retainers/", "/library/", "/about/", "/contact/", "/legal/privacy/",
  "/app/", "/app/trade-packages/", "/app/trade-packages/civil-works/", "/app/builder-bundles/", "/app/safety/", "/audit/", "/audit/checklists/", "/register-interest/", "/planning/", "/planning/vic/", "/education/"];
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of PAGES_360) {
    await page.goto(base + p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${p} scrolls sideways at 360px`);
  }
  await page.goto(base + "/");
  await page.click(".menu-toggle");
  assert.ok(await page.locator("#site-nav").isVisible());
  assert.ok(await page.locator("#site-nav .nav-status").isVisible(), "status button in the open menu");
  assert.ok(!(await page.locator("#site-nav [data-cart]").isVisible()), "cart hidden until checkout exists");
  const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await wide.goto(base + "/");
  assert.ok(await wide.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "desktop header fits");
  await wide.close();

  let posted;
  await page.route("**/api/lead", async (route) => { posted = JSON.parse(route.request().postData()); await route.fulfill({ json: { ok: true } }); });
  await page.goto(base + "/contact/");
  await page.fill('input[name="name"]', "Test Person");
  await page.fill('input[name="email"]', "delivered@resend.dev");
  await page.fill('textarea[name="need"]', "ISO 45001 gap analysis");
  await page.click('button[type="submit"]');
  await page.locator(".form-status.ok").waitFor();
  assert.equal(posted.source, "systems");
  assert.equal(posted.need, "ISO 45001 gap analysis");

  // Register interest: ?interest=audit preselects Audit; consent recorded only when ticked.
  posted = undefined;
  await page.goto(base + "/register-interest/?interest=audit");
  assert.ok(await page.locator('input[name="interest"][value="audit"]').isChecked());
  await page.fill('input[name="name"]', "Test Person");
  await page.fill('input[name="email"]', "delivered@resend.dev");
  await page.selectOption('select[name="trade"]', "HSEQ consultant");
  await page.check('input[name="consent"]');
  await page.click('button[type="submit"]');
  await page.locator(".form-status.ok").waitFor();
  assert.equal(posted.enquiry_type, "app-interest");
  assert.equal(posted.interest, "audit");
  assert.equal(posted.trade, "HSEQ consultant");
  assert.equal(posted.consent, "yes");
  assert.match(posted.consent_wording, /^Email me about the SiteGuard App/);
  assert.match(posted.consent_source, /\/register-interest\/$/);
  posted = undefined;
  await page.goto(base + "/register-interest/");
  await page.fill('input[name="name"]', "Test Person");
  await page.fill('input[name="email"]', "delivered@resend.dev");
  await page.click('button[type="submit"]');
  await page.locator(".form-status.ok").waitFor();
  assert.equal(posted.interest, "both");
  assert.equal(posted.consent, "");
  assert.equal(posted.consent_wording, "");
  assert.deepEqual(errors, []);

  // ---- Dan, 1 Nov 2026 (#94): FORMS in beta (the default build): the shop is
  // browsable here, the single-documents list loads, and nothing can be bought.
  await page.goto(base + "/forms/documents/");
  await page.locator("[data-doc-table] tbody tr").first().waitFor();
  assert.equal(await page.locator("[data-add-doc]:visible, [data-add-pack]:visible").count(), 0, "no Add buttons in beta");
  assert.ok(await page.locator("[data-beta-notice]").isVisible(), "beta notice on the shop");
  assert.ok(!(await page.locator("#site-nav [data-cart]").isVisible()), "no cart in beta");
  await page.goto(base + "/forms/builder-packs/");
  assert.equal(await page.locator("[data-add-pack], [data-add-doc]").count(), 0, "no buy buttons on the pack pages in beta");
  assert.deepEqual(errors, []);

  // ---- WP-S12: the FORMS shop and one cart, checkout to the (mocked) engine ----
  const cat = JSON.parse(await readFile(path.join(ROOT, "data/catalogue.json"), "utf8"));
  const pack = cat.packs.find((p) => p.show && p.prices?.one_off && p.purchasable && p.group === "builder-packs");
  const doc = cat.documents.find((d) => d.sellable);
  const sp = await browser.newPage({ viewport: { width: 360, height: 780 } });
  sp.on("pageerror", (e) => errors.push(e.message));
  sp.on("console", (m) => { if (m.type() === "error" && !/engine\.example\.test|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  for (const p of ["/forms/", "/forms/trade-packs/", "/forms/builder-packs/", "/forms/documents/", "/forms/subscriptions/", "/forms/how-ordering-works/", "/forms/faq/", "/cart/"]) {
    await sp.goto(shop + p);
    assert.ok(await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${p} scrolls sideways at 360px`);
  }
  // Add a pack, add it again (refused), add a single document from the finder.
  await sp.goto(shop + "/forms/builder-packs/");
  await sp.click(`[data-add-pack="${pack.id}"]`);
  await sp.click(`[data-add-pack="${pack.id}"]`);
  assert.equal(await sp.locator("[data-cart-count]").first().textContent(), "(1)");
  await sp.goto(shop + "/forms/documents/");
  await sp.fill('[data-doc-filters] input[name="q"]', doc.code);
  await sp.locator(`[data-add-doc="${doc.code}"]`).click();
  await sp.goto(shop + "/");
  assert.equal(await sp.locator("[data-cart-count]").first().textContent(), "(2)", "the cart follows you round the whole site");
  await sp.click(".menu-toggle");
  assert.ok(await sp.locator("#site-nav [data-cart]").isVisible(), "cart in the open menu");
  // Cart page: both lines at catalogue prices, ex GST subtotal; remove one.
  await sp.goto(shop + "/cart/");
  assert.equal(await sp.locator(".cart-table tbody tr").count(), 2);
  const sub = await sp.locator(".cart-table tfoot td.num").first().textContent();
  assert.equal(sub, "$" + (pack.prices.one_off + doc.price).toLocaleString("en-AU"));
  await sp.locator(".cart-table [data-remove]").last().click();
  assert.equal(await sp.locator(".cart-table tbody tr").count(), 1);
  // Checkout refuses without the terms box, then posts to the engine origin.
  await sp.click('[data-checkout-form] button[type="submit"]');
  assert.match(await sp.locator("[data-checkout-form] [data-status]").textContent(), /Tick the box/);
  let sent, seenOrigin;
  await sp.route(`${ENGINE}/api/checkout`, async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": shop, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    sent = JSON.parse(req.postData()); seenOrigin = req.headers()["origin"];
    if (!sent.acceptedTerms) return route.fulfill({ status: 400, headers: cors, json: { reason: "Accept the terms." } });
    return route.fulfill({ status: 200, headers: cors, json: { url: `${shop}/order/success/?session_id=cs_test_mock` } });
  });
  await sp.check('[data-checkout-form] input[name="accept"]');
  await sp.fill("#cart-site-name", "Riverside Stage 2");
  await sp.click('[data-checkout-form] button[type="submit"]');
  await sp.waitForURL(/\/order\/success\//);
  assert.deepEqual(sent.cart, [{ packageId: pack.id }]);
  assert.equal(sent.acceptedTerms, true);
  assert.match(sent.termsVersion, /^SG-LEGAL-02 v[\d.]+; SG-LEGAL-01 v[\d.]+$/);
  assert.equal(sent.siteName, "Riverside Stage 2");
  assert.equal(sent.returnOrigin, shop);
  assert.equal(sent.source_site, "systems");
  assert.equal(seenOrigin, shop);
  assert.equal(await sp.locator("[data-cart-count]").first().textContent(), "(0)", "the cart empties on the success page");
  // An engine refusal is shown and the button comes back.
  await sp.goto(shop + "/forms/builder-packs/");
  await sp.click(`[data-add-pack="${pack.id}"]`);
  await sp.unroute(`${ENGINE}/api/checkout`);
  await sp.route(`${ENGINE}/api/checkout`, (route) => route.fulfill({ status: route.request().method() === "OPTIONS" ? 204 : 409,
    headers: { "access-control-allow-origin": shop, "access-control-allow-headers": "content-type" }, json: { reason: "That package can't be bought yet." } }));
  await sp.goto(shop + "/cart/");
  await sp.check('[data-checkout-form] input[name="accept"]');
  await sp.click('[data-checkout-form] button[type="submit"]');
  await sp.locator("[data-checkout-form] .form-status.err").waitFor();
  assert.match(await sp.locator("[data-checkout-form] [data-status]").textContent(), /can't be bought yet/);
  assert.ok(await sp.locator('[data-checkout-form] button[type="submit"]').isEnabled());
  assert.deepEqual(errors, []);

  // ---- WP-S10: founding (presale) and subscriptions (live) through the mocked engine ----
  for (const [st, extra] of [["presale", []], ["live", ["--beta=false"]]]) {
    const d = await mkdtemp(path.join(tmpdir(), `sg-e2e-${st}-`));
    execFileSync(process.execPath, [path.join(ROOT, "build.mjs"), `--app-status=${st}`, "--checkout=true", ...extra], { env: { ...process.env, DIST_DIR: d, CHECKOUT_ENGINE: ENGINE }, stdio: "ignore" });
    const srv = serve(d);
    await new Promise((r) => srv.listen(0, r));
    const site = `http://127.0.0.1:${srv.address().port}`;
    const ap = await browser.newPage({ viewport: { width: 360, height: 780 } });
    ap.on("pageerror", (e) => errors.push(e.message));
    const cors = { "access-control-allow-origin": site, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" };
    let body, cancelled;
    await ap.route(`${ENGINE}/**`, async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (u.pathname === "/api/founding/status") return route.fulfill({ headers: cors, json: { open: true, places_total: 20, places_remaining: 7, notice: { terms_version: "SG-LEGAL-13 DRAFT" } } });
      if (u.pathname === "/api/app/prices") return route.fulfill({ headers: cors, json: { app_subscriptions_open: true, notice: { terms_version: "SG-LEGAL-13 DRAFT" } } });
      if (u.pathname === "/api/founding/checkout/cancel") { cancelled = JSON.parse(req.postData()); return route.fulfill({ headers: cors, json: { ok: true, released: true } }); }
      body = JSON.parse(req.postData());
      return route.fulfill({ headers: cors, json: { ok: true, url: `${site}/${st === "presale" ? "founding" : "app"}/success/` } });
    });
    const url = st === "presale" ? "/app/founding-offer/" : "/app/pricing/";
    await ap.goto(site + url);
    assert.ok(await ap.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${url} at 360px`);
    if (st === "presale") await ap.locator("[data-places]").filter({ hasText: "7 of 20" }).waitFor();
    await ap.selectOption('[data-app-checkout] select[name="productId"]', "app:trade:domestic");
    await ap.selectOption('[data-app-checkout] select[name="trade"]', "CARP");
    await ap.click('[data-app-checkout] button[type="submit"]');
    assert.match(await ap.locator("[data-app-checkout] [data-status]").textContent(), /Tick the box/);
    await ap.check('[data-app-checkout] input[name="accept"]');
    await ap.click('[data-app-checkout] button[type="submit"]');
    await ap.waitForURL(new RegExp(st === "presale" ? "/founding/success/" : "/app/success/"));
    assert.equal(body.productId, "app:trade:domestic");
    assert.equal(body.trade, "CARP");
    assert.equal(body.acceptedTerms, true);
    assert.equal(body.termsVersion, "SG-LEGAL-13 DRAFT");
    assert.equal(body.returnOrigin, site);
    assert.equal(body.source_site, "systems");
    if (st === "live") assert.equal(body.cadence, "annual", "annual is the default");
    if (st === "presale") {
      await ap.goto(site + "/founding/cancelled/?session_id=cs_test_abc123");
      await ap.waitForFunction(() => true);
      for (let i = 0; i < 20 && !cancelled; i++) await ap.waitForTimeout(100);
      assert.deepEqual(cancelled, { session_id: "cs_test_abc123" }, "the cancelled page gives the place back");
    }
    await ap.close(); srv.close(); await rm(d, { recursive: true, force: true });
  }
  assert.deepEqual(errors, []);
  console.log("e2e: all checks passed");
} finally { await browser.close(); server.close(); shopServer.close(); await rm(SHOP_DIST, { recursive: true, force: true }); }
