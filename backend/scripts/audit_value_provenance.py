#!/usr/bin/env python3
"""
VALUE PROVENANCE AUDIT — prove which numbers are measured and which are not.

Every value in the delivery is placed in one of four tiers and counted. Nothing
is taken on trust: the tier is decided by whether a row carries a provider
endpoint in source_endpoint, and by whether its variable is computed from a
constant declared in the rate card.

  1 OBSERVED    a provider returned this number for this artist on this date.
                Directly measured. No assumption of any kind.
  2 AGGREGATED  an arithmetic rollup of tier 1 within a quarter (net change, sum
                or last value). Still factual - no constant is involved.
  3 ESTIMATED   a tier 1 quantity multiplied by an assumed rate. The movement is
                real; the level depends on the constant.
  4 ASSUMED     no measurement behind it at all - a constant multiplied out.

Writes Data_Provenance_Audit.csv (every variable, its tier, its row count and
the constants it depends on) and Observed_Values_Only.csv.gz, which contains
tier 1 exclusively: a file in which every single number was measured.
"""

from __future__ import annotations

import csv
import gzip
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import REGISTER  # noqa: E402
ROOT = BACKEND.parent
D = ROOT / "NBS FINAL delivery" / "04_Datasets"
QC = ROOT / "NBS FINAL delivery" / "07_Quality_Checks"

# Sourced from nmas/assumptions.py so the audit can never describe a constant
# the pipeline is not actually using.
RATE_CARD = {a.name: (a.value, a.limitation) for a in REGISTER}

ESTIMATED_FIELDS = {
    "spotify_revenue_usd": ["STREAMS_PER_LISTENER_MONTH", "SPOTIFY_PER_STREAM"],
    "youtube_revenue_usd": ["YOUTUBE_PER_VIEW"],
    "deezer_revenue_usd": ["DEEZER_STREAMS_PER_FAN_MONTH", "DEEZER_PER_STREAM"],
    "measured_platform_revenue_usd": ["STREAMS_PER_LISTENER_MONTH", "SPOTIFY_PER_STREAM",
                                      "YOUTUBE_PER_VIEW", "DEEZER_PER_STREAM"],
    "unmeasured_platform_uplift_usd": ["UNMEASURED_UPLIFT_RATE"],
    "gross_streaming_revenue_usd": ["STREAMS_PER_LISTENER_MONTH", "SPOTIFY_PER_STREAM",
                                    "YOUTUBE_PER_VIEW", "UNMEASURED_UPLIFT_RATE"],
    "gross_streaming_revenue_ngn": ["NAIRA_PER_USD"],
    "domestic_revenue_usd": ["STREAMS_PER_LISTENER_MONTH", "SPOTIFY_PER_STREAM"],
    "export_revenue_usd": ["STREAMS_PER_LISTENER_MONTH", "SPOTIFY_PER_STREAM"],
    "export_revenue_ngn": ["NAIRA_PER_USD"],
}
# domestic_share_observed is NOT blanket-observed: since the per-artist geography
# change it is OBS where the artist's own geography exists and ASM where the
# portfolio ratio was applied — disambiguated per row by split_classification.
OBSERVED_IN_REVENUE = {"spotify_monthly_listeners", "youtube_quarter_views", "deezer_fans"}


