// M2 campaign counts (W3): the middleware counts utm landings into D1, stores nothing about the
// visitor, and /internal/metrics/campaigns answers the Console in the contract's shape
// (siteguard-ai docs/METRICS_SETUP.md §4). The service token below is a test value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clean, countable, landingKey, range, sydneyDate, tokenOk } from "../functions/_lib/campaigns.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequestGet as campaigns } from "../functions/internal/metrics/campaigns.js";

const TOKEN = "test-service-token-not-real-0123";
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// A tiny stand-in for D1 that runs the two statements the code uses.
class FakeD1 {
  constructor() { this.rows = new Map(); this.sql = []; }
  prepare(sql) {
    const db = this;
    db.sql.push(sql);
    return { bind(...a) { return {
      async run() {
        const [date, s, m, c, g] = a;
        const k = JSON.stringify([date, s, m, c]);
        const r = db.rows.get(k) ?? { date, utm_source: s, utm_medium: m, utm_campaign: c, landings: 0, gclid_landings: 0 };
        r.landings += 1; r.gclid_landings += g;
        db.rows.set(k, r);
      },
      async all() {
        const [from, to] = a;
        return { results: [...db.rows.values()].filter((r) => r.date >= from && r.date <= to && r.landings > 0) };
      },
    }; } };
  }
}

function ctx(url, db, { status = 200, method = "GET", headers = {} } = {}) {
  const pending = [];
  return {
    pending,
    request: new Request(url, { method, headers }),
    env: { METRICS_DB: db, CAMPAIGN_METRICS_TOKEN_SHA256: null },
    next: async () => new Response("<html>page</html>", { status, headers: { "Content-Type": "text/html", "Set-Cookie": "none=0" } }),
    waitUntil: (p) => pending.push(p),
  };
}

test("values are lower-cased, trimmed, cut to 60, and an email or phone number is dropped", () => {
  assert.equal(clean("  LinkedIn "), "linkedin");
  assert.equal(clean("x".repeat(80)).length, 60);
  assert.equal(clean("dan@example.com"), "");
  assert.equal(clean("0400 123 456"), "");
  assert.equal(clean(null), "");
});

test("a landing key needs a utm value; gclid is a yes/no, never its value", () => {
  assert.equal(landingKey("https://www.siteguardsystems.com.au/?ref=ABC"), null);
  const k = landingKey("https://www.siteguardsystems.com.au/consulting/?utm_source=LinkedIn&utm_campaign=Launch&gclid=Cj0abc", new Date("2026-11-08T14:30:00Z"));
  assert.deepEqual(k, { date: "2026-11-09", utm_source: "linkedin", utm_medium: "", utm_campaign: "launch", gclid: 1 });
  assert.equal(sydneyDate(new Date("2026-11-08T12:59:00Z")), "2026-11-08"); // 23:59 AEDT
});

test("the middleware counts once per landing after the page is served, and changes nothing in the response", async () => {
  const db = new FakeD1();
  for (const url of ["https://www.siteguardsystems.com.au/?utm_source=linkedin&utm_medium=social&utm_campaign=launch",
                     "https://www.siteguardsystems.com.au/contact/?utm_source=LINKEDIN&utm_medium=social&utm_campaign=launch&gclid=x"]) {
    const c = ctx(url, db);
    const r = await middleware(c);
    assert.equal(await r.text(), "<html>page</html>");
    assert.equal(r.headers.get("set-cookie"), "none=0"); // the page's own headers, nothing added
    await Promise.all(c.pending);
  }
  const rows = [...db.rows.values()];
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { date: rows[0].date, utm_source: "linkedin", utm_medium: "social", utm_campaign: "launch", landings: 2, gclid_landings: 1 });
});

test("not counted: no utm, not a page, the unsubscribe page, this API, errors, POSTs, no binding", async () => {
  const db = new FakeD1();
  const q = "?utm_source=a";
  const cases = [
    ctx("https://www.siteguardsystems.com.au/", db),
    ctx(`https://www.siteguardsystems.com.au/assets/site.css${q}`, db),
    ctx(`https://www.siteguardsystems.com.au/assets/shield.png${q}`, db),
    ctx(`https://www.siteguardsystems.com.au/u/abc.def${q}`, db),
    ctx(`https://www.siteguardsystems.com.au/internal/metrics/campaigns${q}`, db),
    ctx(`https://www.siteguardsystems.com.au/nope/${q}`, db, { status: 404 }),
    ctx(`https://www.siteguardsystems.com.au/${q}`, db, { method: "POST" }),
  ];
  for (const c of cases) { await middleware(c); await Promise.all(c.pending); }
  const c = ctx(`https://www.siteguardsystems.com.au/${q}`, null);
  await middleware(c);
  assert.equal(c.pending.length, 0);
  assert.equal(db.rows.size, 0);
  assert.ok(countable(new Request("https://www.siteguardsystems.com.au/consulting/")));
  assert.ok(countable(new Request("https://www.siteguardsystems.com.au/legal/privacy/index.html")));
});

