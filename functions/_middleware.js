// M2 campaign counts (W3): after the page is served, a landing that carries utm values adds 1 to
// its day's count in D1 (binding METRICS_DB). Off until the binding exists; any D1 trouble is
// ignored, so a page never fails because of counting. No cookie, nothing about the visitor.
// X2 (W10): while counts are on, each HTML page is marked <body data-attribution="1">, which is
// what lets assets/attribution.js carry the landing's utm values into an enquiry. Off, unmarked.
import { addLanding, countable, landingKey } from "./_lib/campaigns.js";

/** The page with <body data-attribution="1"> (Cloudflare's HTMLRewriter; unchanged without it). */
export function markAttribution(response) {
  const html = (response.headers.get("content-type") ?? "").includes("text/html");
  if (!html || typeof HTMLRewriter !== "function") return response;
  return new HTMLRewriter()
    .on("body", { element(e) { e.setAttribute("data-attribution", "1"); } })
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
  return markAttribution(response);
}
