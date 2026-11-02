# Link and SEO check, November 2026 (F3)

Run on 2–3 Nov 2026 against `origin/main` at `b88ca73` (after #35), built locally with `node build.mjs`. Report only: nothing was deployed.

## What was checked

| Check | How |
|---|---|
| Internal links, image and script sources, `#` anchors | every `href` and `src` in every built page, resolved against `dist/` |
| Links that only work through a redirect | internal links against `REDIRECTS` |
| Sitemap | every `<loc>` is a built page, not `noindex`, and its canonical is that URL; every indexable page with its canonical on this site is listed |
| Canonical tags | one per page; points at the page itself, or at siteguardforms.com.au for the shop pages |
| `og:url` | matches the canonical |
| Alt text | every `<img>` has an `alt`; empty only where it's decorative |
| Titles and descriptions | present, unique among indexable pages, length (titles over 60–65 characters and descriptions over about 160 are cut short in search results) |
| One `h1`, `lang="en-AU"` | every page |
| External links | one request per unique URL (HEAD, then GET), browser user agent, 20 s timeout |

Builds checked: the default (`coming_soon`, FORMS beta), `--app-status=presale --beta=true`, `--app-status=presale --beta=false --checkout=true` and `--app-status=live --beta=false --checkout=true` (117 to 126 pages; 78 sitemap URLs in the default build).

## Results

| Check | Result |
|---|---|
| Broken internal links, sources or anchors | **None**, in all four builds |
| Internal links through a redirect | None |
| Sitemap | **Clean**: no missing, duplicate, `noindex` or off-site URLs; every indexable page is listed. Shop pages (canonical on siteguardforms.com.au) and pending legal pages are correctly left out |
| Canonical tags | **Clean**: one per page, all correct |
| `og:url` | **Fixed in this PR.** The `/forms/` shop pages had their canonical on siteguardforms.com.au but `og:url` on this site |
| Alt text | **Clean.** The only empty `alt`s are the header shield logo (beside the "SiteGuard Systems" name) and the module label images on cards (beside the module's name in a heading). Both are decorative, so an empty `alt` is right |
| One `h1`, `lang` | Clean |
| Duplicate titles or descriptions | None among indexable pages |
| Long titles | 36 over 65 characters before this PR, 18 after it (see below). The rest need wording (listed for Dan) |
| Long descriptions | 17 over 160 characters. Listed for Dan; not changed |
| External links | 151 unique. 2 are dead (404), 6 redirect to a new address, and 23 refuse automated requests (403) and need a check in a browser |

## Fixed in this PR

1. **Titles that already name SiteGuard drop the " | SiteGuard Systems" suffix** when it would take them past 60 characters (`TITLE_MAX` in `build.mjs`). The brand stays in the title, and search results no longer cut it short. 28 titles change (every title that names SiteGuard and ran past 60 characters with the suffix), for example:
   - "Carpentry and fit-out: SiteGuard App trade package | SiteGuard Systems" (70) becomes "Carpentry and fit-out: SiteGuard App trade package" (51);
   - "SiteGuard Education: construction safety videos | SiteGuard Systems" (67) becomes "SiteGuard Education: construction safety videos" (47).

   No title text was reworded, and titles without "SiteGuard" keep the suffix.
2. **`og:url` follows the canonical**, so a shared shop page points at the FORMS site, as its canonical does.
3. **`test/seo.test.js`** keeps these checks in `npm test`: sitemap against the canonicals (both ways), `og:url`, alt text, no internal links through a redirect, and the title rule.

## For Dan (needs wording or a decision)

### Titles still over 65 characters

These don't name SiteGuard, so the suffix stays. Shorter wording is a choice for Dan; suggestions are in brackets and nothing is changed.

| Page | Title now | Suggestion |
|---|---|---|
| `/planning/<state>/` (8 pages) | "Victoria public holidays and building industry RDOs \| SiteGuard Systems" (71 to 91) | "Victoria public holidays and RDOs" (keep the suffix) |
| `/planning/` | "Planning calendar: holidays, RDOs and the safety calendar" (77) | "Planning calendar: holidays, RDOs and safety dates" |
| `/planning/inspections/` | "Inspection and testing planner: how often, and on what basis" (80) | "Inspection and testing planner" |
| `/planning/inspections/<group>/` (5 pages) | "Fire and emergency: inspection and testing intervals" (71 to 74) | "Fire and emergency inspection intervals" |
| `/legal/document-use-disclaimer/` | "Document Use Disclaimer and Notice of PCBU Responsibilities" (79) | Legal title, from SiteGuard-Forms: leave as is |
| `/audit/` | "SiteGuard Audit: audits and inspections for consultants and businesses" (70, already without the suffix) | "SiteGuard Audit: audits and inspections" |
| `/app/trade-packages/interior-finishes-plaster-ceilings-tiling/` | 74, already without the suffix | The trade name comes from the workbook; leave as is |

### Descriptions over 160 characters

Search results cut these short; nothing is wrong with them otherwise. Rewording them is optional:
`/` (204), `/app/` (179), `/app/builder-bundles/` (188), the Interior finishes trade page (196), `/consulting/builders/` (182), `/consulting/ims-tier-1-uplift/` (224), `/consulting/iso-ims/` (196), `/consulting/leadership-advisory/` (197), `/forms/management-systems/` (172, canonical on the FORMS site), `/legal/privacy/` (173), `/legal/terms-of-sale/` (182), `/planning/act/` (175) and the five `/planning/inspections/<group>/` pages (174 to 177).

### Share image

Every page uses `/assets/apple-touch-icon.png` (the small app icon) as its `og:image`. A 1200 × 630 share image from the Brand Suite would show properly when a page is shared on LinkedIn or in a message. It needs a brand asset.

### External links

The planner data (`data/planning-calendar.json` and `data/inspection-planner.json`) is shared with SiteGuard-Forms-Storefront, so source changes go in both repos together and weren't made here.

**Dead (404):**
- ACT public holidays source, `https://www.cmtedd.act.gov.au/communication/holidays` (`planning-calendar.json`). The ACT Government page now appears to be `https://www.act.gov.au/living-in-the-act/public-holidays-school-terms-and-daylight-saving` (returns 200); confirm the dates against it before swapping.
- MBA WA 2026 public holidays and RDO calendar PDF, `https://www.mbawa.com/wp-content/uploads/2025/10/2026-Public-Holidays-RDO-Calendar.pdf` (source `mbawa-2026`, used by 2 entries). The site is up, but the file has moved or been removed.

**Redirected (still work; update when the data is next checked):**
- `https://www.comcare.gov.au/conference` to `https://conference.comcare.gov.au/`
- `https://www.aioh.org.au/education/annual-conference/` to `https://www.aioh.org.au/annual-conference/`
- `https://www.worksafe.vic.gov.au/worksafe-awards` to `https://www.worksafe.vic.gov.au/awards`
- `https://www.tradefairdates.com/Workplace-Health-und-Safety-Show-M10490/Melbourne.html` to `.../Workplace-Health-Safety-Show-M10490/Melbourne.html`
- `https://pfes.nt.gov.au/file/download/481` to the 2024 NTFRS building fire safety inspection checklist PDF
- `https://www.comcare.gov.au/about/forms-pubs/docs/pubs/safety/participating-in-effective-health-safety-committees.pdf` to `https://www.comcare.gov.au/sites/default/files/docs/participating-in-effective-health-safety-committees.pdf`

**Refused automated checks (403), to open in a browser:** 23 URLs, mostly state regulator sites behind a firewall (WorkSafe Queensland and Tasmania, SafeWork SA, NT Government, business.vic.gov.au, VBA, VicRoads), plus awarenessdays.com, quality.org, women.qld.gov.au, thinkroadsafety.sa.gov.au and the ACA generator PDF. These are usually fine for a person; the next 6-monthly data check should open them.

### Already on Dan's list

- Submit `https://www.siteguardsystems.com.au/sitemap.xml` in Google Search Console (Decisions Record Rev01, "Still open").
- The old root `index.html` is no longer served (Cloudflare Pages builds `dist/`), so archiving it doesn't affect the live site.
