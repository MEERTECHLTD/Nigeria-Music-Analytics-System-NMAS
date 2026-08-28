# Data and Methodology Handbook

**Nigerian Music Sector Statistics, Q1 2019 - Q3 2026** · generated 2026-08-28 by `backend/scripts/build_handbook.py`

Written so a reader who has never seen this project can reproduce its numbers, challenge its assumptions, and know exactly which figures are measured and which are not. This handbook is generated from the delivered artifacts; it cannot disagree with them.

## 1. Purpose and scope

Quarterly statistics on Nigerian music-sector digital activity for incorporation into the national accounts on the 2019 base year: platform audience, streaming activity, estimated streaming revenue with a domestic/export split, radio airplay, operating cost, and the domestic-production versus Gross National Income (diaspora) account separation NBS requested.

- **Time coverage**: 31 quarters, Q1_2019 to Q3_2026
- **Artists**: 855 in the population frame; 752 resolved and fetched; 734 revenue-bearing (see section 8 — these are different populations and must not be compared)
- **Geographic coverage**: global platform metrics; Nigerian domestic detail to city level; export destinations to country level (217 countries observed)
- **Sources**: Chartmetric (archive floor 2024-01-01) and Soundcharts (2019+), merged under a documented precedence and plausibility rule; external secondary sources for employment and cost

## 2. Classification vocabulary

Every value carries one of six classes, end to end:

| Code | Class | Meaning |
|---|---|---|
| `OBS` | Observed | directly recorded from a provider for a named artist on a named date |
| `CNT` | Counted | explicit count of records |
| `AGG` | Aggregated | arithmetic on OBS within a quarter (net change / sum / last value) |
| `EST` | Estimated | OBS quantity x an assumed rate |
| `ASM` | Assumed | no measurement behind it; an explicit registered assumption |
| `UNK` | Unavailable | cannot be determined from available evidence; never filled |

A blank cell in any deliverable means NOT MEASURED. Zero means measured as zero. The two are never interchangeable.

## 3. Revenue composition — the headline methodology disclosure

NBS asked directly about the 3.5 streams-per-listener multiplier. The answer, stated up front: **67.7% of estimated revenue derives from reach or follower metrics converted by assumed multipliers. 32.3% derives from an observed consumption count.**

| Source metric | Type | Conversion | Revenue (USD) | Share |
|---|---|---|---:|---:|
| Spotify monthly listeners | Reach — distinct people, not plays | x3.5 plays/listener/month x3 x$0.004 | 351,000,192 | 51.3% |
| YouTube channel views | **Consumption — observed plays** | quarter net change x$0.004 | 220,594,953 | 32.3% |
| Deezer fans | **Follower count — NOT consumption** | x2.0 plays/fan/month x3 x$0.004 | 6,716,908 | 1.0% |
| Unmeasured platform uplift | Assumed — NOT a platform | Spotify revenue x0.30 | 105,300,058 | 15.4% |
| **Total gross streaming revenue** | `EST` throughout | | **683,612,111** | 100% |

**The Deezer conversion is a stated methodological weakness**: a follower count is not a play count, and converting followers to revenue rests on an assumed listening rate with no observational basis. At 1.0% of revenue it does not threaten the totals, but it is disclosed here rather than left to be discovered.

### 3.1 Multiplier provenance

