// Dan's decision #90 (1 Nov 2026): ONE price source, Hseq-Dev packages.py via
// docs/pricing/. This repo is public, so it pins Hseq-Dev's PUBLIC VIEW of the
// two price tables (pricing.lock + vendor/hseq-dev/pricing/*.public.json, from
// docs/pricing/export_price_tables.py --website): only the figures this site
// shows or sells from, never the full tables (internal codes, held or
// unreleased pack prices, notes). Every price the site shows or uses must be
// one of the pinned figures: the App pages, the catalogue's group "app" rows
// and the founding prepayment, the App checkout forms, and the FORMS shop.
// Nothing here calculates a price. To update: docs/pricing/README.md in Hseq-Dev.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { appProductId, moneyCents } from "../scripts/lib/app-pages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lf = (file) => readFileSync(path.join(ROOT, file)).toString("utf8").replace(/\r\n/g, "\n");
const LOCK = JSON.parse(lf("pricing.lock"));
const VIEW = Object.fromEntries(Object.entries(LOCK.files).map(([name, f]) => [name, JSON.parse(lf(f.vendored_at))]));
const APP = VIEW["app_price_table.public.json"];
const FORMS = VIEW["forms_price_table.public.json"];
const CAT = JSON.parse(lf("data/catalogue.json"));
const AP = JSON.parse(lf("data/app-packages.json"));
const APP_ROWS = CAT.packs.filter((p) => p.group === "app");
const noComments = (o) => (Array.isArray(o) ? o.map(noComments)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, noComments(v)])) : o);
const cents = (s) => Math.round(Number(s.replace(/,/g, "")) * 100);

describe("pricing.lock: the pinned public view of Hseq-Dev's price tables", () => {
  test("each pinned copy hashes to the lock (sha256 of its LF form)", () => {
    assert.equal(LOCK.repo, "SiteGuardSystems/Hseq-Dev");
    assert.equal(LOCK.kind, "price-tables-public-view");
    assert.deepEqual(Object.keys(LOCK.files).sort(), ["app_price_table.public.json", "forms_price_table.public.json"]);
    for (const [name, f] of Object.entries(LOCK.files)) {
      assert.equal(f.vendored_at, `vendor/hseq-dev/pricing/${name}`);
      const got = createHash("sha256").update(lf(f.vendored_at)).digest("hex");
      assert.equal(got, f.sha256, `${f.vendored_at} is not the pinned ${name}: re-run Hseq-Dev docs/pricing/export_price_tables.py --website`);
      assert.match(f.source_sha256, /^[0-9a-f]{64}$/, `${name}: the full table it was cut from`);
    }
    assert.equal(APP.revision, LOCK.revision.app);
    assert.equal(FORMS.revision, LOCK.revision.forms);
  });

  test("a public repo: only the public view is vendored, with no internal codes, notes or unreleased prices", () => {
    assert.deepEqual(readdirSync(path.join(ROOT, "vendor/hseq-dev/pricing")).sort(), Object.keys(LOCK.files).sort());
    const PRIVATE = ["code", "components", "not_in_workbook", "dcr_packs", "launch_wave_rules", "consultant_plans",
      "consultant_seat_annual", "workbook_one_off", "workbook_annual", "management_bands", "add_ons", "source", "status"];
    const keys = (o, out = new Set()) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { out.add(k); keys(v, out); }
      return out;
    };
    for (const [name, v] of Object.entries(VIEW)) {
      const ks = keys(v);
      assert.deepEqual(PRIVATE.filter((k) => ks.has(k)), [], name);
      const text = JSON.stringify(noComments(v));
      for (const w of [/\bDan\b/, /flagged/i, /PENDING/, /\bCORE\b/, /SiteGuard AI/, /robot/i, /OFSC/i, /\.xlsx/]) assert.doesNotMatch(text, w, name);
    }
  });
});

