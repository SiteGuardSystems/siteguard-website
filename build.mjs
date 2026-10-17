#!/usr/bin/env node
// Builds siteguardsystems.com.au into dist/ (Cloudflare Pages: build command
// "node build.mjs", output directory "dist"). Static pages with a shared
// head, header and footer. Numbers and "from" prices come from
// data/site-facts.json, written by Hseq-Dev docs/build_catalogue.py; legal
// pages come from content/legal/, copied from SiteGuard-Forms (the one legal
// source) by scripts/sync-legal.mjs.
//
//   node build.mjs               # build; notes open items
//   node build.mjs --production  # also fails on open [placeholders] in a legal page
import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, frontMatter, render, plain, PLACEHOLDER_RE } from "./scripts/lib/md.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, "dist");
const PRODUCTION = process.argv.includes("--production");
const ORIGIN = (process.env.SITE_ORIGIN ?? "https://www.siteguardsystems.com.au").replace(/\/$/, "");
const FORMS = (process.env.FORMS_URL ?? "https://www.siteguardforms.com.au").replace(/\/$/, "");
const LEAD_ENDPOINT = process.env.LEAD_ENDPOINT ?? `${FORMS}/api/lead`;
const EMAIL = "hello@siteguardsystems.com.au";
const LINKEDIN = "https://www.linkedin.com/in/silverdaniel";
const CREDENTIAL = "Exemplar Global Certified Lead Auditor — Integrated Management Systems (ISO 9001, 14001, 45001)";

export const BANNED = /\b(compliant|certified|endorsed|guarantee[sd]?|4801|coming soon|rolling out|in progress|quarterly)\b/gi;

const pages = [];
const problems = [];
const money = (n) => "$" + Number(n).toLocaleString("en-AU");

const NAV = [
  ["/services/", "Services"], ["/library/", "Document library"], ["/about/", "About"], ["/contact/", "Contact"],
];

function header(url) {
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><img src="/assets/shield.png" alt="" width="26" height="43"><span class="brand-name">SiteGuard <b>Systems</b></span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav class="nav" id="site-nav" aria-label="Main">${NAV.map(([h, l]) => `<a href="${h}"${url.startsWith(h) ? ' aria-current="page"' : ""}>${l}</a>`).join("")}<a class="cart-link" href="${FORMS}/">SiteGuard FORMS</a></nav>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="wrap">
  <div class="footer-grid">
    <div><h2>SiteGuard Systems</h2><p>HSEQ consulting and controlled documentation for Australian construction. Melbourne, Victoria; working Australia-wide.</p></div>
    <div><h2>Services</h2><ul>
      <li><a href="/services/subcontractors/">Subcontractors</a></li><li><a href="/services/builders/">Builders</a></li>
      <li><a href="/services/iso-ims/">ISO and IMS</a></li><li><a href="/services/leadership-advisory/">Leadership and risk advisory</a></li></ul></div>
    <div><h2>Contact</h2><ul><li><a href="mailto:${EMAIL}">${EMAIL}</a></li><li><a href="${LINKEDIN}">LinkedIn</a></li><li><a href="/contact/">Send an enquiry</a></li></ul></div>
    <div><h2>Legal</h2><ul><li><a href="/legal/disclaimer/">Website Disclaimer</a></li><li><a href="/legal/privacy/">Privacy Policy</a></li><li><a href="/legal/website-terms/">Website Terms of Use</a></li></ul></div>
  </div>
  <p class="footer-base">SiteGuard provides frameworks, systems and advisory support. Work health and safety duties stay with the person conducting the business or undertaking.<br>© ${new Date().getFullYear()} SiteGuard Systems Pty Ltd</p>
</div></footer>`;
}

function crumbs(trail) {
  const items = [["/", "Home"], ...trail];
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([h, l], i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(l)}</li>` : `<li><a href="${h}">${esc(l)}</a></li>`).join("")}</ol></nav>`;
}

function page({ url, title, description, body, trail = [], jsonld = [] }) {
  const full = url === "/" ? title : `${title} | SiteGuard Systems`;
  const ld = [...jsonld];
  if (trail.length) ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["/", "Home"], ...trail].map(([h, l], i) => ({ "@type": "ListItem", position: i + 1, name: l, item: ORIGIN + h })) });
  pages.push({ url, title: full, html: `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SiteGuard Systems">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${url}">
