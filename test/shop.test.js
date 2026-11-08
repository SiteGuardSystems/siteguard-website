// WP-S8: the FORMS shop and the cart on the Systems site, from the storefront's
// own page builders (scripts/lib/shop.mjs, cart.mjs, cart-browser.js) and the
// same catalogue. Dan, 1 Nov 2026: the shop is browse only while FORMS is in
// beta (#94), and the cart takes FORMS documents and packs only (#96).
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
const openNoCheckout = await buildWith(["--beta=false", "--checkout=false"]);
test.after(async () => { for (const d of [off, betaOn, on, openNoCheckout]) await rm(d, { recursive: true, force: true }); });
const cat = JSON.parse(await readFile(path.join(ROOT, "data/catalogue.json"), "utf8"));
const SHOP_PAGES = ["forms/index.html", "forms/trade-packs/index.html", "forms/builder-packs/index.html", "forms/management-systems/index.html",
  "forms/specialist-packs/index.html", "forms/documents/index.html", "forms/subscriptions/index.html", "forms/how-ordering-works/index.html", "forms/faq/index.html"];
const allHtml = async (dir) => {
  const { readdir } = await import("node:fs/promises");
  const out = [];
  for (const e of await readdir(dir, { recursive: true, withFileTypes: true })) if (e.isFile() && e.name.endsWith(".html")) out.push([path.relative(dir, path.join(e.parentPath ?? e.path, e.name)), await readFile(path.join(e.parentPath ?? e.path, e.name), "utf8")]);
  return out;
};

// Dan, 1 Nov 2026 (#94): one beta switch. With beta true (the storefront's
// switch, vendored here), the Systems site shows the FORMS shop to browse, with
// no buy button, cart or checkout anywhere, whatever "checkout" says.
test("FORMS in beta (the default, and with checkout on): the shop shows to browse; no buy, cart or checkout", async () => {
  assert.equal(JSON.parse(await readFile(path.join(ROOT, "data/site-mode.json"), "utf8")).checkout ?? false, false);
  for (const d of [off, betaOn]) {
    for (const rel of SHOP_PAGES) assert.ok(has(d, rel), rel);
    for (const rel of ["cart/index.html", "order/success/index.html", "order/cancelled/index.html"]) assert.ok(!has(d, rel), rel);
    for (const [f, html] of await allHtml(d)) {
      assert.ok(!/data-add-(?:pack|doc)=/.test(html), `${f}: a buy button in beta`);
      assert.ok(!/data-checkout|data-app-checkout/.test(html), `${f}: a checkout in beta`);
      assert.ok(!/href="\/cart\/"/.test(html), `${f}: a cart link in beta`);
      assert.ok(!/>Subscribe (yearly|monthly)<|>Yearly<\/a>|>Monthly<\/a>/.test(html), `${f}: a subscribe button in beta`);
      assert.match(html, /<button class="nav-cart" type="button" data-cart hidden>/, `${f}: header cart hidden`);
    }
    const home = await read(d, "index.html");
    assert.ok(home.includes('<a href="https://www.siteguardforms.com.au/">SiteGuard FORMS</a> <span class="forms-soon">(beta)</span>'));
    assert.ok(!home.includes("/assets/cart.js"));
    for (const rel of SHOP_PAGES) {
      const html = await read(d, rel);
      assert.match(html, /<body[^>]* data-browse-only="1"/, rel);
      assert.ok(html.includes("data-beta-notice") && html.includes("SiteGuard FORMS is in beta."), rel);
    }
    // The single-documents list still loads (cart.js draws it); its Add buttons are hidden by site.css.
    assert.ok((await read(d, "forms/documents/index.html")).includes('<script src="/assets/cart.js" defer></script>'));
    assert.match(await read(d, "assets/site.css"), /body\[data-browse-only\] \[data-add-pack\], body\[data-browse-only\] \[data-add-doc\] \{ display: none !important; \}/);
    // No engine or Stripe in the CSP: nothing here can start a checkout.
    const csp = (await read(d, "_headers")).match(/Content-Security-Policy: (.*)/)[1];
    assert.ok(!csp.includes("checkout.stripe.com"), "no Stripe Checkout in form-action");
    assert.ok(!(await read(d, "robots.txt")).includes("/cart/"));
  }
});

test("FORMS out of beta with checkout off: no shop here, the menu links to the FORMS site", async () => {
  assert.ok(!has(openNoCheckout, "forms/index.html") && !has(openNoCheckout, "cart/index.html"));
  assert.ok((await read(openNoCheckout, "index.html")).includes('<a href="https://www.siteguardforms.com.au/">SiteGuard FORMS</a>'));
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
  // #96 (Q1 narrowed by Dan 1 Nov): no App plan or founding place can go in the cart, on any page.
  for (const [f, page] of await allHtml(on)) assert.ok(!/data-add-(?:pack|doc)="(?:app|founding)[:_-]/i.test(page), f);
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

test("WP-S12 CSP: the engine in connect-src and Stripe Checkout in form-action only while the shop is on", async () => {
  const csp = async (d) => (await read(d, "_headers")).match(/Content-Security-Policy: (.*)/)[1];
  const shopCsp = await csp(on);
  assert.match(shopCsp, /connect-src 'self' https:\/\/www\.siteguardforms\.com\.au;/);
  assert.match(shopCsp, /form-action 'self' https:\/\/www\.siteguardforms\.com\.au https:\/\/checkout\.stripe\.com;/);
  assert.match(shopCsp, /script-src 'self';/);
  assert.match(shopCsp, /frame-ancestors 'none'/);
  assert.ok(!(await csp(off)).includes("checkout.stripe.com"));
  const robots = await read(on, "robots.txt");
  assert.match(robots, /Disallow: \/cart\/\nDisallow: \/order\//);
});

test("WP-S12: no inline script or style on the shop and cart pages; prices say +GST", async () => {
  for (const rel of ["forms/index.html", "forms/builder-packs/index.html", "forms/documents/index.html", "cart/index.html", "order/success/index.html"]) {
    const html = await read(on, rel);
    assert.ok(!/<script(?![^>]*(src=|application\/ld\+json))[^>]*>/.test(html), rel);
    assert.ok(!/ style="/.test(html), rel);
    assert.match(html, /class="skip" href="#main"/, rel);
  }
  assert.match(await read(on, "forms/builder-packs/index.html"), /<small> \+GST<\/small>/);
});

test("S20: the subscriptions page promises email, not an account (no account while S4 is off)", async () => {
  const src = await (await import("node:fs/promises")).readFile(new URL("../scripts/lib/shop.mjs", import.meta.url), "utf8");
  assert.ok(!/pushed to your account|from your account/.test(src));
  assert.match(src, /emailed to you after each 6-monthly review/);
  assert.match(src, /To cancel, email support@siteguardsystems\.com\.au at any time/);
});
