#!/usr/bin/env python3
"""
FULL-GRAIN GEOGRAPHY — every plot, every date, every city and country.

The first geography pass reduced at write time to countries plus Nigerian cities
at quarterly grain, because the unreduced form is ~85 million rows and ~11 GB.
This fetches and keeps ALL of it: every countryPlot and every cityPlot the
provider returns, on every observation date, for all five geography-bearing
series.

Storage is gzipped per artist (~1.1 GB total against 11 GB raw), because the
delivery has to survive on a disk with 30 GB free. Content is identical to the
uncompressed form; only the encoding differs.

Series covered:
  streaming/spotify        listener geography
  streaming/youtube        listener geography
  social/instagram         follower geography
  social/youtube           follower geography
  social/tiktok            follower geography

Quarterly request windows are mandatory here, not an optimisation: these
endpoints truncate on longer windows, return next=null while reporting a larger
total, and sort descending, so a yearly request silently keeps only Q4.
"""

from __future__ import annotations

import csv
import gzip
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from nmas.services.soundcharts import client_from_env  # noqa: E402

DATA = BACKEND / "data" / "soundcharts"
RESOLUTION = DATA / "artist_resolution.csv"
_SFX = os.environ.get("SC_OUT_SUFFIX", "")
OUTDIR = DATA / ("geo_full" + _SFX)
MARKERS = DATA / ("geo_full_done" + _SFX)

ACCEPTED = {"exact_ng", "ng_only", "exact_no_country", "exact_foreign"}
START_YEAR = int(os.environ.get("SC_START_YEAR", "2019"))
END_YEAR = int(os.environ.get("SC_END_YEAR", "0")) or None

SCHEMA = ["date", "period_label", "entity_id", "entity_name", "platform", "metric",
          "level", "country_code", "country_name", "region", "city_name",
          "value", "unit", "source_endpoint", "extraction_timestamp"]

SERIES = [
    ("streaming", "spotify", "Spotify", "streaming_listeners", "listeners"),
    ("streaming", "youtube", "YouTube", "streaming_listeners", "listeners"),
    ("social", "instagram", "Instagram", "social_followers", "followers"),
    ("social", "youtube", "YouTube", "social_followers", "followers"),
    ("social", "tiktok", "TikTok", "social_followers", "followers"),
]


def q_of(d):
    return "Q%d_%s" % ((int(d[5:7]) - 1) // 3 + 1, d[:4])


def quarter_windows(end):
    out, today = [], end.strftime("%Y-%m-%d")
    for y in range(START_YEAR, (END_YEAR or end.year) + 1):
        for s, e in (("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31")):
            start = "%d-%s" % (y, s)
            if start > today:
                continue
            out.append({"startDate": start, "endDate": min("%d-%s" % (y, e), today)})
    return out


def extract(client, artist, windows):
    uuid, name = artist["sc_uuid"], artist["artist_name"]
    marker = MARKERS / ("%s.done" % uuid)
    if marker.exists():
        return 0
    stamp = datetime.now(timezone.utc).isoformat()

    try:
        ids = client.artist_identifiers(uuid)
        held = {(i.get("platformCode") or "").lower() for i in ids if i.get("platformCode")}
    except Exception:
        held = {s[1] for s in SERIES}

    rows = []
    for family, slug, platform, metric, unit in SERIES:
        if slug not in held:
            continue
        if family == "streaming":
            ep = "/api/v2/artist/%s/streaming/%s" % (uuid, slug)
        else:
            ep = "/api/v2.37/artist/%s/social/%s/followers/" % (uuid, slug)
        for w in windows:
            for item in client.paginate(ep, w, page_size=100, max_pages=4):
                date_v = (item.get("date") or "")[:10]
                if not date_v:
                    continue
                period = q_of(date_v)
                for level, key in (("country", "countryPlots"), ("city", "cityPlots")):
                    for p in item.get(key) or []:
                        if p.get("value") is None:
                            continue
                        rows.append({
                            "date": date_v, "period_label": period, "entity_id": uuid,
                            "entity_name": name, "platform": platform, "metric": metric,
                            "level": level, "country_code": p.get("countryCode") or "",
                            "country_name": p.get("countryName") or "",
                            "region": p.get("region") or "", "city_name": p.get("cityName") or "",
                            "value": p["value"], "unit": unit,
                            "source_endpoint": "soundcharts:" + ep,
                            "extraction_timestamp": stamp})

    # de-duplicate on the full key; provider repeats crawls of a date
    seen, unique = set(), []
    for r in rows:
        k = (r["platform"], r["metric"], r["level"], r["country_code"], r["city_name"], r["date"])
        if k in seen:
            continue
        seen.add(k)
        unique.append(r)
    unique.sort(key=lambda r: (r["platform"], r["metric"], r["level"], r["date"],
                               r["country_code"], r["city_name"]))

    OUTDIR.mkdir(parents=True, exist_ok=True)
    target = OUTDIR / ("%s.csv.gz" % uuid)
    tmp = target.with_suffix(".tmp")
    with gzip.open(tmp, "wt", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=SCHEMA)
        w.writeheader()
        w.writerows(unique)
    tmp.replace(target)
    MARKERS.mkdir(parents=True, exist_ok=True)
    marker.write_text("%d\n" % len(unique))
    return len(unique)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    artists, seen = [], set()
    for r in csv.DictReader(RESOLUTION.open(encoding="utf-8")):
        if r["sc_uuid"] and r["match_confidence"] in ACCEPTED and r["sc_uuid"] not in seen:
            seen.add(r["sc_uuid"])
            artists.append(r)
    if limit:
        artists = artists[:limit]
    pending = [a for a in artists if not (MARKERS / ("%s.done" % a["sc_uuid"])).exists()]
    windows = quarter_windows(datetime.now(timezone.utc))
    print("artists=%d pending=%d windows=%d" % (len(artists), len(pending), len(windows)), flush=True)
    if not pending:
        print("nothing to do")
        return 0
    workers = int(os.environ.get("SC_WORKERS", "48"))
    client = client_from_env(calls_per_minute=9000)
    total = done = 0
    started = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(extract, client, a, windows): a for a in pending}
        for f in as_completed(futs):
            done += 1
            try:
                total += f.result()
            except Exception as exc:
                print("  !! %s: %s" % (futs[f]["artist_name"], exc), flush=True)
                continue
            if done % 25 == 0 or done == len(pending):
                el = (datetime.now(timezone.utc) - started).total_seconds() / 60
                eta = (len(pending) - done) * (el / done) if done else 0
                print("  %d/%d | rows=%s | calls=%s (%s/min) | eta %d min"
                      % (done, len(pending), format(total, ","),
                         format(client.quota.calls_made, ","),
                         format(int(client.quota.calls_made / el) if el else 0, ","), eta), flush=True)
    print("\nDONE rows=%s calls=%s quota_left=%s"
          % (format(total, ","), format(client.quota.calls_made, ","),
             format(client.quota.quota_remaining or 0, ",")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
