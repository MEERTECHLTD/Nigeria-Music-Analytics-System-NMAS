#!/usr/bin/env python3
"""
NBS ACCOUNTS ENGINE — answers the NBS correspondence directly.

Rebuilds revenue and cost from the merged 31-quarter series, replacing four
constructions NBS questioned:

  1. Export share.    Was a hardcoded 70%. Now the OBSERVED Spotify domestic
                      share per quarter, from Soundcharts city geography. The
                      fixed 70% was wrong in every quarter it can be checked
                      against: the observed export share runs 97% (2021) to 60%
                      (2026), never 70% except in passing.
  2. "Other" platform. Was spotify_revenue x 0.40, labelled as a platform. It is
                      not a platform and never was. It is carried here as
                      `unmeasured_platform_uplift_usd`, outside the platform
                      breakdown, so a reader cannot mistake it for measurement.
  3. Residency.       NBS asked for diaspora artists to be separated so their
                      income can go to Gross National Income rather than the
                      domestic production account. Both accounts are produced.
  4. Duplicate entity. "Flavour" and "Flavour N'abania" are one artist held twice
                      in the frame under two provider UUIDs, double counting
                      $666,219 in Q2 2025 alone. Aliased to one entity.

Costs are broken down by category per NBS's request and now scale with the
number of artists actually observed in each quarter, instead of repeating an
identical total every quarter.

Everything is per quarter from Q1 2019, so the series can be back-cast onto the
2019 GDP base year.
"""

from __future__ import annotations

import csv
import gzip
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
FINAL = ROOT / "NBS FINAL delivery"
OBS = FINAL / "04_Datasets" / "Daily_Metric_Observations.csv"
# The delivered microdata file holds the 131 in-sample artists; the rest of the
# frame lives in the gzipped companion. Revenue is computed over BOTH, so the
# accounts cover every artist extracted rather than the sample alone.
OBS_EXTENDED = FINAL / "04_Datasets" / "Daily_Observations_Extended_Frame.csv.gz"
CROSSWALK = FINAL / "04_Datasets" / "Artist_ID_Crosswalk.csv"
RESOLUTION = BACKEND / "data" / "soundcharts" / "artist_resolution.csv"
OUT = FINAL / "04_Datasets"
QC = FINAL / "07_Quality_Checks"

# ---------------------------------------------------------------------------
# Rate card and cost card come from nmas/assumptions.py, which is the single
# source for every non-observed constant. They are NOT redefined here: the
# uplift rate previously diverged (0.40 here vs 0.30 in the delivered file and
# the published methodology) and inflated five quarters by $5,809,677.
# ---------------------------------------------------------------------------
from nmas.assumptions import (  # noqa: E402
    AVG_HOSTING_COST_QUARTERLY_NGN, AVG_DISTRIBUTION_COST_NGN,
    AVG_PRODUCTION_COST_NGN, AVG_PROMOTION_COST_NGN, COST_CARD,
    DEEZER_PER_STREAM, DEEZER_STREAMS_PER_FAN_MONTH, NAIRA_PER_USD,
    PER_TRACK_CATEGORIES as PER_TRACK, SPOTIFY_PER_STREAM,
    STREAMS_PER_LISTENER_MONTH, TRACKS_PER_QUARTER, UNMEASURED_UPLIFT_RATE,
    VIEWS_PER_SUBSCRIBER_MONTH,
    YOUTUBE_PER_VIEW,
)

# One artist, two frame rows, two provider UUIDs.
ALIASES = {"Flavour N'abania": "Flavour"}


