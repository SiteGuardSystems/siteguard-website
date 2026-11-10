# Unsubscribe page `/u/<token>`: set-up (U1, audit B7)

Built **off**. `functions/u/[token].js` is a Cloudflare Pages Function, deployed with the site.
Until the secret and the D1 binding below are set, the page answers 503 "Unsubscribe is
unavailable" and points people to "reply with unsubscribe". It never pretends to have
unsubscribed someone.

## How it works

- **GET** `/u/<token>` shows one **Unsubscribe** button and changes nothing. A mail scanner that
  pre-fetches the link can't unsubscribe anyone.
- **POST** (the button, or Gmail's or Outlook's own button, RFC 8058 one-click) checks the token
  and writes one row to D1: the prospect id and the time. There's **no email address** in the
  token or the table. A second POST is a no-op.
- **The token** is the one siteguard-ai's `siteguard_org/unsubscribe.py` makes:
  `base64url(prospect id).base64url(HMAC-SHA256(secret, "unsub:" + prospect id), first 16 bytes)`.
  `test/unsubscribe.test.js` checks vectors made by the Python code.
- **Collection:** siteguard-ai's collector (U2), on VM101, pulls new rows out through the
  Cloudflare API every 5 minutes, suppresses each in the CRM and sets `collected_at`. Nothing
  connects in to VM101.
- **No tracking:** no analytics beacon, no tag, no cookie, no script on the page. Its own headers
  are `no-store`, `noindex` and `no-referrer`, with a strict CSP.

## Dan's steps (Cloudflare dashboard, when you're ready to switch it on)

1. **Create the D1 database.** Workers & Pages > D1 > Create database, name `siteguard-website`.
   W3's campaign counts use the same database.
2. **Create the table.** Open the database > Console, paste `migrations/0001_unsubscribes.sql`
   from this repo, and run it. Or from a checkout:
   `npx wrangler d1 execute siteguard-website --remote --file=migrations/0001_unsubscribes.sql`.
3. **Bind it to the site.** Workers & Pages > the siteguard-website Pages project > Settings >
   Bindings > Add > D1 database: variable name **`UNSUB_DB`**, database `siteguard-website`. Do
   this for **Production** (and Preview if you want to test there).
4. **The secret.** On VM101, generate it once with `openssl rand -hex 32`, and put it in
   `/etc/siteguard-ai/agent.env` as `SITEGUARD_UNSUBSCRIBE_SECRET`. Then, in the Pages project >
   Settings > Variables and Secrets > Add > type **Secret**, name `SITEGUARD_UNSUBSCRIBE_SECRET`,
   the **same value**. Don't paste it into chat, email or git.
5. **Redeploy** the site (any merge to `main`, or Deployments > Retry). Bindings and secrets
   apply from the next deployment.
6. **Check it.** On VM101 make a test link for a test prospect, using siteguard-ai's
   `unsubscribe_url()`. Open it: you should see the button. Press it: you should see "You are
   unsubscribed", and the row in D1 (Console: `SELECT prospect_id, at FROM unsubscribes`).
7. **The collector's token** (siteguard-ai U2): My Profile > API Tokens > Create a custom token
   with the account permission **D1: Edit**, limited to your account. Edit is needed because the
   collector sets `collected_at`. Put it in `agent.env` under the name in siteguard-ai's
   `agent.env.example`. Cloudflare can't scope a token to one database, so the collector's code
   only touches `unsubscribes`.
8. **Then** set `SITEGUARD_UNSUBSCRIBE_BASE_URL=https://www.siteguardsystems.com.au` in agent.env
   (siteguard-ai). Outreach refuses to send until the base URL is set. Use the site origin
   **without** `/u/`: `unsubscribe_url()` adds `/u/<token>` itself, so the queue's
   `.../u/` value would make `/u/u/<token>`, which 404s.

There's no `wrangler.toml` in this repo on purpose: with one, the Pages project would take its
bindings from the file instead of the dashboard.
