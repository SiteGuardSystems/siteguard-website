// Site status switch (data/site-mode.json), read by build.mjs.
//
//   beta        SiteGuard FORMS. true: shown as the unlinked label
//               "SiteGuard FORMS: coming soon". false: a link to the FORMS site.
//   app_status  The SiteGuard App and SiteGuard Audit:
//                 coming_soon  no app or audit prices anywhere; every buy
//                              button is "Register interest"
//                 presale      founding places on sale; prices, the pricing
//                              page and the founding offer page show
//                 live         the app modules are open; no pre-launch copy
//
// Pre-launch wording ("coming soon", "launching", "opens June 2027") lives only
// inside elements marked data-status-copy, so it can be found and must be gone
// once app_status is "live" (checkStatusCopy).
import { readFile } from "node:fs/promises";
import path from "node:path";

export const APP_STATUSES = ["coming_soon", "presale", "live"];

/** Read data/site-mode.json. `override` ({ beta, app_status }) is for test and preview builds. */
export async function loadSiteMode(root, override = {}) {
  const problems = [];
  let d = {};
  try { d = JSON.parse(await readFile(path.join(root, "data", "site-mode.json"), "utf8")); } catch (e) {
    problems.push(`site-mode.json: ${e.code === "ENOENT" ? "missing" : e.message}`);
  }
  const mode = { beta: d.beta, app_status: d.app_status };
  if (override.beta !== undefined) mode.beta = override.beta;
  if (override.app_status !== undefined) mode.app_status = override.app_status;
  if (typeof mode.beta !== "boolean") { problems.push("site-mode.json: beta must be true or false"); mode.beta = true; }
  if (!APP_STATUSES.includes(mode.app_status)) {
    problems.push(`site-mode.json: app_status must be one of ${APP_STATUSES.join(", ")}`);
    mode.app_status = "coming_soon";
  }
  return { mode, problems };
}

/** App and audit prices show only once founding places are on sale. */
export const showAppPrices = (mode) => mode.app_status !== "coming_soon";

/** Wrap pre-launch wording so the build can find it (and refuse it once live). */
export function statusCopy(html, { tag = "span", cls = "status-copy" } = {}) {
  return `<${tag} class="${cls}" data-status-copy>${html}</${tag}>`;
}

const STATUS_EL = /<(\w+)\b[^>]*\bdata-status-copy\b[^>]*>[\s\S]*?<\/\1>/g;

/** The page with every data-status-copy element taken out (for the banned-word check). */
export const withoutStatusCopy = (html) => html.replace(STATUS_EL, " ");

// The one FORMS exception: the exact label, only while FORMS is in beta.
export const FORMS_EXCEPTION = /SiteGuard FORMS(?::| \() ?coming soon\)?/;

/** Problems with the status wording on one built page. */
export function checkStatusCopy(html, mode) {
  const out = [];
  if (mode.app_status === "live" && /\bdata-status-copy\b/.test(html)) out.push("pre-launch wording (data-status-copy) while app_status is live");
  if (!mode.beta && FORMS_EXCEPTION.test(html)) out.push(`"SiteGuard FORMS (coming soon)" while beta is false`);
  return out;
}
