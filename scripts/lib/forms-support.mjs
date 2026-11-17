// FORMS support links on /support/ (FORMS queue W13, 16 Nov 2026).
//
// Two storefront pages help FORMS buyers: "Lost your FORMS documents?" (storefront S10, which
// emails a fresh delivery link to the order's own address) and "How FORMS delivery works"
// (storefront S14). Each link is hidden until Dan marks it live in data/forms-support-links.json,
// after the storefront page is deployed, so this site never links to a page that isn't there.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { esc } from "./md.mjs";

const PATH_RE = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/;
export const FORMS_SUPPORT_KEYS = {
  lost_documents: "Lost your FORMS documents?",
  how_delivery_works: "How FORMS delivery works",
};

/** The link config, checked: each key present, live a boolean, path a plain site path. Throws on a bad file. */
export async function loadFormsSupport(root, env = process.env) {
  const file = env.FORMS_SUPPORT_LINKS_PATH ? path.resolve(env.FORMS_SUPPORT_LINKS_PATH) : path.join(root, "data/forms-support-links.json");
  return checkFormsSupport(JSON.parse(await readFile(file, "utf8")));
}

export function checkFormsSupport(cfg) {
  const out = {};
  for (const key of Object.keys(FORMS_SUPPORT_KEYS)) {
    const v = cfg?.[key];
    if (!v || typeof v.live !== "boolean") throw new Error(`forms-support-links: ${key}.live must be true or false`);
    if (typeof v.path !== "string" || !PATH_RE.test(v.path)) throw new Error(`forms-support-links: ${key}.path must be a site path like /lost-documents/, got ${v.path}`);
    out[key] = { live: v.live, path: v.path };
  }
  return out;
}

/** The "FORMS documents" block for /support/: only the live links, or nothing at all. */
export function formsSupportSection(cfg, formsOrigin) {
  const live = Object.entries(FORMS_SUPPORT_KEYS).filter(([k]) => cfg[k]?.live);
  if (!live.length) return "";
  return `<h2 class="mt">SiteGuard FORMS documents</h2><ul data-forms-support>${live
    .map(([k, label]) => `<li><a href="${esc(formsOrigin + cfg[k].path)}">${esc(label)}</a></li>`).join("")}</ul>`;
}
