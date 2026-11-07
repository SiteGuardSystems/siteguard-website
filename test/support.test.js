// W3: /support/ and /support/delete-account/ (linked from the app store
// listings). The support email, how to get help, and how to ask for account
// deletion without the app. The address is SUPPORT_EMAIL (hello@ until set).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { wordingHits } from "../build.mjs";
import { loadSiteMode } from "../scripts/lib/site-mode.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel, dist = path.join(ROOT, "dist")) => readFile(path.join(dist, rel), "utf8");
const MODE = (await loadSiteMode(ROOT)).mode;

test("/support/: the support email, how to get help, a link to account deletion", async () => {
  const html = await read("support/index.html");
  assert.match(html, /<h1>Support<\/h1>/);
  assert.ok(html.includes('<a href="mailto:hello@siteguardsystems.com.au">hello@siteguardsystems.com.au</a>'), "hello@ until SUPPORT_EMAIL is set");
  assert.match(html, /What to send us/);
  assert.ok(html.includes('href="/support/delete-account/"'));
  assert.ok(html.includes('href="/legal/privacy/"'));
  assert.deepEqual(wordingHits(html, MODE), []);
  assert.ok(!/noindex/.test(html), "indexable: the store listings link it");
});

test("/support/delete-account/: how to ask by email, without the app; what is deleted and kept", async () => {
  const html = await read("support/delete-account/index.html");
  assert.match(html, /<h1>Delete your account<\/h1>/);
  assert.match(html, /You don't need the app to do this\./);
  assert.match(html, /with the subject "Delete my account"/);
  assert.match(html, /What we delete/);
  assert.match(html, /What we may have to keep/);
  assert.ok(html.includes("mailto:hello@siteguardsystems.com.au"));
  assert.deepEqual(wordingHits(html, MODE), []);
});

test("the footer links Support on every page; both pages are in the sitemap", async () => {
  assert.ok((await read("index.html")).includes('<li><a href="/support/">Support</a></li>'));
  const sitemap = await read("sitemap.xml");
  assert.ok(sitemap.includes("/support/</loc>") && sitemap.includes("/support/delete-account/</loc>"));
});

test("SUPPORT_EMAIL sets the address at build time", async () => {
  const dist = await mkdtemp(path.join(os.tmpdir(), "sg-support-"));
  try {
    const r = spawnSync(process.execPath, ["build.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DIST_DIR: dist, SUPPORT_EMAIL: "support@siteguardsystems.com.au" } });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    for (const rel of ["support/index.html", "support/delete-account/index.html"]) {
      assert.ok((await read(rel, dist)).includes("mailto:support@siteguardsystems.com.au"), rel);
    }
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
