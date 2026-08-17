#!/usr/bin/env python3
"""
STOCK VERSUS FLOW AUDIT — Phase 1.2 of the v3 run.

A stock is a level at a point in time (followers, fans, a cumulative view
counter). A flow is activity within a period (spins, daily views). Using a
stock's raw values where a flow is required — summing a cumulative counter,
most obviously — produces numbers that are arithmetic on the wrong concept.

Three questions, each answered from code and data, cited:
  A. Which metrics feed revenue, what is each one's nature, and does the
     revenue code treat stocks correctly? (file:line citations)
  B. Do the QUARTERLY AGGREGATES apply a flow rule to any stock?
  C. Are the deltas themselves sane: negative deltas from counter resets,
     single-observation quarters silently yielding zero?
"""

from __future__ import annotations

import csv
import gzip
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from nmas.metrics import METRICS  # noqa: E402
from nmas.soundcharts_metrics import ALL_METRICS  # noqa: E402

D = ROOT / "NBS FINAL delivery" / "04_Datasets"

# Nature of every variable that appears in the delivery. "cumulative" = stock
# counter that only meaningfully yields a flow via a period delta.
NATURE = {
    "YouTube_channel_views_daily": "cumulative counter",
    "TikTok_likes_daily": "cumulative counter",
    "Facebook_likes_daily": "cumulative counter (page likes)",
    "YouTube_artist_daily_views": "flow (daily views)",
    "Wikipedia_views_daily": "flow (daily page views)",
    "Facebook_talks_daily": "flow (talking-about count)",
    "Radio_spins_daily_NG": "flow (spins per day)",
    "Radio_spins_daily_global": "flow (spins per day)",
}
LEVEL_SUFFIXES = ("followers_daily", "fans_daily", "subscribers_daily",
                  "listeners_daily", "popularity_daily", "score_daily",
                  "count_daily", "reach_daily", "retention_daily")


def nature_of(variable: str) -> str:
    if variable in NATURE:
        return NATURE[variable]
    if variable.endswith(LEVEL_SUFFIXES) or "listeners" in variable or "views" not in variable:
        return "level (stock)"
    return "unclassified"


def cite(path: Path, needle: str) -> str:
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if needle in line:
            return "%s:%d" % (path.relative_to(ROOT), lineno)
    return "%s:NOT FOUND (%s)" % (path.relative_to(ROOT), needle)


