// U1: https://siteguardsystems.com.au/u/<token> (Remaining build queue Rev01; audit B7).
//
// GET  shows one "Unsubscribe" button and changes nothing, so a mail scanner that pre-fetches
//      the link can't unsubscribe anyone.
// POST (the button, or the mail client's RFC 8058 one-click, which posts
//      "List-Unsubscribe=One-Click") records the unsubscribe.
//
// A valid POST writes one row to the D1 table `unsubscribes` (binding UNSUB_DB): the prospect id
// and the time, never an email address. A repeat is a no-op. siteguard-ai's collector (U2) pulls
// uncollected rows from VM101 every 5 minutes, suppresses each in the CRM and sets collected_at;
// nothing connects in to VM101. No analytics, beacon or cookie on this page.
import { readToken, secretReady } from "../_lib/unsubscribe-token.js";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function page(title, text, form = "", status = 200) {
  const html = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} | SiteGuard Systems</title>
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="site-header"><div class="wrap header-row"><a class="brand" href="/"><img src="/assets/shield.png" alt="" width="34" height="44"><span class="brand-name">SiteGuard <b>Systems</b></span></a></div></header>
<main id="main"><section class="band"><div class="wrap prose">
<h1>${esc(title)}</h1>
<p>${esc(text)}</p>
${form}
</div></section></main>
</body>
</html>
`;
  return new Response(html, { status, headers: HEADERS });
}

const BAD = ["Link not recognised", 'This unsubscribe link is not valid. Reply to the email with "unsubscribe" and we will remove you.'];
const DOWN = ["Unsubscribe is unavailable", 'We can\'t take unsubscribes on this page right now. Reply to the email with "unsubscribe" and we will remove you.'];

async function prospectFrom(context) {
  const secret = context.env?.SITEGUARD_UNSUBSCRIBE_SECRET;
  if (!secretReady(secret)) return { down: true };
  return { pid: await readToken(context.params?.token, secret) };
}

export async function onRequestGet(context) {
  const { down, pid } = await prospectFrom(context);
  if (down) return page(...DOWN, "", 503);
  if (!pid) return page(...BAD, "", 404);
  const token = esc(context.params.token);
  return page("Unsubscribe", "Stop all emails from SiteGuard Systems to this address.",
    `<form method="post" action="/u/${token}"><p><button class="btn btn-hivis" type="submit">Unsubscribe</button></p></form>`);
}

export async function onRequestPost(context) {
  const { down, pid } = await prospectFrom(context);
  const db = context.env?.UNSUB_DB;
  if (down || !db) return page(...DOWN, "", 503);
  if (!pid) return page(...BAD, "", 404);
  try {
    await db.prepare("INSERT OR IGNORE INTO unsubscribes (prospect_id, at) VALUES (?1, ?2)")
      .bind(pid, new Date().toISOString().replace(/\.\d{3}Z$/, "Z")).run();
  } catch {
    return page(...DOWN, "", 503);
  }
  return page("You are unsubscribed", "You won't receive any more emails from SiteGuard Systems.");
}

