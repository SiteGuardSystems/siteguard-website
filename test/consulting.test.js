// W1 (go-live 7 Nov 2026): Consulting first. The home hero and the menu lead
// with Consulting; one page per service, and only the go-live services; each
// page has who it's for, how it works, the service areas, "Book a call" and
// the enquiry form; no prices; the impartiality rule; old pages redirect.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REDIRECTS, CREDENTIAL } from "../build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, "dist", rel), "utf8");
const main = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

const SERVICES = ["ims-design-implementation", "gap-analysis", "internal-audit-support", "workplace-inspections",
  "custom-swms", "incident-investigation", "advisory-retainers"];
const PRICE = /A\$|\$\s?\d|\+GST|per hour|an hour|a month\b|cents|per kilomet/i;

test("home: the hero and the menu lead with Consulting", async () => {
  const home = await read("index.html");
  const hero = home.slice(home.indexOf('<section class="hero"'), home.indexOf("</section>", home.indexOf('<section class="hero"')));
  assert.match(hero, /<h1>HSEQ consulting for Australian construction\.<\/h1>/);
  assert.match(hero, /<a class="btn btn-hivis" href="\/contact\/">Book a call<\/a><a class="btn" href="\/consulting\/">See consulting services<\/a>/);
  assert.ok(!/SiteGuard App|SiteGuard Audit|register-interest/.test(hero), "the hero is consulting only");
  const nav = home.slice(home.indexOf('<nav class="nav"'), home.indexOf("</nav>", home.indexOf('<nav class="nav"')));
  assert.match(nav, /^<nav class="nav" id="site-nav" aria-label="Main"><a href="\/consulting\/">Consulting<\/a>/);
  for (const s of SERVICES) assert.ok(home.includes(`href="/consulting/${s}/"`), `home lists ${s}`);
  assert.ok(home.indexOf("Consulting services") < home.indexOf("What SiteGuard does"), "the services come before the other doors");
});

test("one page per go-live service, and no other consulting service pages", async () => {
  const idx = await read("consulting/index.html");
  const listed = [...new Set([...idx.matchAll(/href="\/consulting\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(listed, [...SERVICES, "custom-content"].sort());
  for (const gone of ["subcontractors", "builders", "iso-ims", "ims-tier-1-uplift", "audits-and-inspections", "retainers", "leadership-advisory"]) {
    await assert.rejects(read(`consulting/${gone}/index.html`), `${gone} isn't built`);
  }
});

test("every service page: who, what, how, where, Book a call and the enquiry form; no price", async () => {
  for (const s of [...SERVICES, "custom-content"]) {
    const html = await read(`consulting/${s}/index.html`);
    const m = main(html);
    assert.match(m, /<h2>Who it's for<\/h2>/, s);
    assert.match(m, /<h2[^>]*>What's included<\/h2>/, s);
    assert.match(m, /<h2>How it works<\/h2>/, s);
    assert.match(m, /All of Australia\. Remote as standard, and on site anywhere in Australia by arrangement\./, s);
    assert.match(m, /<a class="btn btn-hivis" href="#book">Book a call<\/a>/, s);
    assert.match(m, /<section class="band" id="book"/, s);
    assert.match(m, /<form class="form" data-lead-form data-source="systems" data-endpoint="https:\/\/www\.siteguardforms\.com\.au\/api\/lead"/, s);
    assert.match(m, /<input type="hidden" name="service" value="[^"]+">/, s);
    assert.ok(!PRICE.test(m.replace(/<[^>]+>/g, " ")), `${s}: no price`);
    assert.match(html, /"@type":"Service"/, s);
  }
  const idx = main(await read("consulting/index.html")).replace(/<[^>]+>/g, " ");
  assert.ok(!PRICE.test(idx), "consulting index: no price");
});

test("impartiality: never audit a system SiteGuard designed", async () => {
  assert.match(await read("consulting/internal-audit-support/index.html"), /we don't audit a management system that SiteGuard designed or built/);
  assert.match(await read("consulting/ims-design-implementation/index.html"), /we won't do the internal audit of your system/);
  assert.match(await read("consulting/index.html"), /We never audit a management system that SiteGuard designed\./);
});

test("credential: the approved wording only, and no 'Lead Auditor' claim on the consulting pages", async () => {
  for (const s of ["index.html", "consulting/index.html", ...SERVICES.map((x) => `consulting/${x}/index.html`)]) {
    assert.ok(!/Lead Auditor/i.test(await read(s)), s);
  }
  assert.ok((await read("about/index.html")).includes(CREDENTIAL));
});

test("the old consulting pages redirect to the matching service", () => {
  const r = new Map(REDIRECTS);
  assert.equal(r.get("/consulting/iso-ims/"), "/consulting/ims-design-implementation/");
  assert.equal(r.get("/consulting/retainers/"), "/consulting/advisory-retainers/");
  assert.equal(r.get("/consulting/audits-and-inspections/"), "/consulting/internal-audit-support/");
  assert.equal(r.get("/consulting/subcontractors"), "/consulting/custom-swms/");
  assert.equal(r.get("/consulting/leadership-advisory/"), "/consulting/");
});

test("the enquiry script names the service at the start of the message", async () => {
  const js = await readFile(path.join(ROOT, "assets/site.js"), "utf8");
  assert.ok(js.includes('need: (val(f, "service") ? "[" + val(f, "service") + "] " : "") + val(f, "need")'));
});
