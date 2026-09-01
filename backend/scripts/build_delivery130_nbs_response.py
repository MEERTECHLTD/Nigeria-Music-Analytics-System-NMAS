#!/usr/bin/env python3
"""
DELIVERY130 — datasets answering the NBS response to the first submission.

NBS asked for four things. Each gets its own dataset here.

1. DIASPORA SEPARATED. "Since the above-mentioned artists are living in those
   countries, their income will go to a different account which is not the
   production account. Kindly provide their revenue, cost of operation etc
   separate, it will be used to compile Gross National Income (GNI)."
   -> Artist_Residency_Classification.csv, Domestic_Production_Account.csv,
      GNI_Diaspora_Account.csv

2. REVENUE BY PRODUCT. "broken-down according to product, example Spotify,
   Youtube, Deezer and others to enable us know the driver of digital music."
   -> Revenue_And_Cost_By_Platform.csv

3. COST BY PRODUCT. Same request, cost side. No cost in this dataset is
   directly attributable to a platform: the cost card is per ARTIST per
   quarter, not per platform. Every cost is therefore SHARED and allocated on
   revenue share, and the file says so on every row rather than allocating
   silently.

4. NATIONAL ACCOUNTS. Revenue is not value added. Output, intermediate
   consumption and gross value added are separated so NBS can take the measure
   its framework requires.
   -> National_Accounts_Aggregates.csv

Residency is ECONOMIC RESIDENCE, not nationality. An artist of Nigerian
heritage resident abroad is not part of domestic production. The classification
carries its evidence and a flag where NBS must adjudicate.
"""
from __future__ import annotations
import csv, sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]; ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.cohort import canonical, master_list_names       # noqa: E402
from nmas.fx import ngn_per_usd, rate_basis                # noqa: E402

FINAL = ROOT / "NBS FINAL delivery" / "04_Datasets"
PKG = ROOT / "delivery130"; D = PKG / "04_Datasets"
T = "=== PERIOD TOTAL ==="
csv.field_size_limit(10 ** 9)

PLATFORMS = [("Spotify", "spotify_revenue_usd", "observed monthly listeners x streams/listener x rate"),
             ("YouTube", "youtube_revenue_usd", "channel view volume x rate"),
             ("Deezer", "deezer_revenue_usd", "observed fans x streams/fan x rate"),
             ("Other digital platforms", "unmeasured_platform_uplift_usd",
              "ASSUMPTION: a flat uplift on Spotify revenue. No platform in this "
              "bucket (Apple Music, Amazon, Boomplay, Audiomack, Tidal) was ever "
              "queried; nothing here is measured.")]

COST_CATEGORIES = ["Studio Production", "Digital Distribution",
                   "Promotion & Marketing", "Web Hosting & CDN"]


def qkey(l): q, y = l.split("_"); return (int(y), int(q[1:]))
def f0(v):
    try: return float(v or 0)
    except (TypeError, ValueError): return 0.0


