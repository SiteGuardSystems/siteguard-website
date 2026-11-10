// Measurement tags (growth plan Rev02 M1, M3, M9; Remaining build queue W2, W4, W5).
// Every tag is OFF until its build setting is set in the Cloudflare Pages project
// (Settings > Variables and Secrets, as plain build variables). With nothing set, no tag is added
// and the CSP is unchanged. None of these values is a secret: each ends up in the public page.
//
//   CF_WEB_ANALYTICS_TOKEN  M1: Cloudflare Web Analytics beacon. Cookie-less; the token is the
//                           site's beacon token (32 hex characters) from Analytics & Logs >
//                           Web Analytics > the site > "Manage site" snippet.
//   GOOGLE_SITE_VERIFICATION
//                           M3: Search Console's HTML-tag verification code (the content="..."
//                           value only). Adds <meta name="google-site-verification">; no CSP change.

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const BEACON_ORIGIN = "https://static.cloudflareinsights.com";
const BEACON_CONNECT = "https://cloudflareinsights.com";

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Read the build settings. Returns { cfBeacon, gscVerify, problems }. */
export function loadMeasure(env = process.env) {
  const problems = [];
  const raw = (env.CF_WEB_ANALYTICS_TOKEN ?? "").trim();
  let cfBeacon = null;
  if (raw) {
    if (/^[0-9a-f]{32}$/i.test(raw)) cfBeacon = raw.toLowerCase();
    else problems.push("CF_WEB_ANALYTICS_TOKEN isn't a Web Analytics beacon token (32 hex characters): no beacon added");
  }
  const gsc = (env.GOOGLE_SITE_VERIFICATION ?? "").trim();
  let gscVerify = null;
  if (gsc) {
    if (/^[A-Za-z0-9_-]{10,100}$/.test(gsc)) gscVerify = gsc;
    else problems.push("GOOGLE_SITE_VERIFICATION isn't a Search Console verification code (paste only the content=\"...\" value): no tag added");
  }
  return { cfBeacon, gscVerify, problems };
}

/** Tags for every page's <head> (empty string when everything is off). */
export function measureHead(m) {
  const out = [];
  if (m?.gscVerify) out.push(`<meta name="google-site-verification" content="${attr(m.gscVerify)}">`);
  if (m?.cfBeacon) out.push(`<script defer src="${BEACON_SRC}" data-cf-beacon="${attr(JSON.stringify({ token: m.cfBeacon }))}"></script>`);
  return out.map((t) => t + "\n").join("");
}

/** Add sources to CSP directives ({ "script-src": [...] }); a missing directive is added. */
export function addCspSources(csp, add) {
  const parts = csp.split(";").map((p) => p.trim()).filter(Boolean);
  for (const [dir, srcs] of Object.entries(add)) {
    if (!srcs.length) continue;
    let i = parts.findIndex((p) => p.split(/\s+/)[0] === dir);
    if (i < 0) { parts.push(`${dir} 'self'`); i = parts.length - 1; }
    const have = parts[i].split(/\s+/);
    for (const s of srcs) if (!have.includes(s)) have.push(s);
    parts[i] = have.join(" ");
  }
  return parts.join("; ");
}

/** The CSP with each switched-on tag's sources added (unchanged when everything is off). */
export function measureCsp(csp, m) {
  const add = { "script-src": [], "connect-src": [] };
  if (m?.cfBeacon) { add["script-src"].push(BEACON_ORIGIN); add["connect-src"].push(BEACON_CONNECT); }
  if (!Object.values(add).some((a) => a.length)) return csp;
  return addCspSources(csp, add);
}
