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
//   GOOGLE_ADS_TAG          M9: "on" loads the Google tag (gtag.js) for Google Ads. Default off.
//                           This tag sets Google's advertising cookies, so the privacy policy
//                           must say so before it is switched on (W8 draft).
//   GOOGLE_ADS_ID           the Google Ads tag ID, AW- and digits (needed when the tag is on)
//   GOOGLE_ADS_ENQUIRY_LABEL  the conversion label for "enquiry sent" (any lead form that sends)
//   GOOGLE_ADS_CALL_LABEL     the conversion label for "call booked" (the Book a call form on a
//                             consulting service page). Each label is optional.

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const BEACON_ORIGIN = "https://static.cloudflareinsights.com";
const BEACON_CONNECT = "https://cloudflareinsights.com";

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js";
// Google's published CSP allow-list for the Google tag with Google Ads conversions.
const ADS_CSP = {
  "script-src": ["https://www.googletagmanager.com", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://www.google.com"],
  "img-src": ["https://www.googletagmanager.com", "https://googleads.g.doubleclick.net", "https://www.google.com", "https://www.google.com.au"],
  "connect-src": ["https://www.google.com", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://pagead2.googlesyndication.com"],
  "frame-src": ["https://td.doubleclick.net", "https://www.googletagmanager.com"],
};
const LABEL = /^[A-Za-z0-9_-]{6,40}$/;

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Read the build settings. Returns { cfBeacon, gscVerify, ads, problems }. */
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
  let ads = null;
  const adsSwitch = (env.GOOGLE_ADS_TAG ?? "off").trim().toLowerCase();
  if (adsSwitch === "on") {
    const id = (env.GOOGLE_ADS_ID ?? "").trim().toUpperCase();
    if (!/^AW-\d{6,12}$/.test(id)) problems.push("GOOGLE_ADS_TAG is on but GOOGLE_ADS_ID isn't an AW- tag ID: no Google tag added");
    else {
      ads = { id, enquiry: null, call: null };
      for (const [k, name] of [["enquiry", "GOOGLE_ADS_ENQUIRY_LABEL"], ["call", "GOOGLE_ADS_CALL_LABEL"]]) {
        const v = (env[name] ?? "").trim();
        if (!v) continue;
        if (LABEL.test(v)) ads[k] = v;
        else problems.push(`${name} isn't a conversion label: that conversion isn't sent`);
      }
    }
  } else if (adsSwitch !== "off" && adsSwitch !== "") problems.push("GOOGLE_ADS_TAG must be on or off: the Google tag stays off");
  return { cfBeacon, gscVerify, ads, problems };
}

/** Tags for every page's <head> (empty string when everything is off). */
export function measureHead(m) {
  const out = [];
  if (m?.gscVerify) out.push(`<meta name="google-site-verification" content="${attr(m.gscVerify)}">`);
  if (m?.ads) out.push(`<script async src="${GTAG_SRC}?id=${attr(m.ads.id)}"></script>`, '<script src="/assets/gtag-init.js" defer></script>');
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
  const add = { "script-src": [], "connect-src": [], "img-src": [], "frame-src": [] };
  if (m?.cfBeacon) { add["script-src"].push(BEACON_ORIGIN); add["connect-src"].push(BEACON_CONNECT); }
  if (m?.ads) for (const [dir, srcs] of Object.entries(ADS_CSP)) add[dir].push(...srcs);
  if (!Object.values(add).some((a) => a.length)) return csp;
  return addCspSources(csp, add);
}

/** /assets/gtag-init.js, written only when the Google tag is on (no inline script: CSP).
 *  Conversions fire on assets/site.js's "sg:lead-sent" event after /api/lead answers OK. */
export function gtagInitScript(m) {
  if (!m?.ads) return null;
  const send = (label) => (label ? JSON.stringify(`${m.ads.id}/${label}`) : "null");
  return `// Google tag (M9), written by build.mjs because GOOGLE_ADS_TAG is on.
(function () {
  "use strict";
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", ${JSON.stringify(m.ads.id)});
  var to = { enquiry: ${send(m.ads.enquiry)}, call: ${send(m.ads.call)} };
  document.addEventListener("sg:lead-sent", function (e) {
    var kind = e && e.detail && e.detail.kind;
    if (to[kind]) gtag("event", "conversion", { send_to: to[kind] });
  });
})();
`;
}
