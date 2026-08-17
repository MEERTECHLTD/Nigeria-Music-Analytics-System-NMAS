#!/usr/bin/env python3
"""
FULL SOUNDCHARTS EXTRACTION — every accessible endpoint, all 750 artists.

The first extraction took 7 endpoint families. This takes everything the account
can actually reach, established by probing all 45 artist endpoints in the API
against the live subscription rather than reading documentation.

WHAT THIS ADDS OVER THE FIRST PASS

  countryPlots        The streaming endpoints return a country breakdown beside
                      the city one. The first pass read cityPlots only, so the
                      domestic/export split was built by summing Nigerian cities.
                      countryPlots gives Nigeria directly AND names every export
                      destination — which is what NBS asked for when it wanted to
                      know where the money comes from.
  social geography    /social/{platform}/followers/ carries the same country and
                      city breakdown for Instagram, YouTube and TikTok, so the
                      export split is no longer Spotify-only.
  YouTube streaming   Volume and geography, previously unqueried.
  Audiomack listening Listener volume for a Nigerian DSP.
  playlist reach      Apple Music, Deezer, Amazon and YouTube, not just Spotify.
  charts              Song and album chart entries across six platforms.
  radio by station    broadcast-groups gives play counts per station worldwide,
                      which separates domestic airplay from export airplay.
  catalogue           Songs, albums, related artists, events, Soundcharts score,
                      retention — the artist's productive base, which an economic
                      account needs and follower counts do not describe.

WINDOWING
Endpoints that carry geography truncate on windows longer than a quarter: they
return ~15 rows, report a larger total, emit next=null, and sort descending, so a
yearly request silently keeps Q4. Those are requested per quarter. Plain time
series paginate correctly and are requested per year, which is three times
cheaper. Which is which is declared in GEO_QUARTERLY below, not guessed.

Skipped deliberately: /contacts (premium, returns nothing on this plan),
/audience/{platform}/report (an unlock model that may consume credits, and its
payload carries brand affinity rather than the geography an economic account
needs), tiktok retention and shorts (HTTP 400 on this plan).
"""

from __future__ import annotations

import csv
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from nmas.services.soundcharts import client_from_env  # noqa: E402

ROOT = BACKEND.parent
DATA = BACKEND / "data" / "soundcharts"
RESOLUTION = DATA / "artist_resolution.csv"
_SFX = os.environ.get("SC_OUT_SUFFIX", "")
OBS_DIR = DATA / ("full_obs" + _SFX)
GEO_DIR = DATA / ("full_geo" + _SFX)
ENT_DIR = DATA / ("full_entity" + _SFX)
MARKERS = DATA / ("full_done" + _SFX)

START_YEAR = int(os.environ.get("SC_START_YEAR", "2019"))
# earliest_year in the metric catalogue was established by probing 2019 onward.
# Sweeping a deeper window requires ignoring it, or the guard suppresses exactly
# the history being sought. Empty responses for years a platform did not exist
# yet are cheap; a silently skipped year is not.
IGNORE_EARLIEST = os.environ.get("SC_IGNORE_EARLIEST") == "1"
END_YEAR = int(os.environ.get("SC_END_YEAR", "0")) or None
ACCEPTED = {"exact_ng", "ng_only", "exact_no_country", "exact_foreign"}

OBS_SCHEMA = ["date", "period_label", "entity_type", "entity_id", "entity_name",
              "platform", "geo_scope", "variable_name", "variable_value", "unit",
              "source_endpoint", "source_field", "extraction_timestamp"]
GEO_SCHEMA = ["date", "period_label", "entity_id", "entity_name", "platform",
              "metric", "level", "country_code", "country_name", "region",
              "city_name", "value", "unit", "source_endpoint", "extraction_timestamp"]

