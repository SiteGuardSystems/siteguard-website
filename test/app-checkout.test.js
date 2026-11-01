// WP-S10: founding places (presale) and app subscriptions (live) through the
// storefront's engine; WP-S9: the return pages here. The FORMS subscription
// link-out goes to the FORMS app's signup.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
async function buildWith(args) {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-appco-"));
  await run(process.execPath, [path.join(ROOT, "build.mjs"), ...args], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir } });
  return dir;
}
const read = (d, f) => readFile(path.join(d, f), "utf8");
const has = (d, f) => existsSync(path.join(d, f));
const b = {
  presaleOff: await buildWith(["--app-status=presale"]),
  presale: await buildWith(["--app-status=presale", "--checkout=true"]),
  live: await buildWith(["--app-status=live", "--checkout=true", "--beta=false"]),
  soon: await buildWith(["--app-status=coming_soon", "--checkout=true", "--beta=false"]),
};
test.after(async () => { for (const d of Object.values(b)) await rm(d, { recursive: true, force: true }); });

test("no app checkout without checkout on, or while coming soon", async () => {
  assert.ok(!(await read(b.presaleOff, "app/founding-offer/index.html")).includes("data-app-checkout"));
  assert.ok(!has(b.presaleOff, "founding/success/index.html"));
  assert.ok(!has(b.soon, "founding/success/index.html") && !has(b.soon, "app/success/index.html"));
});

test("presale: the founding form posts to the engine; return pages noindex; CSP lets the engine in", async () => {
  const html = await read(b.presale, "app/founding-offer/index.html");
  assert.match(html, /data-app-checkout="founding" data-engine="https:\/\/www\.siteguardforms\.com\.au"/);
  assert.ok(html.includes('<script src="/assets/app-checkout.js" defer></script>'));
  assert.ok(html.includes('href="/legal/founding-offer-terms/"'));
  for (const id of ["app:trade:domestic", "app:builder:heavy-commercial", "app:audit:seat"]) assert.ok(html.includes(`value="${id}"`), id);
  assert.match(html, /\+GST/);
  assert.ok(!html.includes('data-app-checkout="subscribe"'), "no subscriptions before live");
  for (const f of ["founding/success/index.html", "founding/cancelled/index.html"]) assert.match(await read(b.presale, f), /noindex/);
  assert.match(await read(b.presale, "founding/cancelled/index.html"), /data-founding-cancel data-engine=/);
  assert.match(await read(b.presale, "_headers"), /connect-src 'self' https:\/\/www\.siteguardforms\.com\.au;/);
  assert.ok(!(await read(b.presale, "sitemap.xml")).includes("/founding/"));
});

test("live: the subscription form (annual default) and /app/success/, no founding form", async () => {
  const html = await read(b.live, "app/pricing/index.html");
  assert.match(html, /data-app-checkout="subscribe"/);
  assert.match(html, /<option value="annual" selected>/);
  assert.ok(html.includes('href="/legal/app-subscription-terms/"'));
  assert.ok(has(b.live, "app/success/index.html") && has(b.live, "app/cancelled/index.html"));
  assert.ok(!has(b.live, "founding/success/index.html"));
});

test("FORMS subscription link-out: Subscribe goes to the FORMS app's signup with the pack and cadence", async () => {
  const html = await read(b.live, "forms/builder-packs/index.html");
  const hrefs = [...html.matchAll(/href="(https:\/\/app\.siteguardforms\.com\.au\/signup\?[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(hrefs.length);
  const q = new URL(hrefs[0]).searchParams;
  assert.ok(q.get("pack").startsWith("builder:"));
  assert.ok(["annual", "monthly"].includes(q.get("cadence")));
});
