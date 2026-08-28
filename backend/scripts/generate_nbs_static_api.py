#!/usr/bin/env python3
"""
Rebuild the NBS dashboard's static API from the corrected accounts.

Replaces feeds that carried a hardcoded 30/70 split, a duplicated artist and an
"other platforms" line that was not a platform. Shapes are unchanged so the
existing components keep working; only the numbers and the added fields differ.

Extends coverage from 5 quarters to every quarter the merged series holds.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
SRC = ROOT / "NBS FINAL delivery" / "04_Datasets"
REV = SRC / "Revenue_By_Platform_Quarterly.csv"
COST = SRC / "Cost_By_Category_Quarterly.csv"
OUT = ROOT / "frontend" / "public" / "api" / "v1" / "nbs"
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import NAIRA_PER_USD as NAIRA, STREAMS_PER_LISTENER_MONTH, UNMEASURED_UPLIFT_RATE  # noqa: E402
from nmas.cohort import canonical, counts, master_list_names  # noqa: E402

# SCOPE. The published platform is the 130-artist first-submission cohort, so
# the dashboard reports the same population as delivery130 and the two can never
# disagree. Pass --scope all to regenerate the full 752-artist portfolio into the
# same paths; nothing about the portfolio data is deleted either way.
SCOPE = "cohort130"
for _a in sys.argv[1:]:
    if _a.startswith("--scope"):
        SCOPE = _a.split("=", 1)[1] if "=" in _a else "all"
COHORT = {canonical(n) for n in master_list_names()}
COHORT_COST = ROOT / "delivery130" / "04_Datasets" / "Hosting_Production_Costs.csv"


def qk(label: str):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def dump(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    rows = list(csv.DictReader(REV.open(encoding="utf-8")))
    if SCOPE == "cohort130":
        rows = [r for r in rows if r["artist_name"] in COHORT]
    by_q = defaultdict(list)
    for r in rows:
        by_q[r["period_label"]].append(r)
    periods = sorted(by_q, key=qk)

    def num(r, k):
        try:
            return float(r[k] or 0)
        except (ValueError, KeyError):
            return 0.0

    for quarter in periods:
        artists = sorted(by_q[quarter], key=lambda r: -num(r, "gross_streaming_revenue_usd"))

        dump(OUT / "streaming-revenue" / f"{quarter}.json", [{
            "period": quarter,
            "artist_name": r["artist_name"],
            "residency": r["residency"],
            "spotify_monthly_listeners": int(num(r, "spotify_monthly_listeners")),
            "youtube_subscribers": 0,
            "youtube_actual_views": int(num(r, "youtube_quarter_views")),
            "youtube_views_source": r.get("youtube_views_source", ""),
            "deezer_fans": int(num(r, "deezer_fans")),
            "est_spotify_quarterly_streams": int(num(r, "spotify_monthly_listeners") * STREAMS_PER_LISTENER_MONTH * 3),
            "spotify_revenue_usd": num(r, "spotify_revenue_usd"),
            "youtube_revenue_usd": num(r, "youtube_revenue_usd"),
            "deezer_revenue_usd": num(r, "deezer_revenue_usd"),
            # kept under the old key so the component still reads it, but it is
            # an uplift, not a platform — the UI now labels it as such.
            "other_platforms_revenue_usd": num(r, "unmeasured_platform_uplift_usd"),
            "measured_platform_revenue_usd": num(r, "measured_platform_revenue_usd"),
            "gross_streaming_revenue_usd": num(r, "gross_streaming_revenue_usd"),
            "gross_streaming_revenue_ngn": num(r, "gross_streaming_revenue_ngn"),
        } for r in artists])

        dump(OUT / "export-revenue" / f"{quarter}.json", [{
            "period": quarter,
            "artist_name": r["artist_name"],
            "residency": r["residency"],
            "total_streaming_revenue_usd": num(r, "gross_streaming_revenue_usd"),
            "domestic_revenue_usd": num(r, "domestic_revenue_usd") if r["domestic_revenue_usd"] else None,
            "gross_export_revenue_usd": num(r, "export_revenue_usd") if r["export_revenue_usd"] else None,
            "gross_export_revenue_ngn": num(r, "export_revenue_ngn") if r["export_revenue_ngn"] else None,
            "domestic_share_observed": num(r, "domestic_share_observed") if r["domestic_share_observed"] else None,
            "split_basis": r["split_basis"],
            "split_classification": r.get("split_classification", ""),
        } for r in artists])

        dump(OUT / "top-artists" / f"{quarter}.json", [{
            "artist_name": r["artist_name"],
            "gross_streaming_revenue_usd": num(r, "gross_streaming_revenue_usd"),
            "spotify_monthly_listeners": int(num(r, "spotify_monthly_listeners")),
            "youtube_actual_views": int(num(r, "youtube_quarter_views")),
        } for r in artists[:20]])

    # ---- costs -------------------------------------------------------------
    costs = []
    if SCOPE == "cohort130" and COHORT_COST.exists():
        # The portfolio cost file has no artist dimension and cannot be filtered:
        # publishing it here would bill 130 artists for a 752-artist population.
        # delivery130 recomputes the same card on this cohort's own counts.
        for r in csv.DictReader(COHORT_COST.open(encoding="utf-8")):
            if r["cost_category"].startswith("==="):
                continue
            costs.append({
                "period": r["period"],
                "account": "cohort130",
                "cost_category": r["cost_category"],
                "num_artists": int(float(r["num_artists"])),
                "total_cost_ngn": float(r["total_cost_ngn"]),
                "total_cost_usd": float(r["total_cost_usd"]),
                "source": r["source"],
            })
    else:
        for r in csv.DictReader(COST.open(encoding="utf-8")):
            costs.append({
                "period": r["period_label"],
                "account": r["account"],
                "cost_category": r["category"],
                "num_artists": int(r["artists"]),
                "total_cost_ngn": float(r["cost_ngn"]),
                "total_cost_usd": float(r["cost_usd"]),
                "source": r["basis"],
            })
    dump(OUT / "costs.json", costs)

    # ---- employment (ASM, generated by build_employment.py) ----------------
    employment = []
    emp_path = SRC / "Employment_Male_Female.csv"
    if emp_path.exists():
        for r in csv.DictReader(emp_path.open(encoding="utf-8")):
            if r["category"].startswith("TOTAL"):
                employment.append({
                    "period": r["period"],
                    "total_employment": int(float(r["total_employment"])),
                    "male": int(float(r["male"])),
                    "female": int(float(r["female"])),
                    "classification": "ASM",
                    "source": r["source"],
                })

    # ---- export markets: OBSERVED destinations per quarter -----------------
    # Replaces the dashboard's former hardcoded market list. Spotify listener
    # geography, country level; NG separated as the domestic row.
    markets_path = SRC / "Export_Markets_Quarterly.csv"
    if markets_path.exists():
        mk_by_q = defaultdict(list)
        for r in csv.DictReader(markets_path.open(encoding="utf-8")):
            if r["platform"] == "Spotify" and r["metric"] == "streaming_listeners":
                mk_by_q[r["period_label"]].append(r)
        for quarter, rows_m in mk_by_q.items():
            foreign = sorted((r for r in rows_m if r["is_domestic"] != "Y"),
                             key=lambda r: -float(r["value"] or 0))[:10]
            ng = next((r for r in rows_m if r["is_domestic"] == "Y"), None)
            dump(OUT / "export-markets" / f"{quarter}.json", {
                "period": quarter,
                "basis": "observed Spotify listener geography, country level (AGG)",
                "domestic": ({"country": "Nigeria", "listeners": float(ng["value"]),
                              "share_pct": float(ng["share_of_platform_quarter_pct"])} if ng else None),
                "markets": [{"rank": i + 1, "country": r["country_name"],
                             "country_code": r["country_code"],
                             "listeners": float(r["value"]),
                             "share_pct": float(r["share_of_platform_quarter_pct"]),
                             "artists": int(float(r["artists"]))}
                            for i, r in enumerate(foreign)],
            })

    # ---- summary -----------------------------------------------------------
    def quarter_totals(quarter):
        rs = by_q[quarter]
        gross = sum(num(r, "gross_streaming_revenue_usd") for r in rs)
        exp = sum(num(r, "export_revenue_usd") for r in rs if r["export_revenue_usd"])
        dom = sum(num(r, "domestic_revenue_usd") for r in rs if r["domestic_revenue_usd"])
        share = next((num(r, "domestic_share_observed") for r in rs if r["domestic_share_observed"]), None)
        return gross, exp, dom, share, len(rs)

    summary = {
        "scope": SCOPE,
        "scope_label": ("First-submission cohort — 130 artists" if SCOPE == "cohort130"
                        else "All revenue-bearing artists"),
        "periods": periods,
        "artist_count": len({r["artist_name"] for r in rows}),
        "streaming_revenue": [], "export_revenue": [], "costs": [], "employment": employment,
        "notes": {
            "export_split": "Observed Nigerian city listener share per quarter, from Soundcharts "
                            "geography. Replaces the previous fixed 30/70 constant. Quarters "
                            "before 2021-02-26 have no city breakdown and carry no split.",
            "other_platforms": "The 'other_platforms_revenue_usd' field is NOT a platform. It is "
                               "Spotify revenue x %.2f, an assumed uplift for services never " % UNMEASURED_UPLIFT_RATE +
                               "queried. No Boomplay, Audiomack, Apple Music or Amazon revenue "
                               "is measured in it.",
            "artist_coverage": "Every quarter's figures cover all artists in that quarter's file. "
                               "Tables that display a top-N subset state the full total alongside.",
        },
    }
    cost_by_q = defaultdict(float)
    artists_by_q = defaultdict(int)
    for c in costs:
        cost_by_q[c["period"]] += c["total_cost_ngn"]
        artists_by_q[c["period"]] = max(artists_by_q[c["period"]], c["num_artists"])
    for quarter in periods:
        gross, exp, dom, share, n = quarter_totals(quarter)
        summary["streaming_revenue"].append({
            "period": quarter, "gross_streaming_revenue_usd": round(gross, 2),
            "gross_streaming_revenue_ngn": round(gross * NAIRA, 2), "artists": n})
        summary["export_revenue"].append({
            "period": quarter,
            "gross_export_revenue_usd": round(exp, 2) if share is not None else None,
            "gross_export_revenue_ngn": round(exp * NAIRA, 2) if share is not None else None,
            "domestic_revenue_usd": round(dom, 2) if share is not None else None,
            "domestic_share_observed": round(share, 6) if share is not None else None,
            "export_share_observed": round(1 - share, 6) if share is not None else None})
        summary["costs"].append({
            "period": quarter, "total_cost_ngn": round(cost_by_q.get(quarter, 0.0), 2),
            "total_cost_usd": round(cost_by_q.get(quarter, 0.0) / NAIRA, 2),
            "num_artists": artists_by_q.get(quarter, 0)})
    dump(OUT / "summary.json", summary)

    print("periods written : %d (%s -> %s)" % (len(periods), periods[0], periods[-1]))
    print("artists         : %d" % summary["artist_count"])
    print("cost rows       : %d" % len(costs))
    measured = [p for p in summary["export_revenue"] if p["domestic_share_observed"] is not None]
    print("quarters with an observed split: %d" % len(measured))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
