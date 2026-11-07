#!/usr/bin/env node
// Builds siteguardsystems.com.au into dist/ (Cloudflare Pages: build command
// "node build.mjs", output directory "dist"). Static pages with a shared
// head, header and footer. Numbers and "from" prices come from
// data/site-facts.json, and the full catalogue (the FORMS packs and the
// SiteGuard App products, group "app") from data/catalogue.json, both written
// by Hseq-Dev docs/build_catalogue.py --website; legal
// pages come from content/legal/, copied from SiteGuard-Forms (the one legal
// source) by scripts/sync-legal.mjs.
//
//   node build.mjs               # build; notes open items
//   node build.mjs --production  # also fails on open [placeholders] in a legal page
//   node build.mjs --sample-partners  # preview only: fills the partner and review
//                                     # blocks from data/*.sample.json
//   node build.mjs --app-status=presale --beta=false
//                                # preview and test builds only: override
//                                # data/site-mode.json (--production refuses)
import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, frontMatter, render, plain, PLACEHOLDER_RE } from "./scripts/lib/md.mjs";
import { loadTrust, partnerStrip, reviewBadge, partnersBody } from "./scripts/lib/trust.mjs";
import { loadVideo, introVideo, videoJsonLd, withVideoCsp, withCspSources } from "./scripts/lib/video.mjs";
import { loadEducation, educationBody, seriesBody, seriesPath, educationCsp, educationJsonLd, relatedVideos as relatedVideosBand } from "./scripts/lib/education.mjs";
import { loadPlanning, planningIndexBody, planningStateBody, inspectionsIndexBody, inspectionGroupBody, inspectionGroups, groupPath, icsFor, STATES, STATE_NAMES, statePath } from "./scripts/lib/planning.mjs";
import { loadSiteMode, shopOn, shopShown, statusCopy, appStatusCopy, withoutStatusCopy, checkStatusCopy, FORMS_EXCEPTION } from "./scripts/lib/site-mode.mjs";
import { loadAppPackages, appPages, appProductId } from "./scripts/lib/app-pages.mjs";
import { loadSupportChat, supportChatWidget, supportChatConnect } from "./scripts/lib/support-chat.mjs";
import { loadAuditChecklists, auditPages } from "./scripts/lib/audit-pages.mjs";
import { loadPinned, checkCatalogue, rev2 } from "./scripts/lib/dcr.mjs";
// The FORMS shop and the cart (WP-S8): the same files as SiteGuard-Forms-Storefront.
import { shopModel, rangesHtml, shopPages } from "./scripts/lib/shop.mjs";
import { cartPages, cartBrowserParts, systemsCartScript, termsVersion } from "./scripts/lib/cart.mjs";
import { moduleLabel, moduleLockup, modAttr } from "./scripts/lib/modules.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, "dist");
const PRODUCTION = process.argv.includes("--production");
const CATALOGUE = process.env.CATALOGUE_PATH ? path.resolve(process.env.CATALOGUE_PATH) : path.join(ROOT, "data/catalogue.json");
const SAMPLE_PARTNERS = process.argv.includes("--sample-partners");
const argValue = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
// Status switch (data/site-mode.json; scripts/lib/site-mode.mjs). Loaded in build().
let MODE = { beta: true, app_status: "coming_soon" };
// Partners, affiliates and the Google review link (data/partners.json,
// data/google-reviews.json; scripts/lib/trust.mjs). Loaded in build().
let TRUST = { partners: [], reviews: {} };
// Landing-page introduction video (data/intro-video.json;
// scripts/lib/video.mjs). Nothing shows until it is filled in.
let VIDEO = null;
// Planning calendar and inspection planner (data/planning-calendar.json,
// data/inspection-planner.json; scripts/lib/planning.mjs). /planning/.
let PLANNING = { cal: null, insp: null };
// SiteGuard Education hub (data/education.json; scripts/lib/education.mjs).
let EDU = null;
// Help chat (data/support-chat.json; scripts/lib/support-chat.mjs). P11.
let CHAT = { base: "", endpoint: "" };
const ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.siteguardsystems.com.au").replace(/\/$/, "");
const FORMS = (process.env.FORMS_URL ?? "https://www.siteguardforms.com.au").replace(/\/$/, "");
const FORMS_APP = (process.env.FORMS_APP_URL ?? "https://app.siteguardforms.com.au").replace(/\/$/, "");
// The one checkout engine: the storefront's server (POST /api/checkout).
export const CHECKOUT_ENGINE = (process.env.CHECKOUT_ENGINE ?? FORMS).replace(/\/$/, "");
// The FORMS shop lives under /forms/ here; its pages are canonical on the FORMS site.
export const SHOP_BASE = "/forms";
// Stripe Checkout's origin: the engine returns a checkout.stripe.com URL.
export const STRIPE_CHECKOUT = "https://checkout.stripe.com";
const LEAD_ENDPOINT = process.env.LEAD_ENDPOINT ?? `${FORMS}/api/lead`;
const EMAIL = "hello@siteguardsystems.com.au";
// The support address on /support/ and /support/delete-account/ (the store
// listings link both). SUPPORT_EMAIL at build time sets it (support@ once
// that mailbox exists); until then it is the hello@ address.
export const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL ?? "").trim() || EMAIL;
const LINKEDIN = "https://www.linkedin.com/in/silverdaniel";
// Rebaseline 31 Oct 2026: the Certificate of Attainment wording. Never
// "Exemplar Global Certified Lead Auditor". This exact line is the only place
// "certified" may appear on the site (it describes the courses, not SiteGuard).
export const CREDENTIAL = "Certificates of Attainment for the Exemplar Global certified courses (AU, TL, QM, EM, OH 45001) via Risk Training Professionals";

// Banned wording, checked on every built page except the legal pages.
// "coming soon" and "launching" are allowed only inside elements marked
// data-status-copy (pre-launch wording for the SiteGuard App and SiteGuard
// Audit; none may remain once app_status is "live"), and in the exact
// "SiteGuard FORMS (coming soon)" label while FORMS is in beta (Dan, 22 Oct
// 2026: legal advice, pending settlement).
export const BANNED = /\b(compliant|certified|endorsed|guarantee[sd]?|4801|rolling out|in progress|quarterly|coming soon|launching)\b/gi;
// Gated products and markets are never mentioned on the site (rebaseline
// 31 Oct 2026): CORE, SiteGuard AI, robotics, New Zealand and overseas.
export const GATED = [/\bCORE\b/g, /\bSiteGuard AI\b|\brobot(?:s|ic|ics)?\b|\bhumanoid\b|\bquadruped\b|\bNew Zealand\b|\bSingapore\b|\boverseas\b/gi];

/** Page text with what the banned-word check allows taken out. */
export function checkedText(html, mode) {
  let s = withoutStatusCopy(html.replace(/<script[\s\S]*?<\/script>/g, " "));
  if (mode.beta) s = s.replace(new RegExp(FORMS_EXCEPTION.source, "g"), " ");
  return s.replace(/<[^>]+>/g, " ").split(CREDENTIAL).join(" ");
}

/** Banned and gated words on a page (an empty list is a pass). */
export function wordingHits(html, mode) {
  const text = checkedText(html, mode);
  return [...new Set([...(text.match(BANNED) ?? []), ...GATED.flatMap((re) => text.match(re) ?? [])])];
}

// SiteGuard FORMS: while it is in beta (the storefront's one switch, Dan 1 Nov
// 2026), a link to the shop under /forms/ to browse, marked beta; no orders.
const formsHref = () => (shopShown(MODE) ? "/forms/" : `${FORMS}/`);
const formsName = () => (MODE.beta ? `<a href="/forms/">SiteGuard FORMS</a> <span class="forms-soon">(beta)</span>` : `<a href="${formsHref()}">SiteGuard FORMS</a>`);

const formsWill = () => (MODE.beta ? "will be available on" : "are available on");

// The go-live month for the SiteGuard App and SiteGuard Audit: launch.opens
// in data/app-packages.json. Loaded in build().
let LAUNCH = {};

/** Pre-launch line for the SiteGuard App and SiteGuard Audit (none once live; appStatusCopy in site-mode.mjs). */
const appWhen = (opts = {}) => appStatusCopy(MODE, LAUNCH.opens, opts);

/** The buy button for an app or audit product (interest: app or audit). */
function buyButton(interest, { cls = "btn btn-hivis" } = {}) {
  if (MODE.app_status === "live") return `<a class="${cls}" href="/app/pricing/">Get started</a>`;
  if (MODE.app_status === "presale") return `<a class="${cls}" href="/app/founding-offer/">Founding places</a>`;
  return `<a class="${cls}" href="/register-interest/?interest=${interest}">Register interest</a>`;
}

/** "Related videos" band on a module page (WP-S6 fills it from data/education.json). */
const relatedVideos = (module) => relatedVideosBand(EDU, module);