# audience/{platform} -> (display name, {response field: (variable, unit)})
AUDIENCE = {
    "spotify":     ("Spotify",      {"followerCount": ("Spotify_followers_daily", "followers")}),
    "youtube":     ("YouTube",      {"followerCount": ("YouTube_subscribers_daily", "subscribers"),
                                     "viewCount": ("YouTube_channel_views_daily", "views")}),
    "instagram":   ("Instagram",    {"followerCount": ("Instagram_followers_daily", "followers")}),
    "tiktok":      ("TikTok",       {"followerCount": ("TikTok_followers_daily", "followers"),
                                     "likeCount": ("TikTok_likes_daily", "likes")}),
    "twitter":     ("Twitter",      {"followerCount": ("Twitter_followers_daily", "followers")}),
    "facebook":    ("Facebook",     {"followerCount": ("Facebook_followers_daily", "followers"),
                                     "likeCount": ("Facebook_likes_daily", "likes")}),
    "soundcloud":  ("Soundcloud",   {"followerCount": ("Soundcloud_followers_daily", "followers")}),
    "deezer":      ("Deezer",       {"followerCount": ("Deezer_fans_daily", "fans")}),
    "bandsintown": ("Bandsintown",  {"followerCount": ("Bandsintown_followers_daily", "followers")}),
    "boomplay":    ("Boomplay",     {"followerCount": ("Boomplay_followers_daily", "followers")}),
    "audiomack":   ("Audiomack",    {"followerCount": ("Audiomack_followers_daily", "followers")}),
    "amazon":      ("Amazon Music", {"followerCount": ("Amazon_Music_followers_daily", "followers")}),
    "tidal":       ("Tidal",        {"followerCount": ("Tidal_followers_daily", "followers")}),
    "genius":      ("Genius",       {"followerCount": ("Genius_followers_daily", "followers")}),
}
# streaming volume series (plain, paginate correctly -> yearly windows)
LISTENING = {"spotify": ("Spotify", "Spotify_monthly_listeners_daily"),
             "youtube": ("YouTube", "YouTube_listeners_daily"),
             "audiomack": ("Audiomack", "Audiomack_listeners_daily")}
# geography-bearing -> quarterly windows
GEO_QUARTERLY = {
    "streaming": [("spotify", "Spotify"), ("youtube", "YouTube")],
    "social": [("instagram", "Instagram"), ("youtube", "YouTube"), ("tiktok", "TikTok")],
}
PLAYLIST_PLATFORMS = [("spotify", "Spotify"), ("apple-music", "Apple Music"),
                      ("deezer", "Deezer"), ("amazon", "Amazon Music"), ("youtube", "YouTube")]
PLAYLIST_FIELDS = {"playlistCount": ("Playlist_count_daily", "playlists"),
                   "playlistReach": ("Playlist_reach_daily", "followers"),
                   "playlistEditorialCount": ("Playlist_editorial_count_daily", "playlists"),
                   "playlistEditorialReach": ("Playlist_editorial_reach_daily", "followers")}
CHART_PLATFORMS = ["spotify", "shazam", "deezer", "apple-music", "itunes", "youtube"]


