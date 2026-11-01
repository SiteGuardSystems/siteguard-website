# siteguardsystems.com.au

Multi-page static site. `build.mjs` stamps the shared head, header and
footer onto every page and writes `dist/`, with Cloudflare Pages
`_headers` (CSP, HSTS and so on) and `_redirects`.

| What | Source |
|---|---|
| Library numbers and "from" prices | `data/site-facts.json`, written by Hseq-Dev `docs/build_catalogue.py --website <this repo>/data` |
| The full catalogue: FORMS packs, documents and prices, and the SiteGuard App products (group `"app"`: trade packages, builder bundles, AUDIT seat) | `data/catalogue.json`, written by the same command (WP-S1). Never edit it by hand: `dcr-check` fails a hand edit. The app prices on the App pages (`data/app-packages.json`, interim, from the workbook) must equal its group `"app"`, or the build fails |
| Document codes and titles | the public DCR extract pinned in `dcr.lock` (see "DCR" below) |
| Legal pages | `content/legal/`, copied from SiteGuard-Forms `app/server/data/legal` by `npm run sync-legal -- <path>`: the website terms, privacy and disclaimer, and (WP-S11) the FORMS Terms of Sale, Refunds, Checkout Notice, FORMS App Terms of Use, Document Use Disclaimer and Consultant Licence. The App Subscription Terms (SG-LEGAL-12) and Founding Offer Terms (SG-LEGAL-13) are in `content/legal-pending/`, marked PENDING SOLICITOR: published (noindex, out of the sitemap) only once `app_status` is `presale` or `live`, and a production build fails until Dan swaps in the approved wording and changes `status` |
| Enquiry form | posts to the storefront's `/api/lead` (`LEAD_ENDPOINT`, default `https://www.siteguardforms.com.au/api/lead`) |
| Partners and affiliates | `data/partners.json`, written by the CRM (siteguard-ai `python -m siteguard_org partners export-sites`) or edited by hand |
| Google review link and rating | `data/google-reviews.json`, same way |

## Status switch (`data/site-mode.json`)

Same file and shape as the storefront's (`beta`), plus `app_status` for the SiteGuard App and SiteGuard Audit (`scripts/lib/site-mode.mjs`):

| Key | Value | Effect |
|---|---|---|
| `beta` | `true` | SiteGuard FORMS shows as the unlinked label "SiteGuard FORMS: coming soon" |
| | `false` | a link to siteguardforms.com.au; the build fails if the coming-soon label is left anywhere |
| `app_status` | `coming_soon` | no app or audit prices anywhere; every buy button is "Register interest"; the header status button goes to `/register-interest/` |
| | `presale` | founding places on sale (from March 2027): prices, the pricing page and the founding offer page show |
| | `live` | the app modules are open (June 2027); the build fails if any pre-launch wording is left |

Pre-launch wording ("coming soon", "launching", "Opens June 2027") is allowed only inside elements marked `data-status-copy` (`statusCopy()` in `site-mode.mjs`), so it can be found and removed when the status changes. Preview other states with `node build.mjs --app-status=presale --beta=false` (`--production` refuses the overrides). `npm test` builds every state.

| `checkout` | `false` (default) | no FORMS shop and no cart; the header cart stays hidden |
| | `true` | with `beta` false: the FORMS shop under `/forms/` and the cart in the header (WP-S8) |

## FORMS shop and cart (WP-S8)

The storefront's own page builders, shared byte for byte: `scripts/lib/shop.mjs` (trade, builder, management systems, specialist, consultant packs, single documents, subscriptions, how ordering works, questions), `scripts/lib/cart.mjs` (cart and order pages) and `scripts/lib/cart-browser.js` (the browser cart, wrapped into `/assets/cart.js`). Keep them identical with SiteGuard-Forms-Storefront.

- Rendered from `data/catalogue.json` under `/forms/`. Every shop page has its canonical tag on siteguardforms.com.au, and none is in this sitemap.
- One cart for everything (Dan's Q1 default). `/cart/` posts to the storefront's checkout engine (`CHECKOUT_ENGINE`, default `https://www.siteguardforms.com.au`) with `returnOrigin` and `source_site: "systems"`; the engine re-prices every line from the catalogue. Stripe sends the buyer back to `/order/success/` or `/order/cancelled/` here.
- Preview a build with the shop on: `node build.mjs --beta=false --checkout=true`.

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
- **Google review badge** in the footer, on `/contact/` and on `/partners/`. "Review us on Google" appears once `place_id` (or `review_url`) is set. The star rating appears only with `rating`, `count` and `as_of`, the date it was read off the profile. A production build fails if that date is more than 120 days old. The site doesn't use review structured data, because Google doesn't show self-published review markup for a business's own site.
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

`/app/`, `/app/trade-packages/` and a page per trade, `/app/builder-bundles/`, and a page per module (`/app/safety/`, `/quality/`, `/environmental/`, `/management/`) with its lockup from the Brand Suite Rev06 (`assets/brand/`). `/app/pricing/` is built once `app_status` is `presale` or `live`; `/app/founding-offer/` only while `presale`.

The data is `data/app-packages.json`, **interim**: generated from the Packages and Pricing workbook (tabs Trade Packages, Trade Package Schedule, Trade Package Contents, App Bundles, Levers) by `python scripts/gen-app-packages.py <workbook.xlsx>`. It carries document titles and counts, never document codes, competitor names, costs or margins. Only issued masters are listed. Once the app products are in packages.py / catalogue.json as group `"app"`, read them from there and retire the generator.

## SiteGuard Audit pages (`scripts/lib/audit-pages.mjs`)

`/audit/` and `/audit/checklists/`. Checklist counts come from `data/audit-checklists.json`, generated from SG_AUDIT_CHECKLIST_BUILD_LIST_Rev02 (siteguard-audit `packages/templates/BUILD_LIST.csv`) by `python scripts/gen-audit-checklists.py <BUILD_LIST.csv>`. Only counts by type, area and wave are copied (the list carries internal document codes and stays in the private repo). The seat price and AI photo-check allowance come from `data/app-packages.json`.
