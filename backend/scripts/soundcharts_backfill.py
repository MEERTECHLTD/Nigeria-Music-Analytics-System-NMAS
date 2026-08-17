#!/usr/bin/env python3
"""
SOUNDCHARTS BACKFILL — every quarter from Q1 2019 to the current quarter.

Writes the SAME 13-column schema as delivery/04_Datasets/Daily_Metric_Observations.csv
so the two providers concatenate into one series per variable:

  date, period_label, entity_type, entity_id, entity_name, platform, geo_scope,
  variable_name, variable_value, unit, source_endpoint, source_field,
  extraction_timestamp

source_endpoint is prefixed `soundcharts:` so provenance survives the merge and
no row is ever ambiguous about which provider produced it.

WINDOWING — why yearly, not quarterly
Measured throughput against this account is ~344 calls/minute under 24-way
concurrency: the provider slows down long before the documented 10,000/min rate
limit, so the run is bounded by call COUNT, not by the limiter. One window per
quarter costs a request per platform per quarter even when that platform reports
weekly or returns nothing at all. One window per YEAR plus pagination returns
exactly the same observations for roughly a third of the calls, because a sparse
series fits in a single page where it previously cost four.

period_label is therefore derived from each observation's own date rather than
inherited from the request window — which is also the more honest construction,
since a row's quarter is a property of the observation, not of the call that
fetched it.

Cost control:
  - /identifiers is fetched ONCE per artist, and only platforms the artist
    actually holds an account on are then queried. Blind-querying 14 platforms
    would spend most of the quota on 404s.
  - metrics are skipped for years before the provider's verified first year
    (e.g. TikTok has no history before 2023) rather than paying for empty pages.

Resumable: one shard per artist under data/soundcharts/shards/, written
atomically (tmp then rename), so an interrupted run never leaves a half-written
artist behind and re-running resumes at the next artist.

ONE OBSERVATION PER DATE
Several endpoints — /playlist/reach/{platform} most visibly — return more than
one item for the same calendar date, carrying different values (e.g. 436, 432,
436, 543 for a single day) and no field that distinguishes them: no crawl id, no
timestamp, and the `type` parameter does not separate them either. They are
repeat crawls of the same day. A daily series must carry exactly one observation
per date, so rows are collapsed on (variable, geo_scope, date) keeping the LAST
value the provider returns, which is the latest crawl given the ascending date
sort. Left uncollapsed this produced ~67,500 colliding rows across 30 artists.

City-level geography goes to a separate side file: at ~10 Nigerian cities per
observation date it would outweigh every other variable combined in the main
dataset, while the figure NBS actually needs from it — the domestic total — is
emitted into the main file as Spotify_domestic_listeners_daily.
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
from nmas.soundcharts_metrics import (  # noqa: E402
    AUDIENCE_METRICS,
    PLATFORM_SLUGS,
    PLAYLIST_METRICS,
)

ROOT = BACKEND.parent
RESOLUTION = BACKEND / "data" / "soundcharts" / "artist_resolution.csv"
SHARDS = BACKEND / "data" / "soundcharts" / ("shards" + os.environ.get("SC_OUT_SUFFIX", ""))
CITY_SHARDS = BACKEND / "data" / "soundcharts" / ("city_shards" + os.environ.get("SC_OUT_SUFFIX", ""))

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

# Year range and output namespace are env-driven so a gap window (e.g. the
# 2016-2018 history discovered after the first run) can be fetched into its own
# shard set and merged, instead of re-fetching years already held.
START_YEAR = int(os.environ.get("SC_START_YEAR", "2019"))
# earliest_year in the metric catalogue was established by probing 2019 onward.
# Sweeping a deeper window requires ignoring it, or the guard suppresses exactly
# the history being sought. Empty responses for years a platform did not exist
# yet are cheap; a silently skipped year is not.
IGNORE_EARLIEST = os.environ.get("SC_IGNORE_EARLIEST") == "1"
END_YEAR = int(os.environ.get("SC_END_YEAR", "0")) or None
_SUFFIX = os.environ.get("SC_OUT_SUFFIX", "")
# Exact name matches are accepted whatever the provider says the country is:
# it is blank for 104 of them and a diaspora country for another 121, while the
# population frame is the authority on who is in scope. `ambiguous` (no exact
# match, several Nigerian candidates) and `unmatched` stay out until a human
# adjudicates them — a wrong artist is worse than a missing one.
ACCEPTED_CONFIDENCE = {"exact_ng", "ng_only", "exact_no_country", "exact_foreign"}


def year_windows(start_year: int, end: datetime) -> list[tuple[int, str, str]]:
    """(year, startDate, endDate) per calendar year, clamped to today."""
    out: list[tuple[int, str, str]] = []
    for year in range(start_year, (END_YEAR or end.year) + 1):
        last = f"{year}-12-31"
        if datetime.fromisoformat(last).replace(tzinfo=timezone.utc) > end:
            last = end.strftime("%Y-%m-%d")
        out.append((year, f"{year}-01-01", last))
    return out


def quarter_windows(year: int, first: str, last: str) -> list[dict[str, str]]:
    """Quarter sub-windows inside a year, clamped to the year's own bounds."""
    bounds = [("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31")]
    out = []
    for start_md, end_md in bounds:
        start, end = f"{year}-{start_md}", f"{year}-{end_md}"
        if start > last:
            continue
        out.append({"startDate": max(start, first), "endDate": min(end, last)})
    return out