// [href, title, text, status line, module (colour and label; none for the App and the Planner)]
const HOME_DOORS = () => [
  ["/consulting/", "Consulting", "Senior HSEQ consulting: from one SWMS to an ISO-aligned integrated management system, audits and inspections, and monthly retainers.", "", "consulting"],
  ["/app/", "SiteGuard App", "Safety, quality, environmental and management modules for trades and builders, with the documents for your work included and kept current.", appWhen()],
  ["/audit/", "SiteGuard Audit", "Audits and inspections for consultants and businesses: checklists, photos, findings, corrective actions and the report.", appWhen(), "audit"],
  ["/education/", "Education", "Short videos for toolbox talks, inductions and how-tos, free to watch and share with your crews.", "", "education"],
  ["/planning/", "Planner", "Public holidays, building industry RDOs and the safety calendar for every state, and an inspection and testing planner."],
];

const pages = [];
const problems = [];
// Data files the shop pages load (documents.json, long pack lists).
const shopFiles = [];
// DCR warnings (a retired code neither shown nor sold): reported, never blocking.
const dcrWarnings = [];
let DCR_PIN = null;

/** The public DCR extract pinned in dcr.lock (vendored; the same check as the
 *  storefront): the build stops if it doesn't verify, and fails on a code the
 *  catalogue shows or sells that isn't a live public page-A code, a title that
 *  differs from the DCR, or a catalogue without the dcr.lock stamp. The DCR
 *  never decides what is sold or its price. */
function checkDcr(cat) {
  let pinned;
  try {
    pinned = loadPinned(ROOT);
  } catch (e) {
    console.error(`DCR: the public extract pinned in dcr.lock does not verify: ${e.message}`);
    console.error("Fix vendor/siteguard-dcr or dcr.lock (see README, \"DCR\"). The build stops here.");
    process.exit(1);
  }
  DCR_PIN = { revision: pinned.dcr.revision, sha256: pinned.dcr.sourceSha256, public_sha256: pinned.dcr.sha256 };
  for (const f of checkCatalogue(cat, pinned)) {
    if (f.severity === "error") problems.push(`DCR: [${f.kind}] ${f.message}`);
    else dcrWarnings.push(f);
  }
}

/** The app prices on the SiteGuard App pages (data/app-packages.json, from the
 *  workbook) must equal the catalogue's group "app" (Hseq-Dev
 *  docs/pricing/app_price_table.json). */
export function appPriceDrift(app, cat) {
  const out = [];
  const byId = new Map((cat.packs ?? []).filter((p) => p.group === "app").map((p) => [p.id, p]));
  const want = [
    ...(app?.levels ?? []).map((l) => [appProductId.level(l), l.price_month]),
    ...(app?.bundles ?? []).map((b) => [appProductId.bundle(b), b.price_month]),
    ...(app?.audit ? [[appProductId.audit, app.audit.seat_month]] : []),
  ];
  for (const [id, price] of want) {
    const p = byId.get(id);
    if (!p) out.push(`catalogue.json has no app product ${id} (app-packages.json prices it at ${price})`);
    else if (p.app_prices?.per_month !== price) out.push(`app-packages.json prices ${id} at ${price} a month, catalogue.json at ${p.app_prices?.per_month}`);
    else if (!Number.isInteger(p.app_prices?.founding_prepay_cents)) out.push(`catalogue.json ${id} has no founding_prepay_cents (Hseq-Dev export_price_tables.py --website)`);
  }
  return out;
}
const money = (n) => "$" + Number(n).toLocaleString("en-AU");

// Main menu: Consulting · SiteGuard App · SiteGuard Audit · Education · Planner
// · Forms, then Contact, the cart (hidden until checkout exists) and the
// status button. A tab is current on its own pages and on the pages it lists.
const NAV = [
  ["/consulting/", "Consulting", ["/consulting/", "/about/", "/library/"]],
  ["/app/", "SiteGuard App"], ["/audit/", "SiteGuard Audit"],
  ["/education/", "Education"], ["/planning/", "Planner"],
];
// Cloudflare Pages _redirects, all 301. Every target must be a built page.
export const REDIRECTS = [
  ["/index.html", "/"],
  ...["consulting", "library", "about", "contact", "partners", "planning", "education", "app", "audit"].map((p) => [`/${p}`, `/${p}/`]),
  // Consulting moved from /services/ (WP-S3).
  ["/services", "/consulting/"], ["/services/", "/consulting/"], ["/services/*", "/consulting/:splat"],
  ["/planner", "/planning/"], ["/planner/", "/planning/"], ["/planner/*", "/planning/:splat"],
];
// Checkout (WP-S8 onwards) shows the cart; until then it stays hidden.
// data/site-mode.json "checkout" (and FORMS out of beta): scripts/lib/site-mode.mjs shopOn().
const cartEnabled = () => shopOn(MODE);
// FORMS in beta (Dan, 1 Nov 2026, #94): the shop is browse only. The engine
// refuses every FORMS order anyway; here the buy buttons, the cart and the
// checkout never render. Server-rendered buy controls are taken out of the
// shop pages, and the ones the script draws (single documents) are hidden by
// body[data-browse-only] in site.css.
const browseOnly = () => shopShown(MODE) && !shopOn(MODE);
const BUY_CONTROL = /<button\b[^>]*\bdata-add-(?:pack|doc)=[^>]*>[\s\S]*?<\/button>|<a\b[^>]*\bdata-preview-disabled\b[^>]*>[\s\S]*?<\/a>/g;
export const withoutBuyControls = (html) => html.replace(BUY_CONTROL, "");
const BETA_NOTICE = `<section class="band" data-beta-notice><div class="wrap"><p class="status-line"><strong>SiteGuard FORMS is in beta.</strong> Browse the range and prices now. Orders aren't open yet; they open here and on siteguardforms.com.au at the same time.</p></div></section>`;
/** A shop page body for browse only: no buy controls, and the beta notice under the page head. */
function browseBody(body) {
  const out = withoutBuyControls(body);
  const i = out.indexOf("</section>");
  return i < 0 ? BETA_NOTICE + out : `${out.slice(0, i + 10)}\n${BETA_NOTICE}${out.slice(i + 10)}`;
}
// WP-S10: SiteGuard App checkout through the engine: founding places while
// app_status is "presale", subscriptions once it is "live". Needs "checkout"
// on (the engine accepts this site), not FORMS out of beta. The engine's own
// gates (its app_status, P2's dates, the platform launch endpoint) decide too.
export const appCheckoutOn = (mode) => mode.checkout === true && mode.app_status !== "coming_soon";

/** The founding or subscription form (assets/app-checkout.js posts it to the engine). */
function appCheckoutForm(kind, cat) {
  const app = (cat.packs ?? []).filter((p) => p.group === "app");
  const label = (p) => `${p.name}: ${money(p.app_prices.per_month)} a month +GST${p.app_prices.per_seat ? " a seat" : ""}, billed annually`;
  const trades = (cat.trades ?? []).filter((t) => t.group === "trade-packs" || t.group === "specialist-packs");
  const cad = app[0]?.app_prices?.cadences ?? {};
  const cadLabel = { annual: "Paid yearly (best value)", six_monthly: "Paid every 6 months", quarterly: "Paid every 3 months", monthly: "Paid monthly" };
  const terms = kind === "founding" ? ["/legal/founding-offer-terms/", "Founding Offer Terms"] : ["/legal/app-subscription-terms/", "App Subscription Terms"];
  return `<form class="form" id="${kind === "founding" ? "founding-checkout" : "subscribe"}" data-app-checkout="${kind === "founding" ? "founding" : "subscribe"}" data-engine="${esc(new URL(CHECKOUT_ENGINE).origin)}" novalidate>
  ${kind === "founding" ? '<p class="founding-places" data-places aria-live="polite"></p>' : ""}
  <label>What you're buying<select name="productId">${app.map((p) => `<option value="${esc(p.id)}">${esc(label(p))}</option>`).join("")}</select></label>
  <label data-trade-field>Your trade<select name="trade"><option value="">Choose your trade</option>${trades.map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join("")}</select></label>
  <label data-seats-field>Audit seats<input type="number" name="quantity" min="1" max="50" value="1"></label>
  ${kind === "subscribe" ? `<label>Billing<select name="cadence">${Object.keys(cad).map((c) => `<option value="${c}"${c === "annual" ? " selected" : ""}>${cadLabel[c] ?? c}</option>`).join("")}</select></label>` : '<label>Email for your receipt (optional)<input type="email" name="email" autocomplete="email" maxlength="200"></label>'}
  <label class="check"><input type="checkbox" name="accept" aria-required="true"> <span>I have read and accept the <a href="${terms[0]}">${terms[1]}</a>${kind === "founding" ? ", and I understand I pay for 12 months now and they start when the app opens" : ""}.</span></label>
  <p class="small">Prices are in A$ and exclude GST; GST is added at checkout. Checkout is handled by Stripe.</p>
  <p class="form-status" data-status aria-live="polite"></p>
  <div><button class="btn btn-hivis" type="submit">${kind === "founding" ? "Buy a founding place" : "Go to secure checkout"}</button></div>
</form>`;
}

/** The header button that follows the launch status. */
function statusButton() {
  if (MODE.app_status === "live") return ["/app/pricing/", "Get started"];
  if (MODE.app_status === "presale") return ["/app/founding-offer/", "Founding places"];
  return ["/register-interest/", "Register interest"];
}

