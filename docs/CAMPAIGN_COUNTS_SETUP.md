# Campaign counts (M2): set-up

Built **off**. `functions/_middleware.js` counts a landing only when the D1 binding `METRICS_DB`
exists, and `/internal/metrics/campaigns` answers 401 to everyone until the token hash is set.

## What is counted

- A page request whose query string has any of `utm_source`, `utm_medium` or `utm_campaign`
  adds 1 to `landings` for (Sydney date, source, medium, campaign). Values are lower-cased,
  trimmed and cut to 60 characters. A value that looks like an email address or a phone number
  is stored as "".
- If the landing has a `gclid`, `gclid_landings` also goes up by 1. Only that a gclid was
  present is kept, never its value, and it isn't sent to the Console (the contract allows only
  `landings`).
- Nothing else: no IP, cookie, user agent, visitor or session id, or URL. No cookie is set.
- Not counted: the unsubscribe page `/u/...`, `/internal/...`, `/assets/...`, files, non-GET
  requests and error pages.
- **Enquiries:** `assets/site.js` keeps the landing's three utm values for the visit
  (`sessionStorage`, no cookie) and sends them with an enquiry to the storefront's `/api/lead`.
  The storefront counts `enquiries` (its own M2 work).

The middleware runs on every request once Functions are deployed. That's within the Pages free
tier at this site's traffic.

## The Console's endpoint

`GET https://www.siteguardsystems.com.au/internal/metrics/campaigns?from=YYYY-MM-DD&to=YYYY-MM-DD`
with `Authorization: Bearer <service token>`. It answers as siteguard-ai `docs/METRICS_SETUP.md`
section 4 specifies: inclusive range of at most 92 days, 401 with no detail on a wrong token, and
`{site, as_of, rows:[{date, utm_source, utm_medium, utm_campaign, landings}]}`. The site holds
only the token's SHA-256, never the token.

## Dan's steps

1. **D1:** use the `siteguard-website` database from the unsubscribe set-up
   (`docs/UNSUBSCRIBE_SETUP.md` step 1, or create it now). Run
   `migrations/0002_campaign_counts.sql` in its Console, or
   `npx wrangler d1 execute siteguard-website --remote --file=migrations/0002_campaign_counts.sql`.
2. **Binding:** Pages project > Settings > Bindings > Add > D1 database: variable name
   **`METRICS_DB`**, database `siteguard-website` (Production).
3. **Service token**, on VM101, once, shared with the storefront. Run
   `T=$(openssl rand -hex 32)`, then put `SITEGUARD_CAMPAIGN_METRICS_TOKEN=$T` in
   `/etc/siteguard-ai/console.env`. Its hash is `printf %s "$T" | sha256sum | cut -d' ' -f1`.
   Never paste the token itself anywhere else.
4. **Hash as a Pages secret:** Settings > Variables and Secrets > Add, type **Secret**, name
   `CAMPAIGN_METRICS_TOKEN_SHA256`, value the 64-hex hash from step 3.
5. **Redeploy** (any merge, or Deployments > Retry).
6. **Console:** in console.env add `website=https://www.siteguardsystems.com.au` to
   `SITEGUARD_CAMPAIGN_METRICS_URLS` (siteguard-ai `docs/METRICS_SETUP.md`), and set
   `SITEGUARD_TRAFFIC_METRICS=on`. Then open the Console's Traffic page.
7. **Check:** open `https://www.siteguardsystems.com.au/?utm_source=test&utm_medium=check&utm_campaign=setup`
   once, then in the D1 Console run `SELECT * FROM campaign_counts`: one row, landings 1.