| Constant | Value | Source | Limitation |
|---|---:|---|---|
| `STREAMS_PER_LISTENER_MONTH` | 3.5 | Industry proxy. Not derived from Nigerian data. | Held constant for every artist, quarter and year. Revenue level scales linearly with it: at 5.0 revenue would be 43% higher, at 2.0 43% lower. Cannot be replaced without track-level stream counts, which both providers deny (HTTP 401). |
| `SPOTIFY_PER_STREAM` | 0.004 | Industry average (Ditto Music 2026, Chartlex 2026). | Flat across all 31 quarters. No Nigerian rate card obtained; actual payouts vary by territory, subscription tier and distributor. |
| `YOUTUBE_PER_VIEW` | 0.004 | Industry average (Hootsuite 2025). | Flat across all quarters; real RPM varies by territory and format. |
| `DEEZER_PER_STREAM` | 0.004 | Industry average. | Deezer is under 1% of total revenue, so sensitivity is negligible. |
| `DEEZER_STREAMS_PER_FAN_MONTH` | 2.0 | Industry proxy. | Same structural weakness as the Spotify multiplier. |
| `VIEWS_PER_SUBSCRIBER_MONTH` | 15.0 | First-submission methodology (nbs_deliverables.py); 426 of the delivered 638 rows used it, marked 'estimated'. | Applied ONLY where observation is absent; every row carries youtube_views_source stating observed versus estimated, and the dashboard's tick mark renders only for observed views. |
| `UNMEASURED_UPLIFT_RATE` | 0.3 | Assumed from Spotify's approximate market share. Verified against the delivered file, which reproduces at exactly this value. | NOT a platform and must never be presented as one. No Boomplay, Audiomack, Apple Music or Amazon revenue is measured anywhere in it. |
| `NAIRA_PER_USD` | 1500 | Single assumed rate. | The real NGN/USD rate moved materially across 2019-2026. Every naira figure in the delivery is therefore a constant-rate conversion, not a market conversion, and cross-year naira comparisons are affected. |
| `TRACKS_PER_QUARTER` | 2 | Assumption. | REPLACEABLE: actual release dates for 100,019 songs are now held in Artist_Catalogue_Summary.csv and could replace this with a counted value. |
| `AVG_PRODUCTION_COST_NGN` | 750000 | NigerianInformer 2025 (secondary). | No measured cost input exists anywhere in the pipeline. |
| `AVG_DISTRIBUTION_COST_NGN` | 15000 | Blisshype 2026 (secondary). | No measured cost input. |
| `AVG_PROMOTION_COST_NGN` | 250000 | TaGetMedia 2025 (secondary). | No measured cost input. |
| `AVG_HOSTING_COST_QUARTERLY_NGN` | 50000 | Industry estimate (secondary). | No measured cost input. |

The single source of these values is `backend/nmas/assumptions.py`; the frontend imports a generated copy and a drift test fails the build if the two ever disagree (the D-11 defect class). Six legacy scripts retain their own literals BY DESIGN: they produced the immutable delivered files, and rewiring them would break reproducibility of what actually shipped.

### 3.2 Sensitivity of the headline to the assumptions

| Assumption varied | Gross streaming revenue | vs published |
|---|---:|---:|
| plays/listener/month = 3.0 | $618,426,360 | -9.5% |
| plays/listener/month = 3.5 | $683,612,110 | -0.0% |
| plays/listener/month = 4.0 | $748,797,860 | +9.5% |
| uplift rate = 0.20 | $648,512,091 | -5.1% |
| uplift rate = 0.30 | $683,612,110 | -0.0% |
| uplift rate = 0.40 | $718,712,129 | +5.1% |

A reader should conclude: the quarter-to-quarter MOVEMENT of the series is driven by measured audience data; the LEVEL is proportional to assumed constants and moves about 10%% for every 0.5 change in the plays multiplier.

## 4. The domestic/export split

Classification is exact per cell via the `split_classification` column:

- **`OBS`** — the artist's OWN Nigerian share of listeners that quarter, from provider country geography. Coverage 76.6%-88.6% of revenue-bearing artists per quarter from Q1_2021.
- **`ASM`** — the portfolio-wide quarterly ratio (itself `AGG`) applied to an artist without own geography. The ratio is real; its application to that artist is assumed.
- **`UNK`** — Q4_2020 and earlier: the provider published no geography, so those eight quarters carry revenue with NO split. Blank, never zero.

Domestic values are a lower bound (only reported places count), so the export share is an upper bound.

## 5. Provider defects found, characterised and handled

### 5.1 The plausibility guard

Where the two providers disagreed by more than 10x on the same (artist, metric) series (threshold justified by the flattening of the trigger curve, 63 triggers at 10x vs 59 at 20x), a two-signature diagnosis ran on BOTH providers: (A) stub profile — three or more core metrics simultaneously at or below their own 5th-percentile floors; (B) single-metric ingestion failure — one metric at floor while the same provider's other metrics show a substantial artist and the other provider reports 10x more for the same dates.

Result: **63 series triggered; 35 resolved by excluding the defective side (Chartmetric 22, Soundcharts 13); 28 remain unresolved and documented; 0 had both sides defective.** Every ruling with both defect-test results: `07_Quality_Checks/Plausibility_Rulings.csv`.

The reference case: Chartmetric's record for Burna Boy (ID 441923) is a stub — Deezer 1, followers 54, listeners 164, popularity 1 on a 0-100 index where a peer scores 76. The Soundcharts figure (21.9M monthly listeners) was corroborated by live re-query. Correcting this one artist moved national streaming revenue by +$10.3M; it is the largest single correction in the delivery and is itemised in the change log.

### 5.2 The Deezer cluster — a characterised provider defect

