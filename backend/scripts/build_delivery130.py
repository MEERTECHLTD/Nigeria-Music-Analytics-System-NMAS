#!/usr/bin/env python3
"""
DELIVERY130 — the first-submission cohort, every quarter, in the first
submission's own file structure and column layout.

Scope
  Artists  130 — the first submission's list. Its master list holds 131 ROWS,
           but "Flavour" and "Flavour N'abania" are one artist under two
           provider UUIDs (nmas.cohort), so 130 is the count of people.
  Quarters all 31, Q1 2019 - Q3 2026.

Arrangement
  Mirrors delivery/ (the first submission) file for file and column for column,
  so the two packages can be read side by side and diffed:
      04_Datasets/Gross_Streaming_Revenue.csv    same 15 columns
      04_Datasets/Gross_Export_Revenue.csv       same 10 columns
      04_Datasets/Employment_Male_Female.csv     same  6 columns
      04_Datasets/Hosting_Production_Costs.csv   same  6 columns
      04_Datasets/Quarterly_Aggregates_Full.csv  same  8 columns
      04_Datasets/Artist_Master_List.csv         same  8 columns
  including the first submission's '=== PERIOD TOTAL ===' pseudo-rows, so a
  reader who summed that file the same way gets the same answer.

One column is deliberately NOT copied. The first submission wrote an identical
literal market list ("US, UK, France, Ghana, South Africa") on all 638 export
rows; it was not a detection. Here top_export_markets is computed PER ARTIST
from observed Spotify listener geography, and left blank where that artist has
no geography in that quarter — blank meaning not measured, never zero.

Everything is FILTERED or RE-DERIVED from the canonical NBS FINAL delivery; no
figure is recomputed on a different basis, and no figure is hand-entered.
"""

from __future__ import annotations

import csv
import gzip
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from nmas.cohort import canonical, counts, master_list_names  # noqa: E402
from nmas.assumptions import (  # noqa: E402
    NAIRA_PER_USD, STREAMS_PER_LISTENER_MONTH, TRACKS_PER_QUARTER,
    AVG_PRODUCTION_COST_NGN, AVG_DISTRIBUTION_COST_NGN,
    AVG_PROMOTION_COST_NGN, AVG_HOSTING_COST_QUARTERLY_NGN,
)

FINAL = ROOT / "NBS FINAL delivery" / "04_Datasets"
OUT = ROOT / "delivery130"
TOTAL_ROW = "=== PERIOD TOTAL ==="
SRC = "Chartmetric + Soundcharts (observed); see 02_Methodology"

csv.field_size_limit(10 ** 9)