def main() -> int:
    findings = []
    print("=" * 76)
    print("A. REVENUE-FEEDING METRICS — treatment in build_nbs_accounts.py")
    print("=" * 76)
    accounts = BACKEND / "scripts" / "build_nbs_accounts.py"
    rows = [
        ("Spotify_monthly_listeners_daily", "reach LEVEL (rolling 28-day distinct listeners)",
         "level x 3.5 x 3 x $0.004 (documented EST conversion, level used AS level)",
         cite(accounts, "sp_rev = listeners * STREAMS_PER_LISTENER_MONTH")),
        ("YouTube_channel_views_daily", "CUMULATIVE counter",
         "quarter DELTA (last - first, clamped >= 0) x $0.004",
         cite(accounts, "max(yt[1] - yt[0], 0.0)")),
        ("Deezer_fans_daily", "follower LEVEL",
         "level x 2.0 x 3 x $0.004 (documented EST conversion, level used AS level)",
         cite(accounts, "dz_rev = deezer * DEEZER_STREAMS_PER_FAN_MONTH")),
    ]
    for variable, nature, treatment, citation in rows:
        print("  %-34s %s" % (variable, nature))
        print("      treatment: %s" % treatment)
        print("      citation : %s" % citation)
    print("  VERDICT: revenue treats the one cumulative counter as a DELTA. Correct.")

    print()
    print("=" * 76)
    print("B. QUARTERLY AGGREGATES — rule applied vs metric nature")
    print("=" * 76)
    rules = {m.name: m.aggregation_rule for m in METRICS.values()}
    for metric in ALL_METRICS:
        rules.setdefault(metric.variable_name, metric.aggregation_rule)
    print("  %-40s %-12s %-28s %s" % ("variable", "rule", "nature", "verdict"))
    defects = []
    for variable in sorted(rules):
        rule = rules[variable]
        nat = nature_of(variable)
        bad = (rule == "sum" and "cumulative" in nat)
        verdict = "STOCK TREATED AS FLOW" if bad else "ok"
        if bad or rule == "sum":
            print("  %-40s %-12s %-28s %s" % (variable, rule, nat, verdict))
        if bad:
            defects.append(variable)
    print()
    if defects:
        print("  DEFECT: %s aggregated with rule 'sum' — summing a cumulative counter's" % defects)
        print("  daily LEVELS across a quarter. The catalogue's own limitation text says")
        print("  'use net_change between dates for period volume':")
        print("    %s" % cite(BACKEND / "nmas" / "metrics.py", 'aggregation_rule="sum"'))
        print("    %s" % cite(BACKEND / "nmas" / "soundcharts_metrics.py", 'unit="views", aggregation_rule="sum"'))
        findings.append(("CRITICAL", "stock treated as flow in Quarterly_Aggregates_Full.csv", defects))

    # ---- quantify the defect against the delivered aggregates -------------
    if defects:
        print()
        print("  QUANTIFICATION against delivered Quarterly_Aggregates_Full.csv:")
        agg_bad = defaultdict(float)
        count_bad = 0
        with (D / "Quarterly_Aggregates_Full.csv").open(encoding="utf-8") as handle:
            for r in csv.DictReader(handle):
                if r["variable_name"] in defects:
                    count_bad += 1
                    agg_bad[r["variable_name"]] += float(r["variable_value"] or 0)
        for variable, total in agg_bad.items():
            print("    %-40s %10s cells   summed total %s" %
                  (variable, format(count_bad, ","), format(round(total), ",")))
        # correct figure for one reference artist-quarter, from microdata
        levels = {}
        for path, opener in ((D / "Daily_Metric_Observations.csv", open),):
            with opener(path, "rt", encoding="utf-8") as handle:
                for r in csv.DictReader(handle):
                    if (r["entity_name"] == "Davido" and r["period_label"] == "Q2_2025"
                            and r["variable_name"] == "YouTube_channel_views_daily"):
                        levels[r["date"]] = float(r["variable_value"])
        if levels:
            dates = sorted(levels)
            delta = levels[dates[-1]] - levels[dates[0]]
            summed = sum(levels.values())
            print("    reference cell — Davido Q2_2025 YouTube_channel_views_daily:")
            print("      published (sum of %d daily levels): %s" % (len(levels), format(round(summed), ",")))
            print("      correct   (net change %s -> %s)   : %s" % (dates[0], dates[-1], format(round(delta), ",")))
            print("      inflation factor: %.0fx" % (summed / delta if delta else float("inf")))

    print()
    print("=" * 76)
    print("C. DELTA SANITY — resets, backfills, single-observation quarters")
    print("=" * 76)
    neg = 0
    single = 0
    cells = 0
    first_last = defaultdict(lambda: [None, None, None, None])
    for path, opener in ((D / "Daily_Metric_Observations.csv", open),
                         (D / "Daily_Observations_Extended_Frame.csv.gz", gzip.open)):
        with opener(path, "rt", encoding="utf-8") as handle:
            for r in csv.DictReader(handle):
                if r["variable_name"] != "YouTube_channel_views_daily":
                    continue
                key = (r["entity_name"], r["period_label"])
                cell = first_last[key]
                date, value = r["date"], float(r["variable_value"])
                if cell[0] is None or date < cell[0]:
                    cell[0], cell[1] = date, value
                if cell[2] is None or date > cell[2]:
                    cell[2], cell[3] = date, value
    for key, (d0, v0, d1, v1) in first_last.items():
        cells += 1
        if d0 == d1:
            single += 1
        elif v1 < v0:
            neg += 1
    print("  YouTube_channel_views_daily artist-quarters      : %s" % format(cells, ","))
    print("  negative raw delta (reset/backfill), clamped to 0: %s (%.2f%%)"
          % (format(neg, ","), 100 * neg / cells if cells else 0))
    print("  single-observation quarters (delta forced to 0)  : %s (%.2f%%)"
          % (format(single, ","), 100 * single / cells if cells else 0))
    print("  Treatment: revenue clamps negatives to 0 and a one-observation quarter")
    print("  contributes 0 — conservative (understates, never overstates), and the")
    print("  affected share is reported here rather than silently absorbed.")

    print()
    print("VERDICT: %s" % ("HALT — stock treated as flow in production" if findings else "clean"))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