<meta property="og:image" content="${ORIGIN}/assets/apple-touch-icon.png">
<meta name="theme-color" content="#2B2A2F">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/barlow-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script src="/assets/site.js" defer></script>
</head>
<body>
${header(url)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>
` });
}

const head = (trail, h1, lede) => `<section class="page-head"><div class="wrap">${crumbs(trail)}<h1>${h1}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div></section>`;
const enquire = (label = "Send an enquiry") => `<p><a class="btn btn-hivis" href="/contact/">${label}</a></p>`;

function leadForm() {
  return `<form class="form" data-lead-form data-source="systems" data-endpoint="${esc(LEAD_ENDPOINT)}" novalidate>
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

const SERVICES = {
  subcontractors: {
    title: "Subcontractors and small builders", short: "Site documentation and safety support",
    lede: "Practical, well-structured documentation for growing subcontractors and small builders, from a single SWMS to a full trade pack, without a complex engagement.",
    items: ["A single SWMS, scoped to your work, written and controlled", "Trade document packs for every major trade", "Site safety forms and induction records",
      "Safety walks and site inspections", "Toolbox talks and pre-start meeting records", "HSEQ coordination and administration"],
    note: `Need standard documents now? Trade packs are available to buy on <a href="${FORMS}/trade-packs/">SiteGuard FORMS</a>.`,
  },
  builders: {
    title: "Builders and growing businesses", short: "Safety systems, audit support and incident investigation",
    lede: "For builders and contractors scaling up: documented safety systems, audit readiness and structured HSEQ guidance that supports prequalification and principal contractor requirements.",
    items: ["Safety management system design and build", "Subcontractor management system", "Internal and external audit preparation",
      "Evidence collation and gap closure", "Non-conformance response and corrective action tracking", "Incident investigation and return to work coordination"],
  },
  "iso-ims": {
    title: "ISO and integrated management systems", short: "ISO 45001, 9001 and 14001, IMS and ISO 45003",
    lede: "Structured support for organisations working towards ISO, from gap analysis and system design to evidence preparation and audit readiness support. Standalone standards or one integrated framework.",
    items: ["ISO 45001, ISO 9001 and ISO 14001 implementation support", "Integrated management system (IMS) design: one policy structure, one risk register, one internal audit cycle",
      "ISO 45003 psychosocial hazard management frameworks", "Gap analysis and improvement roadmap", "Certification audit readiness support"],
    note: "SiteGuard designs and builds the framework; your organisation implements and maintains it. Certification is granted only by an accredited certification body.",
  },
  "leadership-advisory": {
    title: "Leadership and risk advisory", short: "Leadership Under Pressure and risk advisory",
    lede: "For leaders carrying real operational risk: mentoring and structured advisory on decision quality, communication discipline, psychosocial duty and the practical demands of leading high-stakes work.",
    items: ["1:1 mentoring: Leadership Under Pressure", "Leadership maturity workshops (half or full day)", "Psychosocial systems and consultation review",
      "Executive risk briefings", "Operational governance support"],
    note: "Leadership advisory is mentoring, not clinical assessment, therapy or coaching. Individual psychological assessment is referred to qualified professionals.",
  },
};

async function legal(file) {
  return frontMatter(await readFile(path.join(ROOT, "content/legal", file), "utf8"));
}

async function build() {
  const facts = JSON.parse(await readFile(path.join(ROOT, "data/site-facts.json"), "utf8"));
  const f = facts.facts;
  const fromP = facts.preview ? {} : facts.from_prices; // a preview catalogue never sets public prices

  page({
    url: "/", title: "SiteGuard Systems | HSEQ consulting for Australian construction",
    description: "Senior HSEQ consulting and controlled documentation for Australian construction: SWMS, safety systems, audit support and ISO-aligned management systems. Melbourne-based, Australia-wide.",
    jsonld: [{ "@context": "https://schema.org", "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN,
      logo: ORIGIN + "/assets/apple-touch-icon.png", email: EMAIL, areaServed: "AU",
      address: { "@type": "PostalAddress", addressLocality: "Melbourne", addressRegion: "VIC", addressCountry: "AU" },
      founder: { "@type": "Person", name: "Daniel Silver", hasCredential: CREDENTIAL }, sameAs: [LINKEDIN] }],
    body: `<section class="hero"><div class="wrap">
  <h1>HSEQ systems that hold up on site.</h1>
  <p class="lede">Senior HSEQ consulting and controlled documentation for Australian construction, from a single SWMS for a subcontractor to an ISO-aligned integrated management system.</p>
  <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Send an enquiry</a><a class="btn" href="/services/">See services</a></div>
  <dl class="title-block">
    <div><dt>Years in construction</dt><dd>27</dd></div>
    <div><dt>Controlled documents</dt><dd>${esc(f.documents_rounded)}</dd></div>
    <div><dt>SWMS across ${f.trades}+ trade series</dt><dd>${f.swms}</dd></div>
    <div><dt>Legislative review</dt><dd>6-monthly</dd></div>
  </dl>
</div></section>
<section class="band band-grey"><div class="wrap">
  <h2>Who we help</h2>
  <p class="lede">Subcontractors and small builders, tier 2 and tier 3 builders, head and principal contractors, organisations working towards ISO, and HSEQ consultants.</p>
  <div class="doors">${Object.entries(SERVICES).map(([slug, s]) => `<div class="door"><h3><a href="/services/${slug}/">${esc(s.title)}</a></h3><p>${esc(s.short)}.</p></div>`).join("")}</div>
</div></section>
<section class="band"><div class="wrap cols">
  <div><h2>The library behind the work</h2>
    <p>SiteGuard maintains ${esc(f.documents_rounded)} controlled, version-managed documents: ${f.swms} SWMS, ${f.by_family.ITP ?? 0} inspection and test plans, and the plans, policies, forms and registers of a full management system. Every document is written to Australian WHS laws (the OHS Act 2004 in Victoria) and reviewed against legislative change every 6 months.</p>
    <p><a href="/library/">See the document library</a></p></div>
  <div><h2>Buy documents directly</h2>
    <p>Not every job needs a consulting engagement. Trade packs, builder packs and management-system packs are on SiteGuard FORMS. Every package can be bought outright or on subscription, with 6-monthly legislative review updates.</p>
    <p><a class="btn" href="${FORMS}/">Go to SiteGuard FORMS</a></p></div>
</div></section>
<section class="band band-ink"><div class="wrap">
  <h2>Tell us about your project.</h2>
  <p class="lede">We reply within one business day.</p>
  <div class="btn-row"><a class="btn btn-hivis" href="/contact/">Send an enquiry</a><a class="btn btn-inv" href="mailto:${EMAIL}">${EMAIL}</a></div>
</div></section>`,
  });

  page({
    url: "/services/", title: "Services", trail: [["/services/", "Services"]],
    description: "HSEQ consulting for subcontractors, builders, organisations working towards ISO, and leaders carrying operational risk.",
    jsonld: Object.entries(SERVICES).map(([slug, s]) => ({ "@context": "https://schema.org", "@type": "Service", name: s.title,
      description: s.lede, provider: { "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN }, areaServed: "AU", url: `${ORIGIN}/services/${slug}/` })),
    body: `${head([["/services/", "Services"]], "Services", "One SWMS or a full ISO framework. Senior practitioner guidance at every level, scoped and quoted to the work.")}
<section class="band"><div class="wrap"><div class="register">${Object.entries(SERVICES).map(([slug, s]) =>
  `<div class="register-row"><div><h3><a href="/services/${slug}/">${esc(s.title)}</a></h3><p>${esc(s.lede)}</p></div><span></span><a class="btn btn-small" href="/services/${slug}/">More</a></div>`).join("")}</div></div></section>
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
    const url = `/services/${slug}/`;
    page({
      url, title: s.title, trail: [["/services/", "Services"], [url, s.title]], description: s.lede,
      jsonld: [{ "@context": "https://schema.org", "@type": "Service", name: s.title, description: s.lede,
        provider: { "@type": "ProfessionalService", name: "SiteGuard Systems", url: ORIGIN }, areaServed: "AU" }],
      body: `${head([["/services/", "Services"], [url, s.title]], esc(s.title), esc(s.lede))}
<section class="band"><div class="wrap cols">
  <div><h2>What we do</h2><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
  <div>${s.note ? `<div class="note"><p>${s.note}</p></div>` : ""}<h2 class="mt">Start with a conversation</h2><p>Tell us about the work and what you need. We reply within one business day with next steps and, where it fits, a scoped quote.</p>${enquire()}</div>
</div></section>`,
    });
  }

  const tc = facts.trade_counts ?? [];
  const fam = f.by_family;
  page({
    url: "/library/", title: "Document library", trail: [["/library/", "Document library"]],
    description: `${f.documents_rounded} controlled HSEQ documents: ${f.swms} SWMS across ${f.trades} trade series, ITPs, plans, policies, forms and registers, reviewed every 6 months.`,
    body: `${head([["/library/", "Document library"]], "Document library", `${esc(f.documents_rounded)} controlled, version-managed documents across every major trade and management-system discipline.`)}
<section class="band"><div class="wrap">
  <dl class="title-block">${[["SWMS", fam.SWMS], ["Inspection and test plans", fam.ITP], ["Plans", fam.Plan], ["Policies", fam.Policy], ["Forms", fam.Form], ["Registers", fam.Register]]
    .filter(([, n]) => n).slice(0, 4).map(([l, n]) => `<div><dt>${l}</dt><dd>${n}</dd></div>`).join("")}</dl>
  <div class="cols mt-lg">
    <div><h2>By trade</h2>
      <table class="doc-table"><thead><tr><th scope="col">Trade series</th><th scope="col">SWMS</th><th scope="col">ITPs</th></tr></thead>
      <tbody>${tc.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.swms || "–"}</td><td>${t.itp || "–"}</td></tr>`).join("")}</tbody></table>
      <p class="small mt">Every trade pack also carries the core site SWMS for general construction, and the high risk construction work SWMS are available across all trades.</p></div>
    <div><h2>How the library is kept</h2>
      <ul><li>Every document carries document control: reference, revision and date on every page.</li>
      <li>Each opens with a "Use of this document" statement that tells the business what to check and adapt.</li>
      <li>Written to Australian WHS laws (the OHS Act 2004 in Victoria) and aligned to ISO 45001, ISO 9001 and ISO 14001.</li>
      <li>The whole library is reviewed against legislative change every 6 months; subscribers receive the updated documents.</li></ul>
      <h2 class="mt-lg">Buy or commission</h2>
      <p>Standard documents are on <a href="${FORMS}/">SiteGuard FORMS</a>, bought outright or on subscription.${fromP["trade-packs"] ? ` Trade packs from ${money(fromP["trade-packs"])}, builder packs from ${money(fromP["builder-packs"])} (prices exclude GST).` : ""} Custom SWMS, project-specific plans and management systems are consulting work.</p>
      <div class="btn-row"><a class="btn btn-hivis" href="${FORMS}/">Go to SiteGuard FORMS</a><a class="btn" href="/contact/">Commission a document</a></div></div>
  </div>
</div></section>`,
  });

  page({
    url: "/about/", title: "About Daniel Silver", trail: [["/about/", "About"]],
    description: "Daniel Silver: 27 years in Australian construction, from carpenter to senior site manager to HSEQ systems practitioner.",
    jsonld: [{ "@context": "https://schema.org", "@type": "Person", name: "Daniel Silver", jobTitle: "Founder and Principal HSEQ Consultant",
      worksFor: { "@type": "Organization", name: "SiteGuard Systems" }, hasCredential: CREDENTIAL, sameAs: [LINKEDIN] }],
    body: `${head([["/about/", "About"]], "Daniel Silver", "Founder and principal HSEQ consultant, SiteGuard Systems.")}
<section class="band"><div class="wrap cols">
  <div class="prose">
    <p>Daniel has 27 years in the construction industry: he started as a carpenter, spent more than 16 years in senior site management, and moved into HSEQ systems management. He has worked with tier 1, tier 2 and tier 3 builders, large subcontractors, and civil and commercial projects up to $300 million.</p>
    <p>SiteGuard started from a simple observation: construction companies are often buried in paperwork but short on systems that hold up on site. Every document and service SiteGuard provides is built to solve a real operational problem.</p>
    <h2>Credential</h2>
    <p><strong>${esc(CREDENTIAL)}</strong></p>
    <p class="small">A personal qualification. It does not mean SiteGuard's products are approved by any certification or standards body.</p>
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
    <p><strong>Response time</strong><br>Within one business day.</p></div>
</div></section>`,
  });

  for (const [file, slug, nav] of [["website-disclaimer.md", "disclaimer", "Website Disclaimer"], ["privacy.md", "privacy", "Privacy Policy"], ["website-terms.md", "website-terms", "Website Terms of Use"]]) {
    const doc = await legal(file);
    const url = `/legal/${slug}/`;
    const left = doc.body.match(PLACEHOLDER_RE) ?? [];
    if (left.length) problems.push(`${file}: ${left.length} open item(s) to fill in: ${[...new Set(left)].join(", ")}`);
    page({
      url, title: doc.meta.title, trail: [[url, nav]], description: plain(doc.body),
      body: `${head([[url, nav]], esc(doc.meta.title), "")}
<section class="band"><div class="wrap prose"><p class="small">${esc(doc.meta.reference)}, version ${esc(doc.meta.version)}, ${esc(doc.meta.date)}</p>${render(doc.body)}</div></section>`,
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
      const text = p.html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/Certified Lead Auditor/g, "");
      const hits = text.match(BANNED);
      if (hits) problems.push(`${p.url}: banned wording: ${[...new Set(hits)].join(", ")}`);
    }
    if (titles.has(p.title)) problems.push(`${p.url}: duplicate title`);
    titles.add(p.title);
    for (const [, href] of p.html.matchAll(/href="(\/[^"#?]*)/g)) {
      if (!href.startsWith("/assets/") && !urls.has(href)) problems.push(`${p.url}: broken link ${href}`);
    }
    if (Buffer.byteLength(p.html) > 100_000) problems.push(`${p.url}: over 100 KB`);
  }
  const listed = pages.filter((p) => !p.url.endsWith(".html"));
  await writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${ORIGIN}${p.url}</loc></url>`).join("\n")}\n</urlset>\n`);
  await writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  // Cloudflare Pages headers and redirects.
  const connect = new URL(LEAD_ENDPOINT).origin;
  await writeFile(path.join(DIST, "_headers"), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${connect}; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
/assets/*
  Cache-Control: public, max-age=86400
`);
  await writeFile(path.join(DIST, "_redirects"), `/index.html / 301\n/services /services/ 301\n/library /library/ 301\n/about /about/ 301\n/contact /contact/ 301\n`);
  console.log(`Built ${pages.length} pages into dist/`);
  const blocking = problems.filter((p) => PRODUCTION || !/open item/.test(p));
  for (const p of problems) console.log(`  ${blocking.includes(p) ? "ERROR" : "note "}: ${p}`);
  if (blocking.length) { console.error(`${blocking.length} problem(s) must be fixed.`); process.exit(1); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