def qkey(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def f0(v):
    n = num(v)
    return 0.0 if n is None else n


def main() -> int:
    cohort_raw = set(master_list_names())
    cohort = {canonical(n) for n in cohort_raw}
    both = cohort_raw | cohort
    c = counts()

    for sub in ("01_Executive_Summary", "02_Methodology", "03_Excel_Deliveries",
                "04_Datasets", "07_Quality_Checks", "14_Growth_Projection"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    D = OUT / "04_Datasets"

    # ---- 1. revenue rows, mapped onto the first submission's columns -------
    rev = [r for r in csv.DictReader((FINAL / "Revenue_By_Platform_Quarterly.csv")
                                     .open(encoding="utf-8"))
           if r["artist_name"] in cohort]
    periods = sorted({r["period_label"] for r in rev}, key=qkey)

    # subscriber levels + per-artist observed geography for the market column
    subs = {}
    for r in csv.DictReader((FINAL / "Quarterly_Aggregates_Full.csv").open(encoding="utf-8")):
        if r["variable_name"] == "YouTube_subscribers_daily" and r["entity_name"] in both:
            v = num(r["period_max"])
            if v is not None:
                subs[(canonical(r["entity_name"]), r["period_label"])] = v

    print("computing per-artist export markets from observed listener geography...")
    geo = defaultdict(lambda: defaultdict(float))     # (artist, q) -> country -> listeners
    last_seen = {}
    with gzip.open(FINAL / "Geography_Full_Daily.csv.gz", "rt", encoding="utf-8") as h:
        for r in csv.DictReader(h):
            if r.get("level") != "country" or r["entity_name"] not in both:
                continue
            a = canonical(r["entity_name"])
            k = (a, r["period_label"], r.get("country_code") or r.get("country_name"))
            d = r.get("date", "")
            if last_seen.get(k, "") <= d:                # last observation in the quarter
                last_seen[k] = d
                geo[(a, r["period_label"])][r.get("country_name") or "?"] = f0(r.get("value"))
    print("  geography cells: %d artist-quarters" % len(geo))

    def markets(artist, quarter):
        cell = geo.get((artist, quarter))
        if not cell:
            return ""                                    # not measured — never a literal
        foreign = sorted(((v, k) for k, v in cell.items()
                          if k.lower() not in ("nigeria",) and v > 0), reverse=True)
        return ", ".join(k for _v, k in foreign[:5])

    # ---- 2. Gross_Streaming_Revenue.csv ------------------------------------
    stream_cols = ["period", "artist_name", "spotify_monthly_listeners",
                   "youtube_subscribers", "youtube_actual_views", "youtube_views_source",
                   "deezer_fans", "est_spotify_quarterly_streams", "spotify_revenue_usd",
                   "youtube_revenue_usd", "deezer_revenue_usd", "other_platforms_revenue_usd",
                   "gross_streaming_revenue_usd", "gross_streaming_revenue_ngn", "source",
                   "spotify_listeners_source"]
    export_cols = ["period", "artist_name", "total_streaming_revenue_usd",
                   "nigeria_domestic_share_pct", "domestic_revenue_usd", "export_share_pct",
                   "gross_export_revenue_usd", "gross_export_revenue_ngn",
                   "top_export_markets", "source"]

    by_q = defaultdict(list)
    for r in rev:
        by_q[r["period_label"]].append(r)

    srows, erows = [], []
    for q in periods:
        rs = sorted(by_q[q], key=lambda r: -f0(r["gross_streaming_revenue_usd"]))
        st, ex = [], []
        for r in rs:
            a = r["artist_name"]
            # Round the LEVEL first, then derive from the rounded level, so every
            # published figure reproduces from the published columns. Deriving
            # from the unrounded value and publishing the rounded one left 6 rows
            # whose revenue could not be recomputed from their own listener count.
            listeners = float(round(f0(r["spotify_monthly_listeners"])))
            st.append({
                "period": q, "artist_name": a,
                "spotify_monthly_listeners": int(listeners),
                "youtube_subscribers": int(subs.get((a, q), 0)),
                "youtube_actual_views": int(f0(r["youtube_quarter_views"])),
                "youtube_views_source": r.get("youtube_views_source", ""),
                "deezer_fans": int(f0(r["deezer_fans"])),
                "est_spotify_quarterly_streams":
                    round(listeners * STREAMS_PER_LISTENER_MONTH * 3),
                "spotify_revenue_usd": round(f0(r["spotify_revenue_usd"]), 2),
                "youtube_revenue_usd": round(f0(r["youtube_revenue_usd"]), 2),
                "deezer_revenue_usd": round(f0(r["deezer_revenue_usd"]), 2),
                "other_platforms_revenue_usd": round(f0(r["unmeasured_platform_uplift_usd"]), 2),
                # Gross is the SUM OF THE PUBLISHED COMPONENTS, not the rounded
                # canonical gross. Rounding each component to the cent and then
                # publishing an independently-rounded total left 6 rows where the
                # four parts did not add up to their own total (sum-of-rounded is
                # not rounded-sum). The difference across the whole package is a
                # few cents; a total that does not equal its own parts is a
                # reconciliation failure a reviewer would raise immediately.
                "gross_streaming_revenue_usd": round(
                    round(f0(r["spotify_revenue_usd"]), 2)
                    + round(f0(r["youtube_revenue_usd"]), 2)
                    + round(f0(r["deezer_revenue_usd"]), 2)
                    + round(f0(r["unmeasured_platform_uplift_usd"]), 2), 2),
                # NGN from the ROUNDED USD actually published. Computing it from the
                # unrounded value left 3,263 of 3,826 rows where usd x 1500 did not
                # equal the published naira — immaterial in value (NGN 84.69 across
                # a NGN 715bn base) but not reproducible, which is what matters here.
                "gross_streaming_revenue_ngn": round(round(
                    round(f0(r["spotify_revenue_usd"]), 2)
                    + round(f0(r["youtube_revenue_usd"]), 2)
                    + round(f0(r["deezer_revenue_usd"]), 2)
                    + round(f0(r["unmeasured_platform_uplift_usd"]), 2), 2) * NAIRA_PER_USD, 2),
                "source": SRC,
                "spotify_listeners_source": (r.get("spotify_listeners_source") or ""),
            })
            dom_share = num(r["domestic_share_observed"])
            dom = num(r["domestic_revenue_usd"])
            exp = num(r["export_revenue_usd"])
            exn = num(r["export_revenue_ngn"])
            ex.append({
                "period": q, "artist_name": a,
                "total_streaming_revenue_usd": round(f0(r["gross_streaming_revenue_usd"]), 2),
                "nigeria_domestic_share_pct": "" if dom_share is None else round(dom_share * 100, 4),
                "domestic_revenue_usd": "" if dom is None else round(dom, 2),
                "export_share_pct": "" if dom_share is None else round((1 - dom_share) * 100, 4),
                "gross_export_revenue_usd": "" if exp is None else round(exp, 2),
                "gross_export_revenue_ngn": "" if exp is None else round(round(exp, 2) * NAIRA_PER_USD, 2),
                "top_export_markets": markets(a, q),
                "source": (r.get("split_basis") or "") + " | " + SRC,
            })
        # the first submission's own pseudo-row, reproduced so the two files sum alike
        srows.extend(st)
        srows.append({**{k: "" for k in stream_cols}, "period": q, "artist_name": TOTAL_ROW,
                      "gross_streaming_revenue_usd": round(sum(x["gross_streaming_revenue_usd"] for x in st), 2),
                      "gross_streaming_revenue_ngn": round(sum(x["gross_streaming_revenue_ngn"] for x in st), 2),
                      "spotify_revenue_usd": round(sum(x["spotify_revenue_usd"] for x in st), 2),
                      "youtube_revenue_usd": round(sum(x["youtube_revenue_usd"] for x in st), 2),
                      "deezer_revenue_usd": round(sum(x["deezer_revenue_usd"] for x in st), 2),
                      "other_platforms_revenue_usd": round(sum(x["other_platforms_revenue_usd"] for x in st), 2),
                      "source": "Aggregated"})
        erows.extend(ex)
        me = [x for x in ex if x["gross_export_revenue_usd"] != ""]
        erows.append({**{k: "" for k in export_cols}, "period": q, "artist_name": TOTAL_ROW,
                      "total_streaming_revenue_usd": round(sum(x["total_streaming_revenue_usd"] for x in ex), 2),
                      "domestic_revenue_usd": round(sum(x["domestic_revenue_usd"] for x in me), 2) if me else "",
                      "gross_export_revenue_usd": round(sum(x["gross_export_revenue_usd"] for x in me), 2) if me else "",
                      "gross_export_revenue_ngn": round(sum(x["gross_export_revenue_ngn"] for x in me), 2) if me else "",
                      "source": "Aggregated"})

    def write(path, cols, rows):
        with path.open("w", newline="", encoding="utf-8") as h:
            w = csv.DictWriter(h, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
        return len(rows)

    n_s = write(D / "Gross_Streaming_Revenue.csv", stream_cols, srows)
    n_e = write(D / "Gross_Export_Revenue.csv", export_cols, erows)

    # ---- 3. costs, recomputed on the cohort's own artist counts ------------
    CARD = [("Studio Production", AVG_PRODUCTION_COST_NGN, True),
            ("Digital Distribution", AVG_DISTRIBUTION_COST_NGN, True),
            ("Promotion & Marketing", AVG_PROMOTION_COST_NGN, True),
            ("Web Hosting & CDN", AVG_HOSTING_COST_QUARTERLY_NGN, False)]
    crows = []
    for q in periods:
        n = len({r["artist_name"] for r in by_q[q]})
        tot = 0.0
        for cat, unit, per_track in CARD:
            ngn = unit * (TRACKS_PER_QUARTER if per_track else 1) * n
            tot += ngn
            crows.append({"period": q, "cost_category": cat, "num_artists": n,
                          "total_cost_ngn": round(ngn, 2),
                          "total_cost_usd": round(ngn / NAIRA_PER_USD, 2),
                          "source": "Unit cost card (ASM) x artists observed in scope"})
        crows.append({"period": q, "cost_category": TOTAL_ROW, "num_artists": n,
                      "total_cost_ngn": round(tot, 2),
                      "total_cost_usd": round(tot / NAIRA_PER_USD, 2), "source": "Aggregated"})
    n_c = write(D / "Hosting_Production_Costs.csv",
                ["period", "cost_category", "num_artists", "total_cost_ngn",
                 "total_cost_usd", "source"], crows)

    # ---- 4. employment — NATIONAL, carried unchanged and labelled ----------
    emp = list(csv.DictReader((FINAL / "Employment_Male_Female.csv").open(encoding="utf-8")))
    ecols = ["period", "category", "total_employment", "male", "female", "source"]
    erow2 = [{"period": r.get("period") or r.get("period_label"),
              "category": r.get("category", ""),
              "total_employment": r.get("total_employment", ""),
              "male": r.get("male", ""), "female": r.get("female", ""),
              "source": (r.get("source", "") + " | NATIONAL sector total; not a count of "
                         "these 130 artists' employees and not scaled to them").strip(" |")}
             for r in emp]
    n_emp = write(D / "Employment_Male_Female.csv", ecols, erow2)

    # ---- 5. aggregates, on the first submission's 8 columns ----------------
    acols = ["entity_name", "variable_name", "period_label", "aggregation_rule",
             "aggregated_value", "min_value", "max_value", "obs_count"]
    n_a = 0
    with (D / "Quarterly_Aggregates_Full.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=acols)
        w.writeheader()
        for r in csv.DictReader((FINAL / "Quarterly_Aggregates_Full.csv").open(encoding="utf-8")):
            if r["entity_name"] not in both:
                continue
            w.writerow({"entity_name": canonical(r["entity_name"]),
                        "variable_name": r["variable_name"],
                        "period_label": r["period_label"],
                        "aggregation_rule": r["aggregation_rule"],
                        "aggregated_value": r["variable_value"],
                        # Named for what they are. The first submission called these
                        # first_value/last_value, but the underlying columns are the
                        # MIN and MAX of the quarter, not its chronologically first
                        # and last observations. For a fluctuating level such as
                        # monthly listeners those are different numbers, and the old
                        # names asserted something the data does not support.
                        "min_value": r["period_min"], "max_value": r["period_max"],
                        "obs_count": r["observations"]})
            n_a += 1

    # ---- 6. master list, on the first submission's 8 columns ---------------
    src_master = {r["artist_name"]: r for r in
                  csv.DictReader((ROOT / "delivery/04_Datasets/Artist_Master_List.csv")
                                 .open(encoding="utf-8"))}
    xw = {r["artist_name"]: r for r in
          csv.DictReader((FINAL / "Artist_ID_Crosswalk.csv").open(encoding="utf-8"))}
    mcols = ["cm_artist_id", "artist_name", "country", "genres", "label",
             "spotify_id", "youtube_id", "status"]
    mrows = []
    for a in sorted(cohort):
        s = src_master.get(a) or {}
        x = xw.get(a) or {}
        mrows.append({"cm_artist_id": s.get("cm_artist_id") or x.get("chartmetric_artist_id", ""),
                      "artist_name": a, "country": s.get("country", "NG"),
                      "genres": s.get("genres", ""), "label": s.get("label", ""),
                      "spotify_id": s.get("spotify_id", ""), "youtube_id": s.get("youtube_id", ""),
                      "status": s.get("status", "verified")})
    n_m = write(D / "Artist_Master_List.csv", mcols, mrows)

    # ---- 7. daily observations for the cohort (streamed) -------------------
    n_d = 0
    with (FINAL / "Daily_Metric_Observations.csv").open(encoding="utf-8") as fin, \
         (D / "Daily_Metric_Observations.csv").open("w", newline="", encoding="utf-8") as fout:
        rd = csv.DictReader(fin)
        wr = csv.DictWriter(fout, fieldnames=rd.fieldnames)
        wr.writeheader()
        for r in rd:
            if r["entity_name"] in both:
                wr.writerow(r)
                n_d += 1

    totals = {q: sum(f0(r["gross_streaming_revenue_usd"]) for r in by_q[q]) for q in periods}
    print("delivery130: %d artists x %d quarters" % (len(cohort), len(periods)))
    print("  streaming %d rows | export %d | costs %d | employment %d | aggregates %d "
          "| master %d | daily %d" % (n_s, n_e, n_c, n_emp, n_a, n_m, n_d))
    print("  gross streaming revenue, all quarters: $%s" % format(sum(totals.values()), ",.2f"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
