// WP-S1: data/catalogue.json is the full catalogue (FORMS packs and the app
// products, group "app"), and the App pages' prices equal it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appPriceDrift } from "../build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cat = JSON.parse(await readFile(path.join(ROOT, "data/catalogue.json"), "utf8"));
const app = JSON.parse(await readFile(path.join(ROOT, "data/app-packages.json"), "utf8"));

test("the catalogue carries the FORMS groups and the app products", () => {
  const groups = new Set(cat.packs.map((p) => p.group));
  for (const g of ["trade-packs", "builder-packs", "management-systems", "specialist-packs", "app"]) assert.ok(groups.has(g), g);
  const ids = cat.packs.filter((p) => p.group === "app").map((p) => p.id).sort();
  assert.deepEqual(ids, ["app:audit:seat", "app:bundle:domestic", "app:bundle:heavy-commercial", "app:bundle:light-commercial",
    "app:trade:domestic", "app:trade:heavy-commercial", "app:trade:light-commercial"]);
  for (const p of cat.packs.filter((x) => x.group === "app")) {
    assert.equal(p.prices, null, `${p.id}: no FORMS price`);
    assert.equal(p.purchasable, false, `${p.id}: not sold by the FORMS checkout`);
    assert.equal(p.app_prices.annual, p.app_prices.per_month * 12);
  }
  assert.equal(cat.prices_exclude_gst, true);
  assert.equal(cat.app.founding.places, 20);
});

test("the App pages' prices equal the catalogue's group app", () => {
  assert.deepEqual(appPriceDrift(app, cat), []);
  const bad = structuredClone(app);
  bad.levels[0].price_month += 1;
  assert.match(appPriceDrift(bad, cat)[0], /app:trade:domestic at 197 a month, catalogue\.json at 196/);
  const none = { ...cat, packs: cat.packs.filter((p) => p.id !== "app:audit:seat") };
  assert.match(appPriceDrift(app, none)[0], /no app product app:audit:seat/);
});
