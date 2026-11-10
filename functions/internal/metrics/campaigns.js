// M2: GET /internal/metrics/campaigns?from=YYYY-MM-DD&to=YYYY-MM-DD for the Console
// (siteguard-ai docs/METRICS_SETUP.md §4). Authorization: Bearer <service token>; the token's
// SHA-256 (hex) is the Pages secret CAMPAIGN_METRICS_TOKEN_SHA256, never the token itself.
// Wrong or missing token: 401, no detail. Not linked from any page; https only (Pages).
import { range, tokenOk } from "../../_lib/campaigns.js";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "Content-Type": "application/json" } });

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await tokenOk(request.headers.get("Authorization"), env?.CAMPAIGN_METRICS_TOKEN_SHA256)))
    return new Response(null, { status: 401, headers: HEADERS });
  const r = range(request.url);
  if (typeof r === "string") return json({ error: r }, 400);
  const db = env?.METRICS_DB;
  if (!db) return json({ error: "campaign counts are not set up" }, 503);
  const { results } = await db.prepare(
    "SELECT date, utm_source, utm_medium, utm_campaign, landings FROM campaign_counts " +
    "WHERE date BETWEEN ?1 AND ?2 AND landings > 0 ORDER BY date, utm_source, utm_medium, utm_campaign LIMIT 5000",
  ).bind(r.from, r.to).all();
  const rows = (results ?? []).map((x) => ({
    date: x.date, utm_source: x.utm_source, utm_medium: x.utm_medium, utm_campaign: x.utm_campaign,
    landings: Math.max(0, Math.trunc(Number(x.landings) || 0)),
  }));
  return json({ site: "website", as_of: new Date().toISOString(), rows });
}