function header(url) {
  const cur = (paths) => (paths.some((p) => url.startsWith(p)) ? ' aria-current="page"' : "");
  const [sh, sl] = statusButton();
  const forms = `<a href="${formsHref()}"${shopShown(MODE) ? cur(["/forms/"]) : ""}>SiteGuard FORMS${MODE.beta ? " (beta)" : ""}</a>`;
  const cart = cartEnabled()
    ? `<a class="nav-cart" href="/cart/" data-cart${cur(["/cart/"])}>Cart <span data-cart-count>(0)</span></a>`
    : `<button class="nav-cart" type="button" data-cart hidden>Cart <span data-cart-count>0</span></button>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><img src="/assets/shield.png" alt="" width="34" height="44"><span class="brand-name">SiteGuard <b>Systems</b></span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav class="nav" id="site-nav" aria-label="Main">${NAV.map(([h, l, also]) => `<a href="${h}"${cur(also ?? [h])}>${l}</a>`).join("")}${forms}<a href="/contact/"${cur(["/contact/"])}>Contact</a>${cart}<a class="cart-link nav-status" href="${sh}"${cur([sh])}>${sl}</a></nav>
  </div>
</header>`;
}

// Legal pages (WP-S11). The synced ones come from SiteGuard-Forms
// app/server/data/legal (scripts/sync-legal.mjs, the one legal source); the
// FORMS ones are here because the Systems site sells FORMS packs from the same
// catalogue and checkout. "when" decides whether a page is published.
export const LEGAL_PAGES = [
  { file: "website-disclaimer.md", slug: "disclaimer", nav: "Website Disclaimer" },
  { file: "privacy.md", slug: "privacy", nav: "Privacy Policy" },
  { file: "website-terms.md", slug: "website-terms", nav: "Website Terms of Use" },
  { file: "terms-of-sale.md", slug: "terms-of-sale", nav: "Terms of Sale" },
  { file: "refunds.md", slug: "refunds", nav: "Refunds and cancellations" },
  { file: "disclaimer.md", slug: "document-use-disclaimer", nav: "Document Use Disclaimer" },
  { file: "terms-of-use.md", slug: "forms-app-terms", nav: "FORMS App Terms of Use" },
  // Published only while a consultant plan is on sale (as on the storefront).
  { file: "consultant-licence.md", slug: "consultant-licence", nav: "Consultant Licence", when: (c) => c.consultants },
  // Not yet written (Solicitor Brief Pack Rev03): content/legal-pending/, marked
  // PENDING SOLICITOR until Dan swaps in the approved wording. Published only
  // once the app is on sale (presale or live); a production build fails while
  // either still says PENDING SOLICITOR.
  { file: "app-subscription-terms.md", dir: "legal-pending", slug: "app-subscription-terms", nav: "App Subscription Terms", when: (c) => c.app_status !== "coming_soon" },
  { file: "founding-offer-terms.md", dir: "legal-pending", slug: "founding-offer-terms", nav: "Founding Offer Terms", when: (c) => c.app_status !== "coming_soon" },
];
export const PENDING = "PENDING SOLICITOR";
// Set in build(): the legal pages published in this state.
let LEGAL_ON = LEGAL_PAGES.filter((l) => !l.when);

function footer() {
  return `<footer class="site-footer"><div class="wrap">
  <div class="footer-grid">
    <div><h2>SiteGuard Systems</h2><p>HSEQ consulting, the SiteGuard App and SiteGuard Audit for Australian construction. Melbourne, Victoria; working Australia-wide.</p></div>
    <div><h2>Consulting</h2><ul>
      ${Object.entries(SERVICES).map(([slug, s]) => `<li><a href="/consulting/${slug}/">${esc(s.nav)}</a></li>`).join("")}
      <li><a href="/library/">Document library</a></li><li><a href="/about/">About Daniel Silver</a></li></ul></div>
    <div><h2>Products and tools</h2><ul><li><a href="/app/">SiteGuard App</a></li><li><a href="/audit/">SiteGuard Audit</a></li><li><a href="/education/">SiteGuard Education</a></li><li><a href="/planning/">Planner</a></li></ul></div>
    <div><h2>Contact</h2><ul><li><a href="mailto:${EMAIL}">${EMAIL}</a></li><li><a href="${LINKEDIN}">LinkedIn</a></li><li><a href="/contact/">Send an enquiry</a></li>${MODE.app_status === "live" ? "" : `<li><a href="/register-interest/">Register interest</a></li>`}<li><a href="/partners/">Partners and referrals</a></li><li><a href="/support/">Support</a></li></ul>${reviewBadge(TRUST, { compact: true })}</div>
    <div><h2>Legal</h2><ul>${LEGAL_ON.map((l) => `<li><a href="/legal/${l.slug}/">${esc(l.nav)}</a></li>`).join("")}</ul></div>
  </div>
  <p class="footer-base">SiteGuard provides frameworks, systems and advisory support. Work health and safety duties stay with the person conducting the business or undertaking.<br>© ${new Date().getFullYear()} SiteGuard Systems · ABN 36 765 797 871</p>
</div></footer>`;
}

function crumbs(trail) {
  const items = [["/", "Home"], ...trail];
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([h, l], i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(l)}</li>` : `<li><a href="${h}">${esc(l)}</a></li>`).join("")}</ol></nav>`;
}

export const TITLE_MAX = 60;
function page({ url, title, description, body, trail = [], jsonld = [], strip = true, noindex = false, canonical, preview = false, module = null }) {
  noindex = noindex || preview;
  // " | SiteGuard Systems" is left off a title that already names SiteGuard when it would take the
  // title past TITLE_MAX characters, where search results cut it short (F3, SEO check Nov 2026).
  const suffixed = `${title} | SiteGuard Systems`;
  const full = url === "/" || (/SiteGuard/.test(title) && suffixed.length > TITLE_MAX) ? title : suffixed;
  const ld = [...jsonld];
  if (trail.length) ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["/", "Home"], ...trail].map(([h, l], i) => ({ "@type": "ListItem", position: i + 1, name: l, item: ORIGIN + h })) });
  pages.push({ url, title: full, noindex, elsewhere: Boolean(canonical), html: `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical ?? ORIGIN + url}">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="SiteGuard Systems">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical ?? ORIGIN + url}">
<meta property="og:image" content="${ORIGIN}/assets/apple-touch-icon.png">
<meta name="theme-color" content="#2B2A2F">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/barlow-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script src="/assets/site.js" defer></script>
${/data-app-checkout|data-founding-cancel/.test(body) ? '<script src="/assets/app-checkout.js" defer></script>\n' : ""}${cartEnabled() || (browseOnly() && url.startsWith(SHOP_BASE + "/")) ? '<script src="/assets/cart.js" defer></script>\n' : ""}<script src="/assets/support-chat.js" defer></script>
</head>
<body${preview ? ' data-preview="1"' : ""}${MODE.beta ? ' data-beta="1"' : ""}${browseOnly() ? ' data-browse-only="1"' : ""}>
${preview ? '<div class="preview-bar" role="note"><strong>Preview build.</strong> This shows every package for review, including packages not yet released for sale. Checkout is switched off.</div>\n' : ""}
${header(url)}
<main id="main"${modAttr(module)}>
${body}
</main>
${strip ? partnerStrip(TRUST) : ""}
${footer()}
${supportChatWidget(CHAT, EMAIL)}
</body>
</html>
` });
}

// module: the page's module (data-module on <main>); the head shows its full lockup.
const head = (trail, h1, lede, module = null) => `<section class="page-head"><div class="wrap">${crumbs(trail)}${module ? moduleLockup(module) : ""}<h1>${h1}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div></section>`;
const enquire = (label = "Send an enquiry") => `<p><a class="btn btn-hivis" href="/contact/">${label}</a></p>`;

// Register interest (WP-S7): posts to the storefront's /api/lead as
// enquiry_type=app-interest. The consent basis is recorded with the lead
// (S077 fields): ticking the box is express consent to launch emails, and
// the exact wording shown is sent with it.
export const CONSENT_WORDING = "Email me about the SiteGuard App and SiteGuard Audit: when founding places and the app open, and the founding offer. I can unsubscribe at any time.";

function interestForm(app) {
  const trades = [...(app?.trades ?? []).map((t) => t.name), "Builder", "HSEQ consultant", "Other business"];
  return `<form class="form" data-lead-form data-source="systems" data-endpoint="${esc(LEAD_ENDPOINT)}" method="post" action="${esc(LEAD_ENDPOINT)}" novalidate>
  <input type="hidden" name="source" value="systems">
  <input type="hidden" name="enquiry_type" value="app-interest">
  <input type="hidden" name="consent_wording" value="${esc(CONSENT_WORDING)}">
  <input type="hidden" name="consent_source" value="${ORIGIN}/register-interest/">
  <input type="hidden" name="ref" value="" data-ref-field>
  <fieldset class="choice"><legend>I'm interested in</legend>
    <label class="check"><input type="radio" name="interest" value="app">The SiteGuard App</label>
    <label class="check"><input type="radio" name="interest" value="audit">SiteGuard Audit</label>
    <label class="check"><input type="radio" name="interest" value="both" checked>Both</label>
  </fieldset>
  <label>Your name<input name="name" autocomplete="name" required maxlength="200"></label>
  <label>Email<input type="email" name="email" autocomplete="email" required maxlength="200"></label>
  <label>Company<input name="company" autocomplete="organization" maxlength="200"></label>
  <label>Phone<input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
  <label>Your trade or business<select name="trade"><option value="">Choose one (optional)</option>${trades.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
  <label>Anything we should know? (optional)<textarea name="need" maxlength="2000"></textarea></label>
  <label class="check"><input type="checkbox" name="consent" value="yes">${esc(CONSENT_WORDING)}</label>
  <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="small">We use these details to reply to you and, if you tick the box, to email you about the launch. <a href="/legal/privacy/">Privacy Policy</a>.</p>
  <p class="form-status" data-status aria-live="polite"></p>
  <div><button class="btn btn-hivis" type="submit">Register interest</button></div>
</form>`;
}