describe("app prices: the catalogue's group \"app\" is the pinned table", () => {
  test("each row's app_prices (every cadence and the founding prepayment) equal the view", () => {
    assert.deepEqual(APP_ROWS.map((p) => p.id).sort(), Object.keys(APP.products).sort());
    for (const p of APP_ROWS) {
      const want = APP.products[p.id];
      assert.deepEqual(p.app_prices, want.app_prices, p.id);
      assert.equal(p.name, want.name, p.id);
      assert.ok(Number.isInteger(p.app_prices.founding_prepay_cents), `${p.id}: founding prepayment in cents`);
      assert.equal(p.prices, null, `${p.id}: never sold by the FORMS checkout`);
    }
    for (const [k, v] of Object.entries(APP.header)) assert.deepEqual(noComments(CAT.app[k]), v, `catalogue.json app.${k}`);
  });

  test("the App pages' source (data/app-packages.json) carries the same figures", () => {
    const row = (id) => APP.products[id].app_prices;
    for (const l of AP.levels) {
      const r = row(appProductId.level(l));
      assert.equal(l.price_month, r.per_month, l.slug);
      assert.equal(l.per_project_month, r.per_project_month, l.slug);
      assert.equal(l.reference_projects, r.reference_projects, l.slug);
    }
    for (const b of AP.bundles) {
      const r = row(appProductId.bundle(b));
      assert.equal(b.price_month, r.per_month, b.slug);
      assert.equal(b.reference_projects, r.reference_projects, b.slug);
    }
    assert.equal(AP.audit.seat_month, row(appProductId.audit).per_month);
    assert.deepEqual(AP.billing.loading, APP.header.billing.loading);
    for (const k of ["places", "discount", "term_months", "price_lock_months", "forms_pack_free_from"]) {
      assert.equal(AP.founding[k], APP.header.founding[k], `founding.${k}`);
    }
  });
});

describe("FORMS prices: the catalogue's shop packs are the pinned table", () => {
  const { monthly_factor: f, monthly_round_to_aud: r } = FORMS.billing;
  const pairs = new Set(Object.values(FORMS.bands).flat().map((b) => `${b.one_off}/${b.annual}`));
  const banded = /^(subcontractor:[A-Z]+:(domestic|light-commercial|heavy-commercial)|swms:[A-Z]+|compliance:[A-Z]+)$/;
  const shown = CAT.packs.filter((p) => p.show && p.prices);

  test("every pack the shop shows is at the table's price: flat exactly, banded at a band row, monthly by the rule", () => {
    assert.ok(shown.length > 50, "the shop shows priced packs");
    for (const p of shown) {
      const k = `${p.prices.one_off ?? null}/${p.prices.annual ?? null}`;
      const flat = FORMS.flat[p.id];
      if (flat) assert.equal(k, `${flat.one_off}/${flat.annual}`, `${p.id}: not the table's price`);
      else {
        assert.match(p.id, banded, `${p.id}: shown, but neither a flat price nor a banded pack in the public table`);
        assert.ok(pairs.has(k), `${p.id}: ${k} is not a band in the pinned FORMS table`);
      }
      if (p.prices.annual != null) assert.equal(p.prices.monthly, Math.floor((p.prices.annual * f) / 12 / r + 0.5) * r, `${p.id}: monthly`);
      assert.ok(FORMS.purchasable_waves.includes(p.launch_wave), `${p.id}: shown outside a purchasable wave`);
    }
    assert.equal(CAT.price_table.revision, FORMS.revision);
    assert.equal(CAT.price_table.effective_from, FORMS.effective_from);
    assert.deepEqual(CAT.price_table.purchasable_waves, FORMS.purchasable_waves);
    assert.equal(CAT.price_table.monthly_factor, f);
    assert.equal(CAT.price_table.monthly_round_to_aud, r);
  });

  test("single documents and the 'from' prices", () => {
    const doc = FORMS.flat["single-document"].one_off;
    assert.equal(CAT.price_table.single_document.one_off_aud, doc);
    for (const d of CAT.documents.filter((x) => x.sellable)) assert.equal(d.price, doc, d.code);
    const oneOffs = new Set(shown.map((p) => p.prices.one_off ?? p.prices.annual));
    for (const [g, v] of Object.entries(CAT.from_prices)) if (v != null) assert.ok(oneOffs.has(v), `from_prices.${g} ${v}`);
  });
});