def main() -> int:
    cohort = {canonical(n) for n in master_list_names()}
    rev = [r for r in csv.DictReader((FINAL / "Revenue_By_Platform_Quarterly.csv")
                                     .open(encoding="utf-8")) if r["artist_name"] in cohort]
    periods = sorted({r["period_label"] for r in rev}, key=qkey)

    res = {}
    for r in csv.DictReader((FINAL / "Artist_Residency_Classification.csv").open(encoding="utf-8")):
        if canonical(r["artist_name"]) in cohort:
            res[canonical(r["artist_name"])] = r

    def account(r):
        c = (res.get(r["artist_name"], {}) or {}).get("classification") or r.get("residency") or "unknown"
        return ("domestic_production" if c == "domestic"
                else "gni_diaspora" if c == "diaspora_candidate" else "unclassified")

    # ---- 1. residency classification ---------------------------------------
    cols = ["artist_name", "nigerian_heritage", "provider_country_of_residence",
            "residence_classification", "national_accounts_treatment",
            "included_in_domestic_production", "gni_relevant", "evidence",
            "needs_nbs_adjudication", "quarters_with_revenue",
            "gross_revenue_usd", "gross_revenue_ngn", "operating_cost_ngn"]
    tot = defaultdict(float); qs = defaultdict(set); ngn = defaultdict(float)
    for r in rev:
        a = r["artist_name"]
        tot[a] += f0(r["gross_streaming_revenue_usd"]); qs[a].add(r["period_label"])
        ngn[a] += f0(r["gross_streaming_revenue_usd"]) * ngn_per_usd(r["period_label"])

    cost_card = {}
    for r in csv.DictReader((D / "Hosting_Production_Costs.csv").open(encoding="utf-8")):
        if r["cost_category"] != T:
            cost_card[(r["period"], r["cost_category"])] = (f0(r["total_cost_ngn"]),
                                                            f0(r["num_artists"]))
    per_artist_cost = defaultdict(float)
    for (q, cat), (ngn_amt, n) in cost_card.items():
        if n:
            per_artist_cost[q] += ngn_amt / n
    art_cost = defaultdict(float)
    for r in rev:
        art_cost[r["artist_name"]] += per_artist_cost.get(r["period_label"], 0.0)

    rrows = []
    for a in sorted(tot):
        rr = res.get(a, {})
        acct = account({"artist_name": a, "residency": ""})
        dom = acct == "domestic_production"
        rrows.append({
            "artist_name": a,
            "nigerian_heritage": "Y",
            "provider_country_of_residence": rr.get("provider_country", "") or "not recorded",
            "residence_classification": rr.get("classification", "unknown"),
            "national_accounts_treatment": ("Domestic production account" if dom
                                            else "Separate — input to GNI compilation" if acct == "gni_diaspora"
                                            else "UNCLASSIFIED — NBS adjudication required"),
            "included_in_domestic_production": "Y" if dom else "N",
            "gni_relevant": "N" if dom else "Y",
            "evidence": rr.get("evidence", "") or "no residence evidence recorded",
            "needs_nbs_adjudication": rr.get("needs_nbs_adjudication", "Y"),
            "quarters_with_revenue": len(qs[a]),
            "gross_revenue_usd": round(tot[a], 2),
            "gross_revenue_ngn": round(ngn[a], 2),
            "operating_cost_ngn": round(art_cost[a], 2),
        })
    with (D / "Artist_Residency_Classification.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=cols); w.writeheader(); w.writerows(rrows)

    # ---- 2. platform revenue AND cost, per account -------------------------
    pcols = ["period", "account", "platform", "revenue_usd", "revenue_ngn",
             "revenue_share_of_quarter_pct", "direct_cost_ngn", "shared_cost_allocated_ngn",
             "cost_allocation_basis", "total_cost_ngn", "net_operating_result_ngn",
             "revenue_measurement_basis", "classification"]
    prows = []
    for q in periods:
        qrev = [r for r in rev if r["period_label"] == q]
        for acct in ("domestic_production", "gni_diaspora", "unclassified"):
            sub = [r for r in qrev if account(r) == acct]
            if not sub:
                continue
            n_artists = len({r["artist_name"] for r in sub})
            acct_cost_ngn = per_artist_cost.get(q, 0.0) * n_artists
            gross = sum(f0(r["gross_streaming_revenue_usd"]) for r in sub)
            for name, col, basis in PLATFORMS:
                v = sum(f0(r[col]) for r in sub)
                share = (v / gross) if gross else 0.0
                alloc = acct_cost_ngn * share
                prows.append({
                    "period": q, "account": acct, "platform": name,
                    "revenue_usd": round(v, 2),
                    "revenue_ngn": round(v * ngn_per_usd(q), 2),
                    "revenue_share_of_quarter_pct": round(share * 100, 4),
                    "direct_cost_ngn": 0.0,
                    "shared_cost_allocated_ngn": round(alloc, 2),
                    "cost_allocation_basis":
                        "SHARED. No cost in this dataset is directly attributable to a "
                        "platform: the cost card is per artist per quarter, not per "
                        "platform. Allocated on this platform's share of the account's "
                        "revenue in this quarter (%.4f%%)." % (share * 100),
                    "total_cost_ngn": round(alloc, 2),
                    "net_operating_result_ngn": round(v * ngn_per_usd(q) - alloc, 2),
                    "revenue_measurement_basis": basis,
                    "classification": "ASM" if name.startswith("Other") else "EST",
                })
    with (D / "Revenue_And_Cost_By_Platform.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=pcols); w.writeheader(); w.writerows(prows)

    # ---- 3. the two accounts ------------------------------------------------
    acols = ["period", "artists", "gross_revenue_usd", "gross_revenue_ngn",
             "operating_cost_ngn", "net_ngn", "ngn_per_usd", "ngn_rate_basis"]
    def account_file(acct, path):
        out = []
        for q in periods:
            sub = [r for r in rev if r["period_label"] == q and account(r) == acct]
            if not sub:
                continue
            n = len({r["artist_name"] for r in sub})
            g = sum(f0(r["gross_streaming_revenue_usd"]) for r in sub)
            c = per_artist_cost.get(q, 0.0) * n
            out.append({"period": q, "artists": n, "gross_revenue_usd": round(g, 2),
                        "gross_revenue_ngn": round(g * ngn_per_usd(q), 2),
                        "operating_cost_ngn": round(c, 2),
                        "net_ngn": round(g * ngn_per_usd(q) - c, 2),
                        "ngn_per_usd": ngn_per_usd(q), "ngn_rate_basis": rate_basis(q)})
        with path.open("w", newline="", encoding="utf-8") as h:
            w = csv.DictWriter(h, fieldnames=acols); w.writeheader(); w.writerows(out)
        return out
    dom = account_file("domestic_production", D / "Domestic_Production_Account.csv")
    gni = account_file("gni_diaspora", D / "GNI_Diaspora_Account.csv")

    # ---- 4. national accounts aggregates -----------------------------------
    ncols = ["period", "account", "output_ngn", "intermediate_consumption_ngn",
             "gross_value_added_ngn", "compensation_of_employees_ngn",
             "operating_surplus_mixed_income_ngn", "basis"]
    nrows = []
    for src, acct in ((dom, "domestic_production"), (gni, "gni_diaspora")):
        for r in src:
            out_ngn = r["gross_revenue_ngn"]; ic = r["operating_cost_ngn"]
            nrows.append({
                "period": r["period"], "account": acct,
                "output_ngn": out_ngn, "intermediate_consumption_ngn": ic,
                "gross_value_added_ngn": round(out_ngn - ic, 2),
                "compensation_of_employees_ngn": "",
                "operating_surplus_mixed_income_ngn": round(out_ngn - ic, 2),
                "basis": ("Output = gross streaming revenue. All four cost categories are "
                          "purchased services and are treated here as intermediate "
                          "consumption. The cost card contains NO labour component, so "
                          "compensation of employees is NOT MEASURED (blank, not zero) and "
                          "the whole of value added falls to operating surplus / mixed "
                          "income. NBS should confirm this treatment against its own "
                          "SNA classification before use."),
            })
    with (D / "National_Accounts_Aggregates.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=ncols); w.writeheader(); w.writerows(nrows)

    dg = sum(r["gross_revenue_usd"] for r in dom); gg = sum(r["gross_revenue_usd"] for r in gni)
    print("NBS-response datasets written")
    print("  residency          : %d artists (%d domestic / %d diaspora / %d unclassified)"
          % (len(rrows), sum(1 for r in rrows if r["included_in_domestic_production"] == "Y"),
             sum(1 for r in rrows if r["gni_relevant"] == "Y" and r["residence_classification"] == "diaspora_candidate"),
             sum(1 for r in rrows if r["residence_classification"] == "unknown")))
    print("  domestic production: $%s  (%d quarters)" % (format(dg, ",.2f"), len(dom)))
    print("  GNI diaspora       : $%s  (%d quarters)" % (format(gg, ",.2f"), len(gni)))
    print("  platform rows      : %d (%d platforms x accounts x quarters)" % (len(prows), len(PLATFORMS)))
    print("  national accounts  : %d rows" % len(nrows))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
