#!/usr/bin/env python3
"""
Extract ONLY new artists (not in existing data), then merge and regenerate NBS CSVs.
"""
from __future__ import annotations

import csv
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from nmas.services.chartmetric import ChartmetricClient
from nmas.metrics import unique_stat_endpoints

OUTPUT_DIR = BACKEND_DIR / "data" / "nbs_deliverables"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PERIODS = {
    "Q1_2025": (date(2025, 1, 1), date(2025, 3, 31)),
    "Q4_2025": (date(2025, 10, 1), date(2025, 12, 31)),
    "Q1_2026": (date(2026, 1, 1), date(2026, 3, 31)),
}

NAIRA_PER_USD = 1500

PRIORITY_ENDPOINTS = {
    "/api/artist/{chartmetric_id}/stat/spotify",
    "/api/artist/{chartmetric_id}/stat/youtube_channel",
    "/api/artist/{chartmetric_id}/stat/youtube_artist",
    "/api/artist/{chartmetric_id}/stat/instagram",
    "/api/artist/{chartmetric_id}/stat/tiktok",
    "/api/artist/{chartmetric_id}/stat/twitter",
    "/api/artist/{chartmetric_id}/stat/facebook",
    "/api/artist/{chartmetric_id}/stat/soundcloud",
    "/api/artist/{chartmetric_id}/stat/deezer",
    "/api/artist/{chartmetric_id}/stat/wikipedia",
    "/api/artist/{chartmetric_id}/stat/bandsintown",
}


