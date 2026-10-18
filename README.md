# siteguardsystems.com.au

Multi-page static site. `build.mjs` stamps the shared head, header and
footer onto every page and writes `dist/`, with Cloudflare Pages
`_headers` (CSP, HSTS and so on) and `_redirects`.

| What | Source |
|---|---|
| Library numbers and "from" prices | `data/site-facts.json`, written by Hseq-Dev `docs/build_catalogue.py --website <this repo>/data` |
| Legal pages | `content/legal/`, copied from SiteGuard-Forms `app/server/data/legal` by `npm run sync-legal -- <path>` |
| Enquiry form | posts to the storefront's `/api/lead` (`LEAD_ENDPOINT`, default `https://www.siteguardforms.com.au/api/lead`) |

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
size, no inline script, the exact credential wording, the enquiry endpoint,
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
| Banned wording (`compliant`, `certified`, `endorsed`, `guarantee`, `4801`, `coming soon`, `rolling out`, `in progress`, `quarterly`; "Certified Lead Auditor" allowed) | build fails; `test/build.test.js` |
| Lighthouse ≥ 90 / 95 / 90 / 95 | run against the Pages preview URL; static pages, self-hosted fonts, no third-party scripts |
