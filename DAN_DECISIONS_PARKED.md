# Decisions parked for Dan: siteguard-website

Parked during the overnight run of 8–9 Nov 2026 (W1–W8). Nothing here blocked the work: each
item went ahead on the recommended default, which is easy to change. Earlier open questions are
in `DAN_DECISIONS_PENDING.md`.

| # | Item | What's needed from Dan | Recommended default (used) |
|---|---|---|---|
| P1 | Source queue | `SG_OVERNIGHT_QUEUE_Rev07_08_Nov_2026.md` is only in the Claude project, not on this PC, OneDrive or in any repo. W1–W8 followed `SG_REMAINING_BUILD_QUEUE_Rev01` and the N1–N3 decisions. Does Rev07 change any W item? | Rev01 + N1–N3. Save Rev07 to OneDrive `00_CONTROL_REFERENCE` (or siteguard-ai `docs/go-live/`) for next time |
| P2 | W1: unsubscribe base URL | Rev01 says `SITEGUARD_UNSUBSCRIBE_BASE_URL=https://siteguardsystems.com.au/u/`, but siteguard-ai's `unsubscribe_url()` adds `/u/<token>` itself, so that value makes `/u/u/<token>` (404). Use the origin? (The siteguard-ai session writes `agent.env.example`.) | `https://www.siteguardsystems.com.au` (www, so a one-click POST isn't redirected) |
| P3 | W1/W3: one D1 database | One D1 database (`siteguard-website`) holds both `unsubscribes` and `campaign_counts`, under two bindings (`UNSUB_DB`, `METRICS_DB`). OK, or separate databases? | One database |
| P4 | W1: the collector's token | Cloudflare API tokens can't be limited to one D1 database, only to the account. The collector needs D1 **Edit** (it sets `collected_at`). Accept an account-scoped D1 Edit token, with the collector's code touching only `unsubscribes`? | Yes |
| P5 | W3: gclid | Rev01 says count "whether a gclid is present", but the Console contract (siteguard-ai `METRICS_SETUP.md` §4) forbids extra fields. The count is kept in D1 (`gclid_landings`) and not served. Add it to the contract later? | Keep in D1, not served |
| P6 | W5: "call booked" | There's no booking calendar. "Call booked" fires when the **Book a call** form on a consulting service page sends; "enquiry sent" fires for every other lead form. Is that what you meant? | Yes |
| P7 | W5/W8: cookies and consent | The Google tag sets advertising cookies. Before `GOOGLE_ADS_TAG=on`: a cookie notice or banner, and Google Consent Mode defaults (deny until agreed)? This is in the W8 draft for the solicitor | Ads stays off until the solicitor answers |
| P8 | W6/W7 (S20): shared files | `scripts/lib/trust.mjs` (W6, links only) and `scripts/lib/shop.mjs` (S20 wording) are shared byte for byte with SiteGuard-Forms-Storefront, and its S2/S3 work changes the same lines. After both merge, check the two repos' copies match | Copy this site's versions to the storefront if they differ |
| P9 | W7 (S25): `/forms/*` redirect | While FORMS is browse only (beta), `/forms` and `/forms/*` 301 to the same path on siteguardforms.com.au. The redirect lifts itself when the shop opens here. OK? | Yes |
| P10 | W8: privacy contact | Privacy requests: the N1 support@ address, or keep hello@? | support@ (N1) |
| P11 | W7 skipped items | **S22** (video titles): there's no `product-videos.json` on this site, so it's the storefront's. **S23** (`consent_basis`): `/api/lead` lives on the storefront. **S24** (footer "Subscriber sign in"): there's no such link on this site. Nothing to do here; confirm the storefront session has them | Storefront S3 |

## FORMS queue 16 Nov 2026

Lane W of `SG_FORMS_AUDIT_AND_BUILD_QUEUE_Rev01_16_Nov_2026.md` (siteguard-ai `docs/go-live/`): W13 (#57) and W14.

| # | Item | What's needed from Dan | Recommended default (used) |
|---|---|---|---|
| F1 | W13: storefront page paths | The storefront's "Lost your documents?" (S10) and "How delivery works" (S14) pages weren't built when W13 was written, so their URLs were chosen here. Keep them, or change `path` in `data/forms-support-links.json` to wherever S10/S14 land? | `/lost-documents/` and `/how-delivery-works/` on siteguardforms.com.au, both `live: false` until the storefront pages are deployed |
| F2 | W13: when to switch the links on | Each link appears on `/support/` only when its `live` is `true`. Turn each on in the same change that deploys the storefront page? | Yes, one at a time, after the page is live |
| F3 | W14: the share link's utm tags | The shared link (`og:url`) is the canonical page plus `utm_source=social&utm_medium=share&utm_campaign=<consulting or education>`, so shares are counted by campaign counts once those are on. The `<link rel="canonical">` stays clean. OK, or other values? | `social` / `share` / module name |
| F4 | W14: which pages | Cards are on every indexed page in the Consulting and Education sections: `/consulting/` and its eight service pages, `/about/`, `/library/` (both under Consulting), `/education/` and its four series pages. Add `/about/` and `/library/`, or drop them? | Keep them (they're in the Consulting section) |
| F5 | W14: redrawing cards | The PNGs are drawn on a dev machine (`npm run share-cards`, Playwright) and committed; `npm test` fails if a page's title or description changes without a fresh card. OK, or draw them in the Pages build instead (slower, needs a browser in the build)? | Dev script + test |
