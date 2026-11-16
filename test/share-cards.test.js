// Share cards (W14): Consulting and Education pages have Open Graph and Twitter tags with a
// current 1200x630 card and no price; og:url stays the canonical (seo.test.js).
// Runs on the dist/ that `npm test` builds first. A failure about a stale or missing card:
// run `npm run share-cards` and commit assets/share/.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { shareSlug, shareUrl, pngSize, CARD_W, CARD_H } from "../scripts/lib/share-cards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const manifest = JSON.parse(await readFile(path.join(DIST, "share-cards.json"), "utf8"));
const record = JSON.parse(await readFile(path.join(ROOT, "assets/share/cards.json"), "utf8"));
const html = (url) => readFile(path.join(DIST, url, "index.html"), "utf8");
const meta = (h, attr, name) => h.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`))?.[1];

test("every Consulting service page and every Education page has a card", () => {
  const urls = manifest.map((c) => c.url);
  for (const u of ["/consulting/", "/consulting/gap-analysis/", "/education/"]) assert.ok(urls.includes(u), `${u} has no card`);
  assert.ok(urls.filter((u) => u.startsWith("/consulting/")).length >= 9);
  assert.ok(urls.filter((u) => u.startsWith("/education/")).length >= 2);
});

for (const c of manifest) {
  test(`${c.url}: tags, image and share link`, async () => {
    const h = await html(c.url);
    const slug = shareSlug(c.url);
    assert.equal(meta(h, "property", "og:image"), `https://www.siteguardsystems.com.au/assets/share/${slug}.png`);
    assert.equal(meta(h, "property", "og:image:width"), String(CARD_W));
    assert.equal(meta(h, "property", "og:image:height"), String(CARD_H));
    assert.equal(meta(h, "name", "twitter:card"), "summary_large_image");
    assert.equal(meta(h, "name", "twitter:image"), meta(h, "property", "og:image"));
    assert.ok(meta(h, "name", "twitter:title"));
    assert.ok(meta(h, "name", "twitter:description"));
    assert.equal(meta(h, "property", "og:url"), `https://www.siteguardsystems.com.au${c.url}`);
    const share = new URL(shareUrl(`https://www.siteguardsystems.com.au${c.url}`, c.module));
    assert.equal(share.searchParams.get("utm_source"), "social");
    assert.equal(share.searchParams.get("utm_medium"), "share");
    assert.equal(share.searchParams.get("utm_campaign"), c.module);
    assert.doesNotMatch(`${c.title} ${c.description}`, /\$\s?\d/, "no price on a card");
  });

  test(`${c.url}: card is 1200x630 and drawn from this text`, async () => {
    const slug = shareSlug(c.url);
    const size = pngSize(await readFile(path.join(ROOT, "assets/share", `${slug}.png`)));
    assert.deepEqual(size, { width: CARD_W, height: CARD_H });
    assert.deepEqual(record[slug], { title: c.title, description: c.description, module: c.module },
      `${slug}.png is stale: run npm run share-cards`);
  });
}

test("no unused cards, and other pages keep the generic image", async () => {
  const used = new Set(manifest.map((c) => `${shareSlug(c.url)}.png`));
  for (const f of await readdir(path.join(ROOT, "assets/share"))) if (f.endsWith(".png")) assert.ok(used.has(f), `${f} is not used by any page`);
  const home = await readFile(path.join(DIST, "index.html"), "utf8");
  assert.equal(meta(home, "property", "og:image"), "https://www.siteguardsystems.com.au/assets/apple-touch-icon.png");
  assert.doesNotMatch(home, /twitter:card/);
});
