#!/usr/bin/env python3
"""
Consolidate full-grain geography into delivery products.

Input: 752 per-artist gzipped shards, 36.2 million rows — every countryPlot and
cityPlot on every observation date across five series.

Outputs:
  Geography_Full_Daily.csv.gz          the complete unreduced record, gzipped
                                       because uncompressed it is ~11 GB
  Export_Markets_Quarterly.csv         by destination country and quarter
  Nigeria_City_Geography_Quarterly.csv Nigerian city detail
  World_City_Geography_Quarterly.csv   foreign city detail, kept now that the
                                       full grain exists rather than discarded

Quarterly products take each artist's LAST observation in the quarter for each
(platform, metric, level, place) and sum across artists — a level, not a flow, so
summing daily values would be meaningless.
"""

from __future__ import annotations

import csv
import gzip
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
SHARDS = BACKEND / "data" / "soundcharts" / "geo_full"
OUT = ROOT / "NBS FINAL delivery" / "04_Datasets"
FULL = OUT / "Geography_Full_Daily.csv.gz"

SCHEMA = ["date", "period_label", "entity_id", "entity_name", "platform", "metric",
          "level", "country_code", "country_name", "region", "city_name",
          "value", "unit", "source_endpoint", "extraction_timestamp"]


def qk(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def main():
    files = sorted(SHARDS.glob("*.csv.gz"))
    if not files:
        print("no geography shards")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    # per artist keep the quarter's last observation per place; then sum artists
    latest = {}          # (artist,platform,metric,level,cc,city,quarter) -> (date,value,country,region)
    total = 0
    with gzip.open(FULL, "wt", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=SCHEMA)
        writer.writeheader()
        for i, path in enumerate(files, 1):
            with gzip.open(path, "rt", encoding="utf-8") as h:
                for r in csv.DictReader(h):
                    writer.writerow(r)
                    total += 1
                    try:
                        v = float(r["value"])
                    except (TypeError, ValueError):
                        continue
                    k = (r["entity_name"], r["platform"], r["metric"], r["level"],
                         r["country_code"], r["city_name"], r["period_label"])
                    prev = latest.get(k)
                    if prev is None or r["date"] > prev[0]:
                        latest[k] = (r["date"], v, r["country_name"], r["region"])
            if i % 100 == 0:
                print("  %d/%d shards, %s rows" % (i, len(files), format(total, ",")), flush=True)
    print("Geography_Full_Daily.csv.gz  %s rows  %.0f MB" % (format(total, ","), FULL.stat().st_size / 1048576))

    country = defaultdict(lambda: {"v": 0.0, "a": set(), "name": ""})
    ng_city = defaultdict(lambda: {"v": 0.0, "a": set(), "region": ""})
    w_city = defaultdict(lambda: {"v": 0.0, "a": set(), "cc": "", "region": ""})
    for (artist, plat, metric, level, cc, city, quarter), (_, v, cname, region) in latest.items():
        if level == "country":
            e = country[(quarter, plat, metric, cc)]
            e["v"] += v; e["a"].add(artist); e["name"] = cname
        elif cc == "NG":
            e = ng_city[(quarter, plat, metric, city)]
            e["v"] += v; e["a"].add(artist); e["region"] = region
        else:
            e = w_city[(quarter, plat, metric, cc, city)]
            e["v"] += v; e["a"].add(artist); e["cc"] = cc; e["region"] = region

    totals = defaultdict(float)
    for (q, p, m, cc), e in country.items():
        totals[(q, p, m)] += e["v"]
    with (OUT / "Export_Markets_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["period_label", "platform", "metric", "country_code", "country_name",
                    "is_domestic", "value", "artists", "share_of_platform_quarter_pct"])
        for k in sorted(country, key=lambda k: (qk(k[0]), k[1], k[2], -country[k]["v"])):
            e = country[k]
            tot = totals[(k[0], k[1], k[2])] or 1
            w.writerow([k[0], k[1], k[2], k[3], e["name"], "Y" if k[3] == "NG" else "N",
                        round(e["v"], 2), len(e["a"]), round(100 * e["v"] / tot, 4)])
    print("Export_Markets_Quarterly.csv         %s rows" % format(len(country), ","))

    with (OUT / "Nigeria_City_Geography_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["period_label", "platform", "metric", "city_name", "region", "value", "artists"])
        for k in sorted(ng_city, key=lambda k: (qk(k[0]), k[1], -ng_city[k]["v"])):
            e = ng_city[k]
            w.writerow([k[0], k[1], k[2], k[3], e["region"], round(e["v"], 2), len(e["a"])])
    print("Nigeria_City_Geography_Quarterly.csv %s rows" % format(len(ng_city), ","))

    with (OUT / "World_City_Geography_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["period_label", "platform", "metric", "country_code", "city_name",
                    "region", "value", "artists"])
        for k in sorted(w_city, key=lambda k: (qk(k[0]), k[1], -w_city[k]["v"])):
            e = w_city[k]
            w.writerow([k[0], k[1], k[2], k[3], k[4], e["region"], round(e["v"], 2), len(e["a"])])
    print("World_City_Geography_Quarterly.csv   %s rows" % format(len(w_city), ","))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