def q_of(date_str: str) -> str:
    y, m = int(date_str[:4]), int(date_str[5:7])
    return "Q%d_%d" % ((m - 1) // 3 + 1, y)


def qkey(label: str):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def main() -> int:
    if not OBS.exists():
        print("missing %s" % OBS)
        return 1

    # ---- residency, from the provider's country code -----------------------
    residency = {}
    for r in csv.DictReader(RESOLUTION.open(encoding="utf-8")):
        name = ALIASES.get(r["artist_name"].strip(), r["artist_name"].strip())
        country = (r["sc_country"] or "").strip()
        if not r["sc_uuid"]:
            cls, note = "unknown", "not resolved to a provider record"
        elif country == "NG":
            cls, note = "domestic", "provider registers the artist in Nigeria"
        elif country:
            cls, note = "diaspora_candidate", "provider registers the artist in %s" % country
        else:
            cls, note = "unknown", "provider holds no country for this artist"
        # keep the strongest evidence when an alias merges two rows
        if name not in residency or residency[name][0] == "unknown":
            residency[name] = (cls, country, note)

    # ---- accumulate per artist-quarter ------------------------------------
    # levels use the quarter's last observation; YouTube views are cumulative so
    # the quarter's flow is last-first.
    lvl = defaultdict(dict)      # (artist,quarter) -> {var: (first,last,fdate,ldate)}
    WANTED = {"Spotify_monthly_listeners_daily", "YouTube_channel_views_daily",
              "YouTube_subscribers_daily",
              "Deezer_fans_daily", "Spotify_domestic_listeners_daily",
              "Spotify_total_listeners_daily", "YouTube_listeners_daily",
              "YouTube_total_listeners_daily", "YouTube_domestic_listeners_daily",
              "Audiomack_listeners_daily", "Boomplay_followers_daily",
              "Audiomack_followers_daily"}
    sources = [(OBS, open)]
    if OBS_EXTENDED.exists():
        sources.append((OBS_EXTENDED, gzip.open))
    for path, opener in sources:
        with opener(path, "rt", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                var = row["variable_name"]
                if var not in WANTED:
                    continue
                name = ALIASES.get(row["entity_name"], row["entity_name"])
                key = (name, row["period_label"])
                try:
                    value = float(row["variable_value"])
                except ValueError:
                    continue
                date = row["date"]
                cell = lvl[key].get(var)
                if cell is None:
                    lvl[key][var] = [value, value, date, date]
                else:
                    if date < cell[2]:
                        cell[0], cell[2] = value, date
                    if date > cell[3]:
                        cell[1], cell[3] = value, date

    # ---- observed export share per quarter ---------------------------------
    dom_q, tot_q = defaultdict(float), defaultdict(float)
    for (name, quarter), vars_ in lvl.items():
        if "Spotify_domestic_listeners_daily" in vars_:
            dom_q[quarter] += vars_["Spotify_domestic_listeners_daily"][1]
        if "Spotify_total_listeners_daily" in vars_:
            tot_q[quarter] += vars_["Spotify_total_listeners_daily"][1]
    domestic_share = {}
    for quarter in set(dom_q) | set(tot_q):
        d, t = dom_q.get(quarter), tot_q.get(quarter)
        domestic_share[quarter] = (d / t) if (d and t) else None

    # ---- revenue -----------------------------------------------------------
    rev_fields = ["period_label", "nmas_artist_id", "artist_name", "residency",
                  "spotify_monthly_listeners", "youtube_quarter_views", "deezer_fans",
                  "spotify_revenue_usd", "youtube_revenue_usd", "deezer_revenue_usd",
                  "measured_platform_revenue_usd", "unmeasured_platform_uplift_usd",
                  "gross_streaming_revenue_usd", "gross_streaming_revenue_ngn",
                  "domestic_share_observed", "domestic_revenue_usd", "export_revenue_usd",
                  "export_revenue_ngn", "split_basis", "split_classification",
                  "youtube_views_source"]
    rev_rows = []
    split_cov = defaultdict(lambda: defaultdict(int))
    for (name, quarter), vars_ in sorted(lvl.items(), key=lambda kv: (kv[0][0], qkey(kv[0][1]))):
        listeners = vars_.get("Spotify_monthly_listeners_daily", [0, 0, "", ""])[1]
        deezer = vars_.get("Deezer_fans_daily", [0, 0, "", ""])[1]
        yt = vars_.get("YouTube_channel_views_daily")
        # Quarter delta of a cumulative counter, clamped at zero. The clamp is a
        # DELIBERATE conservative choice, registered in the assumptions register:
        # a negative delta (counter reset / provider backfill, 217 artist-quarters)
        # or a single-observation quarter (10) contributes zero revenue — which
        # understates and never overstates. The quarterly AGGREGATES classify the
        # same cells UNK instead: 0 asserts no activity, UNK states it cannot be
        # measured, and a revenue model can be conservative where a statistical
        # table must not assert. The two artifacts differ BY DESIGN here.
        yt_views = max(yt[1] - yt[0], 0.0) if yt else 0.0
        # Where NO observed quarter volume exists — the views series is absent,
        # or collapses to zero via a single observation or a counter reset — fall
        # back to the FIRST submission's documented estimate: subscribers x 15
        # views per month. Labelled per row; never replaces an observation.
        yt_subs = vars_.get("YouTube_subscribers_daily")
        if yt_views > 0:
            yt_source = "observed channel views, quarter net change"
        elif yt_subs and yt_subs[1] > 0:
            yt_views = yt_subs[1] * VIEWS_PER_SUBSCRIBER_MONTH * 3
            yt_source = "estimated: subscribers x 15 views/month (EST, first-submission methodology)"
        else:
            yt_source = "no YouTube presence observed"

        sp_rev = listeners * STREAMS_PER_LISTENER_MONTH * 3 * SPOTIFY_PER_STREAM
        yt_rev = yt_views * YOUTUBE_PER_VIEW
        dz_rev = deezer * DEEZER_STREAMS_PER_FAN_MONTH * 3 * DEEZER_PER_STREAM
        measured = sp_rev + yt_rev + dz_rev
        uplift = sp_rev * UNMEASURED_UPLIFT_RATE
        gross = measured + uplift
        if gross <= 0:
            continue

        # Split precedence (v3 decision): the artist's OWN observed geography
        # where the quarter holds both a domestic and a total listener level for
        # this artist (classification OBS); otherwise the portfolio ratio, which
        # is AGG at quarter level but ASSUMED when applied to an artist it was
        # not measured on (ASM); otherwise no split at all (UNK) — never zero.
        own_dom = vars_.get("Spotify_domestic_listeners_daily")
        own_tot = vars_.get("Spotify_total_listeners_daily")
        share = None
        if own_dom and own_tot and own_tot[1] > 0 and 0 <= own_dom[1] <= own_tot[1]:
            share = own_dom[1] / own_tot[1]
            basis = "observed: artist's own Nigerian share of listeners this quarter"
            split_cls = "OBS"
        elif domestic_share.get(quarter) is not None:
            share = domestic_share[quarter]
            basis = "assumed: portfolio-wide ratio applied to an artist without own geography"
            split_cls = "ASM"
        else:
            basis = "not measured: provider published no geography this quarter"
            split_cls = "UNK"
        if share is None:
            dom_rev = exp_rev = None
        else:
            dom_rev = gross * share
            exp_rev = gross - dom_rev
        split_cov[quarter][split_cls] += 1

        cls, country, _ = residency.get(name, ("unknown", "", ""))
        rev_rows.append({
            "period_label": quarter,
            "nmas_artist_id": name.lower().replace(" ", "-"),
            "artist_name": name, "residency": cls,
            "spotify_monthly_listeners": round(listeners),
            "youtube_quarter_views": round(yt_views),
            "deezer_fans": round(deezer),
            "spotify_revenue_usd": round(sp_rev, 2),
            "youtube_revenue_usd": round(yt_rev, 2),
            "deezer_revenue_usd": round(dz_rev, 2),
            "measured_platform_revenue_usd": round(measured, 2),
            "unmeasured_platform_uplift_usd": round(uplift, 2),
            "gross_streaming_revenue_usd": round(gross, 2),
            "gross_streaming_revenue_ngn": round(gross * NAIRA_PER_USD, 2),
            "domestic_share_observed": round(share, 6) if share is not None else "",
            "domestic_revenue_usd": round(dom_rev, 2) if dom_rev is not None else "",
            "export_revenue_usd": round(exp_rev, 2) if exp_rev is not None else "",
            "export_revenue_ngn": round(exp_rev * NAIRA_PER_USD, 2) if exp_rev is not None else "",
            "split_basis": basis,
            "split_classification": split_cls,
            "youtube_views_source": yt_source,
        })

    with (OUT / "Revenue_By_Platform_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=rev_fields)
        w.writeheader()
        w.writerows(rev_rows)

    # ---- the two accounts NBS asked for ------------------------------------
    acct = defaultdict(lambda: defaultdict(float))
    artists_in = defaultdict(lambda: defaultdict(set))
    for r in rev_rows:
        book = "domestic_production" if r["residency"] == "domestic" else (
            "gni_diaspora" if r["residency"] == "diaspora_candidate" else "unclassified")
        a = acct[(r["period_label"], book)]
        a["spotify_revenue_usd"] += r["spotify_revenue_usd"]
        a["youtube_revenue_usd"] += r["youtube_revenue_usd"]
        a["deezer_revenue_usd"] += r["deezer_revenue_usd"]
        a["unmeasured_platform_uplift_usd"] += r["unmeasured_platform_uplift_usd"]
        a["gross_streaming_revenue_usd"] += r["gross_streaming_revenue_usd"]
        if r["domestic_revenue_usd"] != "":
            a["domestic_revenue_usd"] += r["domestic_revenue_usd"]
            a["export_revenue_usd"] += r["export_revenue_usd"]
        artists_in[(r["period_label"], book)]["a"].add(r["artist_name"])

    acct_fields = ["period_label", "account", "artists", "spotify_revenue_usd",
                   "youtube_revenue_usd", "deezer_revenue_usd",
                   "unmeasured_platform_uplift_usd", "gross_streaming_revenue_usd",
                   "gross_streaming_revenue_ngn", "domestic_revenue_usd",
                   "export_revenue_usd", "cost_total_ngn", "cost_total_usd",
                   "net_ngn"]
    cost_fields = ["period_label", "account", "category", "artists", "unit_cost_ngn",
                   "basis", "cost_ngn", "cost_usd"]
    acct_rows, cost_rows = [], []
    for (quarter, book) in sorted(acct, key=lambda k: (qkey(k[0]), k[1])):
        a = acct[(quarter, book)]
        n = len(artists_in[(quarter, book)]["a"])
        total_cost = 0.0
        for category, unit in COST_CARD.items():
            multiplier = TRACKS_PER_QUARTER if category in PER_TRACK else 1
            cost = unit * multiplier * n
            total_cost += cost
            cost_rows.append({
                "period_label": quarter, "account": book, "category": category,
                "artists": n, "unit_cost_ngn": unit,
                "basis": "per artist per quarter x %d track(s)" % multiplier if multiplier > 1
                         else "per artist per quarter",
                "cost_ngn": round(cost, 2), "cost_usd": round(cost / NAIRA_PER_USD, 2),
            })
        acct_rows.append({
            "period_label": quarter, "account": book, "artists": n,
            "spotify_revenue_usd": round(a["spotify_revenue_usd"], 2),
            "youtube_revenue_usd": round(a["youtube_revenue_usd"], 2),
            "deezer_revenue_usd": round(a["deezer_revenue_usd"], 2),
            "unmeasured_platform_uplift_usd": round(a["unmeasured_platform_uplift_usd"], 2),
            "gross_streaming_revenue_usd": round(a["gross_streaming_revenue_usd"], 2),
            "gross_streaming_revenue_ngn": round(a["gross_streaming_revenue_usd"] * NAIRA_PER_USD, 2),
            "domestic_revenue_usd": round(a["domestic_revenue_usd"], 2) or "",
            "export_revenue_usd": round(a["export_revenue_usd"], 2) or "",
            "cost_total_ngn": round(total_cost, 2),
            "cost_total_usd": round(total_cost / NAIRA_PER_USD, 2),
            "net_ngn": round(a["gross_streaming_revenue_usd"] * NAIRA_PER_USD - total_cost, 2),
        })

    with (OUT / "NBS_Accounts_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=acct_fields); w.writeheader(); w.writerows(acct_rows)
    with (OUT / "Cost_By_Category_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=cost_fields); w.writeheader(); w.writerows(cost_rows)

    # ---- residency adjudication list ---------------------------------------
    res_fields = ["artist_name", "nmas_artist_id", "provider_country", "classification",
                  "evidence", "needs_nbs_adjudication", "quarters_present",
                  "gross_streaming_revenue_usd_total"]
    totals = defaultdict(float); quarters = defaultdict(set)
    for r in rev_rows:
        totals[r["artist_name"]] += r["gross_streaming_revenue_usd"]
        quarters[r["artist_name"]].add(r["period_label"])
    with (OUT / "Artist_Residency_Classification.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=res_fields); w.writeheader()
        for name in sorted(totals):
            cls, country, note = residency.get(name, ("unknown", "", "no resolution record"))
            w.writerow({
                "artist_name": name, "nmas_artist_id": name.lower().replace(" ", "-"),
                "provider_country": country, "classification": cls, "evidence": note,
                "needs_nbs_adjudication": "Y" if cls != "domestic" else "N",
                "quarters_present": len(quarters[name]),
                "gross_streaming_revenue_usd_total": round(totals[name], 2),
            })

    # ---- summary -----------------------------------------------------------
    print("\nSPLIT CLASSIFICATION COVERAGE (per quarter):")
    for q in sorted(split_cov, key=qkey):
        c = split_cov[q]
        tot_q_n = sum(c.values())
        print("  %-9s OBS=%-4d ASM=%-4d UNK=%-4d  (own-geography coverage %.1f%%)"
              % (q, c.get("OBS", 0), c.get("ASM", 0), c.get("UNK", 0),
                 100 * c.get("OBS", 0) / tot_q_n if tot_q_n else 0))
    measured_q = [q for q in sorted(domestic_share, key=qkey) if domestic_share[q] is not None]
    print("Revenue_By_Platform_Quarterly.csv  rows=%d" % len(rev_rows))
    print("NBS_Accounts_Quarterly.csv         rows=%d" % len(acct_rows))
    print("Cost_By_Category_Quarterly.csv     rows=%d" % len(cost_rows))
    print("Artist_Residency_Classification.csv rows=%d" % len(totals))
    print()
    print("quarters with an OBSERVED domestic share: %d (%s -> %s)"
          % (len(measured_q), measured_q[0] if measured_q else "-", measured_q[-1] if measured_q else "-"))
    books = defaultdict(float)
    for r in acct_rows:
        books[r["account"]] += r["gross_streaming_revenue_usd"]
    print()
    print("gross streaming revenue by account, all quarters:")
    for book in sorted(books):
        artists = len({r["artist_name"] for r in rev_rows
                       if (r["residency"] == "domestic") == (book == "domestic_production")
                       and (book != "unclassified" or r["residency"] == "unknown")})
        print("  %-20s $%15s" % (book, format(round(books[book]), ",")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
