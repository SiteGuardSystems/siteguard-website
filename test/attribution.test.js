// X2 utm carry-through (Rev09 W10; the Storefront's S6 is the other half, with the same field names,
// the same storage key and these same cases). assets/attribution.js keeps the landing's utm_* and
// gclid for the visit (sessionStorage key "sg_attribution", first landing wins, no cookie); the
// enquiry and Book a call forms carry them as hidden fields; and it's all off until campaign counts
// are on (the middleware marks the page only while METRICS_DB is bound).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { onRequest as middleware, markAttribution } from "../functions/_middleware.js";

const src = await readFile(new URL("../assets/attribution.js", import.meta.url), "utf8");
function load() {
  const ctx = { URLSearchParams };
  vm.runInNewContext(src, ctx);
  return ctx.SGAttribution;
}
class Store {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}
const GCLID = "Cj0KCQiA_test-gclid_123";
const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];

test("carries the six names under the one storage key", () => {
  const A = load();
  assert.deepEqual([...A.KEYS], KEYS);
  assert.equal(A.STORE, "sg_attribution");
});

test("keeps the landing's values for the visit, cleaned", () => {
  const A = load();
  const s = new Store();
  const got = A.capture(`?utm_source=LinkedIn&utm_medium=Social&utm_campaign=Launch&utm_term=swms&utm_content=a1&gclid=${GCLID}&x=1`, s);
  assert.deepEqual({ ...got }, { utm_source: "linkedin", utm_medium: "social", utm_campaign: "launch", utm_term: "swms", utm_content: "a1", gclid: GCLID });
  assert.deepEqual(JSON.parse(s.getItem("sg_attribution")), { ...got });
  // A later page in the visit, with no query string, still carries them.
  assert.deepEqual({ ...A.capture("", s) }, { ...got });
});

test("the first landing in a visit wins", () => {
  const A = load();
  const s = new Store();
  A.capture("?utm_source=google&utm_campaign=one", s);
  assert.equal(A.capture("?utm_source=linkedin&utm_campaign=two", s).utm_source, "google");
});

test("nothing is kept for a landing without campaign values", () => {
  const A = load();
  const s = new Store();
  assert.deepEqual({ ...A.capture("?ref=PARTNER1", s) }, {});
  assert.equal(s.getItem("sg_attribution"), null);
});

test("drops email addresses, phone numbers and malformed gclids; cuts to 60 characters", () => {
  const A = load();
  const got = A.fromSearch(`?utm_source=me@example.com&utm_medium=0412%20345%20678&utm_campaign=${"x".repeat(80)}&gclid=<bad>`);
  assert.deepEqual({ ...got }, { utm_campaign: "x".repeat(60) });
});

test("works with storage blocked (this page only)", () => {
  const A = load();
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(A.capture("?utm_source=google", blocked).utm_source, "google");
});

test("uses no cookie and no localStorage", () => {
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /document\.cookie|localStorage/);
});

test("the enquiry, Book a call and Register interest forms carry the hidden fields", async () => {
  for (const page of ["contact/index.html", "register-interest/index.html"]) {
    const html = await readFile(new URL(`../dist/${page}`, import.meta.url), "utf8");
    for (const form of html.match(/<form[^>]*data-lead-form[\s\S]*?<\/form>/g) ?? []) {
      for (const k of KEYS) assert.match(form, new RegExp(`<input type="hidden" name="${k}" value="" data-attribution-field>`), `${page} ${k}`);
    }
    assert.match(html, /<script src="\/assets\/attribution\.js" defer><\/script>\s*<script src="\/assets\/site\.js" defer>/);
  }
});

// A stand-in for Cloudflare's HTMLRewriter: marks <body> the way the real one would.
class FakeRewriter {
  on(sel, h) { this.sel = sel; this.h = h; return this; }
  transform(res) {
    const attrs = [];
    this.h.element({ setAttribute: (k, v) => attrs.push(`${k}="${v}"`) });
    return new Response(res.body ? null : null, { headers: res.headers, status: res.status, statusText: attrs.join(" ") });
  }
}
const page = () => new Response("<body>", { headers: { "content-type": "text/html; charset=utf-8" } });
const ctx = (env) => ({ request: new Request("https://www.siteguardsystems.com.au/contact/"), env, next: async () => page(), waitUntil() {} });

test("off: the page isn't marked until campaign counts are on (METRICS_DB bound)", async () => {
  globalThis.HTMLRewriter = FakeRewriter;
  try {
    assert.equal((await middleware(ctx({}))).statusText, "");
    const on = await middleware(ctx({ METRICS_DB: { prepare() { return { bind() { return { run: async () => {} }; } }; } } }));
    assert.equal(on.statusText, 'data-attribution="1"');
    // Not HTML: untouched.
    const css = new Response("a{}", { headers: { "content-type": "text/css" } });
    assert.equal(markAttribution(css), css);
  } finally {
    delete globalThis.HTMLRewriter;
  }
});
