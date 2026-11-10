# siteguardsystems.com.au

Multi-page static site. `build.mjs` stamps the shared head, header and
footer onto every page and writes `dist/`, with Cloudflare Pages
`_headers` (CSP, HSTS and so on) and `_redirects`.

| What | Source |
|---|---|
| Library numbers and "from" prices | `data/site-facts.json`, written by Hseq-Dev `docs/build_catalogue.py --website <this repo>/data` |
| The full catalogue: FORMS packs, documents and prices, and the SiteGuard App products (group `"app"`: trade packages, builder bundles, AUDIT seat) | `data/catalogue.json`, written by the same command (WP-S1). Never edit it by hand: `dcr-check` fails a hand edit. The app prices on the App pages (`data/app-packages.json`, interim, from the workbook) must equal its group `"app"`, or the build fails |
| Document codes and titles | the public DCR extract pinned in `dcr.lock` (see "DCR" below) |
| Prices (Dan #90: one price source, Hseq-Dev) | the **public view** of Hseq-Dev's two price tables, pinned in `pricing.lock` at `vendor/hseq-dev/pricing/*.public.json` (this repo is public, so never the full tables). `test/pricing-lock.test.js` fails unless every price the site shows or uses equals them: the App pages and their data, the catalogue's group `"app"` rows and founding prepayment (`founding_prepay_cents`, shown to the cent on the founding page), the App checkout forms and the FORMS shop. To change a price: Hseq-Dev `docs/pricing/README.md`, then `python docs/pricing/export_price_tables.py --website ../siteguard-website` (writes the lock, the view and the catalogue's app prices) |
| Legal pages | `content/legal/`, copied from SiteGuard-Forms `app/server/data/legal` by `npm run sync-legal -- <path>`: the website terms, privacy and disclaimer, and (WP-S11) the FORMS Terms of Sale, Refunds, Checkout Notice, FORMS App Terms of Use, Document Use Disclaimer and Consultant Licence. The App Subscription Terms (SG-LEGAL-12) and Founding Offer Terms (SG-LEGAL-13) are in `content/legal-pending/`, marked PENDING SOLICITOR: published (noindex, out of the sitemap) only once `app_status` is `presale` or `live`, and a production build fails until Dan swaps in the approved wording and changes `status` |
| Enquiry form | posts to the storefront's `/api/lead` (`LEAD_ENDPOINT`, default `https://www.siteguardforms.com.au/api/lead`) |
| Campaign counts (M2) | `functions/_middleware.js` counts utm landings per day into D1 (`METRICS_DB`, `migrations/0002_campaign_counts.sql`), with no IP and no cookie. `GET /internal/metrics/campaigns` serves the Console (service-token hash `CAMPAIGN_METRICS_TOKEN_SHA256`). Off until bound: `docs/CAMPAIGN_COUNTS_SETUP.md` |
| Help chat (P11) | the "Questions?" widget on every page (`scripts/lib/support-chat.mjs`, `assets/support-chat.js`). The assistant runs on the SiteGuard app API (siteguard-audit `POST /api/support/public/chat`), never on this site. Until `data/support-chat.json` `api_base` (or `SUPPORT_CHAT_API_BASE`) is set it shows the support email only, and the CSP is unchanged |
| Unsubscribe page `/u/<token>` (U1, B7) | `functions/u/[token].js`, a Pages Function writing to D1 (`UNSUB_DB`, table in `migrations/0001_unsubscribes.sql`). Off until the secret and binding are set: `docs/UNSUBSCRIBE_SETUP.md` |
| Partners and affiliates | `data/partners.json`, written by the CRM (siteguard-ai `python -m siteguard_org partners export-sites`) or edited by hand |
| Google review links | `data/google-reviews.json`, same way (links only, no rating: decision N3) |

## Measurement tags (`scripts/lib/measure.mjs`)

Each tag is **off** until its build setting is set in the Pages project: Settings > Variables and Secrets > Add, type **Text**, for Production. A new deployment picks it up. With nothing set, no tag is added and the CSP is unchanged. None of these values is secret: each one ends up in the public page.

| Setting | What | CSP opened |
|---|---|---|
| `CF_WEB_ANALYTICS_TOKEN` | M1: the Cloudflare Web Analytics beacon, which is cookie-less. The value is the 32-hex token in the site's Web Analytics snippet (Analytics & Logs > Web Analytics > Add a site > `siteguardsystems.com.au` > Manage site). A malformed value adds nothing and is listed in the build output | `script-src https://static.cloudflareinsights.com`, `connect-src https://cloudflareinsights.com` |
| `GOOGLE_SITE_VERIFICATION` | M3: the Search Console verification `<meta>` tag. Search Console > Add property > URL prefix `https://www.siteguardsystems.com.au/` > HTML tag. Paste only the `content="..."` value, redeploy, then click Verify. Keep the setting afterwards: Google re-checks it | none |
| `GOOGLE_ADS_TAG` (default `off`), `GOOGLE_ADS_ID`, `GOOGLE_ADS_ENQUIRY_LABEL`, `GOOGLE_ADS_CALL_LABEL` | M9: the Google tag for Google Ads, with two conversions. "Enquiry sent" fires when any lead form sends; "call booked" fires when the Book a call form on a consulting service page sends. Both fire after `/api/lead` answers OK. The tag is in `/assets/gtag-init.js`, written only when the setting is on, because the CSP allows no inline script. **It sets advertising cookies**, so the privacy policy must cover it first (W8 draft) | Google's list: `script-src`, `img-src`, `connect-src` and `frame-src` for googletagmanager.com, googleadservices.com, googleads.g.doubleclick.net, google.com (+ .com.au images), pagead2.googlesyndication.com, td.doubleclick.net |

Not on the `/u/<token>` unsubscribe page, which is a Function with its own headers.

## Status switch (`data/site-mode.json`)

`app_status` for the SiteGuard App and SiteGuard Audit, and `checkout` (`scripts/lib/site-mode.mjs`). FORMS `beta` is **not** in this file.

**One beta switch (Dan, 1 Nov 2026, #94).** The FORMS shop is in beta on both sites, and both read one switch: the storefront's `data/site-mode.json` `beta`, the source of truth because the storefront is the checkout engine. It is vendored at `vendor/siteguard-forms-storefront/data/site-mode.json` and pinned by `site-mode.lock` (repo, ref, commit, sha256, beta), like `dcr.lock`. The build refuses a `beta` key in this repo's file, and a vendored copy that doesn't match the lock. CI's **site-mode drift check** (`npm run site-mode-check -- --upstream`, also daily in `.github/workflows/site-mode-drift.yml`) fails when the storefront's beta differs from the vendored one. When Dan turns beta off in the storefront: `npm run sync-site-mode`, commit, rebuild, and both sites open together. The engine refuses every FORMS order while its beta is true whatever this site shows; this site only mirrors it to keep the buttons hidden.

| Key | Value | Effect |
|---|---|---|
| `beta` (storefront's) | `true` | the FORMS shop shows under `/forms/` to browse only: a "SiteGuard FORMS is in beta" notice, no buy or subscribe buttons, no cart, no checkout (`data-browse-only`); the menu says "SiteGuard FORMS (beta)" |
| | `false` | with `checkout` true, the shop and cart open; with `checkout` false, a link to siteguardforms.com.au |
| `app_status` | `coming_soon` | no app or audit prices anywhere; every buy button is "Register interest"; the header status button goes to `/register-interest/` |
| | `presale` | founding places on sale (from March 2027): prices, the pricing page and the founding offer page show |
| | `live` | the app modules are open (June 2027); the build fails if any pre-launch wording is left |

Every App and Audit status line comes from one helper, `appStatusCopy()` in `site-mode.mjs`: "Coming soon. Register your interest now." while `coming_soon` (no date anywhere), "Launching June 2027. Founding places are on sale now." while `presale`, nothing once `live`. The month is read from `launch.opens` in `data/app-packages.json` (the go-live month), never typed into copy. Pre-launch wording ("coming soon", "launching") is allowed only inside elements marked `data-status-copy` (`statusCopy()`), so it can be found and removed when the status changes; `test/status.test.js` fails if a `coming_soon` build has "2027" inside one. Preview other states with `node build.mjs --app-status=presale --beta=false` (`--production` refuses the overrides). `npm test` builds every state.

| `checkout` | `false` (default) | no cart and no App checkout; the header cart stays hidden |
| | `true` | with `beta` false: the FORMS cart in the header and Add to cart on the shop (WP-S8); App checkouts as `app_status` allows |

## FORMS shop and cart (WP-S8)

The storefront's own page builders, shared byte for byte: `scripts/lib/shop.mjs` (trade, builder, management systems, specialist, consultant packs, single documents, subscriptions, how ordering works, questions), `scripts/lib/cart.mjs` (cart and order pages) and `scripts/lib/cart-browser.js` (the browser cart, wrapped into `/assets/cart.js`). Keep them identical with SiteGuard-Forms-Storefront.

- Rendered from `data/catalogue.json` under `/forms/`. Every shop page has its canonical tag on siteguardforms.com.au, and none is in this sitemap.
- **Two kinds of checkout (Q1 narrowed by Dan 1 Nov, #96):** everything is sold on one site, with two kinds of checkout. The cart is for FORMS documents and packs (one-off purchases) only. App and Audit "Subscribe" and "Reserve a founding place" each go straight to their own Stripe checkout, never via the cart, each with its own terms to tick (founding: the 20-place limit; the app: account setup). The build fails if any page has an Add to cart button for an `app:` or founding item, and the engine's `/api/checkout` refuses such a line with a reason.
- `/cart/` posts to the storefront's checkout engine (`CHECKOUT_ENGINE`, default `https://www.siteguardforms.com.au`) with `returnOrigin` and `source_site: "systems"`; the engine re-prices every line from the catalogue. Stripe sends the buyer back to `/order/success/` or `/order/cancelled/` here.
- Preview a build with the shop on: `node build.mjs --beta=false --checkout=true`.

## SiteGuard App checkout (WP-S9 / WP-S10)

With `checkout` true, the App pages sell through the storefront's checkout engine (P2's routes; `assets/app-checkout.js`):

- `app_status` `presale`: a founding-place form on `/app/founding-offer/` (POST `/api/founding/checkout`), with `/founding/success/` and `/founding/cancelled/` here (the cancelled page gives the place back at once).
- `app_status` `live`: a subscription form on `/app/pricing/` (POST `/api/subscribe`, annual by default), with `/app/success/` and `/app/cancelled/`.
- Every call sends `returnOrigin` (this site) and `source_site: "systems"`; the engine only accepts this site's origins.
- The engine decides too: founding only while its own `app_status` is `presale` and P2's sale window is open; subscriptions only when its `app_status` is `live`, the platform launch endpoint says the app is live, and P2's go-live date has passed. Switch `app_status` here and in the storefront's `data/site-mode.json` together.

## DCR

The same check as SiteGuard-Forms-Storefront (its README has the detail). This repo is public, so it never holds the full DCR: `dcr.lock` pins siteguard-dcr's public page-A extract (Rev23, `vendor/siteguard-dcr/public/rev23/dcr-public.json`) by sha256. `scripts/lib/dcr.mjs` and `scripts/dcr-check.mjs` are the storefront's files, unchanged; keep them identical in both repos.

- **The build** verifies the extract first and stops on a hash mismatch, then fails if `data/catalogue.json` shows or sells a code that isn't a live public code, if a title differs from the DCR title, or if its `dcr_revision` / `dcr_sha256` stamp is missing or differs from `dcr.lock`.
- **CI** runs `npm run dcr-check` over `data/`, `content/`, `scripts/`, `assets/` and `build.mjs`. Real drift goes in `dcr.allowlist.json` with a reason; never edit product data to pass.
- **Bumping the DCR:** copy `public/revNN/` from siteguard-dcr into `vendor/siteguard-dcr/public/`, set `dcr.lock`, re-check `dcr.allowlist.json`, and regenerate the catalogue in Hseq-Dev against the same revision. Do it in both sites in the same change.

## Partners, affiliates and Google reviews

`scripts/lib/trust.mjs` (the same file is in SiteGuard-Forms-Storefront):

- **Partner strip** above the footer on every page, linking to `/partners/`. It only appears once `data/partners.json` lists at least one active partner for `"systems"`.
- **`/partners/`**: partners and affiliates, how referrals and referral fees work, and a partner enquiry form. The form posts to `/api/lead` with `enquiry_type=partner`, and the CRM files it as a partner application.
- **Referral links**: a partner sends people to `https://www.siteguardsystems.com.au/?ref=CODE`. The code is kept for that visit (`sessionStorage`, no cookie) and sent with any enquiry, so the CRM can credit the partner.
- **Paid links** (any `fee` other than `none`) carry `rel="sponsored"` and say on the listing that a referral fee may apply.
- **Google review links** in the footer, on `/contact/` and on `/partners/`: "See our reviews on Google" (`profile_url`, else a Maps link from `place_id`) and "Leave us a review" (`review_url`, else `write_review_url` or the write-a-review link from `place_id`). They appear once the profile is set. **Links only, never a rating, count or review text** (Dan's decision N3, 8 Nov 2026). A typed-in number goes stale and can't be checked here, and showing chosen reviews risks misleading under the Australian Consumer Law. Rating fields left in the data are ignored, and the build notes them. Links must be Google addresses (`share.google`, `g.page`, `maps.app.goo.gl`, `google.*`, `search.google.com`). No review structured data.
- **Logos** go in `assets/partners/` (the CSP allows local images only).
- **Preview with sample data:** `node build.mjs --sample-partners` (fictional listings marked "(sample)"). `--production` refuses it.

## Introduction video (landing page)

`scripts/lib/video.mjs` (the same file is in both SiteGuard sites; keep them identical) and `data/intro-video.json`. Each site has its own JSON, so each can show a different video. Nothing shows while `provider` is empty.

- **YouTube (recommended):** set `"provider": "youtube"`, `youtube_id` (the 11 characters after `watch?v=`), `title`, `description` and `upload_date`. The page shows the poster with a play button and loads the player from `youtube-nocookie.com` only when someone presses play (fast page, nothing from Google until then; without JavaScript the poster links to YouTube). Add a `poster` in `/assets/video/` to use your own thumbnail; without one YouTube's thumbnail is used.
- **Self-hosted:** `"provider": "file"`, an MP4 and a poster image in `/assets/video/` (keep the MP4 under 25 MiB, Cloudflare Pages' file limit), optional `captions` (.vtt).
- Optional: `duration` (`PT1M45S`), `heading` (the section heading), and `channel_url` + `channel_name` for a "More videos on … on YouTube" link under the video (set to the SiteGuard Education channel).
- The CSP opens `frame-src https://www.youtube-nocookie.com` (and `img-src https://i.ytimg.com` when there's no local poster) only when a YouTube video is set. A `VideoObject` is added to the home page's JSON-LD.
- An incomplete entry fails the build and nothing is shown.

## Planning calendar and SiteGuard Education

`scripts/lib/planning.mjs` and `scripts/lib/education.mjs` are the same in both SiteGuard sites, and so are their data files (copy any change to both repos).

- **Planning calendar** (`data/planning-calendar.json`): public holidays and building industry RDOs per state, plus national safety initiatives and industry events. Every entry cites a source; entries without an announced date carry a `month` and show as "Date to be confirmed". Pages: `/planning/` (choose a state; national safety calendar), `/planning/<state>/` (with a subscribable `.ics` file per state) and `/planning/inspections/`.
- **Inspection and testing planner** (`data/inspection-planner.json`): interval, basis (Mandatory, Standard, Code of practice, Manufacturer, Good practice), reference and state notes for each item.
- Both files carry a `checked` date. A production build fails once it's more than 200 days old: re-check the entries against their sources (RDO calendars and 2027 dates are released through the year), then update `checked`.
- **SiteGuard Education** (`data/education.json`): `/education/` with a tab per series (About SiteGuard, How-tos, Toolbox talks, Inductions) and a page for each at `/education/<slug>/`. Every series shows from the start; one without videos says so and links the channel. To add a video, paste its YouTube link as `youtube_url` with `title`, `description` and `upload_date` (the file's `note` has the full list). Each video gets Watch on YouTube, Copy link and, with `download_url`, Download.

## Cloudflare Pages settings (Dan, once, before merging)

The current live site is the old root `index.html`, which this branch leaves in
place, so merging changes nothing until the build is switched on:

- **Build command:** `node build.mjs --production`
- **Build output directory:** `dist`
- **Environment variable:** `NODE_VERSION` = `20`

`--production` fails while a legal page still has an open `[placeholder]`
(ABN, privacy email and so on). Fill those in the SiteGuard-Forms legal
sources, sync, and push. Use `node build.mjs` for a preview deployment.

Once the new site is live, the old `index.html` at the repo root can be
retired.

## Checks

`npm test` builds and checks every page (links, titles, banned wording, page
size, no inline script, the exact credential wording (Certificates of Attainment, rebaseline 31 Oct 2026), the enquiry endpoint,
the headers). `npm run test:e2e` checks the 360 px layout, the menu and the
enquiry form in a real browser. Both run in CI.

## Hardening

| Requirement | Where |
|---|---|
| CSP without inline script or style, HSTS, frame denial, Referrer-Policy, Permissions-Policy | `_headers` (built), `test/build.test.js` |
| Enquiry form: storefront `/api/lead` with CORS for this site only, rate limit, honeypot | storefront `lib/create-app.js` and its tests; honeypot field here |
| No secrets | static site, no keys |
| Links, unique titles and descriptions, canonical, sitemap, robots, JSON-LD (`ProfessionalService`, `Service`, `Person`, `BreadcrumbList`) | `build.mjs`, `test/build.test.js` |
| Skip link, visible focus, labelled fields, no sideways scroll at 360 px | `test/build.test.js`, `test/e2e.mjs` |
| Banned wording (`compliant`, `certified`, `endorsed`, `guarantee`, `4801`, `coming soon`, `launching`, `rolling out`, `in progress`, `quarterly`; "coming soon" and "launching" only inside `data-status-copy` or the exact FORMS beta label; the credential line exempt) | build fails; `test/build.test.js`, `test/status.test.js` |
| No gated products or markets (CORE, SiteGuard AI, robotics, New Zealand, Singapore, overseas) | build fails; `test/status.test.js` |
| Redirects: all 301, every target a built page | `REDIRECTS` in `build.mjs`; build fails; `test/build.test.js` |
| Lighthouse ≥ 90 / 95 / 90 / 95 | run against the Pages preview URL; static pages, self-hosted fonts, no third-party scripts |

## SiteGuard App pages (`scripts/lib/app-pages.mjs`)

`/app/`, `/app/trade-packages/` and a page per trade, `/app/builder-bundles/`, and a page per module (`/app/safety/`, `/quality/`, `/environmental/`, `/management/`) with its lockup from the Brand Suite Rev06 (`assets/brand/`, see Module colour identity). `/app/pricing/` is built once `app_status` is `presale` or `live`; `/app/founding-offer/` only while `presale`.

The data is `data/app-packages.json`, **interim**: generated from the Packages and Pricing workbook (tabs Trade Packages, Trade Package Schedule, Trade Package Contents, App Bundles, Levers) by `python scripts/gen-app-packages.py <workbook.xlsx>`. It carries document titles and counts, never document codes, competitor names, costs or margins. Only issued masters are listed. Once the app products are in packages.py / catalogue.json as group `"app"`, read them from there and retire the generator.

## SiteGuard Audit pages (`scripts/lib/audit-pages.mjs`)

`/audit/` and `/audit/checklists/`. Checklist counts come from `data/audit-checklists.json`, generated from SG_AUDIT_CHECKLIST_BUILD_LIST_Rev02 (siteguard-audit `packages/templates/BUILD_LIST.csv`) by `python scripts/gen-audit-checklists.py <BUILD_LIST.csv>`. Only counts by type, area and wave are copied (the list carries internal document codes and stays in the private repo). The seat price and AI photo-check allowance come from `data/app-packages.json`.

## Module colour identity (`scripts/lib/modules.mjs`)

Each module (Safety, Quality, Environmental, Management, Forms, Audit, Consulting, Education) has a colour from the Brand Suite Rev06 palette and two marks in `assets/brand/`: `sg-<module>-label.svg` (single-line label, on cards) and `sg-<module>-lockup.svg` (full lockup, in page heads). The SVGs are the Rev06 masters unchanged: `SG_<MODULE>_LABEL.svg` and `SG_<MODULE>_LOCKUP.svg` from Hseq-Dev `docs/brand/rev06/SiteGuard_<Module>_Brand_Set_Rev06.zip`. No Robotics or Core marks (reserved / gated).

- Tokens are in `assets/site.css` under `[data-module="<module>"]`: `--mod` (brand colour), `--mod-tint` (8% on white), `--mod-line` (30% on white), `--mod-ink` (darkened only as far as 4.5:1 on the tint and on white needs) and `--mod-on` (text on a `--mod` button). A card or a page's `<main>` takes them through `data-module`; never inline style (the CSP forbids it).
- Module pages and the Audit, Education and Consulting tab pages: `page({ module })` and `head(trail, h1, lede, module)`.
- `test/modules.test.js` computes the WCAG ratios from the CSS values and fails under 4.5:1; it also checks every module page's `data-module` and lockup.
- Screenshots for a PR: `npm run build && npm run screenshots` (dev only; `CHROMIUM_PATH` for a local Chromium) writes `docs/screenshots/module-colour/`.