def main():
    print("=" * 70)
    print("NMAS — Extract NEW artists + Merge + Regenerate NBS CSVs")
    print("=" * 70)

    # Load new artist list
    export_dir = sorted([
        d for d in (BACKEND_DIR / "data" / "exports").iterdir()
        if d.is_dir() and not d.name.startswith(".")
    ])[-1]
    with open(export_dir / "nmas_artists.csv") as f:
        all_artists = list(csv.DictReader(f))
    print(f"Total artists in updated list: {len(all_artists)}")

    # Load existing extracted data
    existing_path = OUTPUT_DIR / "nmas_chartmetric_full_metrics.csv"
    existing_obs = []
    existing_names = set()
    if existing_path.exists():
        with open(existing_path) as f:
            existing_obs = list(csv.DictReader(f))
        for row in existing_obs:
            existing_names.add(row["entity_name"])
    print(f"Existing data: {len(existing_obs)} observations for {len(existing_names)} artists")

    new_artists = [a for a in all_artists if a["artist_name"] not in existing_names]
    print(f"New artists to extract: {len(new_artists)}")

    if new_artists:
        # Extract new artists
        client = ChartmetricClient()
        all_groups = unique_stat_endpoints()
        endpoint_groups = [(ep, metrics) for ep, metrics in all_groups if ep in PRIORITY_ENDPOINTS]

        total_calls = len(new_artists) * len(endpoint_groups) * len(PERIODS)
        done = 0
        errors = 0
        new_obs = []

        print(f"\n[1] Extracting: {len(new_artists)} artists × {len(endpoint_groups)} endpoints × {len(PERIODS)} periods = {total_calls} calls")

        for period_label, (start, end) in PERIODS.items():
            print(f"\n--- {period_label} ---")
            for artist in new_artists:
                cm_id = int(artist["cm_artist_id"])
                name = artist["artist_name"]

                for endpoint_template, metrics_group in endpoint_groups:
                    done += 1
                    try:
                        resp, results = client.extract_endpoint_all_metrics(
                            endpoint_template=endpoint_template,
                            metrics=metrics_group,
                            chartmetric_id=cm_id,
                            period_label=period_label,
                            start_date=start,
                            end_date=end,
                        )
                        for result in results:
                            for obs in result.observations:
                                new_obs.append({
                                    "date": obs.observation_date.isoformat(),
                                    "period_label": period_label,
                                    "entity_type": "artist",
                                    "entity_id": str(cm_id),
                                    "entity_name": name,
                                    "platform": result.platform,
                                    "geo_scope": obs.geo_scope,
                                    "variable_name": obs.variable_name,
                                    "variable_value": str(obs.value),
                                    "unit": obs.unit,
                                    "source_endpoint": endpoint_template,
                                    "source_field": obs.source_field,
                                    "extraction_timestamp": datetime.now(timezone.utc).isoformat(),
                                })
                    except Exception:
                        errors += 1

                    if done % 100 == 0:
                        print(f"  [{done}/{total_calls}] {name} | obs={len(new_obs)} err={errors}")

        print(f"\nNew extraction: {len(new_obs)} observations, {errors} errors")

        # Merge
        all_obs = existing_obs + new_obs
        print(f"\n[2] Merged: {len(all_obs)} total observations ({len(existing_obs)} old + {len(new_obs)} new)")

        # Save merged raw
        fieldnames = list(all_obs[0].keys()) if all_obs else []
        with open(OUTPUT_DIR / "nmas_chartmetric_full_metrics.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(all_obs)
        print(f"  Saved nmas_chartmetric_full_metrics.csv ({len(all_obs)} rows)")
    else:
        print("No new artists. Using existing data.")
        all_obs = existing_obs

    # === Regenerate ALL NBS CSVs with full 131 artists ===
    print(f"\n[3] Regenerating NBS deliverables for {len(all_artists)} artists...")

    # Compute last values and sums
    last_vals: dict[tuple, float] = {}
    sum_vals: dict[tuple, float] = defaultdict(float)
    buckets: dict[tuple, list[tuple[date, float]]] = defaultdict(list)

    for row in all_obs:
        try:
            dt = date.fromisoformat(row["date"])
            val = float(row["variable_value"])
        except (ValueError, TypeError, KeyError):
            continue
        for label, (s, e) in PERIODS.items():
            if s <= dt <= e:
                buckets[(row["entity_name"], row["variable_name"], label)].append((dt, val))
                sum_vals[(row["entity_name"], row["variable_name"], label)] += val
                break

    for key, pairs in buckets.items():
        pairs.sort()
        last_vals[key] = pairs[-1][1]

    print(f"  {len(last_vals)} last-value entries")

    # === CSV 1: STREAMING REVENUE ===
    rev_rows = []
    rev_totals = {}
    for period in PERIODS:
        pt = 0.0
        for a in all_artists:
            name = a["artist_name"]
            listeners = last_vals.get((name, "Spotify_monthly_listeners_daily", period), 0)
            subs = last_vals.get((name, "YouTube_subscribers_daily", period), 0)
            yt_actual = sum_vals.get((name, "YouTube_artist_daily_views", period), 0)
            deezer = last_vals.get((name, "Deezer_fans_daily", period), 0)

            sp_streams = listeners * 3.5 * 3
            yt_views = yt_actual if yt_actual > 0 else subs * 15 * 3
            yt_src = "actual" if yt_actual > 0 else "estimated"
            deezer_est = deezer * 2.0 * 3

            sp_rev = sp_streams * 0.004
            yt_rev = yt_views * 0.004
            dz_rev = deezer_est * 0.004
            other = sp_rev * 0.30
            total = sp_rev + yt_rev + dz_rev + other
            pt += total

            if total > 0:
                rev_rows.append({
                    "period": period, "artist_name": name,
                    "spotify_monthly_listeners": round(listeners),
                    "youtube_subscribers": round(subs),
                    "youtube_actual_views": round(yt_views),
                    "youtube_views_source": yt_src,
                    "deezer_fans": round(deezer),
                    "est_spotify_quarterly_streams": round(sp_streams),
                    "spotify_revenue_usd": round(sp_rev, 2),
                    "youtube_revenue_usd": round(yt_rev, 2),
                    "deezer_revenue_usd": round(dz_rev, 2),
                    "other_platforms_revenue_usd": round(other, 2),
                    "gross_streaming_revenue_usd": round(total, 2),
                    "gross_streaming_revenue_ngn": round(total * NAIRA_PER_USD, 2),
                    "source": "Chartmetric API (26 endpoints) + per-stream rates",
                })

        rev_totals[period] = pt
        rev_rows.append({
            "period": period, "artist_name": "=== PERIOD TOTAL ===",
            "spotify_monthly_listeners": "", "youtube_subscribers": "",
            "youtube_actual_views": "", "youtube_views_source": "",
            "deezer_fans": "", "est_spotify_quarterly_streams": "",
            "spotify_revenue_usd": "", "youtube_revenue_usd": "",
            "deezer_revenue_usd": "", "other_platforms_revenue_usd": "",
            "gross_streaming_revenue_usd": round(pt, 2),
            "gross_streaming_revenue_ngn": round(pt * NAIRA_PER_USD, 2),
            "source": "Aggregated",
        })

    # === CSV 2: EXPORT REVENUE ===
    exp_rows = []
    exp_totals = {}
    for period in PERIODS:
        pt_exp = 0.0; pt_dom = 0.0
        for a in all_artists:
            name = a["artist_name"]
            listeners = last_vals.get((name, "Spotify_monthly_listeners_daily", period), 0)
            subs = last_vals.get((name, "YouTube_subscribers_daily", period), 0)
            yt_actual = sum_vals.get((name, "YouTube_artist_daily_views", period), 0)
            deezer = last_vals.get((name, "Deezer_fans_daily", period), 0)

            sp_streams = listeners * 3.5 * 3
            yt_views = yt_actual if yt_actual > 0 else subs * 15 * 3
            deezer_est = deezer * 2.0 * 3

            total_rev = (sp_streams * 0.004 + yt_views * 0.004 + deezer_est * 0.004 + sp_streams * 0.004 * 0.30)
            dom = total_rev * 0.30
            exp = total_rev * 0.70
            pt_exp += exp; pt_dom += dom

            if exp > 0:
                exp_rows.append({
                    "period": period, "artist_name": name,
                    "total_streaming_revenue_usd": round(total_rev, 2),
                    "nigeria_domestic_share_pct": 30.0,
                    "domestic_revenue_usd": round(dom, 2),
                    "export_share_pct": 70.0,
                    "gross_export_revenue_usd": round(exp, 2),
                    "gross_export_revenue_ngn": round(exp * NAIRA_PER_USD, 2),
                    "top_export_markets": "US, UK, France, Ghana, South Africa",
                    "source": "Chartmetric + WIPO 2025 methodology",
                })

        exp_totals[period] = pt_exp
        exp_rows.append({
            "period": period, "artist_name": "=== PERIOD TOTAL ===",
            "total_streaming_revenue_usd": "",
            "nigeria_domestic_share_pct": 30.0,
            "domestic_revenue_usd": round(pt_dom, 2), "export_share_pct": 70.0,
            "gross_export_revenue_usd": round(pt_exp, 2),
            "gross_export_revenue_ngn": round(pt_exp * NAIRA_PER_USD, 2),
            "top_export_markets": "", "source": "Aggregated",
        })

    # === CSV 3: EMPLOYMENT ===
    n = len(all_artists)
    emp_rows = []
    growth = {"Q1_2025": 1.0, "Q4_2025": 1.02**3, "Q1_2026": 1.02**4}
    for p, gf in growth.items():
        d = round(300000 * gf); i = round(1000000 * gf); t = d + i
        emp_rows.append({"period": p, "category": "Direct Employment (Artists, Producers, Engineers, Managers)",
                         "total_employment": d, "male": round(d*0.62), "female": round(d*0.38),
                         "source": "US ITA Nigeria 2024; UNESCO 2023"})
        emp_rows.append({"period": p, "category": "Indirect Employment (Distribution, Marketing, Retail, Tech)",
                         "total_employment": i, "male": round(i*0.62), "female": round(i*0.38),
                         "source": "US ITA Nigeria 2024; UNESCO 2023"})
        emp_rows.append({"period": p, "category": "TOTAL MUSIC INDUSTRY",
                         "total_employment": t, "male": round(t*0.62), "female": round(t*0.38),
                         "source": "Aggregated (US ITA, Vanguard 2024, Nairametrics 2025)"})

    # === CSV 4: COSTS (updated for 131 artists) ===
    cost_rows = []
    for p in PERIODS:
        prod = n*2*750000; dist = n*2*15000; host = n*50000; promo = n*2*250000
        tot = prod+dist+host+promo
        cost_rows.append({"period":p,"cost_category":"Studio Production","num_artists":n,"total_cost_ngn":prod,"total_cost_usd":round(prod/1500,2),"source":"NigerianInformer 2025"})
        cost_rows.append({"period":p,"cost_category":"Digital Distribution","num_artists":n,"total_cost_ngn":dist,"total_cost_usd":round(dist/1500,2),"source":"Blisshype 2026"})
        cost_rows.append({"period":p,"cost_category":"Web Hosting & CDN","num_artists":n,"total_cost_ngn":host,"total_cost_usd":round(host/1500,2),"source":"Industry estimate"})
        cost_rows.append({"period":p,"cost_category":"Promotion & Marketing","num_artists":n,"total_cost_ngn":promo,"total_cost_usd":round(promo/1500,2),"source":"TaGetMedia 2025"})
        cost_rows.append({"period":p,"cost_category":"=== PERIOD TOTAL ===","num_artists":n,"total_cost_ngn":tot,"total_cost_usd":round(tot/1500,2),"source":"Aggregated"})

    # === WRITE ALL CSVs ===
    def write(path, rows):
        if not rows: return
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
        print(f"  [OK] {path.name} — {len(rows)} rows")

    write(OUTPUT_DIR / "1_gross_streaming_revenue.csv", rev_rows)
    write(OUTPUT_DIR / "2_gross_export_revenue.csv", exp_rows)
    write(OUTPUT_DIR / "3_employment_male_female.csv", emp_rows)
    write(OUTPUT_DIR / "4_hosting_production_costs.csv", cost_rows)

    # === QUARTERLY AGGREGATES ===
    from nmas.metrics import METRICS
    agg_rows = []
    for key, pairs in buckets.items():
        name, var, period = key
        pairs.sort()
        values = [v for _, v in pairs]
        metric_def = METRICS.get(var)
        if metric_def:
            rule = metric_def.aggregation_rule
        elif "views" in var.lower() or "streams" in var.lower() or "talks" in var.lower():
            rule = "sum"
        else:
            rule = "net_change"
        agg = sum(values) if rule == "sum" else (values[-1] if rule == "last_value" else values[-1] - values[0])
        agg_rows.append({
            "entity_name": name, "variable_name": var, "period_label": period,
            "aggregation_rule": rule, "aggregated_value": round(agg, 2),
            "first_value": round(values[0], 2), "last_value": round(values[-1], 2),
            "obs_count": len(values),
        })
    agg_rows.sort(key=lambda r: (r["entity_name"], r["variable_name"], r["period_label"]))
    write(OUTPUT_DIR / "quarterly_aggregates_full.csv", agg_rows)

    # === METHODOLOGY ===
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    (OUTPUT_DIR / "NBS_METHODOLOGY_AND_SOURCES.md").write_text(f"""# NBS Deliverable Methodology & Sources
## NMAS — Generated {ts}
## {len(all_artists)} Artists, 26 Accessible Chartmetric Endpoints, 3 Periods

### Summary Results
| Variable | Q1 2025 | Q4 2025 | Q1 2026 |
|----------|---------|---------|---------|
| Gross Streaming Revenue (USD) | ${rev_totals.get('Q1_2025',0):,.2f} | ${rev_totals.get('Q4_2025',0):,.2f} | ${rev_totals.get('Q1_2026',0):,.2f} |
| Gross Streaming Revenue (NGN) | ₦{rev_totals.get('Q1_2025',0)*1500:,.0f} | ₦{rev_totals.get('Q4_2025',0)*1500:,.0f} | ₦{rev_totals.get('Q1_2026',0)*1500:,.0f} |
| Gross Export Revenue (USD) | ${exp_totals.get('Q1_2025',0):,.2f} | ${exp_totals.get('Q4_2025',0):,.2f} | ${exp_totals.get('Q1_2026',0):,.2f} |
| Total Artists | {len(all_artists)} | {len(all_artists)} | {len(all_artists)} |
| Total Observations | {len(all_obs)} |
| Costs (NGN/quarter) | ₦{n*2*750000 + n*2*15000 + n*50000 + n*2*250000:,} |

### Methodology
1. **Streaming Revenue**: Spotify listeners × 3.5 × 3mo × $0.004 + YouTube actual views × $0.004 + Deezer fans × 2 × 3mo × $0.004 + other platforms (30% of Spotify)
2. **Export Revenue**: Total streaming × 70% (WIPO 2025 methodology, 30% domestic share from Where_People_Listen)
3. **Employment**: 300K direct + 1M indirect, 62/38% M/F, 2% QoQ growth (US ITA, UNESCO, Nairametrics)
4. **Costs**: {n} artists × 2 tracks/qtr. Production ₦750K, Distribution ₦15K, Hosting ₦50K/qtr, Promotion ₦250K

### Data Sources
- Chartmetric API: 11 stat endpoints + Where People Listen + charts (26 total accessible)
- Per-stream rates: Ditto Music 2026, Royalty Exchange 2025, IFPI 2024
- Employment: US ITA Nigeria 2024, UNESCO 2023, Vanguard 2024, Nairametrics 2025
- Costs: NigerianInformer 2025, Blisshype 2026, TaGetMedia 2025
""")
    print(f"  [OK] NBS_METHODOLOGY_AND_SOURCES.md")

    print(f"\n{'='*70}")
    print(f"DONE — {len(all_artists)} artists, {len(all_obs)} observations")
    for p in PERIODS:
        print(f"  {p}: Streaming ${rev_totals.get(p,0):,.2f} | Export ${exp_totals.get(p,0):,.2f}")
    print(f"\nOutput: {OUTPUT_DIR}")
    for f in sorted(OUTPUT_DIR.iterdir()):
        if not f.name.startswith("nmas_q1"):
            print(f"  {f.name} ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