test("a D1 failure never breaks the page", async () => {
  const broken = { prepare() { return { bind() { return { run: async () => { throw new Error("D1 down"); } }; } }; } };
  const c = ctx("https://www.siteguardsystems.com.au/?utm_source=a", broken);
  const r = await middleware(c);
  assert.equal(r.status, 200);
  await Promise.all(c.pending);
});

test("token check: SHA-256 of the Bearer token against the stored hash; anything else fails", async () => {
  const h = await sha(TOKEN);
  assert.equal(await tokenOk(`Bearer ${TOKEN}`, h), true);
  assert.equal(await tokenOk(`Bearer ${TOKEN}`, h.toUpperCase()), true);
  for (const bad of [undefined, "", TOKEN, `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, "Bearer short"]) assert.equal(await tokenOk(bad, h), false, String(bad));
  assert.equal(await tokenOk(`Bearer ${TOKEN}`, ""), false); // not set up: always 401
  assert.equal(await tokenOk(`Bearer ${TOKEN}`, "abc"), false);
});

test("range: inclusive YYYY-MM-DD, at most 92 days", () => {
  const u = (f, t) => `https://x.example/internal/metrics/campaigns?from=${f}&to=${t}`;
  assert.deepEqual(range(u("2026-10-12", "2026-11-08")), { from: "2026-10-12", to: "2026-11-08" });
  assert.deepEqual(range(u("2026-08-09", "2026-11-08")), { from: "2026-08-09", to: "2026-11-08" }); // 92 days
  assert.match(range(u("2026-08-08", "2026-11-08")), /at most 92/);
  assert.match(range(u("2026-11-09", "2026-11-08")), /after/);
  assert.match(range(u("2026-11-8", "2026-11-08")), /YYYY-MM-DD/);
});

test("the Console endpoint: 401 with no detail, 400 on a bad range, then the contract's rows only", async () => {
  const db = new FakeD1();
  for (const [s, c] of [["linkedin", "launch"], ["linkedin", "launch"], ["google", "swms"]]) {
    const cx = ctx(`https://www.siteguardsystems.com.au/?utm_source=${s}&utm_medium=cpc&utm_campaign=${c}&gclid=1`, db);
    await middleware(cx); await Promise.all(cx.pending);
  }
  const day = [...db.rows.values()][0].date;
  const call = async (auth, q = `from=${day}&to=${day}`) => {
    const c = ctx(`https://www.siteguardsystems.com.au/internal/metrics/campaigns?${q}`, db, { headers: auth ? { Authorization: auth } : {} });
    c.env.CAMPAIGN_METRICS_TOKEN_SHA256 = await sha(TOKEN);
    return campaigns(c);
  };
  for (const auth of [null, "Bearer wrong-token-wrong-token"]) {
    const r = await call(auth);
    assert.equal(r.status, 401);
    assert.equal(await r.text(), "");
  }
  assert.equal((await call(`Bearer ${TOKEN}`, "from=2026-01-01&to=2026-12-31")).status, 400);
  const r = await call(`Bearer ${TOKEN}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const body = await r.json();
  assert.equal(body.site, "website");
  assert.ok(!Number.isNaN(Date.parse(body.as_of)));
  assert.deepEqual(body.rows.map((x) => Object.keys(x).sort()), body.rows.map(() => ["date", "landings", "utm_campaign", "utm_medium", "utm_source"]));
  const li = body.rows.find((x) => x.utm_source === "linkedin");
  assert.equal(li.landings, 2);
  assert.ok(!JSON.stringify(body).includes("gclid"));
});

test("the enquiry form carries the landing's utm values only while counts are on (test/attribution.test.js)", async () => {
  const js = await readFile(new URL("../assets/site.js", import.meta.url), "utf8");
  assert.match(js, /window\.sgAttribution\(\)/);
  assert.doesNotMatch(js, /document\.cookie|localStorage/);
});

test("the D1 migration: counts only", async () => {
  const sql = (await readFile(new URL("../migrations/0002_campaign_counts.sql", import.meta.url), "utf8")).replace(/--.*$/gm, "");
  assert.match(sql, /PRIMARY KEY \(date, utm_source, utm_medium, utm_campaign\)/);
  assert.doesNotMatch(sql, /\b(ip|cookie|agent|email|url|visitor|session)\b/i);
});