22 of 122 Chartmetric Deezer-fan series sit at or below the metric's floor while **21 of those 22 artists show healthy Spotify followings on the same provider** (CKay: 8 vs 230,080 on Soundcharts; Teni: 13 vs 156,378; Joeboy: 31 vs 315,156). This is an isolated metric-level ingestion failure in one provider, not stub profiles — which is exactly why signature B exists: signature A cannot see a defect confined to a single metric. 12 of the cluster were resolved by signature B; 13 remain unresolved because the artist is not substantial enough elsewhere to satisfy the guard's safeguard against misclassifying genuinely small artists. Residual impact if all were flipped: about -0.03%% of national streaming.

### 5.3 Stock treated as flow (D-15) — found and corrected before shipping

YouTube channel views is a cumulative counter, and both metric catalogues simultaneously declared `aggregation_rule="sum"` while their own limitation text said to use net change — the entry was copied from a common source carrying the error. The quarterly aggregates therefore summed daily LEVELS: the reference cell (Davido, Q2 2025) published 177,639,619,700 against a correct 125,410,400 — 1,416x inflation across 8,012 cells. Caught by the stock-versus-flow audit BEFORE any artifact shipped (the previous delivery carried zeros for this variable, and the live site predates the pipeline). Fixed as a rule in both catalogues; revenue was never affected (it always used the delta).

Non-computable deltas are `UNK`, never zero: a single-observation quarter (a delta needs two points) or a negative delta on a counter that cannot genuinely decline (reset/backfill artifact). 580 of 420,891 aggregate cells are UNK, with the raw delta preserved in `delta_raw`. The REVENUE model instead clamps these to a zero contribution — a deliberate, registered conservative choice (understates, never overstates). The two artifacts differ on these cells BY DESIGN.

## 6. Aggregation rules

| Rule | Applied to | Definition |
|---|---|---|
| `net_change` | stocks: followers, fans, subscribers, cumulative counters | last minus first observation within the quarter; covers only the observed span (stated by first/last_observed); no interpolation across quarter edges |
| `sum` | flows only: radio spins, daily views, page views | total within the quarter |
| `last_value` | indices and levels reported as levels | final observation in the quarter |

## 7. What is measured and what is not

| Tier | Values | Evidence |
|---|---:|---|
| OBS daily observations | 13.2M rows (in-sample + extended) | 25/25 random re-queries matched the live provider exactly |
| OBS geography | 36.2M rows | row counts reconciled shard -> delivery |
| AGG quarterly cells | 420,891 | independently recomputed, residual $0 |
| EST revenue | all revenue figures | recomputed to the cent given the registered constants |
| ASM | uplift, costs, FX, employment, residency signal, portfolio-split application | registered with source and limitation |
| UNK | see register | never filled |

**Remaining `UNK`, and what would resolve each:**

- Track-level stream counts — both providers return HTTP 401; requires a track-level subscription
- Domestic/export split 2019-2020 — provider geography begins 2021-02-26; no known source
- 580 non-computable aggregate deltas — provider counter resets; unrecoverable
- 103 unmatched/ambiguous frame artists — held out; skewed to older, regional and Northern acts
- Employment before Q1 2025 — no source; extending the growth assumption backwards would be fabrication
- Boomplay before 2023 / Audiomack before 2024 — provider holds no history

## 8. Populations — read this before quoting any artist count

| Population | Count | Meaning |
|---|---:|---|
| Frame | 855 | curated population frame |
| Resolved + fetched | 752 | confident provider match; all fetched |
| Revenue-bearing | 734 | at least one revenue metric in some quarter |
| Revenue-bearing, single quarter | varies 270-728 | artists absent in a quarter are absent, not zero |

Comparing figures across DIFFERENT populations produced a withdrawn finding during the audit (D-01, a 19.9-36.4%% "divergence" that was really 128 artists vs 734). Every comparison in this delivery states its population.

## 9. Corrections made, and not made

Made (all as rules that regenerate output; full log in `_audit/registers/changes.csv`): uplift 0.40->0.30 (-$34.3M, D-11); plausibility guard exclusions (+$10.3M, D-12); aggregation rule fix (D-15); per-artist geography splits (-$1.6M reallocation); Flavour dedup; 208,595 duplicate observations removed, itemised.

Not made: the 28 unresolved guard series (neither side provably defective — flagged, not chosen); the 2019-2020 split (no evidence); employment back-cast (would be fabrication); the six legacy scripts (immutable reproduction of what shipped).

## 10. Revision history

| Version | Date | Change |
|---|---|---|
| 1 | 2026-04 | Chartmetric-only delivery: 9 quarters, 131 artists, fixed 70/30 split |
| 2 | 2026-08 | Two-provider series: 31 quarters, 752 artists, observed geography, Boomplay/Audiomack/radio, GNI separation |
| 3 | 2026-08-28 | Audit pass: uplift corrected, plausibility guard, per-artist splits, D-15 aggregation fix, classification everywhere |