function leadForm() {
  return `<form class="form" data-lead-form data-source="systems" data-endpoint="${esc(LEAD_ENDPOINT)}" method="post" action="${esc(LEAD_ENDPOINT)}" novalidate>
  <input type="hidden" name="source" value="systems">
  <label>Your name<input name="name" autocomplete="name" required maxlength="200"></label>
  <label>Email<input type="email" name="email" autocomplete="email" required maxlength="200"></label>
  <label>Company<input name="company" autocomplete="organization" maxlength="200"></label>
  <label>Phone<input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
  <label>What do you need?<textarea name="need" maxlength="2000" required></textarea></label>
  <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="small">We use these details only to reply to you. <a href="/legal/privacy/">Privacy Policy</a>.</p>
  <p class="form-status" data-status aria-live="polite"></p>
  <div><button class="btn btn-hivis" type="submit">Send enquiry</button></div>
</form>`;
}

// Consulting services: /consulting/<slug>/. "nav" is the footer label.
const SERVICES = {
  subcontractors: {
    nav: "Subcontractors", title: "Subcontractors and small builders", short: "Site documentation and safety support",
    lede: "Practical, well-structured documentation for growing subcontractors and small builders, from a single SWMS to a full trade pack, without a complex engagement.",
    items: ["A single SWMS, scoped to your work, written and controlled", "Trade document packs for every major trade", "Site safety forms and induction records",
      "Safety walks and site inspections", "Toolbox talks and pre-start meeting records", "HSEQ coordination and administration"],
    note: () => `Standard trade packs ${formsWill()} ${formsName()}. For anything else, we can prepare the documents you need. <a href="/contact/">Contact us</a>.`,
  },
  builders: {
    nav: "Builders", title: "Builders and growing businesses", short: "Safety systems, audit support and incident investigation",
    lede: "For builders and contractors scaling up: documented safety systems, audit readiness and structured HSEQ guidance that supports prequalification and principal contractor requirements.",
    items: ["Safety management system design and build", "Subcontractor management system", "Internal and external audit preparation",
      "Evidence collation and gap closure", "Non-conformance response and corrective action tracking", "Incident investigation and return to work coordination"],
  },
  "audits-and-inspections": {
    nav: "Audits and inspections", title: "Audits and inspections", short: "Site inspections, internal audits and gap reviews, with a findings register",
    lede: "Independent site inspections, internal management-system audits and pre-audit gap reviews, reported with clear findings and corrective actions your team can close out.",
    items: ["Site safety, quality and environmental inspections", "Internal audits against ISO 45001, ISO 9001 and ISO 14001, or an integrated management system",
      "Pre-audit gap reviews before a client, principal contractor or certification audit", "Subcontractor and supplier audits",
      "Findings and corrective actions in a register, followed through to close-out", "A written report for every audit or inspection"],
    note: () => `Running audits and inspections yourself? See <a href="/audit/">SiteGuard Audit</a>.${MODE.app_status === "live" ? "" : " " + appWhen({ tag: "span", cls: "status-copy", short: true })}`,
  },
  "iso-ims": {
    nav: "ISO and IMS", title: "ISO and integrated management systems", short: "ISO 45001, 9001 and 14001, IMS and ISO 45003",
    lede: "Structured support for organisations working towards ISO, from gap analysis and system design to evidence preparation and audit readiness support. Standalone standards or one integrated framework.",
    items: ["ISO 45001, ISO 9001 and ISO 14001 implementation support", "Integrated management system (IMS) design: one policy structure, one risk register, one internal audit cycle",
      "ISO 45003 psychosocial hazard management frameworks", "Gap analysis and improvement roadmap", "Certification audit readiness support"],
    note: "SiteGuard designs and builds the framework; your organisation implements and maintains it. Certification is granted only by an accredited certification body.",
  },
  "ims-tier-1-uplift": {
    nav: "IMS and Tier 1 uplift", title: "IMS and Tier 1 uplift", short: "Lift your system to what Tier 1 builders ask of their contractors",
    lede: "For subcontractors and builders moving onto Tier 1 and Tier 2 sites: we review your system against what those contractors ask for at prequalification, close the gaps and bring it together as one integrated management system.",
    items: ["Gap review against Tier 1 contractor prequalification and site requirements", "Integrated management system: one policy set, one risk register, one internal audit cycle",
      "Tier 1 safety documents: permits, emergency and health programs, contractor assurance", "Quality and environmental documents to match: ITPs, NCRs, environmental controls",
      "Prequalification submission support", "An internal audit before your first Tier 1 audit"],
    note: "Scoped and quoted after a first gap review. SiteGuard builds and uplifts the system; your business runs it and stays responsible for its duties on site.",
  },
  retainers: {
    nav: "Monthly retainers", title: "Monthly HSEQ retainers", short: "Ongoing HSEQ support for A$1,200 a month +GST",
    lede: "Ongoing HSEQ support from a senior practitioner for A$1,200 a month +GST: a set amount of help every month, without scoping and quoting each job.",
    items: ["A$1,200 a month +GST", "What each month covers is agreed with you up front", "Document updates, reviews and questions as they come up",
      "Site inspections and internal audits as part of the month's work", "Help with client, principal contractor and prequalification requests", "Work outside the agreed scope is quoted before it starts"],
    note: "Ask us what a month would cover for your business.",
  },
  "leadership-advisory": {
    nav: "Leadership and risk advisory", title: "Leadership and risk advisory", short: "Leadership Under Pressure and risk advisory",
    lede: "For leaders carrying real operational risk: mentoring and structured advisory on decision quality, communication discipline, psychosocial duty and the practical demands of leading high-stakes work.",
    items: ["1:1 mentoring: Leadership Under Pressure", "Leadership maturity workshops (half or full day)", "Psychosocial systems and consultation review",
      "Executive risk briefings", "Operational governance support"],
    note: "Leadership advisory is mentoring, not clinical assessment, therapy or coaching. Individual psychological assessment is referred to qualified professionals.",
  },
  // Custom content (Dan, Q-ED3, 2 Nov 2026; Competitor Gap Rev03 section 7, E5): listed under
  // Consulting and Education as "on request", enquiry only. No price (Q-ED2: quoted per job for now).
  "custom-content": {
    nav: "Custom content (on request)", title: "Custom content, on request", short: "Site-specific induction videos and custom toolbox talks, on request",
    lede: "Video content made for your business, on request: a full site-specific induction video, custom toolbox talks or a company induction video, kept private to you.",
    items: ["Full site-specific induction videos: your site's layout, rules, emergency points, access and hazards",
      "Custom toolbox talks for your work and your crews", "Company induction videos for your own workers",
      "Private to your business: not published on YouTube or in the public SiteGuard Education library",
      "Filmed only with written consent from everyone on camera and the site owner's permission",
      "Updated when the site layout changes, as staged construction moves access and exits"],
    note: "On request, by enquiry only. Tell us about your site and what you need, and we'll scope it with you. A site-specific induction doesn't replace the General Construction Induction (White Card), and the business running the site stays responsible for its inductions.",
  },
};
const TC = [["/consulting/", "Consulting"]];

async function legal(file, dir = "legal") {
  return frontMatter(await readFile(path.join(ROOT, "content", dir, file), "utf8"));
}