def q_of(d: str) -> str:
    return "Q%d_%s" % ((int(d[5:7]) - 1) // 3 + 1, d[:4])


def day(v):
    return (v or "")[:10]


def year_windows(end):
    out = []
    for y in range(START_YEAR, (END_YEAR or end.year) + 1):
        last = "%d-12-31" % y
        if datetime.fromisoformat(last).replace(tzinfo=timezone.utc) > end:
            last = end.strftime("%Y-%m-%d")
        out.append({"startDate": "%d-01-01" % y, "endDate": last})
    return out


def quarter_windows(end):
    out = []
    today = end.strftime("%Y-%m-%d")
    for y in range(START_YEAR, (END_YEAR or end.year) + 1):
        for s, e in (("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31")):
            start = "%d-%s" % (y, s)
            if start > today:
                continue
            out.append({"startDate": start, "endDate": min("%d-%s" % (y, e), today)})
    return out


def extract(client, artist, yearly, quarterly):
    uuid = artist["sc_uuid"]
    name = artist["artist_name"]
    marker = MARKERS / ("%s.done" % uuid)
    if marker.exists():
        return 0, 0, 0
    stamp = datetime.now(timezone.utc).isoformat()
    obs, geo = {}, {}
    entity = {"uuid": uuid, "artist_name": name, "extracted_utc": stamp}

    def emit(date_v, platform, scope, var, value, unit, ep, field):
        if value is None or not date_v:
            return
        obs[(var, scope, date_v)] = {
            "date": date_v, "period_label": q_of(date_v), "entity_type": "artist",
            "entity_id": uuid, "entity_name": name, "platform": platform,
            "geo_scope": scope, "variable_name": var, "variable_value": value,
            "unit": unit, "source_endpoint": "soundcharts:" + ep,
            "source_field": field, "extraction_timestamp": stamp}

    def plots(date_v, platform, metric, item, ep):
        quarter = q_of(date_v)
        for level, key in (("country", "countryPlots"), ("city", "cityPlots")):
            for p in item.get(key) or []:
                if p.get("value") is None:
                    continue
                # Foreign city detail is dropped: the export split is a country
                # question, and keeping every city for every artist for every day
                # would outweigh the entire rest of the delivery.
                if level == "city" and (p.get("countryCode") or "") != "NG":
                    continue
                gkey = (platform, metric, level, p.get("countryCode") or "",
                        p.get("cityName") or "", quarter)
                prior = geo.get(gkey)
                if prior and prior["date"] >= date_v:
                    continue  # keep the quarter's latest observation
                geo[gkey] = {
                    "date": date_v, "period_label": q_of(date_v), "entity_id": uuid,
                    "entity_name": name, "platform": platform, "metric": metric,
                    "level": level, "country_code": p.get("countryCode") or "",
                    "country_name": p.get("countryName") or "", "region": p.get("region") or "",
                    "city_name": p.get("cityName") or "", "value": p["value"],
                    "unit": "listeners" if metric.startswith("streaming") else "followers",
                    "source_endpoint": "soundcharts:" + ep, "extraction_timestamp": stamp}

    # which platforms the artist actually holds
    try:
        ids = client.artist_identifiers(uuid)
        held = {(i.get("platformCode") or "").lower() for i in ids if i.get("platformCode")}
        entity["identifiers"] = [{"platform": i.get("platformCode"), "identifier": i.get("identifier"),
                                  "url": i.get("url")} for i in ids]
    except Exception:
        held = set(AUDIENCE)

    # metadata
    try:
        meta = client.artist_metadata(uuid)
        entity["metadata"] = {k: meta.get(k) for k in
                              ("name", "slug", "countryCode", "careerStage", "growthLevel",
                               "genres", "isni", "appUrl", "biography", "gender", "birthDate")}
    except Exception:
        entity["metadata"] = {}

    # ---- streaming volume (yearly) ---------------------------------------
    # Audience follower series, Spotify monthly listeners, Spotify popularity,
    # Spotify playlist reach and daily Nigerian radio spins are NOT re-fetched:
    # the first extraction already holds all 31 quarters of them and merging is
    # free, while re-fetching them costs ~2,000 calls per artist. Measured on one
    # artist, fetching everything blind cost 3,372 calls; fetching only what is
    # genuinely new costs roughly a tenth of that.
    for slug, (platform, var) in LISTENING.items():
        if slug == "spotify" or (slug not in held):
            continue
        ep = "/api/v2/artist/%s/streaming/%s/listening" % (uuid, slug)
        for w in yearly:
            for item in client.paginate(ep, w, page_size=100, max_pages=5):
                emit(day(item.get("date")), platform, "global", var, item.get("value"),
                     "listeners", ep, "value")

    # ---- geography-bearing (quarterly) -----------------------------------
    for family, entries in GEO_QUARTERLY.items():
        for slug, platform in entries:
            if slug not in held:
                continue
            if family == "streaming":
                ep = "/api/v2/artist/%s/streaming/%s" % (uuid, slug)
                total_var = "%s_total_listeners_daily" % platform.replace(" ", "_")
                metric, unit = "streaming_listeners", "listeners"
            else:
                ep = "/api/v2.37/artist/%s/social/%s/followers/" % (uuid, slug)
                total_var = "%s_total_followers_daily" % platform.replace(" ", "_")
                metric, unit = "social_followers", "followers"
            for w in quarterly:
                for item in client.paginate(ep, w, page_size=100, max_pages=4):
                    d = day(item.get("date"))
                    emit(d, platform, "global", total_var, item.get("value"), unit, ep, "value")
                    plots(d, platform, metric, item, ep)
                    ng = sum(p.get("value") or 0 for p in (item.get("countryPlots") or [])
                             if (p.get("countryCode") or "") == "NG")
                    if ng:
                        emit(d, platform, "nigeria",
                             "%s_domestic_%s_daily" % (platform.replace(" ", "_"),
                                                       "listeners" if metric.startswith("streaming") else "followers"),
                             ng, unit, ep, "countryPlots")

    # ---- popularity, score, retention, playlist reach (yearly) -----------
    ep = "/api/v2/artist/%s/soundcharts/score" % uuid
    for w in yearly:
        for item in client.paginate(ep, w, page_size=100, max_pages=5):
            d = day(item.get("date"))
            for field, var in (("scScore", "Soundcharts_score_daily"),
                               ("fanbaseScore", "Soundcharts_fanbase_score_daily"),
                               ("trendingScore", "Soundcharts_trending_score_daily")):
                emit(d, "Soundcharts", "global", var, item.get(field), "index", ep, field)
    for slug, platform in (("spotify", "Spotify"), ("youtube", "YouTube")):
        if slug not in held:
            continue
        ep = "/api/v2/artist/%s/%s/retention" % (uuid, slug)
        for w in yearly:
            for item in client.paginate(ep, w, page_size=100, max_pages=5):
                emit(day(item.get("date")), platform, "global",
                     "%s_retention_daily" % platform, item.get("value"), "ratio", ep, "value")
    for slug, platform in PLAYLIST_PLATFORMS:
        if slug == "spotify":
            continue
        ep = "/api/v2/artist/%s/playlist/reach/%s" % (uuid, slug)
        for w in yearly:
            for item in client.paginate(ep, w, page_size=100, max_pages=5):
                d = day(item.get("date"))
                for field, (base, unit) in PLAYLIST_FIELDS.items():
                    var = base if slug == "spotify" else base.replace("Playlist_", "Playlist_%s_" % platform.replace(" ", "_"))
                    emit(d, platform, "global", var, item.get(field), unit, ep, field)

    # ---- radio: daily NG spins + station-level counts ---------------------
    stations = {}
    gep = "/api/v2/artist/%s/broadcast-groups" % uuid
    for w in yearly:
        for row in client.paginate(gep, w, page_size=100, max_pages=6):
            r = row.get("radio") or {}
            key = (r.get("slug"), w["startDate"][:4])
            stations[key] = {"year": w["startDate"][:4], "station": r.get("name"),
                             "slug": r.get("slug"), "city": r.get("cityName"),
                             "country_code": r.get("countryCode"), "play_count": row.get("playCount")}
    entity["radio_stations"] = list(stations.values())

    # ---- catalogue and standings -----------------------------------------
    def collect(path, params=None, cap=400):
        out = []
        try:
            for item in client.paginate(path, params or {}, page_size=100, max_pages=cap // 100 or 1):
                out.append(item)
        except Exception:
            pass
        return out

    entity["songs"] = [{"uuid": s.get("uuid"), "name": s.get("name"),
                        "credit": s.get("creditName"), "release": s.get("releaseDate")}
                       for s in collect("/api/v2.21/artist/%s/songs" % uuid)]
    entity["albums"] = [{"uuid": a.get("uuid"), "name": a.get("name"), "type": a.get("type"),
                         "release": a.get("releaseDate")}
                        for a in collect("/api/v2.34/artist/%s/albums" % uuid)]
    entity["related"] = [{"uuid": r.get("uuid"), "name": r.get("name"),
                          "country": r.get("countryCode")}
                         for r in collect("/api/v2/artist/%s/related" % uuid, cap=100)]
    entity["events"] = [{"uuid": e.get("uuid"), "name": e.get("name"), "type": e.get("type"),
                         "date": e.get("date"), "venue": (e.get("venue") or {}).get("name"),
                         "country": ((e.get("venue") or {}).get("countryCode"))}
                        for e in collect("/api/v2/artist/%s/events" % uuid, cap=200)]
    charts = []
    for p in CHART_PLATFORMS:
        for c in collect("/api/v2/artist/%s/charts/song/ranks/%s" % (uuid, p), cap=200):
            ch = c.get("chart") or {}
            charts.append({"platform": p, "chart": ch.get("name"), "country": ch.get("countryCode"),
                           "frequency": ch.get("frequency"), "song": (c.get("song") or {}).get("name"),
                           "position": c.get("position"), "peak": c.get("peakPosition"),
                           "entry_date": c.get("entryDate"), "rank_date": c.get("rankDate")})
    entity["chart_entries"] = charts
    pls = []
    for slug, platform in PLAYLIST_PLATFORMS:
        for e in collect("/api/v2.20/artist/%s/playlist/current/%s" % (uuid, slug), cap=200):
            pl = e.get("playlist") or {}
            pls.append({"platform": platform, "playlist": pl.get("name"),
                        "curator": pl.get("curatorName"), "type": pl.get("type"),
                        "subscribers": pl.get("subscriberCount"), "position": e.get("position"),
                        "peak": e.get("peakPosition"), "entry_date": e.get("entryDate"),
                        "song": (e.get("song") or {}).get("name")})
    entity["playlist_entries"] = pls

    _write_csv(OBS_DIR / ("%s.csv" % uuid), OBS_SCHEMA,
               sorted(obs.values(), key=lambda r: (r["variable_name"], r["date"])))
    if geo:
        _write_csv(GEO_DIR / ("%s.csv" % uuid), GEO_SCHEMA,
                   sorted(geo.values(), key=lambda r: (r["platform"], r["metric"], r["level"],
                                                       r["date"], r["country_code"], r["city_name"])))
    ENT_DIR.mkdir(parents=True, exist_ok=True)
    (ENT_DIR / ("%s.json" % uuid)).write_text(json.dumps(entity, ensure_ascii=False), encoding="utf-8")
    MARKERS.mkdir(parents=True, exist_ok=True)
    marker.write_text("obs=%d geo=%d\n" % (len(obs), len(geo)))
    return len(obs), len(geo), len(entity.get("songs", []))


def _write_csv(target, fields, rows):
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    tmp.replace(target)


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
    now = datetime.now(timezone.utc)
    yearly, quarterly = year_windows(now), quarter_windows(now)
    print("artists=%d pending=%d yearly=%d quarterly=%d" % (len(artists), len(pending), len(yearly), len(quarterly)), flush=True)
    if not pending:
        print("nothing to do")
        return 0
    workers = int(os.environ.get("SC_WORKERS", "48"))
    client = client_from_env(calls_per_minute=9000)
    o = g = s = done = 0
    started = datetime.now(timezone.utc)
    print("workers=%d" % workers, flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(extract, client, a, yearly, quarterly): a for a in pending}
        for f in as_completed(futs):
            done += 1
            try:
                a, b, c = f.result()
            except Exception as exc:
                print("  !! %s: %s: %s" % (futs[f]["artist_name"], type(exc).__name__, exc), flush=True)
                continue
            o += a; g += b; s += c
            if done % 10 == 0 or done == len(pending):
                el = (datetime.now(timezone.utc) - started).total_seconds() / 60
                eta = (len(pending) - done) * (el / done) if done else 0
                print("  %d/%d | obs=%s geo=%s songs=%s | calls=%s (%s/min) quota=%s | eta %d min"
                      % (done, len(pending), format(o, ","), format(g, ","), format(s, ","),
                         format(client.quota.calls_made, ","),
                         format(int(client.quota.calls_made / el) if el else 0, ","),
                         format(client.quota.quota_remaining or 0, ","), eta), flush=True)
    print("\nDONE obs=%s geo=%s calls=%s quota_left=%s"
          % (format(o, ","), format(g, ","), format(client.quota.calls_made, ","),
             format(client.quota.quota_remaining or 0, ",")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