def day(value: str | None) -> str:
    return (value or "")[:10]


def period_of(date_str: str) -> str:
    """Quarter label derived from the observation's own date."""
    try:
        year, month = int(date_str[:4]), int(date_str[5:7])
    except (ValueError, IndexError):
        return ""
    return f"Q{(month - 1) // 3 + 1}_{year}"


def artist_platforms(client, uuid: str) -> set[str]:
    """Platform slugs this artist actually holds an account on."""
    try:
        rows = client.artist_identifiers(uuid)
    except Exception:
        return set(PLATFORM_SLUGS.values())  # degrade to trying everything
    return {(r.get("platformCode") or "").strip().lower() for r in rows if r.get("platformCode")}


def extract_artist(client, artist: dict[str, str],
                   windows: list[tuple[int, str, str]]) -> tuple[int, int]:
    uuid = artist["sc_uuid"]
    frame_name = artist.get("artist_name") or artist.get("sc_name") or ""
    shard = SHARDS / f"{uuid}.csv"
    city_shard = CITY_SHARDS / f"{uuid}.csv"
    if shard.exists():
        return 0, 0

    stamp = datetime.now(timezone.utc).isoformat()
    held = artist_platforms(client, uuid)
    # keyed so repeat crawls of one date collapse to a single observation
    rows: dict[tuple, dict] = {}
    city_rows: dict[tuple, dict] = {}

    def emit(date_value, platform, geo, variable, value, unit, endpoint, field):
        if value is None or not date_value:
            return
        rows[(variable, geo, date_value)] = {
            "date": date_value, "period_label": period_of(date_value),
            "entity_type": "artist", "entity_id": uuid, "entity_name": frame_name,
            "platform": platform, "geo_scope": geo, "variable_name": variable,
            "variable_value": value, "unit": unit,
            "source_endpoint": f"soundcharts:{endpoint}", "source_field": field,
            "extraction_timestamp": stamp,
        }

    for year, first, last in windows:
        window = {"startDate": first, "endDate": last}

        # --- audience: one paginated sweep per platform per year ------------
        by_slug: dict[str, list] = {}
        for metric in AUDIENCE_METRICS:
            if not IGNORE_EARLIEST and metric.earliest_year > year:
                continue
            slug = PLATFORM_SLUGS[metric.platform]
            if slug not in held:
                continue
            by_slug.setdefault(slug, []).append(metric)

        for slug, metrics in by_slug.items():
            path = f"/api/v2/artist/{uuid}/audience/{slug}"
            for item in client.paginate(path, window, page_size=100, max_pages=8):
                date_value = day(item.get("date"))
                for metric in metrics:
                    emit(date_value, metric.platform, metric.geo_scope,
                         metric.variable_name, item.get(metric.response_field),
                         metric.unit, path, metric.response_field)

        if "spotify" in held:
            listening = f"/api/v2/artist/{uuid}/streaming/spotify/listening"
            for item in client.paginate(listening, window, page_size=100, max_pages=8):
                emit(day(item.get("date")), "Spotify", "global",
                     "Spotify_monthly_listeners_daily", item.get("value"),
                     "listeners", listening, "value")

            # total listeners + city geography — the domestic/export base.
            #
            # This endpoint MUST be requested per quarter, not per year. Given a
            # year window it returns ~15 items while reporting total=54, emits
            # next=null so pagination stops, and sorts DESC — so a yearly request
            # silently keeps Q4 and drops Q1-Q3. Offset-walking does not recover
            # them either: successive offsets slide by one week and return
            # overlapping rows. Quarter windows return the full set with total
            # matching the item count. Verified 2026-08-12.
            local = f"/api/v2/artist/{uuid}/streaming/spotify"
            for sub in quarter_windows(year, first, last):
                for item in client.paginate(local, sub, page_size=100, max_pages=4):
                    date_value = day(item.get("date"))
                    emit(date_value, "Spotify", "global", "Spotify_total_listeners_daily",
                         item.get("value"), "listeners", local, "value")
                    nigeria_total = 0
                    seen_nigeria = False
                    for plot in item.get("cityPlots") or []:
                        if (plot.get("countryCode") or "") != "NG":
                            continue
                        seen_nigeria = True
                        nigeria_total += plot.get("value") or 0
                        city_rows[(date_value, plot.get("cityName") or "")] = {
                            "date": date_value, "period_label": period_of(date_value),
                            "entity_id": uuid, "entity_name": frame_name, "platform": "Spotify",
                            "country_code": plot.get("countryCode") or "",
                            "country_name": plot.get("countryName") or "",
                            "region": plot.get("region") or "",
                            "city_name": plot.get("cityName") or "",
                            "variable_name": "Spotify_city_listeners_daily",
                            "variable_value": plot.get("value"), "unit": "listeners",
                            "source_endpoint": f"soundcharts:{local}",
                            "extraction_timestamp": stamp,
                        }
                    if seen_nigeria:
                        emit(date_value, "Spotify", "nigeria",
                             "Spotify_domestic_listeners_daily", nigeria_total,
                             "listeners", local, "cityPlots")

            if IGNORE_EARLIEST or year >= 2020:  # provider carries no popularity history before 2020
                popularity = f"/api/v2/artist/{uuid}/popularity/spotify"
                for item in client.paginate(popularity, window, page_size=100, max_pages=8):
                    emit(day(item.get("date")), "Spotify", "global",
                         "Spotify_popularity_daily", item.get("value"),
                         "popularity_index", popularity, "value")

            reach = f"/api/v2/artist/{uuid}/playlist/reach/spotify"
            for item in client.paginate(reach, window, page_size=100, max_pages=8):
                date_value = day(item.get("date"))
                for metric in PLAYLIST_METRICS:
                    emit(date_value, "Spotify", "global", metric.variable_name,
                         item.get(metric.response_field), metric.unit, reach,
                         metric.response_field)

        # --- Nigerian radio airplay: daily spin counts ----------------------
        spins_path = f"/api/v2/artist/{uuid}/broadcasts"
        per_day: dict[str, int] = {}
        for spin in client.paginate(
            spins_path, {**window, "countryCode": "NG"}, page_size=100, max_pages=40
        ):
            aired = day(spin.get("airedAt"))
            if aired:
                per_day[aired] = per_day.get(aired, 0) + 1
        for aired, count in sorted(per_day.items()):
            emit(aired, "Radio", "nigeria", "Radio_spins_daily_NG",
                 count, "spins", spins_path, "airedAt")

    ordered = sorted(rows.values(), key=lambda r: (r["variable_name"], r["date"]))
    ordered_city = sorted(city_rows.values(), key=lambda r: (r["date"], r["city_name"]))
    _write(shard, SCHEMA, ordered)
    if ordered_city:
        _write(city_shard, CITY_SCHEMA, ordered_city)
    return len(ordered), len(ordered_city)


