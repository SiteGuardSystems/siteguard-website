// SiteGuard App pages (WP-S4), built from data/app-packages.json.
//
//   /app/                         the app: modules, trade packages, builder bundles
//   /app/trade-packages/          the three levels and the 25 trades
//   /app/trade-packages/<trade>/  one trade: what each level carries
//   /app/builder-bundles/         the three builder bundles
//   /app/<module>/                safety, quality, environmental, management
//   /app/pricing/                 only once app_status is presale or live
//   /app/founding-offer/          only while app_status is presale
//
// data/app-packages.json is generated from the Packages and Pricing workbook
// by scripts/gen-app-packages.py. It is interim: once the app products are in
// packages.py / catalogue.json as group "app", read them from there instead.
// Prices are shown only when showAppPrices(mode) (never while coming_soon).
// The founding prices are the catalogue's group "app" founding_prepay_cents
// (ctx.appRow(id), from Hseq-Dev's price table, Dan #90): the amount Stripe
// takes, to the cent; nothing here calculates them.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { esc } from "./md.mjs";
import { showAppPrices } from "./site-mode.mjs";

export const MODULES = {
  safety: {
    name: "SiteGuard Safety", lockup: "/assets/brand/sg-safety-lockup.png",
    lede: "SWMS for your trade, site forms, inductions, inspections and incident records, with your workforce and tickets carried into the documents.",
    items: ["SWMS for your trade and the high risk construction work you do, with your business details filled in",
      "Core site forms: inductions, pre-starts, toolbox talks, hazard, incident and first aid records, inspections",
      "Registers for SWMS, training and competency, high risk work licences, plant, test and tag, and chemicals",
      "Tier 1 safety documents at Heavy Commercial: permits, emergency and health programs"],
  },
  quality: {
    name: "SiteGuard Quality", lockup: "/assets/brand/sg-quality-lockup.png",
    lede: "Defects, non-conformances and inspection and test plans, with hold and witness points released on site.",
    items: ["Lodge a defect on site in seconds: location, photos, date and time, and a completion date",
      "Defects not closed by their date become non-conformances, tracked to close-out",
      "Your trade's inspection and test plans, with hold and witness points released by link",
      "Defect, NCR and ITP registers, and the handover record pack"],
  },
  environmental: {
    name: "SiteGuard Environmental", lockup: "/assets/brand/sg-environmental-lockup.png",
    lede: "The environmental basics a site expects of its trades, and full environmental management for builders.",
    items: ["Waste, spill, dust and noise controls and records (Environmental Essentials)",
      "Spill and waste registers that fill from what you record",
      "Full environmental management for builders: plans, inspections and registers"],
  },
  management: {
    name: "SiteGuard Management", lockup: "/assets/brand/sg-management-lockup.png",
    lede: "Your organisation record: policies, workforce, tickets and competency, and the prequalification documents principal contractors ask for.",
    items: ["One organisation record: company details, policies, workforce, licences and tickets",
      "Workforce and tickets carried into your SWMS",
      "Prequalification and contractor information for principal contractors",
      "Governance forms, and full management-system documents for builders"],
  },
};
export const MODULE_SLUGS = Object.keys(MODULES);

export async function loadAppPackages(root) {
  const problems = [];
  let d = null;
  try { d = JSON.parse(await readFile(path.join(root, "data", "app-packages.json"), "utf8")); } catch (e) {
    problems.push(`app-packages.json: ${e.code === "ENOENT" ? "missing" : e.message}`);
    return { app: null, problems };
  }
  if (d.group !== "app") problems.push('app-packages.json: group must be "app"');
  if ((d.levels ?? []).length !== 3) problems.push("app-packages.json: three trade package levels expected");
  for (const t of d.trades ?? []) if (!/^[a-z0-9-]+$/.test(t.slug ?? "")) problems.push(`app-packages.json: trade ${t.name}: bad slug`);
  return { app: d, problems };
}

