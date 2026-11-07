// The status switch (data/site-mode.json): builds the site once per
// app_status value (and once with FORMS out of beta) into temporary folders
// and checks what each shows.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { wordingHits } from "../build.mjs";
import { checkStatusCopy, withoutStatusCopy, statusCopy, loadSiteMode, appStatusCopy, monthYear } from "../scripts/lib/site-mode.mjs";

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
      // A buy button is any button that leads to buying: while coming soon, only Register interest.
      assert.ok(!/^\/app\/(pricing|founding-offer)\//.test(href), `${f}: ${href}`);
      if (/^\/register-interest\//.test(href)) assert.equal(label, "Register interest", `${f}: ${href}`);
      if (/^(Buy|Get started|Founding places|Reserve)/i.test(label)) assert.fail(`${f}: buy button "${label}" while coming soon`);
    }
  }
  assert.ok(pages.has("register-interest/index.html"));
  assert.ok(!pages.has("app/pricing/index.html") && !pages.has("app/founding-offer/index.html"), "pricing and founding pages hidden while coming soon");
  assert.match(pages.get("index.html"), /class="cart-link nav-status" href="\/register-interest\/">Register interest</);
  assert.match(pages.get("app/index.html"), /data-status-copy>Coming soon\. Register your interest now\./);
});

