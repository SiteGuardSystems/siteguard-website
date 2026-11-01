// The status switch (data/site-mode.json): builds the site once per
// app_status value (and once with FORMS out of beta) into temporary folders
// and checks what each shows.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { wordingHits } from "../build.mjs";
import { checkStatusCopy, withoutStatusCopy, statusCopy, loadSiteMode } from "../scripts/lib/site-mode.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Build with overrides into a temp folder; returns { pages: Map(path -> html), dir }. */
async function buildWith(args) {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-status-"));
  await run(process.execPath, [path.join(ROOT, "build.mjs"), ...args], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir } });
  const pages = new Map();
  for (const f of await htmlFiles(dir)) pages.set(path.relative(dir, f).split(path.sep).join("/"), await readFile(f, "utf8"));
  return { pages, dir };
}

const builds = {};
for (const s of ["coming_soon", "presale", "live"]) builds[s] = await buildWith([`--app-status=${s}`, "--beta=true"]);
builds.formsOpen = await buildWith(["--app-status=coming_soon", "--beta=false"]);
test.after(async () => { for (const b of Object.values(builds)) await rm(b.dir, { recursive: true, force: true }); });

const isAppPage = (f) => /^(app|audit)\//.test(f) || f === "index.html";
// Launch prices from Packages and Pricing Rev06 (ex GST): none may show while coming soon.
const APP_PRICES = /\$\s?(196|271|496|910|1,?279|1,?757|75)\b/;

test("coming_soon: no app or audit prices anywhere; every buy button is Register interest", () => {
  const { pages } = builds.coming_soon;
  for (const [f, html] of pages) {
    const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
    assert.ok(!APP_PRICES.test(text), `${f}: shows an app or audit price`);
    if (isAppPage(f)) assert.ok(!/\$\s?\d/.test(text), `${f}: shows a price`);
    for (const [, href, label] of html.matchAll(/<a class="btn[^"]*" href="([^"]+)">([^<]+)<\/a>/g)) {
      if (/^\/(register-interest|app|audit)\//.test(href) && /^(app|audit)\//.test(f)) assert.equal(label, "Register interest", `${f}: ${href}`);
    }
  }
  assert.ok(pages.has("register-interest/index.html"));
  assert.match(pages.get("index.html"), /class="cart-link nav-status" href="\/register-interest\/">Register interest</);
  assert.match(pages.get("app/index.html"), /data-status-copy>Opens June 2027\. Register your interest now\./);
});

test("presale: pre-launch lines say founding places are on sale", () => {
  const { pages } = builds.presale;
  assert.match(pages.get("app/index.html"), /data-status-copy>Opens June 2027\. Founding places are on sale now\./);
});

test("live: no pre-launch wording, no Register interest", () => {
  const { pages } = builds.live;
  for (const [f, html] of pages) {
    assert.ok(!/data-status-copy/.test(html), `${f}: pre-launch wording while live`);
    assert.ok(!/\/register-interest\//.test(html), `${f}: links to Register interest while live`);
  }
  assert.ok(!pages.has("register-interest/index.html"));
});

test("FORMS out of beta: a link to the FORMS site, never the coming-soon label", () => {
  const { pages } = builds.formsOpen;
  for (const [f, html] of pages) assert.ok(!/SiteGuard FORMS(:| \() ?coming soon/.test(html), f);
  assert.match(pages.get("index.html"), /<nav[\s\S]*<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS<\/a>[\s\S]*<\/nav>/);
  assert.match(builds.coming_soon.pages.get("index.html"), /<span class="cart-link is-soon" aria-disabled="true">SiteGuard FORMS: coming soon<\/span>/);
});

test("banned words: coming soon and launching only inside data-status-copy, or the FORMS label in beta", () => {
  const beta = { beta: true, app_status: "coming_soon" };
  assert.deepEqual(wordingHits(`<p>${statusCopy("Launching June. Coming soon.")}</p>`, beta), []);
  assert.deepEqual(wordingHits("<p>Coming soon to your site</p>", beta), ["Coming soon"]);
  assert.deepEqual(wordingHits("<p>Launching in June</p>", beta), ["Launching"]);
  assert.deepEqual(wordingHits(`<span class="forms-soon">SiteGuard FORMS (coming soon)</span>`, beta), []);
  assert.deepEqual(wordingHits(`<span class="forms-soon">SiteGuard FORMS (coming soon)</span>`, { ...beta, beta: false }), ["coming soon"]);
  assert.deepEqual(wordingHits("<p>Fully compliant and certified</p>", beta), ["compliant", "certified"]);
  assert.equal(withoutStatusCopy(`a<span data-status-copy>x</span>b`), "a b");
});

test("gated products and markets are refused", () => {
  const m = { beta: true, app_status: "coming_soon" };
  for (const s of ["SiteGuard CORE", "SiteGuard AI", "robotics", "humanoid robots", "New Zealand", "Singapore", "overseas markets"]) {
    assert.notDeepEqual(wordingHits(`<p>${s}</p>`, m), [], s);
  }
  assert.deepEqual(wordingHits("<p>core site SWMS</p>", m), []);
});

test("the build refuses pre-launch wording once live, and the FORMS label once FORMS is open", () => {
  const html = `<p>${statusCopy("Opens June 2027.")}</p><span>SiteGuard FORMS (coming soon)</span>`;
  assert.equal(checkStatusCopy(html, { beta: true, app_status: "presale" }).length, 0);
  assert.equal(checkStatusCopy(html, { beta: true, app_status: "live" }).length, 1);
  assert.equal(checkStatusCopy(html, { beta: false, app_status: "live" }).length, 2);
});

test("site-mode.json: this repo's file is valid; bad values are reported", async () => {
  const ok = await loadSiteMode(ROOT);
  assert.deepEqual(ok.problems, []);
  assert.ok(["coming_soon", "presale", "live"].includes(ok.mode.app_status));
  const bad = await loadSiteMode(ROOT, { app_status: "soon", beta: "yes" });
  assert.equal(bad.problems.length, 2);
});
