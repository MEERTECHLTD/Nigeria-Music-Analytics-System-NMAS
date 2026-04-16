#!/usr/bin/env python3
"""
Generate static JSON files from NBS CSV deliverables.
These JSON files replace the live backend API for Firebase Hosting.
Output goes to frontend/public/api/v1/nbs/
"""
import csv
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data" / "nbs_deliverables"
OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "api" / "v1" / "nbs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PERIODS = ["Q1_2025", "Q2_2025", "Q3_2025", "Q4_2025", "Q1_2026"]


def read_csv(filename):
    path = DATA_DIR / filename
    if not path.exists():
        return []
    with open(path, "r") as f:
        return list(csv.DictReader(f))


def write_json(filename, data):
    path = OUT_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  -> {path.relative_to(PROJECT_ROOT)} ({len(json.dumps(data)):,} bytes)")


def generate_summary():
    rev = read_csv("1_gross_streaming_revenue.csv")
    exp = read_csv("2_gross_export_revenue.csv")
    emp = read_csv("3_employment_male_female.csv")
    costs = read_csv("4_hosting_production_costs.csv")

    rev_totals = []
    for r in rev:
        if r.get("artist_name") == "=== PERIOD TOTAL ===":
            rev_totals.append({
                "period": r["period"],
                "gross_streaming_revenue_usd": float(r.get("gross_streaming_revenue_usd") or 0),
                "gross_streaming_revenue_ngn": float(r.get("gross_streaming_revenue_ngn") or 0),
            })

    exp_totals = []
    for r in exp:
        if r.get("artist_name") == "=== PERIOD TOTAL ===":
            exp_totals.append({
                "period": r["period"],
                "domestic_revenue_usd": float(r.get("domestic_revenue_usd") or 0),
                "gross_export_revenue_usd": float(r.get("gross_export_revenue_usd") or 0),
                "gross_export_revenue_ngn": float(r.get("gross_export_revenue_ngn") or 0),
            })

    emp_totals = []
    for r in emp:
        if "TOTAL" in r.get("category", ""):
            emp_totals.append({
                "period": r["period"],
                "total_employment": int(r.get("total_employment") or 0),
                "male": int(r.get("male") or 0),
                "female": int(r.get("female") or 0),
            })

    cost_totals = []
    for r in costs:
        if "TOTAL" in r.get("cost_category", ""):
            cost_totals.append({
                "period": r["period"],
                "total_cost_ngn": float(r.get("total_cost_ngn") or 0),
                "total_cost_usd": float(r.get("total_cost_usd") or 0),
            })

    artist_count = sum(
        1 for r in rev
        if r.get("artist_name") not in ("=== PERIOD TOTAL ===", "")
        and r.get("period") == "Q1_2026"
    )

    periods = sorted(
        set(r["period"] for r in rev_totals),
        key=lambda p: (int(p.split("_")[1]), int(p.split("_")[0][1:]))
    )

    return {
        "streaming_revenue": rev_totals,
        "export_revenue": exp_totals,
        "employment": emp_totals,
        "costs": cost_totals,
        "artist_count": artist_count,
        "periods": periods,
    }


def generate_streaming_revenue(period=None):
    rows = read_csv("1_gross_streaming_revenue.csv")
    result = []
    for r in rows:
        if r.get("artist_name") == "=== PERIOD TOTAL ===":
            continue
        if period and r.get("period") != period:
            continue
        result.append({
            "period": r["period"],
            "artist_name": r["artist_name"],
            "spotify_monthly_listeners": int(float(r.get("spotify_monthly_listeners") or 0)),
            "youtube_subscribers": int(float(r.get("youtube_subscribers") or 0)),
            "youtube_actual_views": int(float(r.get("youtube_actual_views") or 0)),
            "youtube_views_source": r.get("youtube_views_source", ""),
            "deezer_fans": int(float(r.get("deezer_fans") or 0)),
            "est_spotify_quarterly_streams": int(float(r.get("est_spotify_quarterly_streams") or 0)),
            "spotify_revenue_usd": float(r.get("spotify_revenue_usd") or 0),
            "youtube_revenue_usd": float(r.get("youtube_revenue_usd") or 0),
            "deezer_revenue_usd": float(r.get("deezer_revenue_usd") or 0),
            "other_platforms_revenue_usd": float(r.get("other_platforms_revenue_usd") or 0),
            "gross_streaming_revenue_usd": float(r.get("gross_streaming_revenue_usd") or 0),
            "gross_streaming_revenue_ngn": float(r.get("gross_streaming_revenue_ngn") or 0),
        })
    result.sort(key=lambda x: -x["gross_streaming_revenue_usd"])
    return result


def generate_export_revenue(period=None):
    rows = read_csv("2_gross_export_revenue.csv")
    result = []
    for r in rows:
        if r.get("artist_name") == "=== PERIOD TOTAL ===":
            continue
        if period and r.get("period") != period:
            continue
        result.append({
            "period": r["period"],
            "artist_name": r["artist_name"],
            "total_streaming_revenue_usd": float(r.get("total_streaming_revenue_usd") or 0),
            "domestic_revenue_usd": float(r.get("domestic_revenue_usd") or 0),
            "gross_export_revenue_usd": float(r.get("gross_export_revenue_usd") or 0),
            "gross_export_revenue_ngn": float(r.get("gross_export_revenue_ngn") or 0),
        })
    result.sort(key=lambda x: -x["gross_export_revenue_usd"])
    return result


def generate_top_artists(period="Q1_2026", limit=20):
    rows = read_csv("1_gross_streaming_revenue.csv")
    filtered = [
        {
            "artist_name": r["artist_name"],
            "gross_streaming_revenue_usd": float(r.get("gross_streaming_revenue_usd") or 0),
            "spotify_monthly_listeners": int(float(r.get("spotify_monthly_listeners") or 0)),
            "youtube_actual_views": int(float(r.get("youtube_actual_views") or 0)),
        }
        for r in rows
        if r.get("period") == period and r.get("artist_name") != "=== PERIOD TOTAL ==="
    ]
    filtered.sort(key=lambda x: -x["gross_streaming_revenue_usd"])
    return filtered[:limit]


def generate_costs():
    return read_csv("4_hosting_production_costs.csv")


def main():
    print("Generating static API JSON files...")
    print()

    # Summary
    print("[1] summary.json")
    write_json("summary.json", generate_summary())

    # Costs (single file)
    print("[2] costs.json")
    write_json("costs.json", generate_costs())

    # Per-period files
    for period in PERIODS:
        print(f"\n[{period}]")

        print(f"  streaming-revenue/{period}.json")
        write_json(f"streaming-revenue/{period}.json", generate_streaming_revenue(period))

        print(f"  export-revenue/{period}.json")
        write_json(f"export-revenue/{period}.json", generate_export_revenue(period))

        print(f"  top-artists/{period}.json")
        write_json(f"top-artists/{period}.json", generate_top_artists(period))

    print(f"\nDone! Files written to {OUT_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
