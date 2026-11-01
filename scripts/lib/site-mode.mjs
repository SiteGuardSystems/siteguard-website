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
// Pre-launch wording ("Coming soon", "Launching <month year>") lives only
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2027-06" -> "June 2027" (null when the value isn't a YYYY-MM month). */
export function monthYear(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${m[1]}` : null;
}

/**
 * The one SiteGuard App / SiteGuard Audit status line, so every page reads the
 * same wording. opens is the go-live month, launch.opens in
 * data/app-packages.json ("2027-06"); it is never typed into copy.
 *   coming_soon  "Coming soon. Register your interest now."   (no date)
 *   presale      "Launching June 2027. Founding places are on sale now."
 *   live         "" (no pre-launch wording)
 * short: just "Coming soon." / "Launching June 2027.". Rendered with
 * data-status-copy (statusCopy) so the build can find it.
 */
export function appStatusCopy(mode, opens, { tag = "p", cls = "status-line", short = false } = {}) {
  if (mode.app_status === "live") return "";
  let text;
  if (mode.app_status === "presale") {
    const when = monthYear(opens);
    if (!when) throw new Error(`app status line: launch.opens must be a YYYY-MM month (got ${JSON.stringify(opens)})`);
    text = `Launching ${when}.${short ? "" : " Founding places are on sale now."}`;
  } else {
    text = `Coming soon.${short ? "" : " Register your interest now."}`;
  }
  return statusCopy(text, { tag, cls });
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