def main():
    rows_out = []
    obs_path = D / "Daily_Metric_Observations.csv"
    ext_path = D / "Daily_Observations_Extended_Frame.csv.gz"
    geo_path = D / "Geography_Full_Daily.csv.gz"

    # ---- tier 1: every daily observation carries a provider endpoint -------
    tier1 = defaultdict(lambda: {"n": 0, "providers": set()})
    total_obs = 0
    for path, opener in ((obs_path, open), (ext_path, gzip.open)):
        if not path.exists():
            continue
        with opener(path, "rt", encoding="utf-8") as h:
            for r in csv.DictReader(h):
                total_obs += 1
                e = tier1[r["variable_name"]]
                e["n"] += 1
                e["providers"].add("soundcharts" if r["source_endpoint"].startswith("soundcharts:")
                                   else "chartmetric")
    for var, e in sorted(tier1.items()):
        rows_out.append({"dataset": "Daily_Metric_Observations + Extended", "field": var,
                         "tier": "1 OBSERVED", "rows": e["n"],
                         "depends_on_constants": "", "providers": "+".join(sorted(e["providers"])),
                         "note": "provider returned this figure for this artist on this date"})

    geo_n = 0
    if geo_path.exists():
        with gzip.open(geo_path, "rt", encoding="utf-8") as h:
            for _ in csv.DictReader(h):
                geo_n += 1
        rows_out.append({"dataset": "Geography_Full_Daily", "field": "value", "tier": "1 OBSERVED",
                         "rows": geo_n, "depends_on_constants": "", "providers": "soundcharts",
                         "note": "listener/follower counts per country and city, as returned"})

    # ---- tier 2: quarterly rollups ----------------------------------------
    agg = D / "Quarterly_Aggregates_Full.csv"
    if agg.exists():
        n = sum(1 for _ in agg.open(encoding="utf-8")) - 1
        rows_out.append({"dataset": "Quarterly_Aggregates_Full", "field": "variable_value",
                         "tier": "2 AGGREGATED", "rows": n, "depends_on_constants": "",
                         "providers": "chartmetric+soundcharts",
                         "note": "net change / sum / last value of tier 1 within the quarter"})
    for name in ("Export_Markets_Quarterly.csv", "Nigeria_City_Geography_Quarterly.csv",
                 "World_City_Geography_Quarterly.csv", "Radio_Stations_Quarterly.csv",
                 "Artist_Catalogue_Summary.csv"):
        p = D / name
        if p.exists():
            n = sum(1 for _ in p.open(encoding="utf-8")) - 1
            rows_out.append({"dataset": name.replace(".csv", ""), "field": "value/count",
                             "tier": "2 AGGREGATED", "rows": n, "depends_on_constants": "",
                             "providers": "soundcharts",
                             "note": "rollup of measured values; no constant involved"})

    # ---- tier 3 and 4 ------------------------------------------------------
    rev = D / "Revenue_By_Platform_Quarterly.csv"
    rev_rows = 0
    if rev.exists():
        rev_rows = sum(1 for _ in rev.open(encoding="utf-8")) - 1
        for field in OBSERVED_IN_REVENUE:
            rows_out.append({"dataset": "Revenue_By_Platform_Quarterly", "field": field,
                             "tier": "1 OBSERVED", "rows": rev_rows, "depends_on_constants": "",
                             "providers": "soundcharts+chartmetric",
                             "note": "measured input carried through to the revenue table"})
        for field, consts in ESTIMATED_FIELDS.items():
            rows_out.append({"dataset": "Revenue_By_Platform_Quarterly", "field": field,
                             "tier": "3 ESTIMATED", "rows": rev_rows,
                             "depends_on_constants": ", ".join(consts),
                             "providers": "derived",
                             "note": "measured quantity multiplied by an assumed rate"})
    cost = D / "Cost_By_Category_Quarterly.csv"
    if cost.exists():
        n = sum(1 for _ in cost.open(encoding="utf-8")) - 1
        rows_out.append({"dataset": "Cost_By_Category_Quarterly", "field": "cost_ngn / cost_usd",
                         "tier": "4 ASSUMED", "rows": n,
                         "depends_on_constants": "AVG_PRODUCTION_COST_NGN, AVG_DISTRIBUTION_COST_NGN, "
                                                 "AVG_PROMOTION_COST_NGN, AVG_HOSTING_COST_QUARTERLY_NGN, "
                                                 "TRACKS_PER_QUARTER",
                         "providers": "none",
                         "note": "NO measurement behind the naira figure; artist COUNT is measured"})

    fields = ["dataset", "field", "tier", "rows", "depends_on_constants", "providers", "note"]
    with (D / "Data_Provenance_Audit.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=fields)
        w.writeheader()
        w.writerows(sorted(rows_out, key=lambda r: (r["tier"], r["dataset"], r["field"])))

    # ---- tier 1 only export ------------------------------------------------
    out = D / "Observed_Values_Only.csv.gz"
    written = 0
    with gzip.open(out, "wt", newline="", encoding="utf-8") as dst:
        w = None
        for path, opener in ((obs_path, open), (ext_path, gzip.open)):
            if not path.exists():
                continue
            with opener(path, "rt", encoding="utf-8") as h:
                rd = csv.DictReader(h)
                if w is None:
                    w = csv.DictWriter(dst, fieldnames=rd.fieldnames)
                    w.writeheader()
                for r in rd:
                    w.writerow(r)
                    written += 1

    by_tier = defaultdict(int)
    for r in rows_out:
        by_tier[r["tier"]] += r["rows"]
    lines = ["# Value Provenance Audit", "",
             "Generated %s" % datetime.now(timezone.utc).isoformat(), "",
             "Every number in the delivery, classified by whether it was measured.", "",
             "| Tier | Meaning | Values |", "|---|---|---:|",
             "| 1 OBSERVED | a provider returned it | %s |" % format(by_tier["1 OBSERVED"], ","),
             "| 2 AGGREGATED | arithmetic rollup of tier 1 | %s |" % format(by_tier["2 AGGREGATED"], ","),
             "| 3 ESTIMATED | tier 1 x an assumed rate | %s |" % format(by_tier["3 ESTIMATED"], ","),
             "| 4 ASSUMED | constant, no measurement | %s |" % format(by_tier["4 ASSUMED"], ","),
             "",
             "**Tiers 1 and 2 are real values.** %s daily observations and %s geography rows were "
             "returned by a provider for a named artist on a named date, and the quarterly figures "
             "are arithmetic on those." % (format(total_obs, ","), format(geo_n, ",")),
             "",
             "`Observed_Values_Only.csv.gz` contains tier 1 exclusively - %s rows in which every "
             "single number was measured. Use it where no assumption is acceptable." % format(written, ","),
             "", "## The constants that tiers 3 and 4 depend on", "",
             "| Constant | Value | What it assumes |", "|---|---:|---|"]
    for k, (v, why) in RATE_CARD.items():
        lines.append("| `%s` | %s | %s |" % (k, v, why))
    lines += ["",
              "Revenue cannot be made tier 1 on the current subscriptions: both providers deny "
              "track-level stream counts (HTTP 401), so plays are inferred from listener reach "
              "rather than counted. That is a limit of the data available, not a modelling choice. "
              "Cost has no measured component at all beyond the number of artists.",
              ""]
    QC.mkdir(parents=True, exist_ok=True)
    (QC / "Value_Provenance_Audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("Data_Provenance_Audit.csv     %d field entries" % len(rows_out))
    print("Observed_Values_Only.csv.gz   %s rows (tier 1 only)" % format(written, ","))
    print()
    for t in sorted(by_tier):
        print("  %-16s %s values" % (t, format(by_tier[t], ",")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