const money = (n) => "A$" + Number(n).toLocaleString("en-AU", { maximumFractionDigits: 0 });
/** A$ from cents: whole dollars as money(), otherwise with the cents (A$1,999.20). */
export const moneyCents = (c) => (c % 100 === 0 ? money(c / 100)
  : "A$" + (c / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** The catalogue's group "app" id for a trade level, a builder bundle (slug builder-*) or the Audit seat. */
export const appProductId = { level: (l) => `app:trade:${l.slug}`, bundle: (b) => `app:builder:${b.slug.replace(/^builder-/, "")}`, audit: "app:audit:seat" };
const perMonth = (n) => `${money(n)} a month <small>+GST</small>`;
const range = (ns) => (Math.min(...ns) === Math.max(...ns) ? `${ns[0]}` : `${Math.min(...ns)} to ${Math.max(...ns)}`);
const lockup = (src, alt, w = 171) => `<p class="lockup"><img src="${src}" alt="${esc(alt)}" width="${w}" height="60"></p>`;

/**
 * Page specs for every SiteGuard App page. ctx: { mode, head, buy, when, related }
 * (head(trail, h1, lede), buy(interest), when(opts) the status line,
 * related(module) the "Related videos" band or "").
 */
export function appPages(app, ctx) {
  const { mode, head, buy, when, related = () => "" } = ctx;
  const prices = showAppPrices(mode);
  const T = [["/app/", "SiteGuard App"]];
  const TP = [...T, ["/app/trade-packages/", "Trade packages"]];
  const out = [];
  const docsRange = (lv) => range(app.trades.map((t) => t.documents_by_level[lv]));
  const modName = (m) => (MODULES[m] ? MODULES[m].name : m === "audit" ? "SiteGuard Audit" : m);
  const modLink = (m) => (MODULES[m] ? `<a href="/app/${m}/">${modName(m)}</a>` : m === "audit" ? `<a href="/audit/">SiteGuard Audit</a>` : esc(m));
  const buyBand = (interest = "app") => `<section class="band band-ink"><div class="wrap">
  <h2>${mode.app_status === "live" ? "Get started with the SiteGuard App" : "Be first on the SiteGuard App"}</h2>
  ${when({ cls: "lede status-line" })}
  <div class="btn-row">${buy(interest)}${prices ? `<a class="btn btn-inv" href="/app/pricing/">See pricing</a>` : ""}</div>
</div></section>`;
  const levelPrice = (l) => (prices ? `<div class="prices"><p class="price-line"><span class="label">Up to ${l.reference_projects} active projects</span><span class="amount">${perMonth(l.price_month)}</span></p><p class="gst">Each extra project ${money(l.per_project_month)} a month +GST. Billed annually.</p></div>` : "");

  const howItWorks = `<section class="band band-grey"><div class="wrap">
  <h2>How it works</h2>
  <ol class="steps">
    <li><h3>Set up your business once</h3><p>Company details, workforce, tickets and projects go into one organisation record.</p></li>
    <li><h3>Your documents arrive filled in</h3><p>The SWMS, forms, ITPs and registers for your work come with your package, with your details in them.</p></li>
    <li><h3>Record on site</h3><p>Inspections, defects, incidents and sign-ons go in on a phone or tablet. Registers fill from what you record.</p></li>
    <li><h3>Kept current</h3><p>SiteGuard reviews the library against legislative change every 6 months and pushes the new revisions to you.</p></li>
  </ol>
</div></section>`;

  out.push({
    url: "/app/", title: "SiteGuard App: HSEQ software for trades and builders", trail: T,
    description: "The SiteGuard App: safety, quality, environmental and management modules for Australian trades and builders, with the documents for your work included and reviewed every 6 months.",
    body: `${head(T, "SiteGuard App", "Safety, quality, environmental and management modules for trades and builders, with the documents for your work included and kept current after every 6-monthly review.")}
<section class="band"><div class="wrap">
  ${lockup("/assets/brand/sg-app-lockup.png", "SiteGuard App", 196)}
  ${when({ cls: "note status-line" })}
  <h2>Modules</h2>
  <div class="doors">${MODULE_SLUGS.map((m) => `<div class="door"><h3><a href="/app/${m}/">${MODULES[m].name}</a></h3><p>${esc(MODULES[m].lede)}</p></div>`).join("")}</div>
</div></section>
<section class="band band-grey"><div class="wrap cols">
  <div><h2><a href="/app/trade-packages/">Trade packages</a></h2><p>One package for each of ${app.trades.length} trades, at three levels: ${app.levels.map((l) => esc(l.name)).join(", ")}. Same modules for every trade at a level; the documents are your trade's.</p><p><a class="btn" href="/app/trade-packages/">Find your trade</a></p></div>
  <div><h2><a href="/app/builder-bundles/">Builder bundles</a></h2><p>${app.bundles.map((b) => esc(b.name)).join(", ")}: the full safety, quality, environmental and management modules for builders, and SiteGuard Audit at Heavy Commercial.</p><p><a class="btn" href="/app/builder-bundles/">See the bundles</a></p></div>
</div></section>
${howItWorks}
${buyBand()}`,
  });

  out.push({
    url: "/app/trade-packages/", title: "SiteGuard App trade packages: 25 trades, three levels", trail: TP,
    description: `SiteGuard App trade packages for ${app.trades.length} trades at Domestic, Light Commercial and Heavy Commercial levels, each with that trade's SWMS, ITPs, forms and registers.`,
    body: `${head(TP, "Trade packages", "One package for your trade at the level of work you do. Every level carries your trade's SWMS and ITPs; higher levels add environmental basics and Tier 1 documents.")}
<section class="band"><div class="wrap">
  ${when({ cls: "note status-line" })}
  <div class="rungs">${app.levels.map((l) => `<div class="rung"><h3>${esc(l.name)}</h3><p class="summary">${esc(l.who)}.</p>
    <ul>${l.modules.map((m) => `<li>${modLink(m)}</li>`).join("")}</ul>
    <p class="small">${docsRange(l.slug)} documents, depending on the trade.</p>${levelPrice(l)}</div>`).join("")}</div>
</div></section>
<section class="band band-grey"><div class="wrap">
  <h2>Choose your trade</h2>
  <ul class="trade-list">${app.trades.map((t) => `<li><a href="/app/trade-packages/${t.slug}/">${esc(t.name)}</a><span class="small">${esc(t.who)}</span></li>`).join("")}</ul>
</div></section>
${buyBand()}`,
  });

  for (const t of app.trades) {
    const tr = [...TP, [`/app/trade-packages/${t.slug}/`, t.name]];
    const docList = (label, list) => (list.length ? `<details class="doclist doclist-titles"><summary>${esc(label)} (${list.length})</summary><ol>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : "");
    out.push({
      url: `/app/trade-packages/${t.slug}/`, title: `${t.name}: SiteGuard App trade package`, trail: tr,
      description: `The SiteGuard App package for ${t.name.toLowerCase()} (${t.who.toLowerCase()}): ${t.documents.trade_swms.length} trade SWMS, ${t.documents.trade_itps.length} ITPs and the forms and registers at each level.`,
      body: `${head(tr, esc(t.name), `For ${esc(t.who.toLowerCase())}. Your trade's documents, filled in with your details, at the level of work you do.`)}
<section class="band"><div class="wrap">
  ${when({ cls: "note status-line" })}
  <div class="rungs">${app.levels.map((l) => `<div class="rung"><h3>${esc(l.name)}</h3><p class="summary">${esc(l.who)}.</p>
    <ul>${l.modules.map((m) => `<li>${modLink(m)}</li>`).join("")}</ul>
    <p><strong>${t.documents_by_level[l.slug]} documents</strong></p>${levelPrice(l)}</div>`).join("")}</div>
</div></section>
<section class="band band-grey"><div class="wrap cols">
  <div><h2>Your trade's documents</h2>
    ${docList("Trade SWMS", t.documents.trade_swms)}
    ${docList("High risk construction work SWMS", t.documents.hrcw_swms)}
    ${t.has_itps ? docList("Inspection and test plans", t.documents.trade_itps) : `<p>No inspection and test plans for this trade yet: quality covers defects and non-conformances.</p>`}</div>
  <div><h2>In every ${esc(t.name.toLowerCase())} package</h2>
    ${app.common_sets.map((s) => `${docList(`${s.name}${s.levels.length < 3 ? ` (${s.levels.map((x) => app.levels.find((l) => l.slug === x).name).join(" and ")})` : ""}`, s.documents)}`).join("")}
    <p class="small">Documents are reviewed against legislative change every 6 months; new revisions are pushed to you.</p></div>
</div></section>
${buyBand()}`,
    });
  }

  const TB = [...T, ["/app/builder-bundles/", "Builder bundles"]];
  out.push({
    url: "/app/builder-bundles/", title: "SiteGuard App builder bundles", trail: TB,
    description: "SiteGuard App builder bundles for domestic, light commercial and heavy commercial builders: safety, quality, environmental and management modules, with SiteGuard Audit at Heavy Commercial.",
    body: `${head(TB, "Builder bundles", "The modules a builder runs a site on, in one bundle, with the documents included and kept current.")}
<section class="band"><div class="wrap">
  ${when({ cls: "note status-line" })}
  <div class="rungs">${app.bundles.map((b) => `<div class="rung"><h3>${esc(b.name.replace(/^Builder /, ""))}</h3><p class="summary">${esc(b.who)}.</p>
    <ul>${b.components.map((c, i) => `<li>${MODULES[b.modules[i]] ? `<a href="/app/${b.modules[i]}/">${esc(c.replace(/^(\w+)/, (w) => `SiteGuard ${w}`))}</a>` : `<a href="/audit/">SiteGuard Audit</a> (one seat)`}</li>`).join("")}</ul>
    ${prices ? `<div class="prices"><p class="price-line"><span class="label">Up to ${b.reference_projects} active projects</span><span class="amount">${perMonth(b.price_month)}</span></p><p class="gst">Billed annually.</p></div>` : ""}</div>`).join("")}</div>
</div></section>
${howItWorks}
${buyBand()}`,
  });

  for (const m of MODULE_SLUGS) {
    const M = MODULES[m];
    const tm = [...T, [`/app/${m}/`, M.name]];
    const inLevels = app.levels.filter((l) => l.modules.includes(m)).map((l) => l.name);
    const inBundles = app.bundles.filter((b) => b.modules.includes(m)).map((b) => b.name);
    out.push({
      url: `/app/${m}/`, title: `${M.name}: a SiteGuard App module`, trail: tm, description: M.lede,
      body: `${head(tm, M.name, esc(M.lede))}
<section class="band"><div class="wrap cols">
  <div>${lockup(M.lockup, M.name)}<h2>What it does</h2><ul>${M.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
  <div>${when({ cls: "note status-line" })}<h2>Where you get it</h2><ul>
    ${inLevels.length ? `<li><a href="/app/trade-packages/">Trade packages</a>: ${inLevels.map(esc).join(", ")}</li>` : ""}
    ${inBundles.length ? `<li><a href="/app/builder-bundles/">Builder bundles</a>: ${inBundles.map((b) => esc(b.replace(/^Builder /, ""))).join(", ")}</li>` : ""}</ul>
    <div class="btn-row">${buy("app")}</div></div>
</div></section>
${related(m)}`,
    });
  }

  if (prices) {
    const TPr = [...T, ["/app/pricing/", "Pricing"]];
    const L = app.billing.loading;
    out.push({
      url: "/app/pricing/", title: "SiteGuard App and SiteGuard Audit pricing", trail: TPr,
      description: "SiteGuard App trade packages, builder bundles and SiteGuard Audit seats: prices in Australian dollars, ex GST, billed annually.",
      body: `${head(TPr, "Pricing", "Prices are in Australian dollars a month, plus GST, billed annually.")}
<section class="band"><div class="wrap">
  ${when({ cls: "note status-line" })}
  <h2>Trade packages</h2>
  <div class="rungs">${app.levels.map((l) => `<div class="rung"><h3>${esc(l.name)}</h3><p class="summary">${esc(l.who)}.</p>${levelPrice(l)}</div>`).join("")}</div>
  <h2 class="mt-lg">Builder bundles</h2>
  <div class="rungs">${app.bundles.map((b) => `<div class="rung"><h3>${esc(b.name.replace(/^Builder /, ""))}</h3><p class="summary">${esc(b.who)}.</p><div class="prices"><p class="price-line"><span class="label">Up to ${b.reference_projects} active projects</span><span class="amount">${perMonth(b.price_month)}</span></p></div></div>`).join("")}</div>
  <h2 class="mt-lg">SiteGuard Audit</h2>
  <div class="rungs"><div class="rung"><h3>Audit seat</h3><p class="summary">Unlimited clients and audits for one auditor; ${Number(app.audit.ai_photo_checks_per_seat_month).toLocaleString("en-AU")} AI photo checks a month included (fair use), then top-ups.</p><div class="prices"><p class="price-line"><span class="label">Per auditor</span><span class="amount">${perMonth(app.audit.seat_month)}</span></p></div></div></div>
  <h2 class="mt-lg">Billing</h2>
  <ul><li>Annual billing is the default.</li>
  <li>Paying more often adds a loading: every 6 months +${L.six_monthly * 100}%, every 3 months +${L.quarterly * 100}%, monthly +${L.monthly * 100}%.</li>
  <li>Prices may rise once a year, with notice.</li></ul>
  <div class="btn-row">${buy("app")}</div>
</div></section>`,
    });
  }

  if (mode.app_status === "presale") {
    const TF = [...T, ["/app/founding-offer/", "Founding offer"]];
    const f = app.founding;
    // The founding prepayment and the standard annual price, from the catalogue row (Hseq-Dev's table).
    const firstYear = (id, each = "") => {
      const r = ctx.appRow?.(id);
      if (!r) throw new Error(`founding offer: no catalogue group "app" row ${id}`);
      return `${moneyCents(r.app_prices.founding_prepay_cents)}${each} for the first year <small>+GST</small> (standard ${money(r.app_prices.cadences.annual.per_year)})`;
    };
    out.push({
      url: "/app/founding-offer/", title: "SiteGuard App founding offer", trail: TF,
      description: `Founding places on the SiteGuard App and SiteGuard Audit: the first ${f.places} customers get ${f.discount * 100}% off their first year, paid annually, with access from June 2027.`,
      body: `${head(TF, "Founding offer", `The first ${f.places} customers get ${f.discount * 100}% off their first year of the SiteGuard App or SiteGuard Audit.`)}
<section class="band"><div class="wrap cols">
  <div><h2>The offer</h2><ul>
    <li>${f.discount * 100}% off your first ${f.term_months} months, paid annually up front.</li>
    <li>${when({ tag: "span" })} Your ${f.term_months} months start when the app opens.</li>
    <li>Your price is locked for those ${f.price_lock_months} months; standard prices apply after that.</li>
    <li>The matching ${ctx.formsName()} pack is yours free from March 2027, so you have your documents while you wait.</li>
    <li>If the June 2027 opening moves, you get ${esc(f.delay)}.</li></ul>
    <p class="small">${ctx.foundingTerms ? `Read the <a href="${ctx.foundingTerms}">Founding Offer Terms</a>.` : "The founding offer terms are published before founding places go on sale."}</p></div>
  <div><h2>Founding prices</h2>
    <ul>${app.levels.map((l) => `<li>Trade ${esc(l.name)}: ${firstYear(appProductId.level(l))}</li>`).join("")}
    ${app.bundles.map((b) => `<li>${esc(b.name)}: ${firstYear(appProductId.bundle(b))}</li>`).join("")}
    <li>SiteGuard Audit: ${firstYear(appProductId.audit, " a seat")}</li></ul>
    <div class="btn-row"><a class="btn btn-hivis" href="/register-interest/?interest=both">Ask for a founding place</a></div></div>
</div></section>`,
    });
  }
  return out;
}
