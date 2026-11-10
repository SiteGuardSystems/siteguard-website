// M2 campaign counts (Remaining build queue W3; contract: siteguard-ai docs/METRICS_SETUP.md §4).
// Counts only: a landing with any utm_* in the query string adds 1 to
// (date in Australia/Sydney, utm_source, utm_medium, utm_campaign). Nothing else is stored: no IP,
// no cookie, no user agent, no visitor or session id, no full URL, no gclid value. Whether a gclid
// was present is kept as a separate count (gclid_landings) and isn't sent to the Console (the
// contract allows only the fields below).

export const UTM = ["utm_source", "utm_medium", "utm_campaign"];
export const MAX_DAYS = 92;

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });

export const sydneyDate = (d = new Date()) => DAY.format(d);

// Lower-cased, trimmed, cut to 60 characters. Anything that looks like an email address or a
// phone number is dropped (stored as ""), so a mis-tagged link can't put personal data in D1.
export function clean(v) {
  const s = String(v ?? "").trim().toLowerCase().slice(0, 60);
  if (s.includes("@") || (s.match(/\d/g) ?? []).length >= 8) return "";
  return s;
}

/** The key for a landing URL, or null when it carries no utm value. */
export function landingKey(url, now = new Date()) {
  const q = new URL(url).searchParams;
  if (!UTM.some((k) => q.has(k))) return null;
  return {
    date: sydneyDate(now),
    utm_source: clean(q.get("utm_source")),
    utm_medium: clean(q.get("utm_medium")),
    utm_campaign: clean(q.get("utm_campaign")),
    gclid: q.has("gclid") ? 1 : 0,
  };
}

/** Requests that are never counted: the unsubscribe page, this API, files. */
export function countable(request) {
  if (request.method !== "GET") return false;
  const p = new URL(request.url).pathname;
  if (p.startsWith("/u/") || p.startsWith("/internal/") || p.startsWith("/assets/")) return false;
  return !/\.[a-z0-9]{2,5}$/i.test(p) || p.endsWith(".html");
}

export async function addLanding(db, key) {
  await db.prepare(
    "INSERT INTO campaign_counts (date, utm_source, utm_medium, utm_campaign, landings, gclid_landings) VALUES (?1, ?2, ?3, ?4, 1, ?5) " +
    "ON CONFLICT (date, utm_source, utm_medium, utm_campaign) DO UPDATE SET landings = landings + 1, gclid_landings = gclid_landings + excluded.gclid_landings",
  ).bind(key.date, key.utm_source, key.utm_medium, key.utm_campaign, key.gclid).run();
}

const enc = new TextEncoder();

async function sha256Hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time check of a Bearer token against the stored SHA-256 (hex). */
export async function tokenOk(header, wantHex) {
  const want = String(wantHex ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want)) return false;
  const m = /^Bearer (\S{16,})$/.exec(String(header ?? ""));
  const got = await sha256Hex(m ? m[1] : "");
  let d = m ? 0 : 1;
  for (let i = 0; i < 64; i++) d |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}

const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** { from, to } or an error string. Inclusive; at most MAX_DAYS days. */
export function range(url) {
  const q = new URL(url).searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) return "from and to must be YYYY-MM-DD";
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!(days >= 1)) return "from must not be after to";
  if (days > MAX_DAYS) return `at most ${MAX_DAYS} days`;
  return { from, to };
}
