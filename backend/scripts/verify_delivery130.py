#!/usr/bin/env python3
"""
DELIVERY130 — independent verification report.

Recomputes every material figure from the published files, reconciles every
artifact against the authoritative dataset, and writes the result to
delivery130/07_Quality_Checks/Verification_Report.md.

Deliberately does NOT import any build script. It re-derives figures from the
published CSVs using its own arithmetic, so a defect in the generators cannot
hide behind a check that shares their logic.
"""
from __future__ import annotations
import csv, json, sys
from collections import defaultdict, Counter
from datetime import datetime, timezone
from pathlib import Path
from openpyxl import load_workbook

BACKEND = Path(__file__).resolve().parents[1]; ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.cohort import counts                       # noqa: E402
PKG = ROOT / "delivery130"; D = PKG / "04_Datasets"; T = "=== PERIOD TOTAL ==="
API = ROOT / "frontend/public/api/v1/nbs"
csv.field_size_limit(10 ** 9)
FOLDERS = ["01_Executive_Summary", "02_Methodology", "03_Excel_Deliveries", "04_Datasets",
           "05_Database_Extracts", "06_Sample_Workbooks", "07_Quality_Checks", "08_References",
           "09_AI_Disclosure", "10_Presentation", "11_Raw_Extractions", "12_System_Exports",
           "13_Database"]

def f(x):
    try: return float(x or 0)
    except (TypeError, ValueError): return 0.0
def qk(l): q, y = l.split("_"); return (int(y), int(q[1:]))
def m(v): return "$%s" % format(v, ",.2f")

