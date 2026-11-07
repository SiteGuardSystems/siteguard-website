import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { wordingHits, REDIRECTS, CREDENTIAL } from "../build.mjs";
import { loadSiteMode } from "../scripts/lib/site-mode.mjs";

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
const pages = await Promise.all((await htmlFiles()).map(async (f) => ({ f: path.relative(DIST, f).split(path.sep).join("/"), html: await readFile(f, "utf8") })));
// The mode the build used: data/site-mode.json plus the storefront's beta switch (site-mode.lock).
const MODE = (await loadSiteMode(ROOT)).mode;
const get = (f) => pages.find((p) => p.f === f)?.html ?? assert.fail(`missing ${f}`);

test("the brief's pages exist", () => {
  const have = new Set(pages.map((p) => p.f));
  for (const p of ["index.html", "consulting/index.html", "consulting/ims-design-implementation/index.html", "consulting/gap-analysis/index.html",
    "consulting/internal-audit-support/index.html", "consulting/workplace-inspections/index.html", "consulting/custom-swms/index.html",
    "consulting/incident-investigation/index.html", "consulting/advisory-retainers/index.html", "library/index.html", "about/index.html",
    "contact/index.html", "partners/index.html", "legal/disclaimer/index.html", "legal/privacy/index.html", "404.html",
    "app/index.html", "app/trade-packages/index.html", "app/builder-bundles/index.html", "app/safety/index.html", "app/quality/index.html",
    "app/environmental/index.html", "app/management/index.html", "audit/index.html", "audit/checklists/index.html", "register-interest/index.html", "planning/index.html", "education/index.html"]) assert.ok(have.has(p), p);
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
    assert.deepEqual(wordingHits(html, MODE), [], f);
    assert.ok(!/fully certified|AS\/NZS 4801|ABN to be confirmed|mailto:[^"]*\?/.test(html), f);
  }
  // Rebaseline 31 Oct 2026: Certificate of Attainment wording, never "Certified Lead Auditor".
  const CRED = "Certificates of Attainment for the Exemplar Global certified courses (AU, TL, QM, EM, OH 45001) via Risk Training Professionals";
  assert.equal(CREDENTIAL, CRED);
  assert.ok(get("about/index.html").includes(`<strong>${CRED}</strong>`));
  const lds = [...get("about/index.html").matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(lds.find((o) => o["@type"] === "Person").hasCredential, CRED);
  assert.equal(JSON.parse(get("index.html").match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]).founder.hasCredential, CRED);
  for (const { f, html } of pages) assert.ok(!/Certified Lead Auditor/i.test(html), f);
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

test("partners page: partner enquiry form posts to /api/lead as a partner enquiry", () => {
  const html = pages.find((p) => p.f === "partners/index.html").html;
  assert.match(html, /data-endpoint="https:\/\/[^"]+\/api\/lead"/);
  assert.match(html, /name="enquiry_type" value="partner"/);
  assert.match(html, /How referrals work/);
});

test("no intro video until data/intro-video.json sets one; CSP unchanged", async () => {
  const video = JSON.parse(await readFile(path.join(ROOT, "data/intro-video.json"), "utf8"));
  if (video.provider) return;
  const home = pages.find((p) => p.f === "index.html").html;
  assert.ok(!/intro-video/.test(home));
  assert.ok(!/youtube/.test(await readFile(path.join(DIST, "_headers"), "utf8")));
});

test("menu: Consulting, SiteGuard App, SiteGuard Audit, Education, Planner, Forms, then Contact, the cart and the status button", () => {
  const nav = get("index.html").match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  const labels = [...nav.matchAll(/<(?:a|span|button)\b[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(labels.slice(0, 5), ["Consulting", "SiteGuard App", "SiteGuard Audit", "Education", "Planner"]);
  assert.equal(labels[5], MODE.beta ? "SiteGuard FORMS (beta)" : "SiteGuard FORMS");
  assert.equal(labels[6], "Contact");
  assert.match(nav, /<button class="nav-cart"[^>]*data-cart hidden>/); // no checkout yet
  assert.match(nav, /class="cart-link nav-status" href="\/register-interest\/">Register interest</);
  // Go-live 7 Nov 2026: the Forms link goes to the storefront, marked beta while its beta switch is on.
  assert.match(nav, MODE.beta ? /<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS \(beta\)<\/a>/ : /<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS<\/a>/);
  assert.match(nav, /href="\/planning\/"[^>]*>Planner</);
});

test("_redirects: every rule is a 301 to a built page", async () => {
  const r = await readFile(path.join(DIST, "_redirects"), "utf8");
  const lines = r.trim().split("\n");
  assert.equal(lines.length, REDIRECTS.length);
  const have = new Set(pages.map((p) => "/" + p.f.replace(/index\.html$/, "")));
  for (const line of lines) {
    const [from, to, code] = line.split(" ");
    assert.equal(code, "301", line);
    assert.ok(from.startsWith("/"), line);
    assert.ok(have.has(to.replace(/:splat$/, "")), `${line}: target not built`);
  }
  assert.match(r, /^\/planner \/planning\/ 301$/m);
  assert.match(r, /^\/services\/ \/consulting\/ 301$/m);
  assert.match(r, /^\/services\/\* \/consulting\/:splat 301$/m);
});

test("custom content on request (Q-ED3): under Consulting and Education, enquiry only, no price", () => {
  const cc = get("consulting/custom-content/index.html");
  assert.match(cc, /<h1>Custom content, on request<\/h1>/);
  assert.match(cc, /On request, by enquiry only\./);
  assert.match(cc, /site-specific induction video/);
  assert.ok(cc.includes('href="/contact/"'), "enquiry button");
  const main = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  for (const f of ["consulting/custom-content/index.html", "education/index.html"]) {
    assert.ok(!/(A\$|\$\s?\d|\+GST|per hour|a month)/.test(main(get(f))), `${f}: no price`);
  }
  assert.ok(get("consulting/index.html").includes('href="/consulting/custom-content/"'), "listed under Consulting");
  const edu = get("education/index.html");
  assert.match(edu, /Custom content, on request/);
  assert.ok(edu.includes('href="/consulting/custom-content/"'), "linked from Education");
});

test("consulting: about and library listed under Consulting", () => {
  const idx = get("consulting/index.html");
  for (const h of ["/about/", "/library/", "/consulting/internal-audit-support/", "/consulting/advisory-retainers/"]) assert.ok(idx.includes(`href="${h}"`), h);
  for (const f of ["about/index.html", "library/index.html", "consulting/advisory-retainers/index.html"]) assert.match(get(f), /<a href="\/consulting\/" aria-current="page">Consulting<\/a>/, f);
  assert.match(get("library/index.html"), /Buy or commission[\s\S]*SiteGuard App[\s\S]*consulting/);
});

test("SiteGuard App: a page for every trade in data/app-packages.json, module lockups, no document codes", async () => {
  const app = JSON.parse(await readFile(path.join(ROOT, "data/app-packages.json"), "utf8"));
  assert.equal(app.group, "app");
  assert.equal(app.trades.length, 25);
  for (const t of app.trades) {
    const html = get(`app/trade-packages/${t.slug}/index.html`);
    for (const l of app.levels) assert.ok(html.includes(`${t.documents_by_level[l.slug]} documents`), `${t.slug} ${l.slug}`);
    assert.ok(get("app/trade-packages/index.html").includes(`href="/app/trade-packages/${t.slug}/"`), t.slug);
  }
  for (const m of ["safety", "quality", "environmental", "management"]) assert.match(get(`app/${m}/index.html`), new RegExp(`<img src="/assets/brand/sg-${m}-lockup.svg"`));
  for (const { f, html } of pages) assert.ok(!/\bSG-[A-Z]-[A-Z]{3}-|\bAU-\d\d\b|\bNEW-\d/.test(html), `${f}: internal document code`);
});

test("SiteGuard Audit: only a launch-ready checklist count, never the build list's size; the Audit lockup, unlimited clients and audits", async () => {
  const cl = JSON.parse(await readFile(path.join(ROOT, "data/audit-checklists.json"), "utf8"));
  assert.equal(Object.values(cl.by_type).reduce((a, b) => a + b, 0), cl.checklists);
  const hub = get("audit/index.html");
  const lib = get("audit/checklists/index.html");
  for (const html of [hub, lib]) {
    assert.ok(!html.includes(`${cl.checklists.toLocaleString("en-AU")} checklists`), "no build-list count");
    for (const [k, v] of Object.entries(cl.by_type)) assert.ok(!html.includes(`<td>${k}</td><td>${v.toLocaleString("en-AU")}</td>`), k);
    assert.ok(!/through 2027/.test(html), "no date");
  }
  if (Number.isInteger(cl.launch_ready) && cl.launch_ready > 0) assert.ok(hub.includes(`${cl.launch_ready.toLocaleString("en-AU")} checklists ready`));
  assert.match(hub, /<img src="\/assets\/brand\/sg-audit-lockup.svg"/);
  assert.match(hub, /Unlimited clients and audits/);
});

test("planner cross-links: planner and inspection pages to SiteGuard Audit, state calendars to SiteGuard App", () => {
  for (const f of ["planning/index.html", "planning/inspections/index.html"]) assert.match(get(f), /class="band band-grey plan-cross"[\s\S]*href="\/audit\/"/, f);
  for (const st of ["vic", "nsw", "qld", "sa", "wa", "tas", "act", "nt"]) assert.match(get(`planning/${st}/index.html`), /class="band band-grey plan-cross"[\s\S]*href="\/app\/"/, st);
});

test("Register interest: posts to /api/lead as app-interest with App / Audit / both and the consent wording", async () => {
  const { CONSENT_WORDING } = await import("../build.mjs");
  const html = get("register-interest/index.html");
  assert.match(html, /data-endpoint="https:\/\/[^"]+\/api\/lead"/);
  assert.match(html, /name="enquiry_type" value="app-interest"/);
  for (const v of ["app", "audit", "both"]) assert.match(html, new RegExp(`name="interest" value="${v}"`));
  assert.match(html, /<input type="checkbox" name="consent" value="yes">/);
  assert.ok(html.includes(`name="consent_wording" value="${CONSENT_WORDING}"`));
  assert.ok(html.includes(`<input type="checkbox" name="consent" value="yes">${CONSENT_WORDING}</label>`));
  assert.match(html, /name="website"/); // honeypot
});
