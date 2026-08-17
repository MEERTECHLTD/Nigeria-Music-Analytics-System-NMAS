#!/usr/bin/env python3
"""
TARGETED REPAIR — refetch /streaming/spotify per quarter.

Why this exists. The backfill originally requested every endpoint with one window
per year, which is correct and three times cheaper for all of them but one.
`/api/v2/artist/{uuid}/streaming/spotify` given a year window returns ~15 items
while reporting `total: 54`, sets `next: null` so pagination stops, and sorts
DESCENDING — so a yearly request silently keeps the last quarter and discards the
earlier ones. Offset-walking does not recover them: successive offsets slide by a
week and return overlapping rows. Quarter windows return the complete set with
`total` matching the item count.

The symptom in the delivered data was unmistakable once aggregated: Q1 and Q2 of
every year from 2021 showed 2-6 artists reporting total listeners against 560-685
in Q3 and Q4.

Only three variables come from that endpoint, so only they are rebuilt:
  Spotify_total_listeners_daily
  Spotify_domestic_listeners_daily
  Spotify_city_listeners_daily   (the city side file)

Every other row in every shard is left byte-identical. Re-running the whole
extraction would take two hours and re-fetch 200,000 calls that were already
correct; this touches ~23,000.

Resumable: a marker per repaired artist under data/soundcharts/repaired/.
"""

from __future__ import annotations

import csv
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from nmas.services.soundcharts import client_from_env  # noqa: E402

SHARDS = BACKEND / "data" / "soundcharts" / "shards"
CITY_SHARDS = BACKEND / "data" / "soundcharts" / "city_shards"
MARKERS = BACKEND / "data" / "soundcharts" / "repaired"

SCHEMA = [
    "date", "period_label", "entity_type", "entity_id", "entity_name",
    "platform", "geo_scope", "variable_name", "variable_value", "unit",
    "source_endpoint", "source_field", "extraction_timestamp",
]
CITY_SCHEMA = [
    "date", "period_label", "entity_id", "entity_name", "platform",
    "country_code", "country_name", "region", "city_name",
    "variable_name", "variable_value", "unit", "source_endpoint",
    "extraction_timestamp",
]

REBUILT = {"Spotify_total_listeners_daily", "Spotify_domestic_listeners_daily"}
START_YEAR = 2019


def period_of(date_str: str) -> str:
    try:
        year, month = int(date_str[:4]), int(date_str[5:7])
    except (ValueError, IndexError):
        return ""
    return f"Q{(month - 1) // 3 + 1}_{year}"


def quarter_windows(end: datetime) -> list[dict[str, str]]:
    bounds = [("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31")]
    today = end.strftime("%Y-%m-%d")
    out = []
    for year in range(START_YEAR, end.year + 1):
        for start_md, end_md in bounds:
            start, finish = f"{year}-{start_md}", f"{year}-{end_md}"
            if start > today:
                continue
            out.append({"startDate": start, "endDate": min(finish, today)})
    return out


