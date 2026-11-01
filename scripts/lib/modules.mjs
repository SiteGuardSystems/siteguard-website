// Module colour identity (Dan, 1 Nov 2026).
//
// Each SiteGuard module has a colour from the Brand Suite Rev06 palette and
// two marks exported unchanged from its Rev06 brand set
// (Hseq-Dev docs/brand/rev06/SiteGuard_<Module>_Brand_Set_Rev06.zip):
//   assets/brand/sg-<module>-label.svg   single-line label (SG_<MODULE>_LABEL.svg)
//   assets/brand/sg-<module>-lockup.svg  full lockup (SG_<MODULE>_LOCKUP.svg)
// The colour tokens (--mod, --mod-tint, --mod-line, --mod-ink, --mod-on) are
// in assets/site.css under [data-module="<slug>"]; a card or a page's <main>
// takes them through its data-module attribute (the CSP forbids inline style).
// No Robotics or Core marks: they are reserved or gated.
import { esc } from "./md.mjs";

// labelWidth: the label SVG's viewBox width (its height is 84). Every lockup is 853 x 308.
export const BRAND_MODULES = {
  safety: { name: "SiteGuard Safety", colour: "#C62828", labelWidth: 455 },
  quality: { name: "SiteGuard Quality", colour: "#1D5C96", labelWidth: 471 },
  environmental: { name: "SiteGuard Environmental", colour: "#2E7D32", labelWidth: 632 },
  management: { name: "SiteGuard Management", colour: "#8A5A00", labelWidth: 601 },
  forms: { name: "SiteGuard Forms", colour: "#F58220", labelWidth: 445 },
  audit: { name: "SiteGuard Audit", colour: "#6A6E77", labelWidth: 428 },
  consulting: { name: "SiteGuard Consulting", colour: "#6A6E77", labelWidth: 547 },
  education: { name: "SiteGuard Education", colour: "#5B3F9E", labelWidth: 532 },
};
export const LOCKUP_SIZE = [853, 308];
const LABEL_H = 28;
const LOCKUP_H = 84;

const known = (m) => {
  if (!BRAND_MODULES[m]) throw new Error(`unknown module "${m}"`);
  return BRAND_MODULES[m];
};

/** The module's single-line label, for the top of a card. The card's heading names it, so alt is empty unless given. */
export function moduleLabel(m, { alt = "" } = {}) {
  const M = known(m);
  return `<p class="mod-label"><img src="/assets/brand/sg-${m}-label.svg" alt="${esc(alt)}" width="${Math.round((M.labelWidth * LABEL_H) / 84)}" height="${LABEL_H}"></p>`;
}

/** The module's full lockup, for a page head. */
export function moduleLockup(m) {
  const M = known(m);
  return `<p class="mod-lockup"><img src="/assets/brand/sg-${m}-lockup.svg" alt="${esc(M.name)}" width="${Math.round((LOCKUP_SIZE[0] * LOCKUP_H) / LOCKUP_SIZE[1])}" height="${LOCKUP_H}"></p>`;
}

/** data-module attribute (with its leading space), or "" for no module. */
export const modAttr = (m) => (m ? ` data-module="${known(m) && m}"` : "");
