// M2 campaign counts (W3): after the page is served, a landing that carries utm values adds 1 to
// its day's count in D1 (binding METRICS_DB). Off until the binding exists; any D1 trouble is
// ignored, so a page never fails because of counting. No cookie, nothing about the visitor.
// X2 (W10): while counts are on, each HTML page also gets <script src="/assets/attribution.js">,
// which carries the landing's utm values into an enquiry (the Storefront adds the same script
// while its CAMPAIGN_COUNTS=on). Counts off: the script isn't on the page, so nothing is kept.
import { addLanding, countable, landingKey } from "./_lib/campaigns.js";

export const ATTRIBUTION_TAG = '<script src="/assets/attribution.js" defer></script>';

/** The page with the attribution script in its <head> (Cloudflare's HTMLRewriter; unchanged without it). */
export function withAttribution(response) {
  const html = (response.headers.get("content-type") ?? "").includes("text/html");
  if (!html || typeof HTMLRewriter !== "function") return response;
  return new HTMLRewriter()
    .on("head", { element(e) { e.append(ATTRIBUTION_TAG, { html: true }); } })
    .transform(response);
}

export async function onRequest(context) {
  const response = await context.next();
  const db = context.env?.METRICS_DB;
  if (!db) return response;
  if (countable(context.request) && response.status === 200) {
    const key = landingKey(context.request.url);
    if (key) context.waitUntil(addLanding(db, key).catch(() => {}));
  }
  return withAttribution(response);
}
