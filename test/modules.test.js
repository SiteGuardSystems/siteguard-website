// Module colour identity: the tokens in assets/site.css (WCAG contrast computed
// from the CSS values themselves), the Rev06 marks in assets/brand/, and the
// data-module wiring on the built pages (npm test builds first).
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BRAND_MODULES, LOCKUP_SIZE } from "../scripts/lib/modules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const CSS = await readFile(path.join(ROOT, "assets/site.css"), "utf8");

// WCAG 2.x relative luminance and contrast ratio.
const rgb = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); assert.ok(m, `not a #RRGGBB colour: ${hex}`); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const varOf = (block, name) => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (!m) return null;
  const v = m[1].trim();
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref ? varOf(CSS.match(/:root\s*\{[^}]*\}/)[0], ref[1]) : v;
};

/** { slug: { mod, tint, line, ink, on } } from the [data-module="…"] blocks in site.css. */
function tokens() {
  const out = {};
  for (const [, slug, block] of CSS.matchAll(/\[data-module="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
    if (!/--mod:/.test(block)) continue;
    out[slug] = { mod: varOf(block, "mod"), tint: varOf(block, "mod-tint"), line: varOf(block, "mod-line"), ink: varOf(block, "mod-ink"), on: varOf(block, "mod-on") };
  }
  return out;
}
const T = tokens();
const over = (hex, a) => rgb(hex).map((v) => a * v + (1 - a) * 255);
const near = (hex, want) => rgb(hex).every((v, i) => Math.abs(v - want[i]) <= 1);

test("site.css has one token set per module, and only for the eight modules (no Robotics or Core)", () => {
  assert.deepEqual(Object.keys(T).sort(), Object.keys(BRAND_MODULES).sort());
  for (const [m, t] of Object.entries(T)) for (const [k, v] of Object.entries(t)) assert.ok(v, `${m}: --${k === "mod" ? "mod" : `mod-${k}`} missing`);
});

test("--mod is the Rev06 palette colour; --mod-tint is 8% and --mod-line 30% of it on white", () => {
  for (const [m, t] of Object.entries(T)) {
    assert.equal(t.mod.toUpperCase(), BRAND_MODULES[m].colour, `${m}: --mod`);
    assert.ok(near(t.tint, over(t.mod, 0.08)), `${m}: --mod-tint ${t.tint} is not 8% of ${t.mod}`);
    assert.ok(near(t.line, over(t.mod, 0.3)), `${m}: --mod-line ${t.line} is not 30% of ${t.mod}`);
  }
});

test("contrast: --mod-ink is at least 4.5:1 on --mod-tint and on white; --mod-on at least 4.5:1 on --mod", () => {
  const rows = [];
  for (const [m, t] of Object.entries(T)) {
    const onTint = contrast(t.ink, t.tint), onWhite = contrast(t.ink, "#FFFFFF"), button = contrast(t.on, t.mod);
    rows.push(`${m}: ink ${t.ink} ${onTint.toFixed(2)}:1 on tint, ${onWhite.toFixed(2)}:1 on white; button ${button.toFixed(2)}:1`);
    assert.ok(onTint >= 4.5, `${m}: --mod-ink ${t.ink} on --mod-tint ${t.tint} is ${onTint.toFixed(2)}:1, under 4.5:1`);
    assert.ok(onWhite >= 4.5, `${m}: --mod-ink ${t.ink} on white is ${onWhite.toFixed(2)}:1, under 4.5:1`);
    assert.ok(button >= 4.5, `${m}: --mod-on ${t.on} on --mod ${t.mod} is ${button.toFixed(2)}:1, under 4.5:1`);
    // Page-head text on the tint: the heading, lede and breadcrumbs.
    for (const v of ["ink", "ink-2", "muted"]) {
      const c = varOf(CSS.match(/:root\s*\{[^}]*\}/)[0], v);
      assert.ok(contrast(c, t.tint) >= 4.5, `${m}: --${v} on --mod-tint is under 4.5:1`);
    }
  }
  console.log(rows.join("\n"));
});

test("the contrast check fails a pair under 4.5:1", () => {
  assert.ok(contrast("#F58220", "#FEF5ED") < 4.5); // Forms orange as small text on its tint
  assert.equal(contrast("#000000", "#FFFFFF").toFixed(0), "21");
});

test("assets/brand: a label and a lockup SVG for each module, exported from the Rev06 masters; no Robotics or Core", async () => {
  const files = (await readdir(path.join(ROOT, "assets/brand"))).filter((f) => f.endsWith(".svg")).sort();
  assert.deepEqual(files, Object.keys(BRAND_MODULES).flatMap((m) => [`sg-${m}-label.svg`, `sg-${m}-lockup.svg`]).sort());
  for (const f of await readdir(path.join(ROOT, "assets/brand"))) assert.ok(!/robot|core/i.test(f), f);
  for (const [m, M] of Object.entries(BRAND_MODULES)) {
    const label = await readFile(path.join(ROOT, `assets/brand/sg-${m}-label.svg`), "utf8");
    const lockup = await readFile(path.join(ROOT, `assets/brand/sg-${m}-lockup.svg`), "utf8");
    assert.match(label, new RegExp(`^<svg [^>]*viewBox="0 0 ${M.labelWidth} 84"`), `${m} label viewBox`);
    assert.match(lockup, new RegExp(`^<svg [^>]*viewBox="0 0 ${LOCKUP_SIZE.join(" ")}"`), `${m} lockup viewBox`);
    for (const svg of [label, lockup]) {
      assert.ok(svg.includes(`fill="${M.colour}"`), `${m}: the mark carries its Rev06 colour`);
      assert.ok(!/<script|<image|<foreignObject|href=|url\((?!#)/i.test(svg), `${m}: SVG must be self-contained (paths; only internal url(#id) references)`);
    }
  }
});

async function htmlFiles(dir = DIST) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const pages = new Map(await Promise.all((await htmlFiles()).map(async (f) => [path.relative(DIST, f).split(path.sep).join("/"), await readFile(f, "utf8")])));

/** The module a built page belongs to, or null. */
function moduleOf(f) {
  const m = /^app\/(safety|quality|environmental|management)\//.exec(f);
  if (m) return m[1];
  if (/^audit\//.test(f)) return "audit";
  if (/^education\//.test(f)) return "education";
  if (/^(consulting|library|about)\//.test(f)) return "consulting";
  return null;
}

test("every module page and the Audit, Education and Consulting tab pages carry their data-module and full lockup in the page head", () => {
  let n = 0;
  for (const [f, html] of pages) {
    const m = moduleOf(f);
    if (!m) {
      assert.ok(!/<main id="main" data-module=/.test(html), `${f}: data-module on a page outside a module`);
      continue;
    }
    n++;
    assert.match(html, new RegExp(`<main id="main" data-module="${m}">`), `${f}: data-module`);
    const headEl = html.match(/<section class="page-head">[\s\S]*?<\/section>/)?.[0] ?? "";
    assert.match(headEl, new RegExp(`<p class="mod-lockup"><img src="/assets/brand/sg-${m}-lockup.svg" alt="${BRAND_MODULES[m].name}" width="\\d+" height="\\d+"></p>`), `${f}: lockup in the page head`);
  }
  assert.ok(n >= 4 + 2 + 1 + 1 + 7 + 2, `module pages found: ${n}`);
});

test("module cards: App hub, home, Audit cross-links; label at the top of each", () => {
  // The card element carries data-module; its first child is the label (the cross-link card wraps it in a column).
  const card = (html, m) => new RegExp(`data-module="${m}">\\s*(<div>)?<p class="mod-label"><img src="/assets/brand/sg-${m}-label.svg"`).test(html);
  for (const m of ["safety", "quality", "environmental", "management"]) assert.ok(card(pages.get("app/index.html"), m), `App hub: ${m} card`);
  for (const m of ["consulting", "audit", "education"]) assert.ok(card(pages.get("index.html"), m), `home: ${m} card`);
  assert.ok(card(pages.get("planning/index.html"), "audit"), "planner: SiteGuard Audit cross-link card");
  assert.match(pages.get("app/trade-packages/index.html"), /<a class="mod-link" data-module="safety" href="\/app\/safety\/">/);
});

test("no inline style for module colour (the CSP forbids it)", () => {
  for (const [f, html] of pages) assert.ok(!/\sstyle=/.test(html), f);
});

test("Safety and Management list their coming features as not yet available (Module Standard Rev04)", async () => {
  const page = (m) => readFile(path.join(DIST, "app", m, "index.html"), "utf8");
  const safety = await page("safety");
  for (const w of ["Being added", "organisation induction", "site-specific induction for each project", "Site sign-in by QR", "Plant:", "plant risk assessments", "Emergency evacuation diagrams", "helps you prepare"]) assert.ok(safety.includes(w), `safety: ${w}`);
  const management = await page("management");
  for (const w of ["Being added", "QR site access", "do the project induction, then sign in", "live on-site dashboard", "evacuation roll call", "QR toolbox sign-on", "daily pre-start brief", "reads and acknowledges it at sign-in"]) assert.ok(management.includes(w), `management: ${w}`);
  for (const html of [safety, management]) assert.ok(html.includes("They aren't available yet."));
  for (const m of ["quality", "environmental"]) assert.ok(!(await page(m)).includes("Being added"), m);
});