// The pages as built: every amount on the App, Audit and FORMS shop pages and
// in the shop's data files is one of the pinned figures. Built with prices on
// (presale, checkout, FORMS out of beta) so every price the site can show
// renders; the real site-mode is not changed.
describe("rendered prices: what a visitor sees", () => {
  let dist;
  before(async () => {
    dist = await mkdtemp(path.join(tmpdir(), "sg-pricing-"));
    await promisify(execFile)(process.execPath, [path.join(ROOT, "build.mjs"), "--app-status=presale", "--checkout=true", "--beta=false"],
      { cwd: ROOT, env: { ...process.env, DIST_DIR: dist } });
  });
  after(async () => { if (dist) await rm(dist, { recursive: true, force: true }); });

  const htmlUnder = (dir) => {
    const out = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".html")) out.push(p);
      }
    };
    walk(dir);
    return out;
  };
  const amounts = (html) => [...html.matchAll(/(?<![\w-])(?:A)?\$\s?([0-9][0-9,]*(?:\.[0-9]{2})?)(?![0-9])/g)].map((m) => [m[1], cents(m[1])]);

  test("App and Audit pages: every amount is a pinned app figure; founding prices are the prepayment, to the cent", async () => {
    const ok = new Set();
    for (const { app_prices: a } of Object.values(APP.products)) {
      for (const c of Object.values(a.cadences)) for (const v of [c.per_month, c.per_period, c.per_year]) ok.add(v * 100);
      for (const v of [a.per_month, a.annual, a.per_project_month]) if (v != null) ok.add(Math.round(v * 100));
      ok.add(a.founding_prepay_cents);
    }
    let n = 0;
    for (const dir of ["app", "audit", "founding"]) {
      let files = [];
      try { files = htmlUnder(path.join(dist, dir)); } catch { continue; }
      for (const file of files) {
        for (const [s, c] of amounts(await readFile(file, "utf8"))) {
          n++;
          assert.ok(ok.has(c), `${path.relative(dist, file)}: $${s} is not a price in the pinned app table`);
        }
      }
    }
    assert.ok(n > 30, "the App pages show prices in this build");
    const founding = await readFile(path.join(dist, "app/founding-offer/index.html"), "utf8");
    for (const [id, { app_prices: a }] of Object.entries(APP.products)) {
      assert.ok(founding.includes(`${moneyCents(a.founding_prepay_cents)}${id === appProductId.audit ? " a seat" : ""} for the first year`), `${id}: founding price ${moneyCents(a.founding_prepay_cents)}`);
    }
    assert.ok(founding.includes("A$1,999.20 for the first year"), "the prepayment Stripe takes, not a rounded figure");
    assert.match(founding, /data-app-checkout="founding"/);
  });

  test("FORMS shop pages and data: every amount is a shown pack's pinned price (or its monthly-over-a-year difference)", async () => {
    const ok = new Set([FORMS.flat["single-document"].one_off * 100]);
    const pricesById = new Map();
    for (const p of CAT.packs.filter((x) => x.show && x.prices)) {
      const { one_off, annual, monthly } = p.prices;
      for (const v of [one_off, annual, monthly]) if (v != null) ok.add(v * 100);
      if (annual != null && monthly != null) ok.add((monthly * 12 - annual) * 100);
      pricesById.set(p.id, p.prices);
    }
    let n = 0;
    for (const file of htmlUnder(path.join(dist, "forms"))) {
      const html = await readFile(file, "utf8");
      for (const [s, c] of amounts(html)) {
        n++;
        assert.ok(ok.has(c), `${path.relative(dist, file)}: $${s} is not a price in the pinned FORMS table`);
      }
      for (const m of html.matchAll(/data-add-pack="([^"]+)"[^>]*data-price="(\d+)"/g)) {
        const p = pricesById.get(m[1]);
        assert.ok(p, `${m[1]}: an Add to cart button for a pack the shop does not show`);
        assert.equal(Number(m[2]), p.one_off ?? p.annual, `${m[1]}: cart price`);
      }
    }
    assert.ok(n > 100, "the shop shows prices in this build");
    const docs = JSON.parse(await readFile(path.join(dist, "forms/assets/documents.json"), "utf8"));
    assert.equal(docs.price, FORMS.flat["single-document"].one_off);
  });
});