def main() -> int:
    R = []; a = R.append
    checks = []   # (section, check, expected, actual, status)
    def chk(sec, name, exp, act, ok): checks.append((sec, name, exp, act, "PASS" if ok else "FAIL"))

    rows = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))
            if r["artist_name"] != T]
    ps = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))
          if r["artist_name"] == T]
    AUTH = sum(f(r["gross_streaming_revenue_usd"]) for r in rows)
    periods = sorted({r["period"] for r in rows}, key=qk)
    artists = sorted({r["artist_name"] for r in rows})
    c = counts()

    # 1 arithmetic, recomputed independently
    tests = {
        "spotify_revenue_usd = listeners x 3.5 x 3 x 0.004":
            lambda r: (f(r["spotify_monthly_listeners"]) * 3.5 * 3 * 0.004, f(r["spotify_revenue_usd"])),
        "youtube_revenue_usd = views x 0.004":
            lambda r: (f(r["youtube_actual_views"]) * 0.004, f(r["youtube_revenue_usd"])),
        "deezer_revenue_usd = fans x 2.0 x 3 x 0.004":
            lambda r: (f(r["deezer_fans"]) * 2.0 * 3 * 0.004, f(r["deezer_revenue_usd"])),
        "other_platforms_usd = spotify x 0.30":
            lambda r: (f(r["spotify_revenue_usd"]) * 0.30, f(r["other_platforms_revenue_usd"])),
        "gross_usd = sum of its four components":
            lambda r: (f(r["spotify_revenue_usd"]) + f(r["youtube_revenue_usd"])
                       + f(r["deezer_revenue_usd"]) + f(r["other_platforms_revenue_usd"]),
                       f(r["gross_streaming_revenue_usd"])),
        "gross_ngn = gross_usd x 1500":
            lambda r: (f(r["gross_streaming_revenue_usd"]) * 1500, f(r["gross_streaming_revenue_ngn"])),
        "est_spotify_quarterly_streams = listeners x 3.5 x 3":
            lambda r: (round(f(r["spotify_monthly_listeners"]) * 3.5 * 3), f(r["est_spotify_quarterly_streams"])),
    }
    for name, fn in tests.items():
        bad = [r for r in rows if abs(fn(r)[0] - fn(r)[1]) > 0.02]
        chk("Arithmetic", name, "0 failing rows", "%d of %s" % (len(bad), format(len(rows), ",")), not bad)

    byq = defaultdict(float)
    for r in rows: byq[r["period"]] += f(r["gross_streaming_revenue_usd"])
    mm = [r["period"] for r in ps if abs(f(r["gross_streaming_revenue_usd"]) - byq[r["period"]]) > 0.02]
    chk("Aggregation", "period-total rows equal the sum of their quarter", "31 match", "%d mismatch" % len(mm), not mm)

    # 2 keys, nulls, ranges
    dup = [k for k, v in Counter((r["period"], r["artist_name"]) for r in rows).items() if v > 1]
    chk("Integrity", "no duplicate (period, artist)", "0", str(len(dup)), not dup)
    chk("Integrity", "distinct artists", str(c["distinct_artists"]), str(len(artists)), len(artists) == c["distinct_artists"])
    chk("Integrity", "distinct quarters", "31", str(len(periods)), len(periods) == 31)
    neg = [r for r in rows if f(r["gross_streaming_revenue_usd"]) < 0]
    chk("Integrity", "no negative revenue", "0", str(len(neg)), not neg)
    blank = [r for r in rows if not r["period"] or not r["artist_name"]]
    chk("Integrity", "no blank key fields", "0", str(len(blank)), not blank)
    lab = [r for r in rows if not (r.get("youtube_views_source") or "").strip()]
    chk("Provenance", "every row states its YouTube volume basis", "0 unlabelled", str(len(lab)), not lab)

    ex = [r for r in csv.DictReader((D / "Gross_Export_Revenue.csv").open(encoding="utf-8"))
          if r["artist_name"] != T]
    badpct = [r for r in ex if r["nigeria_domestic_share_pct"] not in ("", None)
              and not (0 <= f(r["nigeria_domestic_share_pct"]) <= 100)]
    chk("Integrity", "domestic share within 0-100%", "0 out of range", str(len(badpct)), not badpct)
    split = [r for r in ex if r["nigeria_domestic_share_pct"] not in ("", None)]
    badsum = [r for r in split if abs(f(r["nigeria_domestic_share_pct"]) + f(r["export_share_pct"]) - 100) > 0.01]
    chk("Integrity", "domestic% + export% = 100 where measured", "0", str(len(badsum)), not badsum)
    zero_as_blank = [r for r in ex if r["gross_export_revenue_usd"] == "0.0"]
    chk("Classification", "unmeasured export is BLANK, never zero", "0 zeros", str(len(zero_as_blank)), not zero_as_blank)

    # 3 cross-artifact
    def xlsum(fn, sheet, col, akey=None):
        wb = load_workbook(PKG / "03_Excel_Deliveries" / fn, read_only=True, data_only=True)
        sh = wb[sheet]; it = sh.iter_rows(values_only=True); h = list(next(it))
        gi = h.index(col); ai = h.index(akey) if akey else None; t = 0.0
        for r in it:
            if ai is not None and r[ai] == T: continue
            t += r[gi] or 0
        wb.close(); return t
    arts = [("Excel 1 Gross_Streaming_Revenue", xlsum("1_Gross_Streaming_Revenue.xlsx", "Streaming_Revenue", "gross_streaming_revenue_usd", "artist_name")),
            ("Excel 5 Artist_Totals", xlsum("5_Artist_Platform_Performance.xlsx", "Artist_Totals", "total_gross_usd")),
            ("11_Raw_Extractions copy", sum(f(r["gross_streaming_revenue_usd"]) for r in
                csv.DictReader((PKG / "11_Raw_Extractions/1_gross_streaming_revenue.csv").open(encoding="utf-8")) if r["artist_name"] != T)),
            ("05_Database_Extracts coverage", sum(f(r["gross_streaming_revenue_usd"]) for r in
                csv.DictReader((PKG / "05_Database_Extracts/coverage_by_quarter.csv").open(encoding="utf-8")))),
            ("14_Growth_Projection observed", sum(f(r["observed_usd"]) for r in
                csv.DictReader((PKG / "14_Growth_Projection/Growth_Projection_Quarterly.csv").open(encoding="utf-8")))),
            ]
    if (API / "summary.json").exists():
        s = json.loads((API / "summary.json").read_text())
        arts.append(("Platform summary.json", sum(e["gross_streaming_revenue_usd"] for e in s["streaming_revenue"])))
        chk("Platform", "platform artist_count equals the package", str(len(artists)), str(s["artist_count"]), s["artist_count"] == len(artists))
        chk("Platform", "platform declares its scope", "cohort130", str(s.get("scope")), s.get("scope") == "cohort130")
    for n, v in arts:
        chk("Cross-artifact", n, m(AUTH), m(v), abs(v - AUTH) < 0.05)

    nf = 0
    for fp in sorted((PKG / "03_Excel_Deliveries").glob("*.xlsx")):
        w = load_workbook(fp, data_only=False)
        for ws in w.worksheets:
            for row in ws.iter_rows():
                for cc in row:
                    if cc.data_type == "f": nf += 1
        w.close()
    chk("Excel", "no cell stored as a formula", "0", str(nf), nf == 0)

    # 4 structure
    missing = [d for d in FOLDERS if not (PKG / d).is_dir()]
    chk("Structure", "all 13 submission folders present", "13", str(13 - len(missing)), not missing)
    empty = [d for d in FOLDERS if (PKG / d).is_dir() and not any((PKG / d).rglob("*"))]
    chk("Structure", "no folder is empty", "0", str(len(empty)), not empty)

    passed = sum(1 for x in checks if x[4] == "PASS")
    verdict = "VERIFIED" if passed == len(checks) else "NOT VERIFIED"

    a("# Verification Report — DELIVERY130\n")
    a("Generated %s by `backend/scripts/verify_delivery130.py`, which recomputes every figure"
      % datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    a("from the published files using its own arithmetic. It imports no build script, so a")
    a("defect in the generators cannot hide behind a check that shares their logic.\n")
    a("## 1. Overall status\n")
    a("## **%s** — %d of %d checks pass.\n" % (verdict, passed, len(checks)))
    a("## 2. Source of truth\n")
    a("`delivery130/04_Datasets/Gross_Streaming_Revenue.csv`, excluding its 31")
    a("`=== PERIOD TOTAL ===` pseudo-rows.\n")
    a("**Authoritative gross streaming revenue: %s** (₦%s) over %d artists and %d quarters,"
      % (m(AUTH), format(AUTH * 1500, ",.2f"), len(artists), len(periods)))
    a("across %s artist-quarter rows.\n" % format(len(rows), ","))
    a("> Summing that file **without** excluding the pseudo-rows gives %s — exactly double."
      % m(AUTH * 2))
    a("> The rows are reproduced because the first submission carried them; they are a trap")
    a("> for any reviewer who sums the column blind, and are called out here for that reason.\n")
    a("## 3. Results\n")
    a("| Section | Check | Expected | Actual | Status |")
    a("|---|---|---|---|---|")
    for sec, name, exp, act, st in checks:
        a("| %s | %s | %s | %s | %s |" % (sec, name, exp, act, "PASS" if st == "PASS" else "**FAIL**"))
    a("")
    a("## 4. Per-quarter reconciliation\n")
    a("| Quarter | Artists | Gross USD | Gross NGN |")
    a("|---|---:|---:|---:|")
    for p in periods:
        n = len({r["artist_name"] for r in rows if r["period"] == p})
        a("| %s | %d | %s | ₦%s |" % (p.replace("_", " "), n, m(byq[p]), format(byq[p] * 1500, ",.0f")))
    a("| **Total** | **%d** | **%s** | **₦%s** |\n" % (len(artists), m(AUTH), format(AUTH * 1500, ",.0f")))
    a("## 5. Incomplete quarter disclosed\n")
    q3 = byq.get("Q3_2026", 0.0)
    a("Q3 2026 is an unfinished quarter — the revenue series end 2026-08-11 (45.7% of the quarter), the quarter closes")
    a("2026-09-30. It is included in the headline at %s, **%.2f%%** of the total."
      % (m(q3), q3 / AUTH * 100))
    a("Restricted to the %d complete quarters the figure is **%s**. It is excluded from"
      % (len(periods) - 1, m(AUTH - q3)))
    a("every growth calculation. Both totals are published so neither is mistaken for the")
    a("other.\n")
    a("## 6. What a reviewer can reproduce without this system\n")
    a("Every published figure derives from other published columns by the identities in")
    a("section 3. A reviewer needs only `04_Datasets/Gross_Streaming_Revenue.csv` and a")
    a("spreadsheet to check all %s rows.\n" % format(len(rows), ","))
    a("## 7. What this report does NOT establish\n")
    a("- That a provider's audience figure is itself correct. That is the provider's")
    a("  measurement, and no check here can confirm it.")
    a("- That the per-unit rates match what a platform actually paid. No platform reports")
    a("  payouts to this system; the rates are documented assumptions.")
    a("- That estimated rows are close to the truth. They are labelled, not validated.")
    a("- The growth projection describes quarters that have not happened. It is not a")
    a("  measurement and is excluded from every reconciliation above.\n")
    (PKG / "07_Quality_Checks" / "Verification_Report.md").write_text("\n".join(R), encoding="utf-8")

    print("VERDICT: %s  (%d/%d checks pass)" % (verdict, passed, len(checks)))
    for sec, name, exp, act, st in checks:
        if st != "PASS": print("  FAIL  %-14s %-52s expected %s got %s" % (sec, name, exp, act))
    print("  authoritative total: %s" % m(AUTH))
    return 0 if verdict == "VERIFIED" else 1

if __name__ == "__main__":
    raise SystemExit(main())
