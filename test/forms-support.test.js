// FORMS support links on /support/ (W13): hidden until each storefront page is live.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkFormsSupport, formsSupportSection } from "../scripts/lib/forms-support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const FORMS = "https://www.siteguardforms.com.au";

async function supportPage(cfg) {
  const dir = await mkdtemp(path.join(tmpdir(), "sg-forms-support-"));
  const env = { ...process.env, DIST_DIR: path.join(dir, "dist") };
  if (cfg) {
    env.FORMS_SUPPORT_LINKS_PATH = path.join(dir, "links.json");
    await writeFile(env.FORMS_SUPPORT_LINKS_PATH, JSON.stringify(cfg));
  }
  await run(process.execPath, [path.join(ROOT, "build.mjs")], { cwd: ROOT, env });
  return readFile(path.join(dir, "dist/support/index.html"), "utf8");
}

test("the committed file has both links hidden", async () => {
  const cfg = checkFormsSupport(JSON.parse(await readFile(path.join(ROOT, "data/forms-support-links.json"), "utf8")));
  assert.equal(cfg.lost_documents.live, false);
  assert.equal(cfg.how_delivery_works.live, false);
});

test("/support/ shows no FORMS links while both are hidden", async () => {
  const html = await supportPage(null);
  assert.doesNotMatch(html, /data-forms-support/);
  assert.doesNotMatch(html, /Lost your FORMS documents/);
  assert.doesNotMatch(html, /How FORMS delivery works/);
});

test("/support/ shows only the links marked live", async () => {
  const html = await supportPage({
    lost_documents: { live: true, path: "/lost-documents/" },
    how_delivery_works: { live: false, path: "/how-delivery-works/" },
  });
  assert.ok(html.includes(`<a href="${FORMS}/lost-documents/">Lost your FORMS documents?</a>`));
  assert.doesNotMatch(html, /How FORMS delivery works/);
});

test("both live: both links, on the FORMS site", () => {
  const html = formsSupportSection(checkFormsSupport({
    lost_documents: { live: true, path: "/lost-documents/" },
    how_delivery_works: { live: true, path: "/how-delivery-works/" },
  }), FORMS);
  assert.match(html, /href="https:\/\/www\.siteguardforms\.com\.au\/lost-documents\/"/);
  assert.match(html, /href="https:\/\/www\.siteguardforms\.com\.au\/how-delivery-works\/"/);
});

test("a bad file stops the build", () => {
  assert.throws(() => checkFormsSupport({ lost_documents: { live: "yes", path: "/x/" }, how_delivery_works: { live: false, path: "/y/" } }), /live must be/);
  assert.throws(() => checkFormsSupport({ lost_documents: { live: false, path: "https://evil.example/" }, how_delivery_works: { live: false, path: "/y/" } }), /site path/);
  assert.throws(() => checkFormsSupport({ lost_documents: { live: false, path: "/x/" } }), /how_delivery_works/);
});
