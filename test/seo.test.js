// Link and SEO checks over the built site (F3, SEO check Nov 2026; docs/SEO_CHECK_2026-11.md).
// build.test.js already checks every page's title, description, canonical, h1 and internal links;
// these cover the sitemap against the canonicals, og:url, image alt text and redirect hops.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REDIRECTS, TITLE_MAX } from "../build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const ORIGIN = "https://www.siteguardsystems.com.au";
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
const canonicalOf = (html) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
const noindex = (html) => /<meta name="robots" content="noindex/.test(html);
const ERROR_PAGES = new Set(["404.html", "500.html"]);

test("sitemap: every URL is a built, indexable page whose canonical is that URL, listed once", async () => {
  const locs = [...(await readFile(path.join(DIST, "sitemap.xml"), "utf8")).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0);
  assert.equal(new Set(locs).size, locs.length, "duplicate sitemap URL");
  for (const loc of locs) {
    assert.ok(loc.startsWith(`${ORIGIN}/`), loc);
    const f = loc.slice(ORIGIN.length + 1) + "index.html";
    assert.ok(pages.has(f), `${loc}: no page`);
    assert.ok(!noindex(pages.get(f)), `${loc}: noindex page in the sitemap`);
    assert.equal(canonicalOf(pages.get(f)), loc, `${loc}: canonical differs`);
  }
});

test("sitemap: every indexable page with its canonical on this site is listed", async () => {
  const locs = new Set([...(await readFile(path.join(DIST, "sitemap.xml"), "utf8")).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  for (const [f, html] of pages) {
    if (ERROR_PAGES.has(f) || noindex(html)) continue;
    const c = canonicalOf(html);
    if (c.startsWith(ORIGIN)) assert.ok(locs.has(c), `${f}: not in the sitemap`);
  }
});

test("og:url matches the canonical on every page (shop pages point at the FORMS site)", () => {
  for (const [f, html] of pages) {
    if (ERROR_PAGES.has(f)) continue;
    assert.equal(/<meta property="og:url" content="([^"]*)"/.exec(html)?.[1], canonicalOf(html), f);
  }
});

test("every image has an alt attribute; an empty alt only on the logo or a module label beside its name", () => {
  for (const [f, html] of pages) {
    for (const [img] of html.matchAll(/<img\s[^>]*>/g)) {
      const alt = /\salt="([^"]*)"/.exec(img);
      assert.ok(alt, `${f}: no alt: ${img}`);
      if (!alt[1].trim()) assert.match(img, /src="\/assets\/(shield\.png|brand\/sg-[a-z]+-label\.svg)"/, `${f}: empty alt: ${img}`);
    }
  }
});

test("internal links go straight to the page, not through a redirect", () => {
  const from = new Set(REDIRECTS.map(([a]) => a).filter((a) => !a.includes("*")));
  for (const [f, html] of pages) {
    for (const [, href] of html.matchAll(/<a\s[^>]*href="(\/[^"#?]*)/g)) assert.ok(!from.has(href), `${f}: links to redirect ${href}`);
  }
});

test(`a title that names SiteGuard drops the " | SiteGuard Systems" suffix rather than run past ${TITLE_MAX} characters`, () => {
  for (const [f, html] of pages) {
    const t = /<title>([^<]*)<\/title>/.exec(html)[1].replace(/&amp;/g, "&");
    if (t.endsWith(" | SiteGuard Systems") && /SiteGuard/.test(t.slice(0, -" | SiteGuard Systems".length))) assert.ok(t.length <= TITLE_MAX, `${f}: ${t}`);
  }
});
