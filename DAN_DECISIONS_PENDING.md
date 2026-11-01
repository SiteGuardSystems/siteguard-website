# Dan: decisions pending for siteguardsystems.com.au

Last updated 1 Nov 2026 (website restructure WP-S2 to WP-S7; Dan's decisions of 1 Nov on the beta switch, separate checkouts and the go-live order). Nothing here goes live without Dan's go.

## 0. Go-live order (Dan, 1 Nov 2026, #97)

Dan and his assistant do this together, in this order. **Checkout stays off throughout:** FORMS stays in beta (the storefront's one beta switch, see 4.1) and the App stays "coming soon" (`app_status` `coming_soon`, `checkout` `false`).

1. **Legal page details.** Fill them in the SiteGuard-Forms legal sources (`app/server/data/legal`), then `npm run sync-legal -- <path to SiteGuard-Forms>/app/server/data/legal`, commit and push (see section 2).
2. **Cloudflare Pages build settings** (section 1): build `node build.mjs --production`, output `dist`, `NODE_VERSION=20`. Then check a preview build.
3. **Merge S2 to S7, the module colours and the "Coming soon" wording:**
   - S2 to S7: PRs #19 to #24 (the P4 stack).
   - Module colours: **PR #30** (`website-p4-module-colour-identity`, Rev06 module marks and colour tokens). Open item: it is stacked on #23 (S6), beside the main stack, not in it; it has to be merged into #24 and up through #25 to #29 (or rebased onto the top) before the top of the stack has it.
   - "Coming soon" wording: commit `6081883` ("Status wording: Coming soon while coming_soon; launch month only in presale"), on #21 (S4) and merged into #22 and #23. Open item: it is not yet in #24 to #29 (or this PR); merge it up the stack too. Expect a conflict in `scripts/lib/site-mode.mjs` with the beta-switch change here.
4. **Review the preview.**
5. **Switch production over** (and retire the old root `index.html`: archive it, don't delete it).
6. **Check the redirects** (`_redirects`, all 301) **and submit the sitemap** (`https://www.siteguardsystems.com.au/sitemap.xml`) to Google Search Console.

**Legal still pending:** SG-LEGAL-12 (App Subscription Terms) and SG-LEGAL-13 (Founding Offer Terms) stay **PENDING SOLICITOR**. Dan's advisor is drafting them from Solicitor Brief Pack Rev03 section E. They don't block the go-live above (the App stays "coming soon" and checkout off), but they block `app_status` `presale`.

## 1. Go-live of the built site (WP-S0): Cloudflare Pages settings

The live site is still the old root `index.html`. The built site goes live only when the Pages project builds it. In the Cloudflare dashboard, open Pages, then the **siteguard-website** project, then Settings, then Builds & deployments:

| Setting | Value |
|---|---|
| Build command | `node build.mjs --production` |
| Build output directory | `dist` |
| Environment variable (Production and Preview) | `NODE_VERSION` = `20` |
| Preview branches | keep previews on; preview builds may use `node build.mjs` (no `--production`) |

Once the built site is live and checked, retire the old root `index.html` (archive it, don't delete it).

## 2. What blocks `--production`

These are the "open item" problems that only `--production` turns into errors.

- **Legal `[placeholders]`:** none open today. `node build.mjs --production` passed on 1 Nov 2026 with `content/legal/` as synced.
  - If a placeholder comes back, fill it in the SiteGuard-Forms legal sources (`app/server/data/legal`), not here.
  - Then run `npm run sync-legal -- <path to SiteGuard-Forms>/app/server/data/legal`, commit and push.
  - The files concerned: `privacy.md`, `website-terms.md` and `website-disclaimer.md`. Watch for the ABN, privacy contact email and entity name.
- **Founding offer terms (SG-LEGAL-13):** while `data/site-mode.json` has `"app_status": "presale"`, the build reports the founding offer terms as unpublished. This blocks production until they're published (solicitor questions 27–30).
- **Data freshness:**
  - The Google review rating date must be under 120 days old (`data/google-reviews.json` `as_of`).
  - The planning data `checked` dates must be under 200 days old (`data/planning-calendar.json`, `data/inspection-planner.json`).
- **Preview-only overrides:** `--sample-partners`, `--app-status=…` and `--beta=…` are refused by `--production`.

## 3. Decisions from the restructure PRs

1. **The plan file is missing:** `docs/WEBSITE_REVISION_PLAN.md` (Rev02) was not in any repo or in OneDrive 00_CONTROL_REFERENCE. Check the home page (plan 3.1), library box (3.2), App and Audit pages (3.3, 3.4) and redirects (Section 4) against it.
2. **Credential text** (WP-S3), to confirm: "Certificates of Attainment for the Exemplar Global certified courses (AU, TL, QM, EM, OH 45001) via Risk Training Professionals".
3. **Retainer inclusions** (WP-S3): only the price (A$1,200 a month +GST) is in the sources. The listed inclusions need your approval.
4. **Audit checklist headline** (WP-S5): it shows the full build list (480 checklists, added through 2027). The alternative is the launch-ready count only.
5. **S077 consent field names** (WP-S7, storefront PR): consent_basis, consent_method, consent_wording, consent_source and consent_at. Check them against the S077 draft.
6. **When to switch `app_status`:** to `presale` in March 2027, once the founding terms are published and checkout exists (WP-S8 onwards); to `live` in June 2027. FORMS opens when Dan sets `beta` to false in the **storefront's** `data/site-mode.json` (see 4.1); then `npm run sync-site-mode` here, commit, rebuild.

## 4. Decided by Dan, 1 Nov 2026

1. **#94 One beta switch.** The FORMS shop stays in beta on both sites, and both read one switch: the storefront's `data/site-mode.json` `beta` (the checkout engine). Customers can browse the FORMS shop on either site; neither takes orders until Dan turns beta off, then both open together. The engine refuses every FORMS order while beta is true (`source_site` forms or systems), and this site vendors the file (`site-mode.lock`, CI drift check) to keep its buy buttons, cart and checkout hidden.
2. **#96 Separate checkouts (Q1 narrowed by Dan 1 Nov).** Q1 "everything from one cart" becomes: everything is sold on one site, with two kinds of checkout. FORMS documents and packs share one cart (one-off purchases). App and Audit "Subscribe" and "Reserve a founding place" each go straight to their own Stripe checkout, never via the cart, each with its own terms to tick; the founding places keep the 20-place limit and the app needs account setup. The engine's `/api/checkout` refuses `app:` or founding lines with a reason; this build fails if any page could add one to the cart.
3. **#97 Go-live order:** section 0.

