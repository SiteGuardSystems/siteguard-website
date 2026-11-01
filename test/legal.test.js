// WP-S11: the FORMS sale terms on the Systems site, and the App Subscription
// Terms and Founding Offer Terms marked PENDING SOLICITOR.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LEGAL_PAGES, PENDING } from "../build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

async function buildWith(args) {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-legal-"));
  await run(process.execPath, [path.join(ROOT, "build.mjs"), ...args], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir } });
  return dir;
}
const read = (dir, rel) => readFile(path.join(dir, rel), "utf8");
const exists = async (dir, rel) => readFile(path.join(dir, rel)).then(() => true, () => false);

const soon = await buildWith(["--app-status=coming_soon"]);
const presale = await buildWith(["--app-status=presale"]);
test.after(async () => { for (const d of [soon, presale]) await rm(d, { recursive: true, force: true }); });

test("the FORMS sale terms are published from the synced legal sources", async () => {
  for (const [slug, ref] of [["terms-of-sale", "SG-LEGAL-02"], ["refunds", "SG-LEGAL-03"], ["document-use-disclaimer", "SG-LEGAL-01"], ["forms-app-terms", "SG-LEGAL-08"]]) {
    const html = await read(soon, `legal/${slug}/index.html`);
    assert.ok(html.includes(ref), slug);
    assert.ok(!html.includes(PENDING), slug);
    assert.ok((await read(soon, "index.html")).includes(`href="/legal/${slug}/"`), `footer links ${slug}`);
  }
  // The checkout notice is synced for the cart page, not published as a page.
  assert.match(await readFile(path.join(ROOT, "content/legal/checkout-notice.md"), "utf8"), /SG-LEGAL-06/);
  const sync = await readFile(path.join(ROOT, "scripts/sync-legal.mjs"), "utf8");
  for (const f of ["terms-of-sale.md", "refunds.md", "checkout-notice.md", "terms-of-use.md", "disclaimer.md"]) assert.ok(sync.includes(`"${f}"`), f);
});

test("app subscription and founding terms: not published before presale", async () => {
  for (const slug of ["app-subscription-terms", "founding-offer-terms"]) {
    assert.equal(await exists(soon, `legal/${slug}/index.html`), false, slug);
    assert.ok(!(await read(soon, "index.html")).includes(`/legal/${slug}/`), slug);
  }
});

test("from presale they are published marked PENDING SOLICITOR, noindex and out of the sitemap", async () => {
  const sitemap = await read(presale, "sitemap.xml");
  for (const [slug, ref] of [["app-subscription-terms", "SG-LEGAL-12"], ["founding-offer-terms", "SG-LEGAL-13"]]) {
    const html = await read(presale, `legal/${slug}/index.html`);
    assert.ok(html.includes(ref), slug);
    assert.ok(html.includes(`<strong>${PENDING}</strong>`), slug);
    assert.ok(html.includes("data-pending-solicitor"), slug);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/, slug);
    assert.ok(!sitemap.includes(`/legal/${slug}/`), slug);
  }
  // The founding page links its terms; the refund wording is the brief's.
  const founding = await read(presale, "app/founding-offer/index.html");
  assert.ok(founding.includes('href="/legal/founding-offer-terms/"'));
  const terms = await read(presale, "legal/founding-offer-terms/index.html");
  assert.ok(terms.includes("a refund of the unused prepayment"));
  assert.ok(!/full refund/i.test(terms));
  for (const re of [/\bcompliant\b/i, /\bcertified\b/i, /\bguarantee/i, /\bCORE\b/, /SiteGuard AI/, /New Zealand/]) assert.ok(!re.test(terms), String(re));
});

test("a production build refuses terms still marked PENDING SOLICITOR", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-legal-prod-"));
  try {
    // --production refuses the --app-status override too, so this checks the
    // pending-terms message itself appears among the errors.
    const r = spawnSync(process.execPath, [path.join(ROOT, "build.mjs"), "--production", "--app-status=presale"], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ERROR: \/legal\/founding-offer-terms\/: SG-LEGAL-13 .* is PENDING SOLICITOR/);
    assert.match(r.stdout, /ERROR: \/legal\/app-subscription-terms\/: SG-LEGAL-12 .* is PENDING SOLICITOR/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("every legal page entry has a source file", async () => {
  for (const l of LEGAL_PAGES) {
    const dir = path.join(ROOT, "content", l.dir ?? "legal");
    assert.ok((await readdir(dir)).includes(l.file), l.file);
  }
});