// Status wording (Dan, 1 Nov 2026): no launch date while coming soon.
const STATUS_ELS = /<(\w+)\b[^>]*\bdata-status-copy\b[^>]*>([\s\S]*?)<\/\1>/g;
test("coming_soon: no June 2027 (or any 2027) inside a data-status-copy element; every status line reads the same", () => {
  const { pages } = builds.coming_soon;
  let n = 0;
  for (const [f, html] of pages) {
    for (const [, , inner] of html.matchAll(STATUS_ELS)) {
      n++;
      assert.ok(!/June 2027|2027/.test(inner), `${f}: status copy carries a date: ${inner}`);
      assert.ok(/^Coming soon\.( Register your interest now\.)?$/.test(inner), `${f}: status copy "${inner}"`);
    }
    if (isAppPage(f) || /^register-interest\//.test(f)) assert.ok(!/June 2027/.test(html), `${f}: mentions June 2027 while coming soon`);
    const meta = (html.match(/<title>[^<]*<\/title>|<meta name="description" content="[^"]*"/g) ?? []).join(" ");
    assert.ok(!/June 2027/.test(meta), `${f}: June 2027 in the title or description`);
  }
  assert.ok(n > 0, "status lines found");
});

test("presale: pre-launch lines say founding places are on sale", () => {
  const { pages } = builds.presale;
  const opens = monthYear(JSON.parse(readFileSync(path.join(ROOT, "data/app-packages.json"), "utf8")).launch.opens);
  assert.ok(opens, "launch.opens in data/app-packages.json");
  assert.ok(pages.get("app/index.html").includes(`data-status-copy>Launching ${opens}. Founding places are on sale now.`));
  assert.ok(pages.get("audit/index.html").includes(`data-status-copy>Launching ${opens}.`));
  assert.ok(pages.has("app/pricing/index.html") && pages.has("app/founding-offer/index.html"));
  const pricing = pages.get("app/pricing/index.html");
  for (const p of ["A$196", "A$271", "A$496", "A$910", "A$1,279", "A$1,757", "A$75"]) assert.ok(pricing.includes(`${p} a month <small>+GST</small>`), p);
  assert.match(pages.get("app/trade-packages/concrete/index.html"), /A\$196 a month <small>\+GST<\/small>/);
  assert.match(pages.get("audit/index.html"), /A\$75 a month <small>\+GST<\/small>/);
  assert.match(pages.get("index.html"), /class="cart-link nav-status" href="\/app\/founding-offer\/">Founding places</);
});

test("live: no pre-launch wording, no Register interest", () => {
  const { pages } = builds.live;
  for (const [f, html] of pages) {
    assert.ok(!/data-status-copy/.test(html), `${f}: pre-launch wording while live`);
    assert.ok(!/\/register-interest\//.test(html), `${f}: links to Register interest while live`);
  }
  assert.ok(!pages.has("register-interest/index.html"));
  assert.ok(pages.has("app/pricing/index.html") && !pages.has("app/founding-offer/index.html"));
});

test("FORMS out of beta (checkout off): a link to the FORMS site; in beta: the browse-only shop here, marked beta", () => {
  const { pages } = builds.formsOpen;
  for (const [f, html] of pages) assert.ok(!/SiteGuard FORMS(:| \() ?(coming soon|beta)/.test(html), f);
  assert.match(pages.get("index.html"), /<nav[\s\S]*<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS<\/a>[\s\S]*<\/nav>/);
  assert.ok(!pages.has("forms/index.html"));
  const beta = builds.coming_soon.pages;
  assert.match(beta.get("index.html"), /<nav[\s\S]*<a href="https:\/\/www\.siteguardforms\.com\.au\/">SiteGuard FORMS \(beta\)<\/a>[\s\S]*<\/nav>/);
  for (const [f, html] of beta) assert.ok(!/SiteGuard FORMS(:| \() ?coming soon/.test(html), f);
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
  const html = `<p>${statusCopy("Coming soon.")}</p><span>SiteGuard FORMS (coming soon)</span>`;
  assert.equal(checkStatusCopy(html, { beta: true, app_status: "presale" }).length, 0);
  assert.equal(checkStatusCopy(html, { beta: true, app_status: "live" }).length, 1);
  assert.equal(checkStatusCopy(html, { beta: false, app_status: "live" }).length, 2);
});

test("appStatusCopy: one wording, the date only in presale and only from the config value", () => {
  assert.equal(appStatusCopy({ app_status: "coming_soon" }, "2027-06"), `<p class="status-line" data-status-copy>Coming soon. Register your interest now.</p>`);
  assert.equal(appStatusCopy({ app_status: "coming_soon" }, "2027-06", { tag: "span", short: true }), `<span class="status-line" data-status-copy>Coming soon.</span>`);
  assert.equal(appStatusCopy({ app_status: "presale" }, "2027-06"), `<p class="status-line" data-status-copy>Launching June 2027. Founding places are on sale now.</p>`);
  assert.equal(appStatusCopy({ app_status: "presale" }, "2027-09", { short: true }), `<p class="status-line" data-status-copy>Launching September 2027.</p>`);
  assert.equal(appStatusCopy({ app_status: "live" }, "2027-06"), "");
  assert.throws(() => appStatusCopy({ app_status: "presale" }, undefined));
  assert.equal(monthYear("2027-13"), null);
});

test("site-mode.json: this repo's file is valid; bad values are reported", async () => {
  const ok = await loadSiteMode(ROOT);
  assert.deepEqual(ok.problems, []);
  // Dan, 1 Nov 2026 (#94): one beta switch, the storefront's, vendored and pinned.
  const own = JSON.parse(await readFile(path.join(ROOT, "data/site-mode.json"), "utf8"));
  assert.ok(!("beta" in own), "data/site-mode.json must not set beta");
  const lock = JSON.parse(await readFile(path.join(ROOT, "site-mode.lock"), "utf8"));
  assert.equal(lock.repo, "SiteGuardSystems/SiteGuard-Forms-Storefront");
  assert.equal(lock.path, "data/site-mode.json");
  const vendored = await readFile(path.join(ROOT, lock.vendored_at));
  assert.equal(createHash("sha256").update(vendored).digest("hex"), lock.sha256);
  assert.equal(ok.mode.beta, JSON.parse(vendored.toString("utf8")).beta);
  assert.equal(ok.mode.beta, lock.beta);
  assert.ok(["coming_soon", "presale", "live"].includes(ok.mode.app_status));
  const bad = await loadSiteMode(ROOT, { app_status: "soon", beta: "yes" });
  assert.equal(bad.problems.length, 2);
});
