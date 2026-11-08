// Measurement tags (W2 M1, W4 M3, W5 M9): off until a Pages build setting is set; the CSP opens
// only for what is on. The token below is a made-up 32-hex test value.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadMeasure, measureCsp, measureHead } from "../scripts/lib/measure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const run = promisify(execFile);
const TOKEN = "0123456789abcdef0123456789abcdef";
const BASE_CSP = "default-src 'self'; script-src 'self'; connect-src 'self' https://www.siteguardforms.com.au; object-src 'none'";

test("nothing set: no tag, CSP unchanged", () => {
  const m = loadMeasure({});
  assert.equal(measureHead(m), "");
  assert.equal(measureCsp(BASE_CSP, m), BASE_CSP);
  assert.deepEqual(m.problems, []);
});

test("default build: no beacon on any page, no Cloudflare Insights in the CSP", async () => {
  for (const f of ["index.html", "contact/index.html", "consulting/index.html"])
    assert.doesNotMatch(await readFile(path.join(DIST, f), "utf8"), /cloudflareinsights/, f);
  assert.doesNotMatch(await readFile(path.join(DIST, "_headers"), "utf8"), /cloudflareinsights/);
});

test("M1 beacon: the Cloudflare snippet with the token, and the CSP opens to its two hosts only", () => {
  const m = loadMeasure({ CF_WEB_ANALYTICS_TOKEN: ` ${TOKEN.toUpperCase()} ` });
  assert.equal(m.cfBeacon, TOKEN);
  assert.equal(measureHead(m), `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}"></script>\n`);
  const csp = measureCsp(BASE_CSP, m);
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.siteguardforms\.com\.au https:\/\/cloudflareinsights\.com;/);
  assert.equal(measureCsp(csp, m), csp); // adding twice changes nothing
});

test("a malformed token adds nothing and is reported", () => {
  for (const bad of ["abc", `${TOKEN}0`, "<script>", "not-a-token-at-all-not-a-token-ok"]) {
    const m = loadMeasure({ CF_WEB_ANALYTICS_TOKEN: bad });
    assert.equal(m.cfBeacon, null, bad);
    assert.equal(measureHead(m), "");
    assert.match(m.problems[0], /CF_WEB_ANALYTICS_TOKEN/);
  }
});

test("M3 Search Console: the verification meta tag, and no CSP change", () => {
  const code = "AbCdEf-123_xyz0987654321AbCdEfGhIjKlMnOpQr";
  const m = loadMeasure({ GOOGLE_SITE_VERIFICATION: ` ${code} ` });
  assert.equal(measureHead(m), `<meta name="google-site-verification" content="${code}">\n`);
  assert.equal(measureCsp(BASE_CSP, m), BASE_CSP);
  for (const bad of ['<meta name="google-site-verification" content="abc">', "short", "has space in it here"]) {
    const b = loadMeasure({ GOOGLE_SITE_VERIFICATION: bad });
    assert.equal(b.gscVerify, null, bad);
    assert.match(b.problems[0], /GOOGLE_SITE_VERIFICATION/);
  }
});

test("built with the setting: the beacon is on every page and in _headers", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "measure-"));
  await run(process.execPath, [path.join(ROOT, "build.mjs")], { cwd: ROOT, env: { ...process.env, DIST_DIR: dir, CF_WEB_ANALYTICS_TOKEN: TOKEN, GOOGLE_SITE_VERIFICATION: "TestVerificationCode_0123" } });
  for (const f of ["index.html", "contact/index.html", "legal/privacy/index.html"])
    assert.match(await readFile(path.join(dir, f), "utf8"), /beacon\.min\.js" data-cf-beacon=/, f);
  assert.match(await readFile(path.join(dir, "index.html"), "utf8"), /<meta name="google-site-verification" content="TestVerificationCode_0123">/);
  const h = await readFile(path.join(dir, "_headers"), "utf8");
  assert.match(h, /script-src 'self'[^;]* https:\/\/static\.cloudflareinsights\.com/);
  assert.match(h, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
});
