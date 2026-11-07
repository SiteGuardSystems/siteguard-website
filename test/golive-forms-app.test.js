// W2 (go-live 7 Nov 2026): the App tab stays "coming soon" with no dates,
// prices or founding offer; the Forms link goes to the storefront; no page
// promises auto-delivery or instant documents (FORMS packs are delivered by
// email as PDFs within 3 business days); FORMS subscriptions and consultant
// plans show only "Coming soon: register interest".
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSiteMode } from "../scripts/lib/site-mode.mjs";
import { DELIVERY_LINE, INTEREST_LABEL } from "../scripts/lib/shop.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
async function htmlFiles(dir = DIST) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const pages = new Map(await Promise.all((await htmlFiles()).map(async (f) => [path.relative(DIST, f).split(path.sep).join("/"), await readFile(f, "utf8")])));
const MODE = (await loadSiteMode(ROOT)).mode;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("no page promises auto-delivery or instant documents", () => {
  for (const [f, html] of pages) {
    if (f.startsWith("legal/")) continue;
    const t = text(html);
    assert.ok(!/\binstant(ly)?\b|within minutes|often within minutes|download now|one business day of payment|delivered automatically|auto-?deliver/i.test(t), f);
  }
});

test("the Forms link in the menu goes to the storefront", () => {
  for (const [f, html] of pages) {
    const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)?.[0];
    if (!nav) continue;
    assert.match(nav, /<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS( \(beta\))?<\/a>/, f);
    assert.ok(!nav.includes('href="/forms/"'), f);
  }
});

test("App tab while coming soon: no founding offer, no launch date, no price", { skip: MODE.app_status !== "coming_soon" }, () => {
  for (const [f, html] of pages) {
    if (f.startsWith("legal/")) continue;
    const t = text(html);
    assert.ok(!/founding/i.test(t), `${f}: founding offer`);
    if (f === "index.html" || /^(app|audit|register-interest)\//.test(f)) {
      assert.ok(!/\b20(26|27|28)\b(?! SiteGuard Systems)/.test(t.replace(/© 20\d\d/g, "")), `${f}: a date`);
      assert.ok(!/\$\s?\d/.test(t), `${f}: a price`);
    }
  }
  assert.ok(!pages.has("app/founding-offer/index.html") && !pages.has("legal/founding-offer-terms/index.html"));
  for (const [f, html] of pages) assert.ok(!html.includes("/legal/founding-offer-terms/"), `${f}: links the founding terms`);
});

test("FORMS subscriptions and consultant plans: register interest only; one-off packs show the delivery line", () => {
  const lib = text(pages.get("library/index.html"));
  assert.ok(!/subscri/i.test(lib), "library: no FORMS subscription");
  assert.match(lib, /delivered as PDFs by email within 3 business days/);
  const shop = [...pages].filter(([f]) => f.startsWith("forms/"));
  if (!shop.length) return; // the /forms/ copy isn't built in this state
  const trade = shop.find(([f]) => /^forms\/trade-packs\/[^/]+\/index\.html$/.test(f));
  assert.ok(trade, "a trade pack page");
  assert.ok(trade[1].includes(DELIVERY_LINE), "delivery line on a pack page");
  for (const [f, html] of shop) {
    // The real subscribe and plan buttons are in the page but hidden (fail closed: this site never shows them).
    for (const m of html.matchAll(/<(\w+)\b([^>]*)data-switch="(subscriptions_open|consultant_plans_open)" data-when="on"([^>]*)>/g)) {
      assert.match(m[2] + m[4], /\bhidden\b/, `${f}: ${m[3]} on-half shown`);
    }
  }
  assert.ok(pages.get("forms/subscriptions/index.html").includes(INTEREST_LABEL));
  assert.match(pages.get("forms/subscriptions/index.html"), /data-endpoint="https:\/\/www\.siteguardforms\.com\.au\/api\/lead"/);
});

test("register interest: the consent wording names no founding offer", async () => {
  const { CONSENT_WORDING } = await import("../build.mjs");
  assert.ok(!/founding/i.test(CONSENT_WORDING));
});

test("site.css keeps the hidden half of a FORMS switch pair hidden", async () => {
  assert.match(await readFile(path.join(ROOT, "assets/site.css"), "utf8"), /\[data-switch\]\[hidden\] \{ display: none !important; \}/);
});
