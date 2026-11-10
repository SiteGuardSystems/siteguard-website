// U1: the /u/<token> Pages Function and its token check. The vectors were made with
// siteguard-ai's siteguard_org/unsubscribe.py make_token() under the test secret below, so a
// pass here means both sides agree on the algorithm. The secret is a test value, not a real one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readToken } from "../functions/_lib/unsubscribe-token.js";
import * as fn from "../functions/u/[token].js";

const SECRET = "test-only-secret-not-a-real-one-0000";
const VECTORS = [
  ["P-123", "UC0xMjM.pLo1FZlWgf-JxprxVVr8zQ"],
  ["prospect_7f3a", "cHJvc3BlY3RfN2YzYQ.II-rxrL6S95qdUcI7JTokg"],
  ["\u00dcn\u00efcode-ID", "w5xuw69jb2RlLUlE._iYvXhVTX48Kc_DOIw46nA"],
];

test("tokens made by siteguard-ai's unsubscribe.py are read back to the same prospect id", async () => {
  for (const [pid, token] of VECTORS) assert.equal(await readToken(token, SECRET), pid);
});

test("a wrong signature, another secret or a malformed token is refused", async () => {
  assert.equal(await readToken("UC0xMjM.AAAAAAAAAAAAAAAAAAAAAA", SECRET), null);
  assert.equal(await readToken(VECTORS[0][1], SECRET.replace("0000", "0001")), null);
  for (const bad of ["", "nodot", "a.b.c", "UC0xMjM.", ".pLo1FZlWgf-JxprxVVr8zQ", "UC0x+MjM.pLo1FZlWgf-JxprxVVr8zQ", "UC0xMjM.pLo1FZlWgf-JxprxVVr8z", undefined])
    assert.equal(await readToken(bad, SECRET), null, String(bad));
});

test("a short or missing secret is a configuration error, never a pass", async () => {
  await assert.rejects(() => readToken(VECTORS[0][1], "short"));
  await assert.rejects(() => readToken(VECTORS[0][1], undefined));
});

class FakeD1 {
  constructor() { this.rows = []; this.fail = false; }
  prepare(sql) {
    const db = this;
    return { bind(...args) { return { async run() {
      if (db.fail) throw new Error("D1 down");
      assert.match(sql, /^INSERT OR IGNORE INTO unsubscribes \(prospect_id, at\)/);
      const [pid, at] = args;
      if (!db.rows.some((r) => r.prospect_id === pid)) db.rows.push({ prospect_id: pid, at, collected_at: null });
      return { success: true };
    } }; } };
  }
}

const ctx = (token, env) => ({ params: { token }, env, request: new Request(`https://www.siteguardsystems.com.au/u/${token}`) });
const env = (db = new FakeD1()) => ({ SITEGUARD_UNSUBSCRIBE_SECRET: SECRET, UNSUB_DB: db });

test("GET shows one button that posts back, and writes nothing", async () => {
  const e = env();
  const r = await fn.onRequestGet(ctx(VECTORS[0][1], e));
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, new RegExp(`<form method="post" action="/u/${VECTORS[0][1]}">`));
  assert.equal(e.UNSUB_DB.rows.length, 0);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag"), /noindex/);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});

test("POST (the button or RFC 8058 one-click) records the prospect id and time only, once", async () => {
  const e = env();
  for (let i = 0; i < 3; i++) {
    const r = await fn.onRequestPost(ctx(VECTORS[1][1], e));
    assert.equal(r.status, 200);
    assert.match(await r.text(), /You are unsubscribed/);
  }
  assert.equal(e.UNSUB_DB.rows.length, 1);
  const row = e.UNSUB_DB.rows[0];
  assert.deepEqual(Object.keys(row).sort(), ["at", "collected_at", "prospect_id"]);
  assert.equal(row.prospect_id, "prospect_7f3a");
  assert.match(row.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test("a bad token is 404 with the reply-to-unsubscribe fallback, and writes nothing", async () => {
  const e = env();
  for (const h of [fn.onRequestGet, fn.onRequestPost]) {
    const r = await h(ctx("UC0xMjM.AAAAAAAAAAAAAAAAAAAAAA", e));
    assert.equal(r.status, 404);
    assert.match(await r.text(), /Reply to the email with &quot;unsubscribe&quot;/);
  }
  assert.equal(e.UNSUB_DB.rows.length, 0);
});

test("no secret, no database or a D1 failure is 503 with the fallback, never a false success", async () => {
  for (const e of [{ UNSUB_DB: new FakeD1() }, { SITEGUARD_UNSUBSCRIBE_SECRET: SECRET }]) {
    const r = await fn.onRequestPost(ctx(VECTORS[0][1], e));
    assert.equal(r.status, 503);
    assert.doesNotMatch(await r.text(), /You are unsubscribed/);
  }
  const db = new FakeD1(); db.fail = true;
  const r = await fn.onRequestPost(ctx(VECTORS[0][1], env(db)));
  assert.equal(r.status, 503);
});

test("the page has no tracking: no scripts, no third-party hosts, a strict CSP", async () => {
  const r = await fn.onRequestGet(ctx(VECTORS[0][1], env()));
  const html = await r.text();
  assert.doesNotMatch(html, /<script|cloudflareinsights|googletagmanager|gtag|https?:\/\/(?!www\.siteguardsystems)/);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.doesNotMatch(r.headers.get("content-security-policy"), /script-src/);
});

test("the D1 migration matches the collector's contract: no email column", async () => {
  const sql = await readFile(new URL("../migrations/0001_unsubscribes.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS unsubscribes \(\s*id INTEGER PRIMARY KEY,\s*prospect_id TEXT NOT NULL,\s*at TEXT NOT NULL,\s*collected_at TEXT\s*\)/);
  assert.match(sql, /UNIQUE INDEX[^;]*unsubscribes \(prospect_id\)/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /email/i);
});