def _write(target: Path, fields: list[str], rows: list[dict]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(target)


def main() -> int:
    # usage: soundcharts_backfill.py [sample|rest|all] [limit]
    scope = sys.argv[1] if len(sys.argv) > 1 else "all"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    # in_sample lives on the frame, not the resolution file. The 131 in-sample
    # artists are exactly the scope already delivered at daily grain, so they
    # extract first: that wave alone completes the 2019-2026 microdata series.
    frame_path = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"
    in_sample = {
        (r.get("artist_name") or "").strip()
        for r in csv.DictReader(frame_path.open(encoding="utf-8"))
        if (r.get("in_sample") or "").strip().upper() == "Y"
    }

    resolved = [r for r in csv.DictReader(RESOLUTION.open(encoding="utf-8"))
                if r.get("sc_uuid") and r.get("match_confidence") in ACCEPTED_CONFIDENCE]
    if scope == "sample":
        resolved = [r for r in resolved if r["artist_name"].strip() in in_sample]
    elif scope == "rest":
        resolved = [r for r in resolved if r["artist_name"].strip() not in in_sample]

    seen: set[str] = set()
    artists = []
    for row in resolved:
        if row["sc_uuid"] in seen:
            continue
        seen.add(row["sc_uuid"])
        artists.append(row)
    if limit:
        artists = artists[:limit]

    now = datetime.now(timezone.utc)
    windows = year_windows(START_YEAR, now)
    pending = [a for a in artists if not (SHARDS / f"{a['sc_uuid']}.csv").exists()]

    print(f"scope={scope} artists accepted={len(artists)} pending={len(pending)} "
          f"years={len(windows)} ({windows[0][1]} -> {windows[-1][2]})", flush=True)
    if not pending:
        print("nothing to do — every shard present")
        return 0

    # Latency-bound, not rate-limit-bound: measured throughput sits far below the
    # 10,000/min ceiling, so concurrency is the lever that matters.
    workers = int(os.environ.get("SC_WORKERS", "48"))
    client = client_from_env(calls_per_minute=9000)
    total_rows = total_city = done = 0
    started = datetime.now(timezone.utc)
    print(f"workers={workers}", flush=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(extract_artist, client, a, windows): a for a in pending}
        for future in as_completed(futures):
            artist = futures[future]
            done += 1
            try:
                n_rows, n_city = future.result()
            except Exception as exc:  # noqa: BLE001
                print(f"  !! {artist.get('artist_name')}: {type(exc).__name__}: {exc}", flush=True)
                continue
            total_rows += n_rows
            total_city += n_city
            if done % 10 == 0 or done == len(pending):
                elapsed = (datetime.now(timezone.utc) - started).total_seconds() / 60
                rate = client.quota.calls_made / elapsed if elapsed else 0
                eta = (len(pending) - done) * (elapsed / done) if done else 0
                print(
                    f"  {done}/{len(pending)} artists | rows={total_rows:,} city={total_city:,} "
                    f"| calls={client.quota.calls_made:,} ({rate:,.0f}/min) "
                    f"quota_left={client.quota.quota_remaining:,} | eta {eta:,.0f} min",
                    flush=True,
                )

    print(f"\nDONE rows={total_rows:,} city_rows={total_city:,} calls={client.quota.calls_made:,}")
    print(f"quota remaining: {client.quota.quota_remaining:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
