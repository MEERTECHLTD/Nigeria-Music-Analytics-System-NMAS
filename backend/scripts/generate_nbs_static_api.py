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


def qk(label: str):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def dump(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    rows = list(csv.DictReader(REV.open(encoding="utf-8")))
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
            "youtube_views_source": "observed channel views, quarter net change",
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

    # ---- summary -----------------------------------------------------------
    def quarter_totals(quarter):
        rs = by_q[quarter]
        gross = sum(num(r, "gross_streaming_revenue_usd") for r in rs)
        exp = sum(num(r, "export_revenue_usd") for r in rs if r["export_revenue_usd"])
        dom = sum(num(r, "domestic_revenue_usd") for r in rs if r["domestic_revenue_usd"])
        share = next((num(r, "domestic_share_observed") for r in rs if r["domestic_share_observed"]), None)
        return gross, exp, dom, share, len(rs)

    summary = {
        "periods": periods,
        "artist_count": len({r["artist_name"] for r in rows}),
        "streaming_revenue": [], "export_revenue": [], "costs": [], "employment": [],
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
