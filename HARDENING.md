# Hardening: siteguardsystems.com.au

The SiteGuard-Forms-Storefront `HARDENING.md` rows, applied to this site (WP-S12), and what proves each one. "CI" means `.github/workflows/ci.yml` runs it on every pull request. This site is static (Cloudflare Pages): the server rows (rate limits, webhook, Stripe Tax, re-pricing) belong to the checkout engine, the storefront's server, and are proved there.

| Area | Requirement | Where it is checked |
|---|---|---|
| Links | Every internal link resolves; every redirect target is a page | `build.mjs` fails the build (CI) |
| Error pages | Real 404 and 500 pages | `dist/404.html`, `dist/500.html` (Cloudflare Pages serves `404.html`) |
| SEO | `sitemap.xml`, `robots.txt`, a canonical tag, unique title and description on every page, Open Graph | `build.mjs`; `test/build.test.js` (CI) |
| Duplicate content | The FORMS shop pages under `/forms/` are canonical on siteguardforms.com.au and left out of this sitemap; `/cart/` and `/order/` are noindex and disallowed in `robots.txt`; PENDING SOLICITOR legal pages are noindex | `test/shop.test.js`, `test/legal.test.js` (CI) |
| Structured data | `ProfessionalService`, `Person`, `Service`, `BreadcrumbList`; on the shop `Product` / `Offer` (ex GST) naming the FORMS page, `FAQPage` | `build.mjs`, `scripts/lib/shop.mjs`; `test/shop.test.js` |
| Accessibility | Skip link, visible focus, labels on every field, no sideways scroll at 360 px (shop and cart included), menu works on a phone | `test/build.test.js`; `test/e2e.mjs` in a real browser (CI) |
| Lighthouse | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90, SEO ≥ 95 | run against the preview URL before go-live; static pages, self-hosted fonts, no third-party scripts |
| Page weight | Under 100 KB of HTML per page; long document lists load on demand | `build.mjs` fails above 100 KB (CI) |
| Functions | Enquiry and register-interest forms; cart on every page (one cart), add / remove / subtotal, terms tick box, checkout posts to the configured engine with `returnOrigin` and `source_site`, engine refusals shown, cart empties on success; no console errors | `test/e2e.mjs` (CI), against a mocked engine. The real engine and Stripe test mode: WP-S9 |
| Prices | Every price equals the catalogue (`data/catalogue.json`, from Hseq-Dev `packages.py` and the app price table); the App pages' prices equal its group `"app"`; prices are A$ ex GST and say "+GST" | `test/shop.test.js`, `test/catalogue.test.js`, `build.mjs` (CI); the engine re-prices every line |
| What is sold | Only packs in a purchasable launch wave can be added; app products are never FORMS cart items; a preview catalogue never takes payment | `scripts/lib/shop.mjs`; `test/shop.test.js` (CI) |
| Shop switch | No shop and no cart until `data/site-mode.json` `checkout` is true and FORMS is out of beta | `test/shop.test.js` (CI) |
| DCR | Pinned public extract verified; every code shown or sold is a live public code with the DCR title; catalogue stamped | `build.mjs`; `npm run dcr-check` (CI) |
| Banned words | `compliant`, `certified` (except the exact credential line), `endorsed`, `guarantee`, `4801`, `rolling out`, `in progress`, `quarterly`, `coming soon` / `launching` (outside status copy); legal pages exempt | `build.mjs` fails (CI); `test/build.test.js`, `test/status.test.js` |
| Gated products | No CORE, SiteGuard AI, robotics, New Zealand or overseas markets on a customer page | `build.mjs` fails (CI) |
| Legal | Legal pages from the one source (`sync-legal`); production refuses open `[placeholders]` and PENDING SOLICITOR terms; checkout needs the Terms of Sale and Document Use Disclaimer tick box, and the terms version is sent | `build.mjs --production`; `test/legal.test.js`; `test/e2e.mjs` |
| Security headers | CSP (`default-src 'self'`, no inline script or style, `frame-ancestors 'none'`, `object-src 'none'`), `connect-src` adds the checkout engine and `form-action` adds the engine and `https://checkout.stripe.com` only while the shop is on; HSTS; `X-Frame-Options`; Referrer-Policy; Permissions-Policy | `_headers` from `build.mjs`; `test/build.test.js`, `test/shop.test.js` (CI) |
| Abuse | Honeypot field on every form; rate limits, body limits and CORS (this site's origins only) are on the engine's `/api/lead` and `/api/checkout` | storefront `test/app.test.js` |
| Secrets | None in the client bundle or the repo; the cart holds no key and talks only to the engine | static site; `cart.js` built from `scripts/lib/cart-browser.js` |
| Dependencies | `npm audit`: 0 high or critical | CI (`npm audit --omit=dev --audit-level=high`) |
| Node | Pinned | `.nvmrc` (20), `engines` in `package.json` |
