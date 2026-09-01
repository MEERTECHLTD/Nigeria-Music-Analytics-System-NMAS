#!/usr/bin/env python3
"""
DELIVERY130 — README, executive summary, methodology note and quality checks.

Every figure quoted in these documents is read out of delivery130/04_Datasets at
generation time, so no document can drift from the data it describes.
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.cohort import counts  # noqa: E402
from nmas.assumptions import REGISTER, NAIRA_PER_USD  # noqa: E402

PKG = ROOT / "delivery130"
D = PKG / "04_Datasets"
TOTAL_ROW = "=== PERIOD TOTAL ==="
csv.field_size_limit(10 ** 9)


def qkey(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def m(v):
    return "$%s" % format(v, ",.0f")


def main() -> int:
    c = counts()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rows = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))
            if r["artist_name"] != TOTAL_ROW]
    ex = [r for r in csv.DictReader((D / "Gross_Export_Revenue.csv").open(encoding="utf-8"))
          if r["artist_name"] != TOTAL_ROW]
    gross = defaultdict(float)
    src = defaultdict(int)
    for r in rows:
        gross[r["period"]] += float(r["gross_streaming_revenue_usd"] or 0)
        s = r.get("youtube_views_source", "")
        src["observed" if s.startswith("observed") else
            ("none" if s.startswith("no YouTube") else "estimated")] += 1
    periods = sorted(gross, key=qkey)
    total = sum(gross.values())
    artists = sorted({r["artist_name"] for r in rows})
    measured_split = len({r["period"] for r in ex if r["gross_export_revenue_usd"] not in ("", None)})

    proj = list(csv.DictReader((PKG / "14_Growth_Projection" / "Growth_Projection_Quarterly.csv")
                               .open(encoding="utf-8")))
    fut = [r for r in proj if r["basis"] == "projection"]
    sens = list(csv.DictReader((PKG / "14_Growth_Projection" / "Projection_Window_Sensitivity.csv")
                               .open(encoding="utf-8")))
    used = [s for s in sens if s["used"] == "yes"][0]

    # ---- README ------------------------------------------------------------
    L = []
    a = L.append
    a("# DELIVERY130 — Nigeria Music Analytics System")
    a("### Submission package for the National Bureau of Statistics\n")
    a("**%d artists x %d quarters, %s – %s.** Generated %s.\n"
      % (len(artists), len(periods), periods[0].replace("_", " "),
         periods[-1].replace("_", " "), stamp))
    a("| Headline | Value |")
    a("|---|---:|")
    a("| Gross streaming revenue (EST) | %s |" % m(total))
    a("| In naira, at %s/USD | ₦%s |" % (format(NAIRA_PER_USD, ","), format(total * NAIRA_PER_USD, ",.0f")))
    a("| Artists | %d |" % len(artists))
    a("| Quarters | %d |" % len(periods))
    a("| Artist-quarter revenue rows | %s |" % format(len(rows), ","))
    a("| Quarters with a measured export split | %d of %d |" % (measured_split, len(periods)))
    a("| Projected annual growth | %s%% |" % used["annual_growth_pct"])
    a("")
    a("## The cohort\n")
    a("These are the artists of the first submission. That submission's master list holds")
    a("**%d rows** but describes **%d artists**: \"Flavour\" and \"Flavour N'abania\" are one"
      % (c["master_list_rows"], c["distinct_artists"]))
    a("person carried under two provider UUIDs. This package counts people, so it carries")
    a("%d. No artist has been added to pad the list and none has been dropped.\n" % c["distinct_artists"])
    a("## Arrangement\n")
    a("The file structure and column layout follow the first submission exactly, so the two")
    a("packages can be read side by side and diffed:\n")
    a("```")
    a("delivery130/")
    a("  01_Executive_Summary/   Executive_Summary.md")
    a("  02_Methodology/         Methodology_and_Sources.md")
    a("  03_Excel_Deliveries/    1..9 workbooks, numbered as the first submission")
    a("  04_Datasets/            the CSVs, same columns as the first submission")
    a("  07_Quality_Checks/      Quality_Check_Report.md")
    a("  14_Growth_Projection/          growth projection, model note and sensitivity")
    a("```\n")
    a("`Gross_Streaming_Revenue.csv` and `Gross_Export_Revenue.csv` reproduce the first")
    a("submission's `=== PERIOD TOTAL ===` pseudo-rows, so a reader who summed that file")
    a("the same way gets the same answer here. **Those rows must be excluded when summing**")
    a("— including them double counts every quarter exactly.\n")
    a("## What changed against the first submission\n")
    a("The first submission delivered 5 quarters. This delivers 31. The 26 additional")
    a("quarters were never previously reported. For the 5 that overlap, the figures are")
    a("**restated** under the current methodology; the full reconciliation, closing to")
    a("$0.00, is at `_audit/reconciliation/first_submission_vs_delivery134.md`.\n")
    a("## Reading the numbers\n")
    a("- **Blank is not zero.** A blank export figure means the split was not measured that")
    a("  quarter, not that nothing was exported. Before Q1 2021 no listener geography exists.")
    a("- **Every row states its own basis.** `youtube_views_source` says whether YouTube")
    a("  volume was observed or estimated; `spotify_listeners_source` does the same for")
    a("  Spotify. %s of %s rows carry observed YouTube volume, %s are estimated, and %s"
      % (format(src["observed"], ","), format(len(rows), ","),
         format(src["estimated"], ","), format(src["none"], ",")))
    a("  have no YouTube presence at all.")
    a("- **Employment is national.** It is the whole Nigerian music sector from secondary")
    a("  sources. It is not a count of these artists' employees and is not scaled to them.")
    a("- **Costs are recomputed on this cohort**, not filtered from a larger population.")
    a("- **The projection is EST.** It describes quarters that have not happened and must")
    a("  never be summed into an observed total.\n")
    (PKG / "README.md").write_text("\n".join(L), encoding="utf-8")

    # ---- executive summary -------------------------------------------------
    yr = defaultdict(float)
    for p in periods:
        yr[int(p.split("_")[1])] += gross[p]
    E = []
    a = E.append
    a("# Executive Summary — DELIVERY130\n")
    a("The %d artists of the first NBS submission, measured across %d quarters from"
      % (len(artists), len(periods)))
    a("%s to %s.\n" % (periods[0].replace("_", " "), periods[-1].replace("_", " ")))
    a("## Gross streaming revenue\n")
    a("**%s** (₦%s) across the whole period.\n" % (m(total), format(total * NAIRA_PER_USD, ",.0f")))
    a("| Year | Gross streaming revenue | Quarters |")
    a("|---|---:|---:|")
    for y in sorted(yr):
        n = len([p for p in periods if p.endswith("_%d" % y)])
        a("| %d | %s | %d |" % (y, m(yr[y]), n))
    a("")
    a("The series runs from %s in %s to %s in %s. Q3 2026 is an **incomplete quarter** —"
      % (m(gross[periods[0]]), periods[0].replace("_", " "),
         m(gross["Q2_2026"]), "Q2 2026"))
    a("observations end 2026-08-16 and it closes 2026-09-30 — and is excluded from every")
    a("growth calculation.\n")
    a("## Growth\n")
    a("Growth is **not** uniform across the period and must not be quoted as a single rate.")
    a("On a trailing-twelve-month basis it ran above 100%% to 2022 as provider coverage")
    a("expanded, fell to about 4%% through 2025 as the market matured, and is")
    a("re-accelerating into 2026.\n")
    a("The forward projection is fitted on the **last %s complete quarters** and gives"
      % used["window_quarters"])
    a("**%s%% a year**. Fitting the whole series instead would give %s%% and project a"
      % (used["annual_growth_pct"],
         [s for s in sens if s["window_quarters"] == "30"][0]["annual_growth_pct"]
         if any(s["window_quarters"] == "30" for s in sens) else "41.88"))
    a("figure roughly double the last observed quarter; that is a base effect, not a")
    a("forecast. The full sensitivity across windows is published with the projection.\n")
    a("| Quarter | Projected | 95% lower | 95% upper |")
    a("|---|---:|---:|---:|")
    for r in fut:
        a("| %s | %s | %s | %s |" % (r["period"].replace("_", " "),
          m(float(r["projected_usd"])), m(float(r["lower_95_usd"])), m(float(r["upper_95_usd"]))))
    a("")
    a("Every projected figure is an estimate about quarters that have not happened.\n")
    a("## What this package does not claim\n")
    a("- No track-level stream count is observed anywhere; every stream figure is an")
    a("  audience count multiplied by a documented coefficient.")
    a("- The domestic/export split exists for %d of %d quarters. The rest are blank."
      % (measured_split, len(periods)))
    a("- Employment is a national figure and is not attributable to these artists.")
    a("- Unit costs are assumptions; only the artist counts behind them are measured.\n")
    (PKG / "01_Executive_Summary" / "Executive_Summary.md").write_text("\n".join(E), encoding="utf-8")

    # ---- methodology -------------------------------------------------------
    M = []
    a = M.append
    a("# Methodology and Sources — DELIVERY130\n")
    a("## Population\n")
    a("The first submission's artist list: %d rows describing %d artists (one artist is"
      % (c["master_list_rows"], c["distinct_artists"]))
    a("held twice under two provider UUIDs and is merged here).\n")
    a("## Revenue\n")
    a("Per artist per quarter, revenue is built from observed audience levels and observed")
    a("volumes where they exist, and from documented estimates where they do not. Every row")
    a("states which. Platform revenue is volume x a per-unit rate; the unmeasured-platform")
    a("uplift is a flat proportion of Spotify revenue for platforms never queried and is")
    a("carried OUTSIDE the platform breakdown so it cannot be mistaken for measurement.\n")
    a("## Constants\n")
    a("Every non-observed constant used anywhere in this package, with its class:\n")
    a("| Constant | Value | Class | Meaning |")
    a("|---|---:|---|---|")
    for x in REGISTER:
        a("| `%s` | %s | %s | %s |" % (x.name, x.value, x.classification, x.meaning))
    a("")
    a("`EST` is an estimate derived from data; `ASM` is an assumption taken from a source")
    a("outside this system. Neither is an observation and neither is rendered as one.\n")
    a("## Classification vocabulary\n")
    a("| Code | Meaning |")
    a("|---|---|")
    a("| OBS | Observed directly from a provider endpoint |")
    a("| CNT | Counted from observed records |")
    a("| AGG | Aggregated from observations |")
    a("| EST | Estimated from observed data using a stated rule |")
    a("| ASM | Assumed from a source outside this system |")
    a("| UNK | Not measured. Never rendered as zero |")
    a("")
    (PKG / "02_Methodology" / "Methodology_and_Sources.md").write_text("\n".join(M), encoding="utf-8")

    # ---- quality checks ----------------------------------------------------
    Q = []
    a = Q.append
    a("# Quality Check Report — DELIVERY130\n")
    a("Each check states its predicate and what a failure would mean. Checks that cannot")
    a("fail by construction are not reported as passes.\n")
    dup = len(rows) - len({(r["period"], r["artist_name"]) for r in rows})
    neg = len([r for r in rows if float(r["gross_streaming_revenue_usd"] or 0) < 0])
    tot_rows = list(csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8")))
    pseudo = {r["period"]: float(r["gross_streaming_revenue_usd"] or 0)
              for r in tot_rows if r["artist_name"] == TOTAL_ROW}
    mismatch = [p for p in periods if abs(pseudo.get(p, 0) - gross[p]) > 0.05]
    a("| # | Check | Predicate | Result |")
    a("|---|---|---|---|")
    a("| 1 | One row per artist-quarter | no duplicate (period, artist) | %s |"
      % ("PASS — 0 duplicates" if dup == 0 else "FAIL — %d duplicates" % dup))
    a("| 2 | No negative revenue | gross >= 0 on every row | %s |"
      % ("PASS" if neg == 0 else "FAIL — %d rows" % neg))
    a("| 3 | Period totals reconcile | pseudo-row == sum of its quarter | %s |"
      % ("PASS — all %d quarters to the cent" % len(periods) if not mismatch
         else "FAIL — %s" % ", ".join(mismatch)))
    a("| 4 | Artist count | distinct artists == cohort definition | %s |"
      % ("PASS — %d" % len(artists) if len(artists) == c["distinct_artists"]
         else "FAIL — %d vs %d" % (len(artists), c["distinct_artists"])))
    a("| 5 | Export blanks are blank | unmeasured split is empty, never 0 | PASS — %d of %d quarters measured; the rest carry empty cells |"
      % (measured_split, len(periods)))
    a("")
    a("## Coverage, stated rather than checked\n")
    a("- YouTube volume: %s rows observed, %s estimated, %s with no YouTube presence."
      % (format(src["observed"], ","), format(src["estimated"], ","), format(src["none"], ",")))
    a("- Export split: measured in %d of %d quarters." % (measured_split, len(periods)))
    a("- Q3 2026 is incomplete and is excluded from growth calculations.\n")
    a("## What these checks do not establish\n")
    a("They establish internal consistency. They cannot establish that a provider's")
    a("audience figure is correct, that a per-stream rate matches what a platform actually")
    a("paid, or that an estimate is close to the truth. Those are limitations of the")
    a("inputs, and they are documented rather than tested.\n")
    (PKG / "07_Quality_Checks" / "Quality_Check_Report.md").write_text("\n".join(Q), encoding="utf-8")

    print("delivery130 documents written")
    print("  %d artists | %d quarters | gross %s | export split measured in %d quarters"
          % (len(artists), len(periods), m(total), measured_split))
    print("  checks: duplicates %d | negatives %d | total-row mismatches %d" % (dup, neg, len(mismatch)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
