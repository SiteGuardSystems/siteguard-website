#!/usr/bin/env node
// Copies the legal sources from SiteGuard-Forms (the one place they are
// written) into content/legal/, so the website pages, the PDFs and the
// disclaimer issued with every delivered set never drift apart.
//
//   node scripts/sync-legal.mjs ../SiteGuard-Forms/app/server/data/legal
import { readdir, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// WP-S11: the FORMS sale terms too, because the Systems site sells FORMS packs
// through the same checkout: Terms of Sale (SG-LEGAL-02), Refunds (SG-LEGAL-03),
// the Checkout Notice (SG-LEGAL-06, shown on the cart page), the FORMS App Terms
// of Use (SG-LEGAL-08), the Document Use Disclaimer (SG-LEGAL-01) and the
// Consultant Licence (SG-LEGAL-07, published only while a consultant plan is on
// sale). App Subscription Terms (SG-LEGAL-12) and Founding Offer Terms
// (SG-LEGAL-13) aren't in SiteGuard-Forms yet: they sit in content/legal-pending/
// marked PENDING SOLICITOR. Once approved, add them to SiteGuard-Forms and here.
const FILES = ["website-disclaimer.md", "privacy.md", "website-terms.md", "terms-of-sale.md", "refunds.md",
  "checkout-notice.md", "terms-of-use.md", "disclaimer.md", "consultant-licence.md"];
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/sync-legal.mjs <path to SiteGuard-Forms/app/server/data/legal>");
  process.exit(2);
}
const have = new Set(await readdir(src));
await mkdir(path.join(ROOT, "content/legal"), { recursive: true });
for (const f of FILES) {
  if (!have.has(f)) { console.error(`missing in source: ${f}`); process.exit(1); }
  await copyFile(path.join(src, f), path.join(ROOT, "content/legal", f));
}
console.log(`copied ${FILES.length} legal files from ${src}`);
