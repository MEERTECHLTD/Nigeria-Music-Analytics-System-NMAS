#!/usr/bin/env python3
"""
CONSOLE ARTIFACT for the two-provider extended series.

Writes frontend/public/api/v1/console/extended-history.json — a read-only
projection of what merge_final_delivery.py produced. Computes no economics.

This artifact exists because three findings the console currently publishes are
now out of date, and a console that keeps asserting them would be wrong:

  Panel 2  "the archive floor is the finding"      floor moved 2024-01-01 -> 2019-01-01
  Panel 3  "one source is integrated"              two are, with quota and depth recorded
  Panel 10 "listener geography was never collected" city-level NG listeners now collected

Fields the source artifacts cannot fill are emitted as null so the console can
render NOT COLLECTED rather than zero.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
FINAL = ROOT / "NBS FINAL delivery"
AGG = FINAL / "04_Datasets" / "Quarterly_Aggregates_Full.csv"
COVERAGE = FINAL / "04_Datasets" / "Coverage_By_Quarter.csv"
RESOLUTION = FINAL / "04_Datasets" / "Artist_Resolution_Soundcharts.csv"
CITY = FINAL / "04_Datasets" / "Nigeria_City_Geography_Quarterly.csv"
OUT = ROOT / "frontend" / "public" / "api" / "v1" / "console" / "extended-history.json"

sys.path.insert(0, str(BACKEND))
from nmas.soundcharts_metrics import ALL_METRICS  # noqa: E402


def period_key(label: str) -> tuple[int, int]:
    try:
        quarter, year = label.split("_")
        return int(year), int(quarter[1:])
    except Exception:
        return (0, 0)


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> int:
    if not AGG.exists():
        print(f"missing {AGG} — run merge_final_delivery.py first")
        return 1

    rows = list(csv.DictReader(AGG.open(encoding="utf-8")))
    periods = sorted({r["period_label"] for r in rows if r["period_label"]}, key=period_key)

    # ---- per-variable coverage, with the provider that supplied it --------
    variables: dict[str, dict] = {}
    for row in rows:
        name = row["variable_name"]
        entry = variables.setdefault(name, {
            "variable_name": name,
            "unit": row.get("unit") or None,
            "aggregation_rule": row.get("aggregation_rule") or None,
            "platform": row.get("platform") or None,
            "quarters": set(),
            "artists": set(),
            "observations": 0,
            "providers": set(),
        })
        entry["quarters"].add(row["period_label"])
        entry["artists"].add(row["entity_name"])
        try:
            entry["observations"] += int(row.get("observations") or 0)
        except ValueError:
            pass
        for provider in (row.get("providers") or "").split("+"):
            if provider:
                entry["providers"].add(provider)

    catalogue = {m.variable_name: m for m in ALL_METRICS}
    variable_rows = []
    for name in sorted(variables):
        entry = variables[name]
        ordered = sorted(entry["quarters"], key=period_key)
        metric = catalogue.get(name)
        variable_rows.append({
            "variable_name": name,
            "platform": entry["platform"],
            "unit": entry["unit"],
            "aggregation_rule": entry["aggregation_rule"],
            "first_quarter": ordered[0] if ordered else None,
            "last_quarter": ordered[-1] if ordered else None,
            "quarters_present": len(ordered),
            "artists": len(entry["artists"]),
            "observations": entry["observations"],
            "providers": sorted(entry["providers"]),
            "provider_earliest_year": metric.earliest_year if metric else None,
            "new_capability": bool(metric and not metric.continues_chartmetric),
            "coverage_limitations": (metric.coverage_limitations or None) if metric else None,
        })

    # ---- headline series --------------------------------------------------
    headline_names = [
        "Spotify_monthly_listeners_daily", "Spotify_followers_daily",
        "YouTube_subscribers_daily", "Boomplay_followers_daily",
        "Audiomack_followers_daily", "Radio_spins_daily_NG", "Playlist_reach_daily",
    ]
    series: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in rows:
        if row["variable_name"] in headline_names:
            value = num(row["variable_value"])
            if value is not None:
                series[row["variable_name"]][row["period_label"]] += value
    headline = [
        {
            "variable_name": name,
            "points": [
                {"period": period, "value": round(series[name].get(period, 0.0), 2)}
                for period in periods
            ],
        }
        for name in headline_names if name in series
    ]

    # ---- domestic vs export ---------------------------------------------
    domestic: dict[str, float] = defaultdict(float)
    total: dict[str, float] = defaultdict(float)
    reporting: dict[str, set] = defaultdict(set)
    for row in rows:
        value = num(row["variable_value"])
        if value is None:
            continue
        if row["variable_name"] == "Spotify_domestic_listeners_daily":
            domestic[row["period_label"]] += value
            reporting[row["period_label"]].add(row["entity_name"])
        elif row["variable_name"] == "Spotify_total_listeners_daily":
            total[row["period_label"]] += value
    export_rows = []
    for period in periods:
        dom, tot = domestic.get(period), total.get(period)
        if not dom and not tot:
            continue
        exported = (tot - dom) if (tot is not None and dom is not None) else None
        export_rows.append({
            "period": period,
            "domestic_listeners": round(dom, 2) if dom else None,
            "total_listeners": round(tot, 2) if tot else None,
            "export_listeners": round(exported, 2) if exported is not None else None,
            "export_share_pct": round(100 * exported / tot, 2) if (exported is not None and tot) else None,
            "artists_reporting": len(reporting.get(period, ())) or None,
        })

    # ---- resolution audit -------------------------------------------------
    resolution_summary: dict[str, int] = defaultdict(int)
    if RESOLUTION.exists():
        for row in csv.DictReader(RESOLUTION.open(encoding="utf-8")):
            resolution_summary[row.get("match_confidence") or "unknown"] += 1

    # ---- city geography ---------------------------------------------------
    cities: dict[str, float] = defaultdict(float)
    city_dates: set[str] = set()
    if CITY.exists():
        with CITY.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                value = num(row.get("value"))
                if value is None:
                    continue
                label = row.get("city_name") or "(unnamed)"
                cities[label] += value
                city_dates.add(row.get("period_label") or "")
    top_cities = sorted(cities.items(), key=lambda kv: kv[1], reverse=True)[:20]

    providers_seen: set[str] = set()
    for row in variable_rows:
        providers_seen.update(row["providers"])

    payload = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "generator": "backend/scripts/generate_extended_console_api.py",
        "note": (
            "Read-only projection of the merged two-provider series. No economic value is "
            "computed here. Fields the source artifacts cannot fill are null and render as "
            "NOT COLLECTED."
        ),
        "archive_floor": min((r["first_quarter"] for r in variable_rows if r["first_quarter"]),
                             key=period_key, default=None),
        "previous_archive_floor": "Q1_2024",
        "periods_observed": periods,
        "providers": [
            {
                "name": "Chartmetric",
                "role": "incumbent",
                "archive_floor": "2024-01-01",
                "auth": "refresh token",
                "notes": "Tier denies Boomplay, Audiomack, Apple Music, Pandora, radio airplay and track-level streams.",
            },
            {
                "name": "Soundcharts",
                "role": "extension",
                "archive_floor": "2019-01-01",
                "auth": "x-app-id / x-api-key (legacy header credentials)",
                "quota_total": 4_000_000,
                "rate_limit_per_minute": 10_000,
                "notes": "Supplies 2019-2023 history plus Boomplay, Audiomack, radio airplay and city-level listener geography.",
            },
        ],
        "variables": variable_rows,
        "headline_series": headline,
        "domestic_vs_export": export_rows,
        "resolution_summary": dict(sorted(resolution_summary.items(), key=lambda kv: -kv[1])),
        "city_geography": {
            "observation_periods": len(city_dates),
            "cities_observed": len(cities),
            "top_cities": [{"city": city, "listener_days": round(value, 2)} for city, value in top_cities],
            "note": "Nigerian cities only. Sum of daily listener values, so it is a listener-day quantity, not a headcount.",
        },
        "supersedes": [
            {"panel": "coverage", "was": "Nine real quarters; the archive floor is the finding.",
             "now": f"{len(periods)} quarters from {periods[0] if periods else '-'}; the floor moved back five years."},
            {"panel": "sources", "was": "One source is integrated.",
             "now": f"{len(providers_seen)} providers integrated, with quota, rate limit and archive depth recorded."},
            {"panel": "footprint", "was": "Listener geography was never collected.",
             "now": f"City-level Nigerian listeners collected across {len(cities)} cities."},
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":"), default=str), encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"  variables={len(variable_rows)} periods={len(periods)} "
          f"export_rows={len(export_rows)} cities={len(cities)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
