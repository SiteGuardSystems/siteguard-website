import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BANNED } from "../build.mjs";

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
const pages = await Promise.all((await htmlFiles()).map(async (f) => ({ f: path.relative(DIST, f), html: await readFile(f, "utf8") })));

test("the brief's pages exist", () => {
  const have = new Set(pages.map((p) => p.f));
  for (const p of ["index.html", "services/index.html", "services/subcontractors/index.html", "services/builders/index.html",
    "services/iso-ims/index.html", "services/leadership-advisory/index.html", "library/index.html", "about/index.html",
    "contact/index.html", "legal/disclaimer/index.html", "legal/privacy/index.html", "404.html"]) assert.ok(have.has(p), p);
});

test("every page: title, description, canonical, one h1, skip link, no inline script or style", () => {
  for (const { f, html } of pages) {
    assert.match(html, /<title>[^<]+<\/title>/, f);
    assert.match(html, /<meta name="description" content="[^"]{20,}">/, f);
    assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+">/, f);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, f);
    assert.ok(!/<script(?![^>]*(src=|application\/ld\+json))[^>]*>/.test(html), f);
    assert.ok(!/ style="/.test(html), f);
    assert.match(html, /class="skip" href="#main"/, f);
  }
});

test("no banned wording outside the legal pages; the credential is exact", () => {
  for (const { f, html } of pages) {
    if (f.startsWith("legal/")) continue;
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/Certified Lead Auditor/g, "");
    assert.equal(text.match(BANNED), null, f);
    assert.ok(!/fully certified|AS\/NZS 4801|ABN to be confirmed|mailto:[^"]*\?/.test(html), f);
  }
  const about = pages.find((p) => p.f === "about/index.html").html;
  assert.ok(about.includes("Exemplar Global Certified Lead Auditor — Integrated Management Systems (ISO 9001, 14001, 45001)"));
});

test("the enquiry form posts to the storefront's /api/lead, not mailto", () => {
  const contact = pages.find((p) => p.f === "contact/index.html").html;
  assert.match(contact, /data-endpoint="https:\/\/[^"]+\/api\/lead"/);
  assert.match(contact, /name="website"/); // honeypot
});

test("Cloudflare headers set CSP, HSTS and frame denial", async () => {
  const h = await readFile(path.join(DIST, "_headers"), "utf8");
  assert.match(h, /Content-Security-Policy: default-src 'self'/);
  assert.match(h, /connect-src 'self' https:\/\//);
  assert.match(h, /Strict-Transport-Security/);
  assert.match(h, /X-Frame-Options: DENY/);
});
