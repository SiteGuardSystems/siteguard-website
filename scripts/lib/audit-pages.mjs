// SiteGuard Audit pages (WP-S5).
//
//   /audit/             what SiteGuard Audit does, who it is for, the seat
//   /audit/checklists/  the checklist library, by type and area
//
// Checklist counts come from data/audit-checklists.json (generated from
// SG_AUDIT_CHECKLIST_BUILD_LIST_Rev02 by scripts/gen-audit-checklists.py);
// the seat price and AI photo-check allowance from data/app-packages.json.
// Prices only when showAppPrices(mode).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { esc } from "./md.mjs";
import { showAppPrices } from "./site-mode.mjs";

export async function loadAuditChecklists(root) {
  try {
    const d = JSON.parse(await readFile(path.join(root, "data", "audit-checklists.json"), "utf8"));
    const sum = Object.values(d.by_type ?? {}).reduce((a, b) => a + b, 0);
    return { checklists: d, problems: sum === d.checklists ? [] : [`audit-checklists.json: by_type adds to ${sum}, not ${d.checklists}`] };
  } catch (e) {
    return { checklists: null, problems: [`audit-checklists.json: ${e.code === "ENOENT" ? "missing" : e.message}`] };
  }
}

const n = (x) => Number(x).toLocaleString("en-AU");

/** Page specs for /audit/ and /audit/checklists/. ctx as appPages, plus app (data/app-packages.json). */
export function auditPages(cl, ctx) {
  const { mode, head, buy, when, app, related = () => "" } = ctx;
  const T = [["/audit/", "SiteGuard Audit"]];
  const seat = app?.audit ?? {};
  const prices = showAppPrices(mode) && seat.seat_month;
  const out = [];
  // Only the launch-ready count is ever shown (launch_ready in
  // data/audit-checklists.json, once the build list marks checklists ready),
  // never the size of the build list. Until then: no count and no breakdown.
  const ready = Number.isInteger(cl.launch_ready) && cl.launch_ready > 0 ? cl.launch_ready : null;
  out.push({
    url: "/audit/", title: "SiteGuard Audit: audits and inspections for consultants and businesses", trail: T, module: "audit",
    description: "SiteGuard Audit: run audits and inspections on site, with photos, findings, corrective actions and the report. Unlimited clients and audits for each auditor.",
    body: `${head(T, "SiteGuard Audit", "Audits and inspections for consultants and businesses: run the checklist on site, take photos, record findings and corrective actions, and issue the report.", "audit")}
<section class="band"><div class="wrap cols">
  <div><h2>What it does</h2><ul>
    <li>Run the checklist on a phone or tablet, on site, with or without a signal</li>
    <li>Photos on every item; AI photo checks suggest hazards, and the auditor decides</li>
    <li>Findings and corrective actions go into a register for each client and project, and are followed through to close-out</li>
    <li>A branded PDF report: your logo on the report, ready to send</li>
    <li>Schedules and reminders for recurring inspections</li></ul></div>
  <div>${when({ cls: "note status-line" })}<h2>For consultants and businesses</h2><ul>
    <li><strong>Unlimited clients and audits</strong> for each auditor seat</li>
    <li>${n(seat.ai_photo_checks_per_seat_month ?? 1000)} AI photo checks a seat each month included (fair use), with top-ups for heavy use</li>
    <li>A free ${seat.trial_days ?? 14}-day trial when it opens</li>
    <li>Included in the <a href="/app/builder-bundles/">Heavy Commercial builder bundle</a></li></ul>
    ${prices ? `<p class="price-line"><span class="label">Per auditor seat</span><span class="amount">A$${seat.seat_month} a month <small>+GST</small></span></p><p class="gst">Billed annually.</p>` : ""}
    <div class="btn-row">${buy("audit")}</div></div>
</div></section>
<section class="band band-grey"><div class="wrap">
  <h2><a href="/audit/checklists/">The checklist library</a></h2>
  <p class="lede">${ready ? `${n(ready)} checklists ready, ` : "Checklists "}built from SiteGuard's controlled forms and kept in step with them: checks for SWMS and ITPs, and inspections, verifications, assessments and audits across safety, quality, environment and management systems.</p>
  <p><a class="btn" href="/audit/checklists/">See the checklist library</a></p>
</div></section>
${related("audit")}
<section class="band band-ink"><div class="wrap">
  <h2>${mode.app_status === "live" ? "Start auditing with SiteGuard Audit" : "Be first on SiteGuard Audit"}</h2>
  ${when({ cls: "lede status-line" })}
  <div class="btn-row">${buy("audit")}<a class="btn btn-inv" href="/consulting/audits-and-inspections/">Have us do the audit</a></div>
</div></section>`,
  });

  const TCk = [...T, ["/audit/checklists/", "Checklist library"]];
  const table = (title, obj, col) => `<div><h2>${title}</h2><table class="doc-table"><thead><tr><th scope="col">${col}</th><th scope="col">Checklists</th></tr></thead><tbody>${Object.entries(obj).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n(v)}</td></tr>`).join("")}</tbody></table></div>`;
  out.push({
    url: "/audit/checklists/", title: "SiteGuard Audit checklist library", trail: TCk, module: "audit",
    description: "The SiteGuard Audit checklist library: checklists built from SiteGuard's controlled forms, SWMS and ITPs.",
    body: `${head(TCk, "Checklist library", `${ready ? `${n(ready)} checklists ready, built` : "Checklists built"} from SiteGuard's controlled forms.`, "audit")}
<section class="band"><div class="wrap">
  ${when({ cls: "note status-line" })}
  ${ready && cl.ready_by_type ? `<div class="cols">${table("By type", cl.ready_by_type, "Type")}${cl.ready_by_area ? table("By area", cl.ready_by_area, "Area") : ""}</div>` : ""}
  <h2 class="mt-lg">How checklists are made and kept</h2>
  <ul><li>Each checklist is drawn from a controlled SiteGuard form, SWMS or ITP, and is reviewed before it is offered to subscribers.</li>
  <li>When a form is revised at the 6-monthly review, its checklist gets a new version; inspections already started keep theirs.</li>
  <li>Checklists are added in stages, starting with site safety, quality and environmental inspections.</li>
  <li>Checklists for work that must be done by a registered or licensed practitioner say so on the report. They are a recording tool and don't replace the practitioner.</li></ul>
  <div class="btn-row">${buy("audit")}</div>
</div></section>`,
  });
  return out;
}
