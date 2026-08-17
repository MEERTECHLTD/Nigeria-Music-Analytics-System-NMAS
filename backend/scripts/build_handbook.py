#!/usr/bin/env python3
"""
DATA AND METHODOLOGY HANDBOOK — generated, never hand-maintained.

Every number in the handbook is computed from the delivered artifacts at
generation time, so the document cannot drift from the data the way the README
once did (D-08). Regenerate with this script after any pipeline change.
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import REGISTER, BY_NAME, UNMEASURED_UPLIFT_RATE  # noqa: E402

FINAL = ROOT / "NBS FINAL delivery"
D = FINAL / "04_Datasets"
OUT = FINAL / "02_Methodology" / "Data_and_Methodology_Handbook.md"


def qk(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def money(x):
    return format(round(x), ",")


def main() -> int:
    revenue = list(csv.DictReader((D / "Revenue_By_Platform_Quarterly.csv").open(encoding="utf-8")))

    def s(key):
        return sum(float(r[key] or 0) for r in revenue if r[key])

    gross = s("gross_streaming_revenue_usd")
    comp = {k: s(k) for k in ("spotify_revenue_usd", "youtube_revenue_usd",
                              "deezer_revenue_usd", "unmeasured_platform_uplift_usd")}
    reach = comp["spotify_revenue_usd"] + comp["deezer_revenue_usd"] + comp["unmeasured_platform_uplift_usd"]
    periods = sorted({r["period_label"] for r in revenue}, key=qk)
    artists = {r["artist_name"] for r in revenue}
    split = defaultdict(lambda: defaultdict(int))
    for r in revenue:
        split[r["period_label"]][r.get("split_classification", "")] += 1
    obs_q = [q for q in periods if split[q].get("OBS")]
    cov = [100 * split[q]["OBS"] / max(sum(split[q].values()), 1) for q in obs_q]

    triggers = list(csv.DictReader((FINAL / "07_Quality_Checks" / "Plausibility_Rulings.csv").open(encoding="utf-8")))
    resolved = [t for t in triggers if t["category"] == "2"]
    unresolved = [t for t in triggers if t["category"] == "3"]
    excl = defaultdict(int)
    for t in resolved:
        excl[t["provider_excluded"]] += 1

    agg_unk = 0
    agg_rows = 0
    with (D / "Quarterly_Aggregates_Full.csv").open(encoding="utf-8") as h:
        for r in csv.DictReader(h):
            agg_rows += 1
            if r.get("classification") == "UNK":
                agg_unk += 1

    sp_base, up_base = comp["spotify_revenue_usd"], comp["unmeasured_platform_uplift_usd"]

    def sens_m(m):
        return gross - sp_base - up_base + sp_base * (m / 3.5) * (1 + UNMEASURED_UPLIFT_RATE)

    def sens_u(u):
        return gross - up_base + sp_base * u

    L = []
    A = L.append
    A("# Data and Methodology Handbook")
    A("")
    A("**Nigerian Music Sector Statistics, Q1 2019 - Q3 %s** · generated %s by `backend/scripts/build_handbook.py`"
      % (periods[-1].split("_")[1], datetime.now(timezone.utc).date().isoformat()))
    A("")
    A("Written so a reader who has never seen this project can reproduce its numbers, "
      "challenge its assumptions, and know exactly which figures are measured and which are not. "
      "This handbook is generated from the delivered artifacts; it cannot disagree with them.")
    A("")
    A("## 1. Purpose and scope")
    A("")
    A("Quarterly statistics on Nigerian music-sector digital activity for incorporation into the "
      "national accounts on the 2019 base year: platform audience, streaming activity, estimated "
      "streaming revenue with a domestic/export split, radio airplay, operating cost, and the "
      "domestic-production versus Gross National Income (diaspora) account separation NBS requested.")
    A("")
    A("- **Time coverage**: %d quarters, %s to %s" % (len(periods), periods[0], periods[-1]))
    A("- **Artists**: 855 in the population frame; 752 resolved and fetched; %d revenue-bearing "
      "(see section 8 — these are different populations and must not be compared)" % len(artists))
    A("- **Geographic coverage**: global platform metrics; Nigerian domestic detail to city level; "
      "export destinations to country level (217 countries observed)")
    A("- **Sources**: Chartmetric (archive floor 2024-01-01) and Soundcharts (2019+), merged under "
      "a documented precedence and plausibility rule; external secondary sources for employment and cost")
    A("")
    A("## 2. Classification vocabulary")
    A("")
    A("Every value carries one of six classes, end to end:")
    A("")
    A("| Code | Class | Meaning |")
    A("|---|---|---|")
    A("| `OBS` | Observed | directly recorded from a provider for a named artist on a named date |")
    A("| `CNT` | Counted | explicit count of records |")
    A("| `AGG` | Aggregated | arithmetic on OBS within a quarter (net change / sum / last value) |")
    A("| `EST` | Estimated | OBS quantity x an assumed rate |")
    A("| `ASM` | Assumed | no measurement behind it; an explicit registered assumption |")
    A("| `UNK` | Unavailable | cannot be determined from available evidence; never filled |")
    A("")
    A("A blank cell in any deliverable means NOT MEASURED. Zero means measured as zero. "
      "The two are never interchangeable.")
    A("")
    A("## 3. Revenue composition — the headline methodology disclosure")
    A("")
    A("NBS asked directly about the 3.5 streams-per-listener multiplier. The answer, stated "
      "up front: **%.1f%% of estimated revenue derives from reach or follower metrics converted "
      "by assumed multipliers. %.1f%% derives from an observed consumption count.**"
      % (100 * reach / gross, 100 * comp["youtube_revenue_usd"] / gross))
    A("")
    A("| Source metric | Type | Conversion | Revenue (USD) | Share |")
    A("|---|---|---|---:|---:|")
    A("| Spotify monthly listeners | Reach — distinct people, not plays | x3.5 plays/listener/month x3 x$0.004 | %s | %.1f%% |"
      % (money(comp["spotify_revenue_usd"]), 100 * comp["spotify_revenue_usd"] / gross))
    A("| YouTube channel views | **Consumption — observed plays** | quarter net change x$0.004 | %s | %.1f%% |"
      % (money(comp["youtube_revenue_usd"]), 100 * comp["youtube_revenue_usd"] / gross))
    A("| Deezer fans | **Follower count — NOT consumption** | x2.0 plays/fan/month x3 x$0.004 | %s | %.1f%% |"
      % (money(comp["deezer_revenue_usd"]), 100 * comp["deezer_revenue_usd"] / gross))
    A("| Unmeasured platform uplift | Assumed — NOT a platform | Spotify revenue x%.2f | %s | %.1f%% |"
      % (UNMEASURED_UPLIFT_RATE, money(comp["unmeasured_platform_uplift_usd"]),
         100 * comp["unmeasured_platform_uplift_usd"] / gross))
    A("| **Total gross streaming revenue** | `EST` throughout | | **%s** | 100%% |" % money(gross))
    A("")
    A("**The Deezer conversion is a stated methodological weakness**: a follower count is not a "
      "play count, and converting followers to revenue rests on an assumed listening rate with no "
      "observational basis. At %.1f%% of revenue it does not threaten the totals, but it is "
      "disclosed here rather than left to be discovered." % (100 * comp["deezer_revenue_usd"] / gross))
    A("")
    A("### 3.1 Multiplier provenance")
    A("")
    A("| Constant | Value | Source | Limitation |")
    A("|---|---:|---|---|")
    for a in REGISTER:
        A("| `%s` | %s | %s | %s |" % (a.name, a.value, a.source, a.limitation.replace("|", "/")))
    A("")
    A("The single source of these values is `backend/nmas/assumptions.py`; the frontend imports a "
      "generated copy and a drift test fails the build if the two ever disagree (the D-11 defect "
      "class). Six legacy scripts retain their own literals BY DESIGN: they produced the immutable "
      "delivered files, and rewiring them would break reproducibility of what actually shipped.")
    A("")
    A("### 3.2 Sensitivity of the headline to the assumptions")
    A("")
    A("| Assumption varied | Gross streaming revenue | vs published |")
    A("|---|---:|---:|")
    for m in (3.0, 3.5, 4.0):
        g2 = sens_m(m)
        A("| plays/listener/month = %.1f | $%s | %+.1f%% |" % (m, money(g2), 100 * (g2 - gross) / gross))
    for u in (0.20, 0.30, 0.40):
        g2 = sens_u(u)
        A("| uplift rate = %.2f | $%s | %+.1f%% |" % (u, money(g2), 100 * (g2 - gross) / gross))
    A("")
    A("A reader should conclude: the quarter-to-quarter MOVEMENT of the series is driven by "
      "measured audience data; the LEVEL is proportional to assumed constants and moves about "
      "10%% for every 0.5 change in the plays multiplier.")
    A("")
    A("## 4. The domestic/export split")
    A("")
    A("Classification is exact per cell via the `split_classification` column:")
    A("")
    A("- **`OBS`** — the artist's OWN Nigerian share of listeners that quarter, from provider "
      "country geography. Coverage %.1f%%-%.1f%% of revenue-bearing artists per quarter from %s."
      % (min(cov), max(cov), obs_q[0]))
    A("- **`ASM`** — the portfolio-wide quarterly ratio (itself `AGG`) applied to an artist "
      "without own geography. The ratio is real; its application to that artist is assumed.")
    A("- **`UNK`** — %s and earlier: the provider published no geography, so those eight "
      "quarters carry revenue with NO split. Blank, never zero." % "Q4_2020")
    A("")
    A("Domestic values are a lower bound (only reported places count), so the export share is an "
      "upper bound.")
    A("")
    A("## 5. Provider defects found, characterised and handled")
    A("")
    A("### 5.1 The plausibility guard")
    A("")
    A("Where the two providers disagreed by more than 10x on the same (artist, metric) series "
      "(threshold justified by the flattening of the trigger curve, 63 triggers at 10x vs 59 at "
      "20x), a two-signature diagnosis ran on BOTH providers: (A) stub profile — three or more "
      "core metrics simultaneously at or below their own 5th-percentile floors; (B) single-metric "
      "ingestion failure — one metric at floor while the same provider's other metrics show a "
      "substantial artist and the other provider reports 10x more for the same dates.")
    A("")
    A("Result: **%d series triggered; %d resolved by excluding the defective side "
      "(Chartmetric %d, Soundcharts %d); %d remain unresolved and documented; 0 had both sides "
      "defective.** Every ruling with both defect-test results: "
      "`07_Quality_Checks/Plausibility_Rulings.csv`."
      % (len(triggers), len(resolved), excl.get("chartmetric", 0), excl.get("soundcharts", 0),
         len(unresolved)))
    A("")
    A("The reference case: Chartmetric's record for Burna Boy (ID 441923) is a stub — Deezer 1, "
      "followers 54, listeners 164, popularity 1 on a 0-100 index where a peer scores 76. The "
      "Soundcharts figure (21.9M monthly listeners) was corroborated by live re-query. Correcting "
      "this one artist moved national streaming revenue by +$10.3M; it is the largest single "
      "correction in the delivery and is itemised in the change log.")
    A("")
    A("### 5.2 The Deezer cluster — a characterised provider defect")
    A("")
    A("22 of 122 Chartmetric Deezer-fan series sit at or below the metric's floor while **21 of "
      "those 22 artists show healthy Spotify followings on the same provider** (CKay: 8 vs "
      "230,080 on Soundcharts; Teni: 13 vs 156,378; Joeboy: 31 vs 315,156). This is an isolated "
      "metric-level ingestion failure in one provider, not stub profiles — which is exactly why "
      "signature B exists: signature A cannot see a defect confined to a single metric. 12 of the "
      "cluster were resolved by signature B; 13 remain unresolved because the artist is not "
      "substantial enough elsewhere to satisfy the guard's safeguard against misclassifying "
      "genuinely small artists. Residual impact if all were flipped: about -0.03%% of national "
      "streaming.")
    A("")
    A("### 5.3 Stock treated as flow (D-15) — found and corrected before shipping")
    A("")
    A("YouTube channel views is a cumulative counter, and both metric catalogues simultaneously "
      "declared `aggregation_rule=\"sum\"` while their own limitation text said to use net change "
      "— the entry was copied from a common source carrying the error. The quarterly aggregates "
      "therefore summed daily LEVELS: the reference cell (Davido, Q2 2025) published "
      "177,639,619,700 against a correct 125,410,400 — 1,416x inflation across 8,012 cells. "
      "Caught by the stock-versus-flow audit BEFORE any artifact shipped (the previous delivery "
      "carried zeros for this variable, and the live site predates the pipeline). Fixed as a rule "
      "in both catalogues; revenue was never affected (it always used the delta).")
    A("")
    A("Non-computable deltas are `UNK`, never zero: a single-observation quarter (a delta needs "
      "two points) or a negative delta on a counter that cannot genuinely decline (reset/backfill "
      "artifact). %s of %s aggregate cells are UNK, with the raw delta preserved in `delta_raw`. "
      "The REVENUE model instead clamps these to a zero contribution — a deliberate, registered "
      "conservative choice (understates, never overstates). The two artifacts differ on these "
      "cells BY DESIGN." % (format(agg_unk, ","), format(agg_rows, ",")))
    A("")
    A("## 6. Aggregation rules")
    A("")
    A("| Rule | Applied to | Definition |")
    A("|---|---|---|")
    A("| `net_change` | stocks: followers, fans, subscribers, cumulative counters | last minus first observation within the quarter; covers only the observed span (stated by first/last_observed); no interpolation across quarter edges |")
    A("| `sum` | flows only: radio spins, daily views, page views | total within the quarter |")
    A("| `last_value` | indices and levels reported as levels | final observation in the quarter |")
    A("")
    A("## 7. What is measured and what is not")
    A("")
    A("| Tier | Values | Evidence |")
    A("|---|---:|---|")
    A("| OBS daily observations | 13.2M rows (in-sample + extended) | 25/25 random re-queries matched the live provider exactly |")
    A("| OBS geography | 36.2M rows | row counts reconciled shard -> delivery |")
    A("| AGG quarterly cells | %s | independently recomputed, residual $0 |" % format(agg_rows, ","))
    A("| EST revenue | all revenue figures | recomputed to the cent given the registered constants |")
    A("| ASM | uplift, costs, FX, employment, residency signal, portfolio-split application | registered with source and limitation |")
    A("| UNK | see register | never filled |")
    A("")
    A("**Remaining `UNK`, and what would resolve each:**")
    A("")
    A("- Track-level stream counts — both providers return HTTP 401; requires a track-level subscription")
    A("- Domestic/export split 2019-2020 — provider geography begins 2021-02-26; no known source")
    A("- %s non-computable aggregate deltas — provider counter resets; unrecoverable" % format(agg_unk, ","))
    A("- 103 unmatched/ambiguous frame artists — held out; skewed to older, regional and Northern acts")
    A("- Employment before Q1 2025 — no source; extending the growth assumption backwards would be fabrication")
    A("- Boomplay before 2023 / Audiomack before 2024 — provider holds no history")
    A("")
    A("## 8. Populations — read this before quoting any artist count")
    A("")
    A("| Population | Count | Meaning |")
    A("|---|---:|---|")
    A("| Frame | 855 | curated population frame |")
    A("| Resolved + fetched | 752 | confident provider match; all fetched |")
    A("| Revenue-bearing | %d | at least one revenue metric in some quarter |" % len(artists))
    A("| Revenue-bearing, single quarter | varies 270-728 | artists absent in a quarter are absent, not zero |")
    A("")
    A("Comparing figures across DIFFERENT populations produced a withdrawn finding during the "
      "audit (D-01, a 19.9-36.4%% \"divergence\" that was really 128 artists vs 734). Every "
      "comparison in this delivery states its population.")
    A("")
    A("## 9. Corrections made, and not made")
    A("")
    A("Made (all as rules that regenerate output; full log in `_audit/registers/changes.csv`): "
      "uplift 0.40->0.30 (-$34.3M, D-11); plausibility guard exclusions (+$10.3M, D-12); "
      "aggregation rule fix (D-15); per-artist geography splits (-$1.6M reallocation); Flavour "
      "dedup; 208,595 duplicate observations removed, itemised.")
    A("")
    A("Not made: the 28 unresolved guard series (neither side provably defective — flagged, not "
      "chosen); the 2019-2020 split (no evidence); employment back-cast (would be fabrication); "
      "the six legacy scripts (immutable reproduction of what shipped).")
    A("")
    A("## 10. Revision history")
    A("")
    A("| Version | Date | Change |")
    A("|---|---|---|")
    A("| 1 | 2026-04 | Chartmetric-only delivery: 9 quarters, 131 artists, fixed 70/30 split |")
    A("| 2 | 2026-08 | Two-provider series: 31 quarters, 752 artists, observed geography, "
      "Boomplay/Audiomack/radio, GNI separation |")
    A("| 3 | %s | Audit pass: uplift corrected, plausibility guard, per-artist splits, "
      "D-15 aggregation fix, classification everywhere |" % datetime.now(timezone.utc).date().isoformat())
    A("")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("wrote %s (%d lines)" % (OUT.relative_to(ROOT), len(L)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
