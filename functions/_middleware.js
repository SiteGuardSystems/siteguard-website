// M2 campaign counts (W3): after the page is served, a landing that carries utm values adds 1 to
// its day's count in D1 (binding METRICS_DB). Off until the binding exists; any D1 trouble is
// ignored, so a page never fails because of counting. No cookie, nothing about the visitor.
import { addLanding, countable, landingKey } from "./_lib/campaigns.js";

export async function onRequest(context) {
  const response = await context.next();
  const db = context.env?.METRICS_DB;
  if (!db || !countable(context.request) || response.status !== 200) return response;
  const key = landingKey(context.request.url);
  if (key) context.waitUntil(addLanding(db, key).catch(() => {}));
  return response;
}
