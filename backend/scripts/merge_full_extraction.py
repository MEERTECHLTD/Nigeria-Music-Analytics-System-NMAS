#!/usr/bin/env python3
"""
Fold the full extraction into the delivery.

Three new products, none of which the first pass could produce:

  Export_Markets_Quarterly.csv    Where Nigerian music is consumed, by
                                  destination country and quarter, from the
                                  countryPlots the first pass never read. This is
                                  the answer to "which markets drive export".
  Artist_Catalogue_Summary.csv    Songs, albums, chart entries, playlist
                                  placements, events and monitored radio stations
                                  per artist — the productive base behind the
                                  revenue, which follower counts do not describe.
  Radio_Stations_Quarterly.csv    Airplay by station and country, separating
                                  domestic from export airplay.

The new daily observations are appended to the existing shard set so the merge,
standardisation and Excel stages downstream need no change: same 13-column
schema, same provenance prefix.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
DATA = BACKEND / "data" / "soundcharts"
SHARDS = DATA / "shards"
FULL_OBS = DATA / "full_obs"
FULL_GEO = DATA / "full_geo"
FULL_ENT = DATA / "full_entity"
OUT = ROOT / "NBS FINAL delivery" / "04_Datasets"

SCHEMA = ["date", "period_label", "entity_type", "entity_id", "entity_name",
          "platform", "geo_scope", "variable_name", "variable_value", "unit",
          "source_endpoint", "source_field", "extraction_timestamp"]


def qk(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- 1. append new observations into the existing shards ---------------
    merged = appended = 0
    for extra in sorted(FULL_OBS.glob("*.csv")):
        shard = SHARDS / extra.name
        new_rows = list(csv.DictReader(extra.open(encoding="utf-8")))
        if not new_rows:
            continue
        existing, keys = [], set()
        if shard.exists():
            existing = list(csv.DictReader(shard.open(encoding="utf-8")))
            keys = {(r["variable_name"], r["geo_scope"], r["date"]) for r in existing}
        fresh = [r for r in new_rows
                 if (r["variable_name"], r["geo_scope"], r["date"]) not in keys]
        if not fresh:
            continue
        rows = existing + fresh
        rows.sort(key=lambda r: (r["variable_name"], r["date"]))
        tmp = shard.with_suffix(".tmp")
        with tmp.open("w", newline="", encoding="utf-8") as h:
            w = csv.DictWriter(h, fieldnames=SCHEMA)
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in SCHEMA})
        tmp.replace(shard)
        merged += 1
        appended += len(fresh)
    print("shards updated: %d, observations appended: %s" % (merged, format(appended, ",")))

    # ---- 2. export markets by country and quarter --------------------------
    country = defaultdict(lambda: defaultdict(float))
    artists_ct = defaultdict(lambda: defaultdict(set))
    names = {}
    city_rows = []
    for path in sorted(FULL_GEO.glob("*.csv")):
        for r in csv.DictReader(path.open(encoding="utf-8")):
            if r["level"] == "country":
                key = (r["period_label"], r["platform"], r["metric"], r["country_code"])
                country[key]["value"] += float(r["value"] or 0)
                artists_ct[key]["a"].add(r["entity_name"])
                names[r["country_code"]] = r["country_name"]
            else:
                city_rows.append(r)

    with (OUT / "Export_Markets_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["period_label", "platform", "metric", "country_code", "country_name",
                    "is_domestic", "value", "artists", "share_of_platform_quarter_pct"])
        totals = defaultdict(float)
        for (q, p, m, cc), v in country.items():
            totals[(q, p, m)] += v["value"]
        for (q, p, m, cc) in sorted(country, key=lambda k: (qk(k[0]), k[1], k[2], -country[k]["value"])):
            v = country[(q, p, m, cc)]["value"]
            tot = totals[(q, p, m)] or 1
            w.writerow([q, p, m, cc, names.get(cc, ""), "Y" if cc == "NG" else "N",
                        round(v, 2), len(artists_ct[(q, p, m, cc)]["a"]),
                        round(100 * v / tot, 4)])

    with (OUT / "Nigeria_City_Geography_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=["period_label", "platform", "metric", "city_name",
                                          "region", "value", "artists"])
        w.writeheader()
        agg = defaultdict(lambda: {"value": 0.0, "artists": set(), "region": ""})
        for r in city_rows:
            k = (r["period_label"], r["platform"], r["metric"], r["city_name"])
            agg[k]["value"] += float(r["value"] or 0)
            agg[k]["artists"].add(r["entity_name"])
            agg[k]["region"] = r["region"]
        for k in sorted(agg, key=lambda k: (qk(k[0]), k[1], -agg[k]["value"])):
            w.writerow({"period_label": k[0], "platform": k[1], "metric": k[2],
                        "city_name": k[3], "region": agg[k]["region"],
                        "value": round(agg[k]["value"], 2), "artists": len(agg[k]["artists"])})

    # ---- 3. catalogue and radio -------------------------------------------
    cat_fields = ["artist_name", "soundcharts_uuid", "country", "career_stage", "growth_level",
                  "genres", "songs", "albums", "chart_entries", "playlist_entries",
                  "events", "radio_stations_monitored", "platform_identifiers"]
    radio_rows = []
    with (OUT / "Artist_Catalogue_Summary.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=cat_fields)
        w.writeheader()
        for path in sorted(FULL_ENT.glob("*.json")):
            e = json.loads(path.read_text(encoding="utf-8"))
            meta = e.get("metadata") or {}
            genres = meta.get("genres") or []
            roots = sorted({g.get("root") for g in genres if isinstance(g, dict) and g.get("root")})
            w.writerow({
                "artist_name": e.get("artist_name"), "soundcharts_uuid": e.get("uuid"),
                "country": meta.get("countryCode") or "", "career_stage": meta.get("careerStage") or "",
                "growth_level": meta.get("growthLevel") or "", "genres": "; ".join(roots),
                "songs": len(e.get("songs") or []), "albums": len(e.get("albums") or []),
                "chart_entries": len(e.get("chart_entries") or []),
                "playlist_entries": len(e.get("playlist_entries") or []),
                "events": len(e.get("events") or []),
                "radio_stations_monitored": len(e.get("radio_stations") or []),
                "platform_identifiers": len(e.get("identifiers") or []),
            })
            for st in e.get("radio_stations") or []:
                radio_rows.append({"artist_name": e.get("artist_name"), **st})

    with (OUT / "Radio_Stations_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["year", "country_code", "station", "city", "artists", "play_count", "is_domestic"])
        agg = defaultdict(lambda: {"plays": 0.0, "artists": set(), "city": ""})
        for r in radio_rows:
            k = (r.get("year"), r.get("country_code") or "", r.get("station") or "")
            agg[k]["plays"] += float(r.get("play_count") or 0)
            agg[k]["artists"].add(r["artist_name"])
            agg[k]["city"] = r.get("city") or ""
        for k in sorted(agg, key=lambda k: (k[0] or "", -agg[k]["plays"])):
            w.writerow([k[0], k[1], k[2], agg[k]["city"], len(agg[k]["artists"]),
                        int(agg[k]["plays"]), "Y" if k[1] == "NG" else "N"])

    print("Export_Markets_Quarterly.csv        %s rows" % format(len(country), ","))
    print("Nigeria_City_Geography_Quarterly.csv written")
    print("Artist_Catalogue_Summary.csv        %s artists" % format(len(list(FULL_ENT.glob('*.json'))), ","))
    print("Radio_Stations_Quarterly.csv        %s station-years" % format(len(radio_rows), ","))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
