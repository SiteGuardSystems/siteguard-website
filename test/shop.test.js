// WP-S8: the FORMS shop and the cart on the Systems site, from the storefront's
// own page builders (scripts/lib/shop.mjs, cart.mjs, cart-browser.js) and the
// same catalogue.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cartBrowserParts } from "../scripts/lib/cart.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
async function buildWith(args) {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-shop-"));
  await run(process.execPath, [path.join(ROOT, "build.mjs"), ...args], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir } });
  return dir;
}
const read = (dir, rel) => readFile(path.join(dir, rel), "utf8");
const has = (dir, rel) => existsSync(path.join(dir, rel));

const off = await buildWith([]);
const betaOn = await buildWith(["--beta=true", "--checkout=true"]);
const on = await buildWith(["--beta=false", "--checkout=true"]);
test.after(async () => { for (const d of [off, betaOn, on]) await rm(d, { recursive: true, force: true }); });
const cat = JSON.parse(await readFile(path.join(ROOT, "data/catalogue.json"), "utf8"));

test("checkout off (the default until WP-S9), or FORMS in beta: no shop and the header cart stays hidden", async () => {
  for (const d of [off, betaOn]) {
    assert.ok(!has(d, "forms/index.html"));
    assert.ok(!has(d, "cart/index.html"));
    assert.ok(!has(d, "assets/cart.js"));
    const home = await read(d, "index.html");
    assert.match(home, /<button class="nav-cart" type="button" data-cart hidden>/);
    assert.ok(!home.includes("/assets/cart.js"));
  }
  assert.equal(JSON.parse(await readFile(path.join(ROOT, "data/site-mode.json"), "utf8")).checkout ?? false, false);
});

test("checkout on: the FORMS shop renders under /forms/, every page canonical on the FORMS site", async () => {
  for (const rel of ["forms/index.html", "forms/trade-packs/index.html", "forms/builder-packs/index.html", "forms/management-systems/index.html",
    "forms/specialist-packs/index.html", "forms/documents/index.html", "forms/subscriptions/index.html", "forms/how-ordering-works/index.html",
    "forms/faq/index.html", "forms/assets/documents.json"]) assert.ok(has(on, rel), rel);
  const trade = cat.trades.find((t) => cat.packs.some((p) => p.show && p.prices && p.trade === t.code && t.group === "trade-packs"));
  const tp = await read(on, `forms/trade-packs/${trade.slug}/index.html`);
  assert.ok(tp.includes(`<link rel="canonical" href="https://www.siteguardforms.com.au/trade-packs/${trade.slug}/">`));
  const sitemap = await read(on, "sitemap.xml");
  assert.ok(!sitemap.includes("/forms/") && !sitemap.includes("/cart/") && !sitemap.includes("/order/"));
  // Product JSON-LD names the FORMS page, at the catalogue's prices, ex GST.
  const ld = [...tp.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1])).filter((o) => o["@type"] === "Product");
  assert.ok(ld.length);
  for (const o of ld) {
    const p = cat.packs.find((x) => x.id === o.sku);
    for (const offer of o.offers) {
      assert.ok(offer.url.startsWith("https://www.siteguardforms.com.au/trade-packs/"));
      assert.equal(offer.priceSpecification.valueAddedTaxIncluded, false);
      assert.ok([p.prices.one_off, p.prices.annual].includes(offer.price));
    }
  }
});

test("every price on the shop equals the catalogue; nothing outside a purchasable wave can be added", async () => {
  const pages = ["forms/builder-packs/index.html", "forms/management-systems/index.html", "forms/specialist-packs/index.html"];
  for (const p of cat.packs.filter((x) => x.show && x.prices && x.trade)) pages.push(`forms/${p.group}/${cat.trades.find((t) => t.code === p.trade).slug}/index.html`);
  const html = (await Promise.all([...new Set(pages)].map((f) => read(on, f)))).join("\n");
  for (const [, id, price] of html.matchAll(/data-add-pack="([^"]+)" data-name="[^"]*" data-price="(\d+)"/g)) {
    const p = cat.packs.find((x) => x.id === id);
    assert.equal(Number(price), p.prices.one_off, id);
    assert.ok(p.purchasable !== false && p.show, id);
  }
  assert.ok(!cat.packs.some((p) => p.group === "app" && html.includes(`data-add-pack="${p.id}"`)), "app products are not FORMS cart items");
  assert.match(html, /\+GST/);
});

test("one cart: header cart on every page, /cart/ with the checkout notice and terms, cart.js from cart-browser.js", async () => {
  const home = await read(on, "index.html");
  assert.match(home, /<a class="nav-cart" href="\/cart\/" data-cart>Cart <span data-cart-count>\(0\)<\/span><\/a>/);
  assert.ok(home.includes('<script src="/assets/cart.js" defer></script>'));
  const cart = await read(on, "cart/index.html");
  assert.ok(cart.includes('data-engine="https://www.siteguardforms.com.au"'));
  assert.match(cart, /name="termsVersion" value="SG-LEGAL-02 v[\d.]+; SG-LEGAL-01 v[\d.]+"/);
  assert.ok(cart.includes('href="/legal/terms-of-sale/"') && cart.includes('href="/legal/document-use-disclaimer/"'));
  assert.match(cart, /<meta name="robots" content="noindex, nofollow">/);
  for (const rel of ["order/success/index.html", "order/cancelled/index.html"]) assert.ok(has(on, rel), rel);
  const js = await read(on, "assets/cart.js");
  for (const part of await cartBrowserParts()) assert.ok(js.includes(part));
  assert.ok(js.includes('var ROOT = "/forms/"') && js.includes('body.source_site = "systems"'));
});

test("shop.mjs, cart.mjs and cart-browser.js are the storefront's files (when checked out beside this repo)", async () => {
  for (const sib of ["../SiteGuard-Forms-Storefront", "../_wt_storefront_s8"]) {
    const other = path.resolve(ROOT, sib, "scripts/lib");
    if (!existsSync(path.join(other, "shop.mjs"))) continue;
    for (const f of ["shop.mjs", "cart.mjs", "cart-browser.js"]) {
      const a = (await readFile(path.join(ROOT, "scripts/lib", f), "utf8")).replace(/\r\n/g, "\n");
      const b = (await readFile(path.join(other, f), "utf8")).replace(/\r\n/g, "\n");
      assert.equal(a, b, `${f} differs from ${sib}`);
    }
  }
});
