# Dan: decisions pending for siteguardsystems.com.au

Last updated 1 Nov 2026 (website restructure WP-S2 to WP-S7). Nothing here goes live without Dan's go.

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
6. **When to switch `app_status`:** to `presale` in March 2027, once the founding terms are published and checkout exists (WP-S8 onwards); to `live` in June 2027. Switch `beta` to false when FORMS opens.