def repair(client, shard: Path, windows: list[dict[str, str]]) -> tuple[int, int, int]:
    uuid = shard.stem
    marker = MARKERS / f"{uuid}.done"
    if marker.exists():
        return 0, 0, 0

    with shard.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        marker.write_text("empty\n")
        return 0, 0, 0

    entity_name = rows[0]["entity_name"]
    kept = [r for r in rows if r["variable_name"] not in REBUILT]
    had = len(rows) - len(kept)
    if not any(r["platform"] == "Spotify" for r in rows):
        marker.write_text("no spotify\n")
        return 0, 0, 0

    stamp = datetime.now(timezone.utc).isoformat()
    endpoint = f"/api/v2/artist/{uuid}/streaming/spotify"
    fresh: dict[tuple, dict] = {}
    city: dict[tuple, dict] = {}

    for window in windows:
        for item in client.paginate(endpoint, window, page_size=100, max_pages=4):
            date_value = (item.get("date") or "")[:10]
            if not date_value:
                continue
            if item.get("value") is not None:
                fresh[("Spotify_total_listeners_daily", "global", date_value)] = {
                    "date": date_value, "period_label": period_of(date_value),
                    "entity_type": "artist", "entity_id": uuid, "entity_name": entity_name,
                    "platform": "Spotify", "geo_scope": "global",
                    "variable_name": "Spotify_total_listeners_daily",
                    "variable_value": item["value"], "unit": "listeners",
                    "source_endpoint": f"soundcharts:{endpoint}", "source_field": "value",
                    "extraction_timestamp": stamp,
                }
            nigeria_total = 0
            seen_nigeria = False
            for plot in item.get("cityPlots") or []:
                if (plot.get("countryCode") or "") != "NG":
                    continue
                seen_nigeria = True
                nigeria_total += plot.get("value") or 0
                city[(date_value, plot.get("cityName") or "")] = {
                    "date": date_value, "period_label": period_of(date_value),
                    "entity_id": uuid, "entity_name": entity_name, "platform": "Spotify",
                    "country_code": plot.get("countryCode") or "",
                    "country_name": plot.get("countryName") or "",
                    "region": plot.get("region") or "",
                    "city_name": plot.get("cityName") or "",
                    "variable_name": "Spotify_city_listeners_daily",
                    "variable_value": plot.get("value"), "unit": "listeners",
                    "source_endpoint": f"soundcharts:{endpoint}",
                    "extraction_timestamp": stamp,
                }
            if seen_nigeria:
                fresh[("Spotify_domestic_listeners_daily", "nigeria", date_value)] = {
                    "date": date_value, "period_label": period_of(date_value),
                    "entity_type": "artist", "entity_id": uuid, "entity_name": entity_name,
                    "platform": "Spotify", "geo_scope": "nigeria",
                    "variable_name": "Spotify_domestic_listeners_daily",
                    "variable_value": nigeria_total, "unit": "listeners",
                    "source_endpoint": f"soundcharts:{endpoint}", "source_field": "cityPlots",
                    "extraction_timestamp": stamp,
                }

    merged = kept + list(fresh.values())
    merged.sort(key=lambda r: (r["variable_name"], r["date"]))
    _write(shard, SCHEMA, merged)

    city_shard = CITY_SHARDS / f"{uuid}.csv"
    if city:
        ordered = sorted(city.values(), key=lambda r: (r["date"], r["city_name"]))
        _write(city_shard, CITY_SCHEMA, ordered)
    elif city_shard.exists():
        city_shard.unlink()

    marker.write_text(f"had={had} now={len(fresh)} city={len(city)}\n")
    return had, len(fresh), len(city)


def _write(target: Path, fields: list[str], rows: list[dict]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(target)


def main() -> int:
    MARKERS.mkdir(parents=True, exist_ok=True)
    shards = sorted(SHARDS.glob("*.csv"))
    pending = [s for s in shards if not (MARKERS / f"{s.stem}.done").exists()]
    windows = quarter_windows(datetime.now(timezone.utc))
    print(f"shards={len(shards)} pending={len(pending)} quarter_windows={len(windows)}", flush=True)
    if not pending:
        print("nothing to repair")
        return 0

    workers = int(os.environ.get("SC_WORKERS", "48"))
    client = client_from_env(calls_per_minute=9000)
    before = after = city_total = done = 0
    started = datetime.now(timezone.utc)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(repair, client, s, windows): s for s in pending}
        for future in as_completed(futures):
            done += 1
            try:
                had, now, city = future.result()
            except Exception as exc:  # noqa: BLE001
                print(f"  !! {futures[future].stem}: {type(exc).__name__}: {exc}", flush=True)
                continue
            before += had
            after += now
            city_total += city
            if done % 50 == 0 or done == len(pending):
                elapsed = (datetime.now(timezone.utc) - started).total_seconds() / 60
                eta = (len(pending) - done) * (elapsed / done) if done else 0
                print(f"  {done}/{len(pending)} | rows before={before:,} after={after:,} "
                      f"city={city_total:,} | calls={client.quota.calls_made:,} | eta {eta:,.0f} min",
                      flush=True)

    gained = after - before
    print(f"\nREPAIRED  streaming rows {before:,} -> {after:,}  ({gained:+,})")
    print(f"city rows now {city_total:,}")
    print(f"calls={client.quota.calls_made:,}  quota remaining={client.quota.quota_remaining:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
