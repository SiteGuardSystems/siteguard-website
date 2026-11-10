// X2 utm carry-through (Rev09 W10). The website half of a pair with the Storefront's S6 (#51): the
// same assets/attribution.js byte for byte, the same keys, the same storage key ("sg_attribution",
// sessionStorage) and these same cases. Here the middleware adds the script to each page only while
// campaign counts are on (METRICS_DB bound), as the Storefront does while CAMPAIGN_COUNTS=on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { onRequest as middleware, withAttribution, ATTRIBUTION_TAG } from "../functions/_middleware.js";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
const src = await readFile(new URL("../assets/attribution.js", import.meta.url), "utf8");

/** Runs assets/attribution.js against a fake page. */
function runScript({ search = "", stored = null, forms = 1 } = {}) {
  const store = new Map(stored ? [["sg_attribution", stored]] : []);
  const form = () => {
    const kids = [];
    return { kids, appendChild: (i) => (kids.push(i), i), querySelector: (sel) => kids.find((i) => sel.includes(`"${i.name}"`)) ?? null };
  };
  const fs = Array.from({ length: forms }, form);
  const window = {
    location: { search },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  };
  const document = {
    readyState: "complete",
    querySelectorAll: (sel) => (sel === "[data-lead-form]" ? fs : []),
    createElement: () => ({}),
    addEventListener: () => {},
  };
  vm.runInNewContext(src, { window, document, URLSearchParams });
  const attribution = () => JSON.parse(JSON.stringify(window.sgAttribution()));
  return { attribution, store, forms: fs };
}

test("the six carried keys, under the one storage key", () => {
  assert.ok(src.includes(`var KEYS = [${KEYS.map((k) => `"${k}"`).join(", ")}];`));
  assert.match(src, /var STORE = "sg_attribution";/);
});

test("keeps the landing's values for the visit and adds hidden fields to enquiry forms", () => {
  const { attribution, store, forms } = runScript({ search: "?utm_source=google&utm_campaign=swms&gclid=Cj0&x=1", forms: 2 });
  assert.deepEqual(JSON.parse(store.get("sg_attribution")), { utm_source: "google", utm_campaign: "swms", gclid: "Cj0" });
  assert.deepEqual(attribution(), { utm_source: "google", utm_campaign: "swms", gclid: "Cj0" });
  for (const f of forms) {
    assert.deepEqual(f.kids.map((i) => [i.type, i.name, i.value]),
      [["hidden", "utm_source", "google"], ["hidden", "utm_campaign", "swms"], ["hidden", "gclid", "Cj0"]]);
  }
});

test("the first landing in the visit wins", () => {
  const { attribution } = runScript({ search: "?utm_source=bing", stored: JSON.stringify({ utm_source: "google" }) });
  assert.deepEqual(attribution(), { utm_source: "google" });
});

test("no params: nothing stored and no fields added", () => {
  const { attribution, store, forms } = runScript({ search: "?ref=abc" });
  assert.equal(store.size, 0);
  assert.deepEqual(attribution(), {});
  assert.equal(forms[0].kids.length, 0);
});

test("no cookie and no localStorage", () => {
  const code = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join(" ");
  assert.doesNotMatch(code, /document\.cookie|localStorage/);
});

test("the enquiry form sends what attribution.js offers, and nothing when it isn't loaded", async () => {
  const js = await readFile(new URL("../assets/site.js", import.meta.url), "utf8");
  assert.match(js, /if \(typeof window\.sgAttribution === "function"\)/);
  // The built pages never carry the script themselves: only the middleware adds it.
  const html = await readFile(new URL("../dist/contact/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /attribution\.js|name="utm_|name="gclid"/);
});

// A stand-in for Cloudflare's HTMLRewriter: records what would be appended to <head>.
class FakeRewriter {
  on(sel, h) { this.sel = sel; this.h = h; return this; }
  transform(res) {
    const added = [];
    this.h.element({ append: (html, o) => added.push([this.sel, html, o?.html]) });
    return new Response(null, { headers: { ...Object.fromEntries(res.headers), "x-added": JSON.stringify(added) } });
  }
}
const page = () => new Response("<head></head><body></body>", { headers: { "content-type": "text/html; charset=utf-8" } });
const ctx = (env) => ({ request: new Request("https://www.siteguardsystems.com.au/contact/"), env, next: async () => page(), waitUntil() {} });
const DB = { prepare() { return { bind() { return { run: async () => {} }; } }; } };

test("the script is on the pages only while campaign counts are on (METRICS_DB bound)", async () => {
  globalThis.HTMLRewriter = FakeRewriter;
  try {
    assert.equal((await middleware(ctx({}))).headers.get("x-added"), null);
    const on = await middleware(ctx({ METRICS_DB: DB }));
    assert.deepEqual(JSON.parse(on.headers.get("x-added")), [["head", ATTRIBUTION_TAG, true]]);
    assert.equal(ATTRIBUTION_TAG, '<script src="/assets/attribution.js" defer></script>');
    const css = new Response("a{}", { headers: { "content-type": "text/css" } });
    assert.equal(withAttribution(css), css);
  } finally {
    delete globalThis.HTMLRewriter;
  }
});