async function build() {
  const override = {};
  if (argValue("app-status") !== undefined) override.app_status = argValue("app-status");
  if (argValue("checkout") !== undefined) override.checkout = { true: true, false: false }[argValue("checkout")] ?? argValue("checkout");
  if (argValue("beta") !== undefined) override.beta = { true: true, false: false }[argValue("beta")] ?? argValue("beta");
  if (PRODUCTION && Object.keys(override).length) problems.push("--app-status, --beta and --checkout are for preview and test builds; a production build reads data/site-mode.json only");
  const sm = await loadSiteMode(ROOT, override);
  MODE = sm.mode;
  for (const p of sm.problems) problems.push(`data: ${p}`);
  // SiteGuard App data first: its launch.opens is the go-live month every status line reads.
  const ap = await loadAppPackages(ROOT);
  for (const p of ap.problems) problems.push(`data: ${p}`);
  LAUNCH = ap.app?.launch ?? {};
  if (MODE.app_status === "presale" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(LAUNCH.opens ?? "")) problems.push("data: app-packages.json launch.opens (YYYY-MM) is needed while app_status is presale");
  TRUST = await loadTrust(ROOT, "systems", { sample: SAMPLE_PARTNERS });
  CHAT = await loadSupportChat(ROOT);
  for (const p of TRUST.problems) problems.push(/open item/.test(p) ? p : `data: ${p}`);
  if (SAMPLE_PARTNERS) problems.push(`data: built with SAMPLE partners and reviews (--sample-partners)${PRODUCTION ? "; a production build can't use sample data" : " (open item: preview only)"}`);
  const vid = await loadVideo(ROOT);
  VIDEO = vid.video;
  for (const p of vid.problems) problems.push(`data: ${p}`);
  PLANNING = await loadPlanning(ROOT);
  const edu = await loadEducation(ROOT);
  EDU = edu.edu;
  for (const p of edu.problems) problems.push(`data: ${p}`);
  for (const p of PLANNING.problems) problems.push(/open item/.test(p) ? p : `data: ${p}`);
  const facts = JSON.parse(await readFile(path.join(ROOT, "data/site-facts.json"), "utf8"));
  const f = facts.facts;
  const fromP = facts.preview ? {} : facts.from_prices; // a preview catalogue never sets public prices
  const cat = JSON.parse(await readFile(CATALOGUE, "utf8"));
  checkDcr(cat);
  const legalCtx = { app_status: MODE.app_status, consultants: cat.packs.some((p) => p.group === "consultants" && p.show && p.prices && p.id !== "consultant:seat") };
  LEGAL_ON = LEGAL_PAGES.filter((l) => !l.when || l.when(legalCtx));
  if (PRODUCTION && cat.preview) problems.push("catalogue.json is a PREVIEW build (generated with --preview); regenerate without it");

  page({
    url: "/", title: "SiteGuard Systems | HSEQ consulting for Australian construction",
    description: "Senior HSEQ consulting, the SiteGuard App and SiteGuard Audit for Australian construction: SWMS, safety systems, audits and inspections and ISO-aligned management systems. Melbourne-based, Australia-wide.",
    jsonld: [{ "@context": "https://schema.org", "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN,
      logo: ORIGIN + "/assets/apple-touch-icon.png", email: EMAIL, areaServed: "AU",
      address: { "@type": "PostalAddress", addressLocality: "Melbourne", addressRegion: "VIC", addressCountry: "AU" },
      founder: { "@type": "Person", name: "Daniel Silver", hasCredential: CREDENTIAL }, sameAs: [LINKEDIN] },
      ...(VIDEO ? [videoJsonLd(VIDEO, ORIGIN)] : [])],
    body: `<section class="hero"><div class="wrap">
  <h1>HSEQ systems that hold up on site.</h1>
  <p class="lede">Senior HSEQ consulting, the SiteGuard App for trades and builders, and SiteGuard Audit for audits and inspections, all built on a library of ${esc(f.documents_rounded)} controlled documents reviewed every 6 months.</p>
  <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Send an enquiry</a>${MODE.app_status === "live" ? `<a class="btn" href="/app/">See the SiteGuard App</a>` : `<a class="btn" href="/register-interest/">Register interest</a>`}</div>
  <dl class="title-block">
    <div><dt>Years in construction</dt><dd>27</dd></div>
    <div><dt>Controlled documents</dt><dd>${esc(f.documents_rounded)}</dd></div>
    <div><dt>SWMS across ${f.trades}+ trade series</dt><dd>${f.swms}</dd></div>
    <div><dt>Legislative review</dt><dd>6-monthly</dd></div>
  </dl>
</div></section>
${introVideo(VIDEO, { heading: "Meet SiteGuard Systems" })}
<section class="band band-grey"><div class="wrap">
  <h2>What SiteGuard does</h2>
  <p class="lede">For subcontractors and trades, builders, head and principal contractors, organisations working towards ISO, and HSEQ consultants.</p>
  <div class="doors doors-5 mod-cards">${HOME_DOORS().map(([h, t, d, st, m]) => `<div class="door"${modAttr(m)}>${m ? moduleLabel(m) : ""}<h3><a href="${h}">${t}</a></h3><p>${d}</p>${st ?? ""}</div>`).join("")}</div>
</div></section>
<section class="band"><div class="wrap cols">
  <div><h2>The library behind the work</h2>
    <p>SiteGuard maintains ${esc(f.documents_rounded)} controlled, version-managed documents: ${f.swms} SWMS, ${f.by_family.ITP ?? 0} inspection and test plans, and the plans, policies, forms and registers of a full management system. Every document is written to Australian WHS laws (the OHS Act 2004 in Victoria) and reviewed against legislative change every 6 months.</p>
    <p><a href="/library/">See the document library</a></p></div>
  <div><h2>Buy documents directly</h2>
    <p>Not every job needs a consulting engagement or an app. Trade packs, builder packs and management-system packs ${formsWill()} ${formsName()}. For anything else, we can prepare the documents you need.</p>
    <p><a class="btn" href="/contact/">Contact us</a></p></div>
</div></section>
<section class="band band-ink"><div class="wrap">
  <h2>Tell us about your project.</h2>
  <p class="lede">We reply within one business day.</p>
  <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Send an enquiry</a><a class="btn btn-inv" href="mailto:${EMAIL}">${EMAIL}</a></div>
</div></section>`,
  });

  if (EDU) {
    const ed = (trail, h1, lede) => head(trail, h1, lede, "education");
    const TE = [["/education/", "SiteGuard Education"]];
    page({
      url: "/education/", title: "SiteGuard Education: construction safety videos", trail: TE, module: "education",
      description: "SiteGuard Education videos for Australian construction: how-tos, toolbox talks and inductions to show your crews, also on YouTube.",
      jsonld: [educationJsonLd(EDU, ORIGIN)].filter(Boolean),
      body: `${ed(TE, "SiteGuard Education", "Practical HSEQ videos for Australian construction, to watch here or show your crews.")}
${educationBody(EDU)}
<section class="band band-grey"><div class="wrap">
  <h2>Custom content, on request</h2>
  <p>The videos here are general and free to use. For content made for your business, such as a full site-specific induction video, custom toolbox talks or a company induction video, ask us. It's on request and enquiry only, scoped with you through SiteGuard Consulting, and kept private to your business.</p>
  <p><a class="btn btn-hivis" href="/consulting/custom-content/">Ask about custom content</a></p>
</div></section>`,
    });
    for (const g of EDU.groups) {
      const tg = [...TE, [seriesPath(g.slug), g.title]];
      page({
        url: seriesPath(g.slug), title: `${g.title}: SiteGuard Education videos`, trail: tg, module: "education",
        description: `${g.title} from SiteGuard Education: ${(g.intro ?? "videos for Australian construction").replace(/\.$/, "")}.`,
        jsonld: [educationJsonLd(EDU, ORIGIN, g.slug)].filter(Boolean),
        body: `${ed(tg, g.title, "")}
${seriesBody(EDU, g.slug)}`,
      });
    }
  }

  {
    const CTA = `<section class="band band-ink"><div class="wrap">
  <h2>Want this built into your system?</h2>
  <p class="lede">We set up inspection registers, schedules and reminders that fit your sites and your plant.</p>
  <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Send an enquiry</a></div>
</div></section>`;
    // Status-aware cross-links: planner -> SiteGuard Audit, state calendars -> SiteGuard App.
    // module: the cross-link is a module card (SiteGuard Audit); the SiteGuard App has no module colour.
    const cross = (href, name, text, module = null) => `<section class="band band-grey plan-cross"><div class="wrap">
  <div class="cols${module ? " mod-card" : ""}"${modAttr(module)}>
  <div>${module ? moduleLabel(module) : ""}<h2><a href="${href}">${name}</a></h2><p>${text}</p>${appWhen({ cls: "status-line" })}</div>
  <div class="btn-row"><a class="btn" href="${href}">See ${name}</a></div></div>
</div></section>`;
    const XAUDIT = cross("/audit/", "SiteGuard Audit", "Run these inspections in SiteGuard Audit: the checklist on site, photos, findings and corrective actions, and schedules and reminders so nothing falls due unseen.", "audit");
    const XAPP = cross("/app/", "SiteGuard App", "Plan your sites in the SiteGuard App: projects, workforce and tickets, inspections and registers in one place, with your documents kept current.");
    const T = [["/planning/", "Planning calendar"]];
    page({
      url: "/planning/", title: "Planning calendar: holidays, RDOs and the safety calendar", trail: T,
      description: "Public holidays and building industry RDOs for every state, national safety initiatives and industry events, and an inspection and testing planner.",
      body: `${head(T, "Planning calendar", "Plan the year around public holidays, building industry RDOs and the safety calendar, and keep inspections and testing on schedule.")}
${planningIndexBody(PLANNING)}
${XAUDIT}${CTA}`,
    });
    for (const st of STATES) {
      const tr = [...T, [statePath(st), STATE_NAMES[st]]];
      page({
        url: statePath(st), title: `${STATE_NAMES[st]} public holidays and building industry RDOs`, trail: tr,
        description: `${STATE_NAMES[st]} public holidays and building and construction industry RDO dates, with national safety initiatives and industry events. Add them to your calendar.`,
        body: `${head(tr, `${STATE_NAMES[st]} planning calendar`, `Public holidays, building industry rostered days off, safety initiatives and industry events for ${STATE_NAMES[st]}.`)}
${planningStateBody(PLANNING, st)}
${XAPP}${CTA}`,
      });
    }
    const ti = [...T, ["/planning/inspections/", "Inspection and testing planner"]];
    page({
      url: "/planning/inspections/", title: "Inspection and testing planner: how often, and on what basis", trail: ti,
      description: "How often workplace equipment and systems are inspected and tested in Australia, with the Act, regulation, standard or code of practice behind each interval.",
      body: `${head(ti, "Inspection and testing planner", "How often common workplace items are inspected or tested, and whether that comes from the law, an Australian Standard, a code of practice or good practice.")}
${inspectionsIndexBody(PLANNING)}
${XAUDIT}${CTA}`,
    });
    for (const g of inspectionGroups(PLANNING.insp)) {
      const tg = [...ti, [groupPath(g.slug), g.title]];
      page({
        url: groupPath(g.slug), title: `${g.title}: inspection and testing intervals`, trail: tg,
        description: `How often ${g.title.toLowerCase()} items are inspected and tested in Australia, with the regulation, standard or code of practice behind each interval and the Victorian differences.`,
        body: `${head(tg, `${g.title}: inspection and testing`, "")}
${inspectionGroupBody(PLANNING, g.slug)}
${XAUDIT}${CTA}`,
      });
    }
  }

  page({
    url: "/consulting/", title: "Consulting", trail: TC, module: "consulting",
    description: "HSEQ consulting for subcontractors, builders, organisations working towards ISO and Tier 1 work: audits and inspections, monthly retainers and leadership advisory.",
    jsonld: Object.entries(SERVICES).map(([slug, s]) => ({ "@context": "https://schema.org", "@type": "Service", name: s.title,
      description: s.lede, provider: { "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN }, areaServed: "AU", url: `${ORIGIN}/consulting/${slug}/` })),
    body: `${head(TC, "Consulting", "One SWMS, a monthly retainer or a full ISO framework. Senior practitioner guidance at every level, scoped and quoted to the work.", "consulting")}
<section class="band"><div class="wrap"><div class="register">${Object.entries(SERVICES).map(([slug, s]) =>
  `<div class="register-row"><div><h3><a href="/consulting/${slug}/">${esc(s.title)}</a></h3><p>${esc(s.lede)}</p></div><span></span><a class="btn btn-small" href="/consulting/${slug}/">More</a></div>`).join("")}</div>
  <h2 class="mt-lg">Also under Consulting</h2>
  <div class="doors"><div class="door"><h3><a href="/about/">About Daniel Silver</a></h3><p>27 years in Australian construction, and the training behind the work.</p></div>
  <div class="door"><h3><a href="/library/">Document library</a></h3><p>The controlled documents behind every engagement, by trade and discipline.</p></div></div></div></section>
<section class="band band-grey"><div class="wrap cols">
  <div><h2>How engagements work</h2><ul>
    <li>Every engagement is scoped and quoted before work starts: fixed scope or hourly, whichever suits the work.</li>
    <li>Remote as standard; on site anywhere in Australia by arrangement.</li>
    <li>Remote work: 2-hour minimum. On site: 4-hour minimum.</li>
    <li>Travel within 20 km is included; beyond that, travel time is billed plus 88 cents per kilometre.</li>
    <li>Payment within 7 days of invoice. Out-of-hours and urgent mobilisation rates apply.</li></ul></div>
  <div><h2>What to expect</h2><ul>
    <li>Daniel personally leads and reviews every engagement, drawing in specialist support where the scope needs it.</li>
    <li>Documents built for your actual site and scope, not a stock template with your logo on it.</li>
    <li>Plain English that the worker, the supervisor and the auditor can all follow.</li></ul>
    ${enquire()}</div>
</div></section>`,
  });

  for (const [slug, s] of Object.entries(SERVICES)) {
    const url = `/consulting/${slug}/`;
    page({
      url, title: s.title, trail: [...TC, [url, s.title]], description: s.lede, module: "consulting",
      jsonld: [{ "@context": "https://schema.org", "@type": "Service", name: s.title, description: s.lede,
        provider: { "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN }, areaServed: "AU" }],
      body: `${head([...TC, [url, s.title]], esc(s.title), esc(s.lede), "consulting")}
<section class="band"><div class="wrap cols">
  <div><h2>What we do</h2><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
  <div>${s.note ? `<div class="note"><p>${typeof s.note === "function" ? s.note() : s.note}</p></div>` : ""}<h2 class="mt">Start with a conversation</h2><p>Tell us about the work and what you need. We reply within one business day with next steps and, where it fits, a scoped quote.</p>${enquire()}</div>
</div></section>`,
    });
  }

  const tc = facts.trade_counts ?? [];
  const fam = f.by_family;
  page({
    url: "/library/", title: "Document library", trail: [...TC, ["/library/", "Document library"]], module: "consulting",
    description: `${f.documents_rounded} controlled HSEQ documents: ${f.swms} SWMS across ${f.trades} trade series, ITPs, plans, policies, forms and registers, reviewed every 6 months.`,
    body: `${head([...TC, ["/library/", "Document library"]], "Document library", `${esc(f.documents_rounded)} controlled, version-managed documents across every major trade and management-system discipline.`, "consulting")}
<section class="band"><div class="wrap">
  <dl class="title-block">${[["SWMS", fam.SWMS], ["Inspection and test plans", fam.ITP], ["Plans", fam.Plan], ["Policies", fam.Policy], ["Forms", fam.Form], ["Registers", fam.Register]]
    .filter(([, n]) => n).slice(0, 4).map(([l, n]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join("")}</dl>
  <div class="cols mt-lg">
    <div><h2>By trade</h2>
      <table class="doc-table"><thead><tr><th scope="col">Trade series</th><th scope="col">SWMS</th><th scope="col">ITPs</th></tr></thead>
      <tbody>${tc.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.swms || "–"}</td><td>${t.itp || "–"}</td></tr>`).join("")}</tbody></table>
      <p class="small mt">Every trade pack also carries the core site SWMS for general construction, and the high risk construction work SWMS cover work in every trade.</p></div>
    <div><h2>How the library is kept</h2>
      <ul><li>Every document carries document control: reference, revision and date on every page.</li>
      <li>Each opens with a "Use of this document" statement that tells the business what to check and adapt.</li>
      <li>Written to Australian WHS laws (the OHS Act 2004 in Victoria) and aligned to ISO 45001, ISO 9001 and ISO 14001.</li>
      <li>The whole library is reviewed against legislative change every 6 months.</li></ul>
      <h2 class="mt-lg">Buy or commission</h2>
      <ul><li><strong>Buy standard documents:</strong> they ${formsWill()} ${formsName()}, bought outright or on subscription.</li>
      <li><strong>Use them in the app:</strong> the documents for your trade or business come with a <a href="/app/">SiteGuard App</a> package, filled in with your details and pushed to you after each 6-monthly review. ${appWhen({ tag: "span" })}</li>
      <li><strong>Commission:</strong> custom SWMS, project-specific plans and management systems are <a href="/consulting/">consulting</a> work.</li></ul>
      <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Commission a document</a></div></div>
  </div>
</div></section>`,
  });

  page({
    url: "/about/", title: "About Daniel Silver", trail: [...TC, ["/about/", "About"]], module: "consulting",
    description: "Daniel Silver: 27 years in Australian construction, from carpenter to senior site manager to HSEQ systems practitioner.",
    jsonld: [{ "@context": "https://schema.org", "@type": "Person", name: "Daniel Silver", jobTitle: "Founder and Principal HSEQ Consultant",
      worksFor: { "@type": "Organization", name: "SiteGuard Systems" }, hasCredential: CREDENTIAL, sameAs: [LINKEDIN] }],
    body: `${head([...TC, ["/about/", "About"]], "Daniel Silver", "Founder and principal HSEQ consultant, SiteGuard Systems.", "consulting")}
<section class="band"><div class="wrap cols">
  <div class="prose">
    <p>Daniel has 27 years in the construction industry: he started as a carpenter, spent more than 16 years in senior site management, and moved into HSEQ systems management. He has worked with tier 1, tier 2 and tier 3 builders, large subcontractors, and civil and commercial projects up to $300 million.</p>
    <p>SiteGuard started from a simple observation: construction companies are often buried in paperwork but short on systems that hold up on site. Every document and service SiteGuard provides is built to solve a real operational problem.</p>
    <h2>Credentials</h2>
    <p><strong>${esc(CREDENTIAL)}</strong></p>
    <p class="small">Personal training certificates. They do not mean SiteGuard's products are approved by any certification or standards body.</p>
  </div>
  <div><h2>How Daniel engages</h2>
    <ul><li>Daniel personally leads and reviews every engagement.</li>
    <li>Documents built for your project, not a stock template.</li>
    <li>Plain English, with technical language only where it is needed.</li>
    <li>Australia-wide: remote as standard, on site by arrangement.</li>
    <li>Hourly or fixed scope, whichever suits the work.</li>
    <li>Systems built to be used in the field.</li></ul>
    ${enquire("Talk to Daniel")}</div>
</div></section>`,
  });

  page({
    url: "/contact/", title: "Contact", trail: [["/contact/", "Contact"]],
    description: "Send an enquiry about SWMS, safety systems, audit support or ISO implementation. We reply within one business day.",
    body: `${head([["/contact/", "Contact"]], "Contact", "Whether you need one SWMS reviewed or a full management system built, tell us about it. We reply within one business day.")}
<section class="band"><div class="wrap cols">
  <div>${leadForm()}</div>
  <div><h2>Other ways to reach us</h2>
    <p><strong>Email</strong><br><a href="mailto:${EMAIL}">${EMAIL}</a></p>
    <p><strong>LinkedIn</strong><br><a href="${LINKEDIN}">linkedin.com/in/silverdaniel</a></p>
    <p><strong>Location</strong><br>Melbourne, Victoria. Working Australia-wide.</p>
    <p><strong>Response time</strong><br>Within one business day.</p>${reviewBadge(TRUST)}</div>
</div></section>`,
  });

  page({
    url: "/partners/", title: "Partners and referrals", trail: [["/partners/", "Partners"]], strip: false,
    description: "SiteGuard Systems partners and affiliates, how referrals and referral fees work, and how to become a partner.",
    body: `${head([["/partners/", "Partners"]], "Partners and referrals", "The businesses we work alongside, how referrals work, and how to become a partner.")}
${partnersBody(TRUST, { source: "systems", endpoint: LEAD_ENDPOINT, brand: "SiteGuard" })}`,
  });

  // SiteGuard App (scripts/lib/app-pages.mjs, data/app-packages.json; loaded above for LAUNCH).
  for (const p of appPriceDrift(ap.app, cat)) problems.push(`data: ${p}`);
  if (ap.app) {
    for (const spec of appPages(ap.app, { mode: MODE, head, buy: buyButton, when: appWhen, formsName, related: relatedVideos, foundingTerms: "/legal/founding-offer-terms/", appRow: (id) => cat.packs.find((p) => p.group === "app" && p.id === id) })) {
      // WP-S10: the founding checkout (presale) and the subscription checkout (live).
      if (appCheckoutOn(MODE) && MODE.app_status === "presale" && spec.url === "/app/founding-offer/") {
        spec.body += `<section class="band band-grey" aria-labelledby="founding-buy-h"><div class="wrap cols"><div><h2 id="founding-buy-h">Buy a founding place</h2>${appCheckoutForm("founding", cat)}</div>
<div><h2>What happens next</h2><ul><li>Stripe takes the payment for 12 months, less 15%.</li><li>Your matching SiteGuard FORMS pack follows by email.</li><li>Your 12 months start when the app opens.</li></ul></div></div></section>`;
      }
      if (appCheckoutOn(MODE) && MODE.app_status === "live" && spec.url === "/app/pricing/") {
        spec.body += `<section class="band band-grey" aria-labelledby="subscribe-h"><div class="wrap"><h2 id="subscribe-h">Subscribe</h2>${appCheckoutForm("subscribe", cat)}</div></section>`;
      }
      page(spec);
    }
    if (appCheckoutOn(MODE)) {
      const done = (url, title, h1, lede, extra = "") => page({ url, title, trail: [[url, title]], description: lede, noindex: true,
        body: `<section class="page-head"><div class="wrap"${extra}><h1>${h1}</h1><p class="lede">${lede}</p><p><a class="btn" href="/app/">Back to the SiteGuard App</a></p></div></section>` });
      if (MODE.app_status === "presale") {
        done("/founding/success/", "Founding place confirmed", "Thank you. Your founding place is confirmed.", "We've emailed your Stripe receipt. Your matching SiteGuard FORMS pack follows, and your 12 months start when the app opens.");
        done("/founding/cancelled/", "Founding checkout cancelled", "Checkout cancelled", "Nothing was charged, and the place has gone back on sale.", ` data-founding-cancel data-engine="${esc(new URL(CHECKOUT_ENGINE).origin)}"`);
      }
      if (MODE.app_status === "live") {
        done("/app/success/", "Subscription started", "Thank you. Your subscription has started.", "We've emailed your Stripe receipt. We'll be in touch to set up your account.");
        done("/app/cancelled/", "Subscription checkout cancelled", "Checkout cancelled", "Nothing was charged.");
      }
    }
  }

  // SiteGuard Audit (scripts/lib/audit-pages.mjs, data/audit-checklists.json).
  const ac = await loadAuditChecklists(ROOT);
  for (const p of ac.problems) problems.push(`data: ${p}`);
  if (ac.checklists) for (const spec of auditPages(ac.checklists, { mode: MODE, head, buy: buyButton, when: appWhen, app: ap.app, related: relatedVideos })) page(spec);

  if (MODE.app_status !== "live") {
    page({
      url: "/register-interest/", title: "Register interest: SiteGuard App and SiteGuard Audit", trail: [["/register-interest/", "Register interest"]],
      description: "Register your interest in the SiteGuard App and SiteGuard Audit, and we'll tell you when founding places and the app open.",
      body: `${head([["/register-interest/", "Register interest"]], "Register interest", "Tell us whether you're interested in the SiteGuard App, SiteGuard Audit or both, and we'll keep you posted.")}
<section class="band"><div class="wrap cols">
  <div>${interestForm(ap.app)}</div>
  <div>${appWhen({ cls: "note status-line" })}<h2>What happens next</h2><ul>
    <li>We'll tell you when founding places open and when the app opens.</li>
${MODE.app_status === "presale" ? `    <li><a href="/app/founding-offer/">Founding places</a> are on sale now.</li>
` : ""}    <li>Questions now? <a href="/contact/">Send an enquiry</a>.</li></ul></div>
</div></section>`,
    });
  }

  // The FORMS shop and the cart (WP-S8): the storefront's own page builders
  // (scripts/lib/shop.mjs, cart.mjs) from the same catalogue, under /forms/.
  // Every shop page is canonical on siteguardforms.com.au and left out of this
  // sitemap. The cart is FORMS documents and packs only (Q1 narrowed by Dan
  // 1 Nov: App "Subscribe" and founding places have their own checkouts);
  // checkout goes to the storefront's engine. While FORMS is in beta the shop
  // shows to browse only (browseBody), with no cart pages.
  if (shopShown(MODE)) {
    const shopBody = (b) => (browseOnly() ? browseBody(b) : b);
    const model = shopModel(cat);
    const T = [["/forms/", "SiteGuard FORMS"]];
    const shopCrumbs = (trail) => crumbs([...T, ...trail]);
    page({
      url: "/forms/", title: "SiteGuard FORMS: HSEQ documents to buy", trail: T, canonical: `${FORMS}/`, preview: cat.preview,
      description: "SiteGuard FORMS packs and single documents for Australian construction: SWMS, ITPs, plans, forms and registers, filled with your details and emailed as PDFs.",
      body: `${head(T, "SiteGuard FORMS", "Site-ready HSEQ documents with your name on them: SWMS, inspection and test plans, management plans, forms and registers, filled with your business and project details and emailed as PDFs.")}
${browseOnly() ? BETA_NOTICE : ""}<section class="band band-grey"><div class="wrap">
  <h2>Choose a range</h2>
  <div class="register">${rangesHtml(model, SHOP_BASE)}</div>
  <p class="mt"><a href="/forms/documents/">Single documents</a> · <a href="/forms/subscriptions/">Subscriptions</a> · <a href="/forms/how-ordering-works/">How ordering works</a> · <a href="/forms/faq/">Questions</a></p>
</div></section>`,
    });
    const out = shopPages({ cat, model, base: SHOP_BASE, origin: FORMS, appUrl: FORMS_APP, isoUrl: "/consulting/iso-ims/", beta: MODE.beta, crumbs: (trail) => shopCrumbs(trail) });
    for (const spec of out.pages) page({ ...spec, body: shopBody(spec.body), trail: [...T, ...spec.trail], canonical: FORMS + spec.url.slice(SHOP_BASE.length) });
    shopFiles.push(...out.files);
  }
  if (shopOn(MODE)) {
    const notice = await legal("checkout-notice.md");
    const noticeBody = notice.body.split("\n").filter((l) => !/☐/.test(l)).join("\n").replace(/^>\s?$/gm, "");
    for (const spec of cartPages({ crumbs, preview: cat.preview, noticeHtml: render(noticeBody, { linkMap: {} }),
      termsVersion: termsVersion(await legal("terms-of-sale.md"), await legal("disclaimer.md")),
      shopHome: "/forms/", browse: "/forms/trade-packs/", engine: CHECKOUT_ENGINE })) page({ ...spec, noindex: true });
  }

  // Support and account deletion (linked from the app store listings). Plain
  // words; no promise beyond replying. The address is SUPPORT_EMAIL.
  {
    const TS = [["/support/", "Support"]];
    const mail = `<a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>`;
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(SUPPORT_EMAIL)) problems.push(`SUPPORT_EMAIL "${SUPPORT_EMAIL}" isn't an email address`);
    page({
      url: "/support/", title: "Support", trail: TS,
      description: "How to get help from SiteGuard: the support email, what to send us, and how to ask for your account to be deleted.",
      body: `${head(TS, "Support", "How to get help with a SiteGuard account, an order or a document.")}
<section class="band"><div class="wrap cols">
  <div><h2>Email us</h2>
    <p><strong>${mail}</strong></p>
    <p>We reply within one business day.</p>
    <h2 class="mt">What to send us</h2><ul>
    <li>Your name and the email address on your account or order.</li>
    <li>Your order number, if it's about an order.</li>
    <li>What you were trying to do and what went wrong. A screenshot helps.</li>
    <li>For a document: its reference and revision (on every page), and what needs fixing.</li></ul></div>
  <div><h2>Your account</h2>
    <p>You can ask us to delete your account and your personal information at any time, without the app. <a href="/support/delete-account/">How to delete your account</a>.</p>
    <p>To see or correct the personal information we hold about you, email us. Our <a href="/legal/privacy/">Privacy Policy</a> explains how we handle it.</p>
    <div class="note"><p><strong>Not for emergencies.</strong> If someone is hurt or in danger, call 000.</p></div></div>
</div></section>`,
    });
    page({
      url: "/support/delete-account/", title: "Delete your account", trail: [...TS, ["/support/delete-account/", "Delete your account"]],
      description: "How to ask SiteGuard to delete your account and personal information, by email, without using the app.",
      body: `${head([...TS, ["/support/delete-account/", "Delete your account"]], "Delete your account", "You can ask us to delete your SiteGuard account and the personal information linked to it. You don't need the app to do this.")}
<section class="band"><div class="wrap cols">
  <div><h2>How to ask</h2><ol class="steps">
    <li><h3>Email us</h3><p>Send an email to ${mail} from the email address on your account, with the subject "Delete my account".</p></li>
    <li><h3>Tell us who you are</h3><p>Include your name and your business name, so we can find the right account.</p></li>
    <li><h3>We check it's you</h3><p>We reply within one business day. Before we delete anything, we confirm the request came from you.</p></li>
    <li><h3>We delete it</h3><p>We delete your account and tell you by email when it's done.</p></li></ol></div>
  <div><h2>What we delete</h2><ul>
    <li>Your account and your sign-in details.</li>
    <li>Your profile and the personal information linked to your account.</li></ul>
    <h2 class="mt">What we may have to keep</h2>
    <p>Some records must be kept by law for a set time, such as tax invoices and payment records (for example, tax records for 5 years). We keep those only for as long as the law requires, and then delete them. See our <a href="/legal/privacy/">Privacy Policy</a>.</p>
    <p class="small">Questions about this? Email ${mail}.</p></div>
</div></section>`,
    });
  }

  page({
    url: "/contact/sent/", title: "Enquiry sent", trail: [["/contact/", "Contact"], ["/contact/sent/", "Sent"]],
    description: "Your enquiry has been sent. We reply within one business day.",
    body: `<section class="page-head"><div class="wrap"><h1>Thanks. Your enquiry has been sent.</h1><p class="lede">We reply within one business day.</p><p><a class="btn" href="/">Back to the home page</a></p></div></section>`,
  });

  for (const { file, dir, slug, nav } of LEGAL_ON) {
    const doc = await legal(file, dir);
    const url = `/legal/${slug}/`;
    const left = doc.body.match(PLACEHOLDER_RE) ?? [];
    if (left.length) problems.push(`${file}: ${left.length} open item(s) to fill in: ${[...new Set(left)].join(", ")}`);
    const pending = String(doc.meta.status ?? "").toUpperCase().startsWith(PENDING);
    if (pending) problems.push(`${url}: ${doc.meta.reference} ${doc.meta.title} is ${PENDING}: swap in the approved wording before it goes live (open item)`);
    page({
      url, title: doc.meta.title, trail: [[url, nav]], description: plain(doc.body), noindex: pending,
      body: `${head([[url, nav]], esc(doc.meta.title), "")}
<section class="band"><div class="wrap prose" data-legal${pending ? " data-pending-solicitor" : ""}><p class="small">${esc(doc.meta.reference)}, version ${esc(doc.meta.version)}, ${esc(doc.meta.date)}${pending ? ` · <strong>${PENDING}</strong>` : ""}</p>${render(doc.body)}</div></section>`,
    });
  }

  for (const [code, msg] of [["404", "That page doesn't exist."], ["500", "Something went wrong on our side."]]) {
    page({ url: `/${code}.html`, title: code === "404" ? "Page not found" : "Server error", description: msg,
      body: `<section class="page-head"><div class="wrap"><h1>${msg}</h1><div class="btn-row"><a class="btn btn-hivis" href="/">Go to the home page</a><a class="btn" href="/contact/">Contact us</a></div></div></section>` });
  }
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(path.join(ROOT, "assets"), path.join(DIST, "assets"), { recursive: true });
  await build();
  const urls = new Set(pages.map((p) => p.url));
  const titles = new Set();
  for (const p of pages) {
    const out = p.url.endsWith(".html") ? path.join(DIST, p.url) : path.join(DIST, p.url, "index.html");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, p.html);
    if (!p.url.startsWith("/legal/")) {
      const hits = wordingHits(p.html, MODE);
      if (hits.length) problems.push(`${p.url}: banned wording: ${hits.join(", ")}`);
    }
    for (const m of checkStatusCopy(p.html, MODE)) problems.push(`${p.url}: ${m}`);
    // #96 (Q1 narrowed by Dan 1 Nov): an App plan or a founding place never goes in the cart.
    for (const [, id] of p.html.matchAll(/data-add-(?:pack|doc)="((?:app|founding)[:_-][^"]*)"/gi)) problems.push(`${p.url}: ${id} has an Add to cart button; App plans and founding places have their own checkout`);
    if (browseOnly() && /data-add-(?:pack|doc)=|data-checkout\b|href="\/cart\/"/.test(p.html)) problems.push(`${p.url}: a buy button, cart or checkout while FORMS is in beta`);
    if (titles.has(p.title)) problems.push(`${p.url}: duplicate title`);
    titles.add(p.title);
    for (const [, href] of p.html.matchAll(/href="(\/[^"#?]*)/g)) {
      if (!href.startsWith("/assets/") && !href.endsWith(".ics") && !urls.has(href)) problems.push(`${p.url}: broken link ${href}`);
    }
    if (Buffer.byteLength(p.html) > 100_000) problems.push(`${p.url}: over 100 KB`);
  }
  for (const st of STATES) await writeFile(path.join(DIST, "planning", `siteguard-planning-${st.toLowerCase()}.ics`), icsFor(PLANNING, st, { origin: ORIGIN, brand: "SiteGuard Systems" }));
  const listed = pages.filter((p) => !p.url.endsWith(".html") && !p.noindex && !p.elsewhere);
  for (const [rel, content] of shopFiles) {
    await mkdir(path.dirname(path.join(DIST, rel)), { recursive: true });
    await writeFile(path.join(DIST, rel), content);
  }
  if (shopShown(MODE)) await writeFile(path.join(DIST, "assets/cart.js"), systemsCartScript(await cartBrowserParts(), { engine: CHECKOUT_ENGINE, root: `${SHOP_BASE}/` }));
  await writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${ORIGIN}${p.url}</loc></url>`).join("\n")}\n</urlset>\n`);
  await writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n${shopOn(MODE) ? "Disallow: /cart/\nDisallow: /order/\n" : ""}Sitemap: ${ORIGIN}/sitemap.xml\n`);
  // Cloudflare Pages headers and redirects.
  // The lead form's origin, plus the help chat's API origin once it is set (P11).
  const connect = new URL(LEAD_ENDPOINT).origin;
  // WP-S12: while the shop is on, the cart may call the checkout engine
  // (connect-src) and the checkout hands over to Stripe Checkout (form-action).
  const engine = shopOn(MODE) || appCheckoutOn(MODE) ? new URL(CHECKOUT_ENGINE).origin : null;
  const connectSrc = [...new Set(["'self'", connect, ...supportChatConnect(CHAT), ...(engine ? [engine] : [])])].join(" ");
  const formAction = [...new Set(["'self'", connect, ...(engine ? [engine, STRIPE_CHECKOUT] : [])])].join(" ");
  await writeFile(path.join(DIST, "_headers"), `/*
  Content-Security-Policy: ${withCspSources(withVideoCsp(`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ${connectSrc}; form-action ${formAction}; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, VIDEO), educationCsp(EDU))}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
/assets/*
  Cache-Control: public, max-age=86400
/planning/*.ics
  Content-Type: text/calendar; charset=utf-8
  Cache-Control: public, max-age=3600
`);
  for (const [from, to] of REDIRECTS) if (!urls.has(to.replace(/:splat$/, ""))) problems.push(`_redirects: ${from} goes to ${to}, which isn't a page`);
  await writeFile(path.join(DIST, "_redirects"), REDIRECTS.map(([from, to]) => `${from} ${to} 301`).join("\n") + "\n");
  console.log(`Built ${pages.length} pages into dist/`);
  const blocking = problems.filter((p) => PRODUCTION || !/open item/.test(p));
  for (const p of problems) console.log(`  ${blocking.includes(p) ? "ERROR" : "note "}: ${p}`);
  if (DCR_PIN) console.log(`  DCR Rev${rev2(DCR_PIN.revision)} public extract verified (sha256 ${DCR_PIN.public_sha256}; from dcr.json ${DCR_PIN.sha256})`);
  for (const f of dcrWarnings.slice(0, 3)) console.log(`  warn : DCR [${f.kind}] ${f.message}`);
  if (dcrWarnings.length > 3) console.log(`  warn : DCR ${dcrWarnings.length} warnings in all (npm run dcr-check lists them)`);
  if (blocking.length) { console.error(`${blocking.length} problem(s) must be fixed.`); process.exit(1); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
