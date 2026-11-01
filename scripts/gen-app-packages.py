#!/usr/bin/env python3
"""Write data/app-packages.json from the Packages and Pricing workbook.

Interim source for the SiteGuard App pages (WP-S4) until the app products
are in packages.py / catalogue.json as group "app"; then the site reads
that instead and this script and its output are retired.

    python scripts/gen-app-packages.py <path to SiteGuard_Packages_and_Pricing_RevNN.xlsx>

Reads the tabs "Trade Packages", "Trade Package Schedule", "Trade Package
Contents", "App Bundles", "Launch Line-up" and "Levers". Writes only what the
public site may show: document titles (never document codes), counts, levels,
modules and launch prices (A$ ex GST). Competitor names, costs, margins and
internal notes stay in the workbook. Only documents whose DCR production
status is "Approved master" are listed; every other row is counted under
"not_yet_issued" so the gap stays visible.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

ISSUED = "Approved master"
LEVELS = [("domestic", "Trade Domestic", "Domestic"), ("light-commercial", "Trade Light Commercial", "Light Commercial"),
          ("heavy-commercial", "Trade Heavy Commercial", "Heavy Commercial")]
MODULE_OF = {"SAFETY": "safety", "QUALITY": "quality", "ENVIRONMENTAL": "environmental", "MANAGEMENT": "management", "AUDIT": "audit"}
BUNDLE_COMPONENTS = {
    "AUD": ("audit", "AUDIT seat"), "QD": ("quality", "Quality Domestic"), "QT": ("quality", "Quality Trade"),
    "QC": ("quality", "Quality Commercial"), "ST": ("safety", "Safety Trade"), "SF": ("safety", "Safety Full"),
    "EE": ("environmental", "Environmental Essentials"), "EF": ("environmental", "Environmental Full"),
    "ML": ("management", "Management Lite"), "MF": ("management", "Management Full"),
}
# Public names for the common sets (the workbook names carry DCR sheet numbers).
SET_NAMES = {
    "Trade core site-forms set": "Core site forms and registers",
    "Defect, NCR and quality policy set": "Defects, NCRs and quality policy",
    "Management Lite set": "Management Lite: policy, competency, workforce and prequalification",
    "Environmental Essentials set": "Environmental Essentials: waste, spills, dust and noise",
    "Tier 1 OHS Core Pack": "Tier 1 safety core",
    "Tier 1 Contractor Assurance": "Tier 1 contractor assurance",
}
SET_LEVELS = {"All levels": ["domestic", "light-commercial", "heavy-commercial"],
              "Light and Heavy Commercial": ["light-commercial", "heavy-commercial"],
              "Heavy Commercial": ["heavy-commercial"]}
DOC_TYPES = {"Trade SWMS": "trade_swms", "HRCW SWMS (selected)": "hrcw_swms", "Trade ITP": "trade_itps", "Trade ITPs": "trade_itps"}


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")


def rows(ws):
    return [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]


def header_index(rs, first):
    for i, r in enumerate(rs):
        if r[0] == first:
            return i, {h: j for j, h in enumerate(r) if h}
    raise SystemExit(f"header row starting {first!r} not found")


def main(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    rev = re.search(r"_(Rev\d+)_", Path(xlsx).name)
    rev = rev.group(1) if rev else "unknown"

    # Levers: billing loadings, AUDIT allowance.
    lev = {r[0]: r[1] for r in rows(wb["Levers"]) if isinstance(r[0], str)}
    loading = {k: lev[f"App billing loading: paid {n}"] for k, n in (("monthly", "monthly"), ("quarterly", "quarterly"), ("six_monthly", "6-monthly"))}
    seat = lev["AUDIT seat price (per month, unlimited clients and audits)"]
    photo_checks = lev["AUDIT: AI photo checks included per seat per month (fair use)"]

    # Trade Packages: one row per level.
    rs = rows(wb["Trade Packages"])
    h0, H = header_index(rs, "Level")
    levels = []
    for slug, name, short in LEVELS:
        r = next(r for r in rs[h0 + 1:] if r[0] == name)
        comps = r[H["App components"]]
        levels.append({
            "slug": slug, "name": short, "who": r[H["Who it suits"]], "components": comps,
            "modules": sorted({m for k, m in MODULE_OF.items() if k in comps.upper()}, key=list(MODULE_OF.values()).index),
            "price_month": r[H["Price at ref. projects"]], "reference_projects": r[H["Ref. projects"]],
            "base_month": r[H["Base fee /mo"]], "per_project_month": r[H["Per project /mo"]],
        })

    # Trade Package Contents: common sets (part A) and trade documents (part B).
    rs = rows(wb["Trade Package Contents"])
    h0, H = header_index(rs, "Part")
    sets, trade_docs, pending = {}, {}, 0
    for r in rs[h0 + 1:]:
        part, setname, comp, lv, dtype, title, status = (r[H[k]] for k in ("Part", "Set / trade", "App component", "Levels", "Doc type", "Title", "DCR production status"))
        if part == "A":
            key = next(k for k in SET_NAMES if setname.startswith(k))
            s = sets.setdefault(key, {"name": SET_NAMES[key], "module": MODULE_OF[comp.split()[0]], "levels": SET_LEVELS[lv], "documents": [], "not_yet_issued": 0})
            if status == ISSUED: s["documents"].append(title)
            else: s["not_yet_issued"] += 1; pending += 1
        elif part == "B":
            t = trade_docs.setdefault(setname, {"trade_swms": [], "hrcw_swms": [], "trade_itps": [], "not_yet_issued": 0})
            kind = DOC_TYPES.get(dtype) or ("trade_itps" if "ITP" in dtype else None)
            if not kind: raise SystemExit(f"unknown doc type {dtype!r}")
            if status == ISSUED: t[kind].append(title)
            else: t["not_yet_issued"] += 1; pending += 1

    # Trade Package Schedule: trades, who, counts per level (checked against the contents).
    rs = rows(wb["Trade Package Schedule"])
    h0, H = header_index(rs, "Trade")
    trades, mismatches = [], []
    for r in rs[h0 + 1:]:
        name = r[H["Trade"]]
        if not name or name.startswith("Total"): continue
        docs = trade_docs.get(name) or {"trade_swms": [], "hrcw_swms": [], "trade_itps": [], "not_yet_issued": 0}
        sched = {"trade_swms": r[H["Trade SWMS"]], "hrcw_swms": r[H["HRCW SWMS selected"]], "trade_itps": r[H["Trade ITPs"]]}
        for k, n in sched.items():
            if len(docs[k]) != n: mismatches.append(f"{name}: schedule {k} {n}, contents lists {len(docs[k])} issued")
        per_level, planned = {}, {}
        for slug, _, short in LEVELS:
            common = sum(len(s["documents"]) for s in sets.values() if slug in s["levels"])
            common_all = common + sum(s["not_yet_issued"] for s in sets.values() if slug in s["levels"])
            per_level[slug] = common + sum(len(docs[k]) for k in sched)
            planned[slug] = r[H[f"Docs: {short}"]]
            if common_all + sum(len(docs[k]) for k in sched) + docs["not_yet_issued"] != planned[slug]:
                mismatches.append(f"{name}: schedule docs {short} {planned[slug]} does not match the contents tab")
        for (slug, _, short), col in zip(LEVELS, ("App Trade Domestic /mo", "App Trade Light Commercial /mo", "App Trade Heavy Commercial /mo")):
            lvl = next(l for l in levels if l["slug"] == slug)
            if r[H[col]] != lvl["price_month"]: mismatches.append(f"{name}: {short} price {r[H[col]]} differs from Trade Packages {lvl['price_month']}")
        trades.append({"slug": slugify(name), "name": name, "who": r[H["Who"]], "documents": {k: docs[k] for k in sched},
                       "documents_by_level": per_level, "documents_by_level_schedule": planned, "has_itps": sched["trade_itps"] > 0, "not_yet_issued": docs["not_yet_issued"]})

    # App Bundles: builder bundles.
    rs = rows(wb["App Bundles"])
    h0, H = header_index(rs, "Bundle")
    bundles = []
    for r in rs[h0 + 1:]:
        if not r[0] or not str(r[0]).startswith("Builder"): continue
        comps = [BUNDLE_COMPONENTS[c] for c in BUNDLE_COMPONENTS if r[H[c]] == 1]
        bundles.append({"slug": slugify(r[0]), "name": r[0], "who": r[H["Who it is for"]],
                        "components": [n for _, n in comps], "modules": [m for m, _ in comps],
                        "reference_projects": r[H["Projects (ref.)"]], "price_month": r[H["Bundle price /mo"]]})

    out = {
        "note": "Generated by scripts/gen-app-packages.py from the SiteGuard Packages and Pricing workbook (tabs Trade Packages, Trade Package Schedule, Trade Package Contents, App Bundles, Levers). Interim: the site reads this until the app products are in packages.py / catalogue.json as group \"app\". Do not edit by hand; regenerate. Prices are A$ a month, ex GST, billed annually unless a loading applies. Documents listed are issued masters only; not_yet_issued counts the rest.",
        "group": "app", "source": {"workbook_revision": rev, "generated": date.today().isoformat()},
        "currency": "AUD", "prices_ex_gst": True,
        "billing": {"default": "annual", "loading": loading},
        "launch": {"presale_from": "2027-03", "opens": "2027-06"},
        "founding": {"places": 20, "discount": 0.15, "term_months": 12, "price_lock_months": 12,
                     "delay": "one free month for each month the June launch slips, or a refund of the unused prepayment",
                     "forms_pack_free_from": "2027-03"},
        "audit": {"seat_month": seat, "ai_photo_checks_per_seat_month": photo_checks, "trial_days": 14,
                  "unlimited": ["clients", "audits"]},
        "levels": levels,
        "common_sets": list(sets.values()),
        "trades": trades,
        "bundles": bundles,
        "not_yet_issued_total": pending,
    }
    dest = Path(__file__).resolve().parent.parent / "data" / "app-packages.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {dest}: {len(trades)} trades, {len(levels)} levels, {len(bundles)} bundles, {pending} documents not yet issued")
    for m in mismatches: print("  check:", m)


if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    main(sys.argv[1])
