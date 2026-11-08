// Partners, affiliates and the Google review link (scripts/lib/trust.mjs).
// The same file and the same tests live in SiteGuard-Forms-Storefront.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadTrust, partnerStrip, reviewBadge, partnersBody, REF_RE } from "../scripts/lib/trust.mjs";

async function fixture(partners, reviews) {
  const root = await mkdtemp(path.join(tmpdir(), "trust-"));
  await mkdir(path.join(root, "data"));
  if (partners !== undefined) await writeFile(path.join(root, "data/partners.json"), JSON.stringify({ partners }));
  if (reviews !== undefined) await writeFile(path.join(root, "data/google-reviews.json"), JSON.stringify(reviews));
  return root;
}
const today = new Date().toISOString().slice(0, 10);
const P = (o) => ({ name: "Acme Brokers", kind: "partner", url: "https://acme.example/", fee: "none", ...o });

test("nothing renders until there is something real to show", async () => {
  const t = await loadTrust(await fixture([], { place_id: "", rating: null, count: null }), "systems");
  assert.deepEqual(t.problems, []);
  assert.equal(partnerStrip(t), "");
  assert.equal(reviewBadge(t), "");
  assert.match(partnersBody(t, { source: "systems", brand: "SiteGuard" }), /building our partner network/);
});

test("missing data files are fine (empty), not an error", async () => {
  const t = await loadTrust(await fixture(), "forms");
  assert.deepEqual(t.problems, []);
  assert.equal(t.partners.length, 0);
});

test("partners are filtered by site and active flag, partners before affiliates", async () => {
  const t = await loadTrust(await fixture([
    P({ name: "Zed Affiliate", kind: "affiliate" }), P({ name: "Only Forms", sites: ["forms"] }),
    P({ name: "Retired", active: false }), P({ name: "Acme Brokers" }),
  ]), "systems");
  assert.deepEqual(t.partners.map((p) => p.name), ["Acme Brokers", "Zed Affiliate"]);
});

test("a paid link is marked rel=sponsored and the fee is disclosed", async () => {
  const t = await loadTrust(await fixture([P({ fee: "we_receive" }), P({ name: "Free Link", url: "https://free.example/" })]), "systems");
  const strip = partnerStrip(t);
  assert.match(strip, /href="https:\/\/acme\.example\/" rel="sponsored noopener"/);
  assert.match(strip, /href="https:\/\/free\.example\/" rel="noopener"/);
  const body = partnersBody(t, { source: "systems", brand: "SiteGuard" });
  assert.match(body, /SiteGuard may receive a referral fee/);
  assert.match(body, /tell the client about any referral fee/);
});

test("bad partner data is reported, not rendered quietly", async () => {
  const t = await loadTrust(await fixture([
    P({ url: "http://insecure.example/" }), P({ name: "B", kind: "sponsor" }), P({ name: "C", logo: "https://cdn.example/x.png" }),
    P({ name: "D", fee: "maybe" }), P({ name: "E", ref_code: "no spaces!" }), P({ name: "Acme Brokers" }),
  ]), "systems");
  const all = t.problems.join("\n");
  for (const re of [/url must be an https/, /kind must be/, /logo must be a file in \/assets\/partners/, /fee must be one of/, /ref_code/, /duplicate partner/]) assert.match(all, re);
});

test("text is escaped", async () => {
  const t = await loadTrust(await fixture([P({ name: "<script>x</script>", blurb: "a & b" })]), "systems");
  const body = partnersBody(t, { source: "systems", brand: "SiteGuard" });
  assert.ok(!body.includes("<script>x"));
  assert.match(body, /&lt;script&gt;/);
  assert.match(body, /a &amp; b/);
});

test("Google reviews: links only, never a rating, a count or review text (decision N3)", async () => {
  let t = await loadTrust(await fixture([], { place_id: "ChIJabcdefghijklmnop" }), "systems");
  let b = reviewBadge(t);
  assert.match(b, /See our reviews on Google/);
  assert.match(b, /google\.com\/maps\/place\/\?q=place_id:ChIJabcdefghijklmnop/);
  assert.match(b, /Leave us a review/);
  assert.match(b, /search\.google\.com\/local\/writereview\?placeid=ChIJabcdefghijklmnop/);
  t = await loadTrust(await fixture([], { place_id: "ChIJabcdefghijklmnop", profile_url: "https://maps.app.goo.gl/AbCdEf",
    review_url: "https://share.google/AbCdEfGh", rating: 4.8, count: 12, as_of: today, reviews: [{ text: "Great" }] }), "systems");
  b = reviewBadge(t);
  assert.match(b, /href="https:\/\/maps\.app\.goo\.gl\/AbCdEf"[^>]*>See our reviews on Google/);
  assert.match(b, /href="https:\/\/share\.google\/AbCdEfGh"[^>]*>Leave us a review/);
  for (const shown of ["4.8", "12 review", "★", "Great", "Rating as shown"]) assert.ok(!b.includes(shown), shown);
  assert.match(t.problems.join(" | "), /rating, count, as_of and reviews aren't shown.*open item/);
  assert.match(reviewBadge(t, { compact: true }), /^<div class="review-compact"><a class="review-badge" href="https:\/\/maps\.app\.goo\.gl\/AbCdEf"/);
});

test("the export's write-a-review link is used when there is no review link", async () => {
  const t = await loadTrust(await fixture([], { write_review_url: "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop" }), "systems");
  assert.deepEqual(t.problems, []);
  assert.match(reviewBadge(t), /writereview\?placeid=ChIJabcdefghijklmnop" rel="noopener">Leave us a review/);
  assert.ok(!/See our reviews/.test(reviewBadge(t)));
});

test("the committed data and sample carry links only", async () => {
  for (const f of ["google-reviews.json", "google-reviews.sample.json"]) {
    const j = JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), "utf8"));
    for (const k of ["rating", "count", "as_of", "reviews"]) assert.ok(!(k in j), `${f}: ${k}`);
  }
});

test("review links must point at Google", async () => {
  const t = await loadTrust(await fixture([], { review_url: "https://evil.example/review" }), "systems");
  assert.match(t.problems.join("\n"), /review_url must be a Google address/);
});

test("the partner form is marked as a partner enquiry and carries the referral code field", async () => {
  const t = await loadTrust(await fixture([]), "systems");
  const body = partnersBody(t, { source: "systems", endpoint: "https://shop.example/api/lead", brand: "SiteGuard" });
  assert.match(body, /name="enquiry_type" value="partner"/);
  assert.match(body, /data-ref-field/);
  assert.match(body, /name="website" tabindex="-1"/); // honeypot kept
  assert.match(body, /name="partner_url"/);
});

test("referral codes", () => {
  for (const ok of ["ACME", "acme-01", "B2"]) assert.match(ok, REF_RE);
  for (const bad of ["", "a", "-lead", "has space", "x".repeat(25), "a<b"]) assert.doesNotMatch(bad, REF_RE);
});
