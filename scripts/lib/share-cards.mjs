// Share cards for social (FORMS queue W14, 16 Nov 2026; the storefront's S12 does the same for pack pages).
//
// Consulting and Education pages carry Open Graph and Twitter tags with a 1200x630 card image:
// the module's SiteGuard lockup, the page title and its one-line description. No prices.
// og:url stays equal to the canonical (test/seo.test.js). utm-tagged links for posts are made with
// shareUrl() (module campaign; parked F3 in DAN_DECISIONS_PARKED.md), not put in the page tags.
//
// The PNGs are made by `npm run share-cards` (dev only; Playwright) into assets/share/, with
// assets/share/cards.json recording the text each was drawn from. test/share-cards.test.js fails
// when a page has no card, or its card was drawn from different text (run the script again).
import { esc } from "./md.mjs";

export const SHARE_MODULES = new Set(["consulting", "education"]);
export const CARD_W = 1200;
export const CARD_H = 630;

/** "/consulting/gap-analysis/" -> "consulting-gap-analysis". */
export const shareSlug = (url) => url.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "home";
export const shareImagePath = (url) => `/assets/share/${shareSlug(url)}.png`;

/** The canonical URL with utm tags for a share from this module. */
export function shareUrl(canonical, module) {
  const u = new URL(canonical);
  u.searchParams.set("utm_source", "social");
  u.searchParams.set("utm_medium", "share");
  u.searchParams.set("utm_campaign", module);
  return u.toString();
}

/** The card's text, as the PNG and cards.json record it. */
export const cardText = ({ title, description, module }) => ({ title, description, module });

/** The <meta> lines for a share-card page (replace the generic og:url and og:image). */
export function shareMeta({ url, title, description, canonical, module, origin }) {
  const img = origin + shareImagePath(url);
  return [
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:width" content="${CARD_W}">`,
    `<meta property="og:image:height" content="${CARD_H}">`,
    `<meta property="og:image:alt" content="${esc(`SiteGuard ${module[0].toUpperCase()}${module.slice(1)}: ${title}`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
  ].join("\n");
}

/** The card as a 1200x630 HTML page (for the screenshot script). */
export function shareCardHtml({ title, description, lockupSvg, fontCss }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
*{box-sizing:border-box;margin:0}
html,body{width:${CARD_W}px;height:${CARD_H}px}
body{background:#FFFFFF;color:#2B2A2F;font-family:"Barlow Condensed",Arial,sans-serif;position:relative;overflow:hidden}
.bar{position:absolute;left:0;top:0;bottom:0;width:24px;background:#FB811C}
.lockup{position:absolute;left:80px;top:64px;height:120px}
.lockup svg{height:120px;width:auto}
h1{position:absolute;left:80px;right:80px;top:222px;font-size:68px;line-height:1.1;font-weight:700;padding-bottom:4px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
p{position:absolute;left:80px;right:80px;top:396px;font-family:Arial,sans-serif;font-size:28px;line-height:1.3;color:#6B6971;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.foot{position:absolute;left:80px;bottom:44px;font-family:Arial,sans-serif;font-size:24px;color:#2B2A2F;letter-spacing:.02em}
</style></head><body><div class="bar"></div><div class="lockup">${lockupSvg}</div>
<h1>${esc(title)}</h1><p>${esc(description)}</p><div class="foot">siteguardsystems.com.au</div></body></html>`;
}

/** Width and height of a PNG from its header. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
