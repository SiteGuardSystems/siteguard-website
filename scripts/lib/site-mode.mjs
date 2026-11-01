// Site status switch (data/site-mode.json), read by build.mjs.
//
//   beta        SiteGuard FORMS ordering. NOT set in this repo's file: it is
//               the storefront's data/site-mode.json beta, vendored at
//               vendor/siteguard-forms-storefront/data/site-mode.json and pinned
//               by site-mode.lock (Dan, 1 Nov 2026, #94: one beta switch for
//               both sites; the engine refuses every FORMS order while it is
//               true, and this site mirrors it). true: the FORMS shop shows
//               under /forms/ to browse, with no buy buttons, cart or checkout.
//               false: the shop and cart open (with checkout on), or a link to
//               the FORMS site.
//   app_status  The SiteGuard App and SiteGuard Audit:
//                 coming_soon  no app or audit prices anywhere; every buy
//                              button is "Register interest"
//                 presale      founding places on sale; prices, the pricing
//                              page and the founding offer page show
//                 live         the app modules are open; no pre-launch copy
//   checkout    Buying on this site (WP-S8): the FORMS cart in the header and
//               the App checkouts, through the storefront's engine. The cart
//               shows only when checkout is true AND beta is false.
//
// Pre-launch wording ("Coming soon", "Launching <month year>") lives only
// inside elements marked data-status-copy, so it can be found and must be gone
// once app_status is "live" (checkStatusCopy).
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const APP_STATUSES = ["coming_soon", "presale", "live"];

export const FORMS_MODE_LOCK = "site-mode.lock";

/**
 * The one FORMS beta switch (#94): the storefront's site-mode.json as vendored
 * here, checked against site-mode.lock. Returns { beta, lock, problems }; beta
 * is true (the safe side) whenever anything doesn't check out.
 */
export async function loadFormsBeta(root) {
  const problems = [];
  let lock = null;
  try { lock = JSON.parse(await readFile(path.join(root, FORMS_MODE_LOCK), "utf8")); } catch (e) {
    problems.push(`${FORMS_MODE_LOCK}: ${e.code === "ENOENT" ? "missing" : e.message}`);
    return { beta: true, lock, problems };
  }
  let buf;
  try { buf = await readFile(path.join(root, lock.vendored_at)); } catch (e) {
    problems.push(`${lock.vendored_at}: ${e.code === "ENOENT" ? "missing" : e.message}`);
    return { beta: true, lock, problems };
  }
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== lock.sha256) problems.push(`${lock.vendored_at}: sha256 ${sha} differs from ${FORMS_MODE_LOCK} (${lock.sha256}); run npm run sync-site-mode, don't edit it by hand`);
  let beta;
  try { beta = JSON.parse(buf.toString("utf8")).beta; } catch (e) { problems.push(`${lock.vendored_at}: ${e.message}`); }
  if (typeof beta !== "boolean") { problems.push(`${lock.vendored_at}: beta must be true or false`); beta = true; }
  if (lock.beta !== beta) problems.push(`${FORMS_MODE_LOCK}: beta ${lock.beta} differs from the vendored file (${beta})`);
  return { beta, lock, problems };
}

/** Read data/site-mode.json (and the FORMS beta switch). `override` ({ beta, app_status, checkout }) is for test and preview builds. */
export async function loadSiteMode(root, override = {}) {
  const problems = [];
  let d = {};
  try { d = JSON.parse(await readFile(path.join(root, "data", "site-mode.json"), "utf8")); } catch (e) {
    problems.push(`site-mode.json: ${e.code === "ENOENT" ? "missing" : e.message}`);
  }
  if ("beta" in d) problems.push(`site-mode.json: beta isn't set here; it is the storefront's switch (${FORMS_MODE_LOCK}, npm run sync-site-mode)`);
  const forms = await loadFormsBeta(root);
  problems.push(...forms.problems);
  const mode = { beta: forms.beta, app_status: d.app_status, checkout: d.checkout ?? false };
  if (override.beta !== undefined) mode.beta = override.beta;
  if (override.checkout !== undefined) mode.checkout = override.checkout;
  if (typeof mode.checkout !== "boolean") { problems.push("site-mode.json: checkout must be true or false"); mode.checkout = false; }
  if (override.app_status !== undefined) mode.app_status = override.app_status;
  if (typeof mode.beta !== "boolean") { problems.push("site-mode.json: beta must be true or false"); mode.beta = true; }
  if (!APP_STATUSES.includes(mode.app_status)) {
    problems.push(`site-mode.json: app_status must be one of ${APP_STATUSES.join(", ")}`);
    mode.app_status = "coming_soon";
  }
  return { mode, problems };
}

/** The FORMS cart and buy buttons show only when checkout is on and FORMS is out of beta. */
export const shopOn = (mode) => mode.checkout === true && mode.beta === false;

/** The FORMS shop pages show under /forms/: to buy from (shopOn), or to browse
 *  only while FORMS is in beta (Dan, 1 Nov 2026, #94). */
export const shopShown = (mode) => mode.beta === true || shopOn(mode);

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
