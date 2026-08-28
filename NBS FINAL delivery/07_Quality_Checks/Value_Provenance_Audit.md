# Value Provenance Audit

Generated 2026-08-28T18:54:53.116208+00:00

Every number in the delivery, classified by whether it was measured.

| Tier | Meaning | Values |
|---|---|---:|
| 1 OBSERVED | a provider returned it | 49,446,375 |
| 2 AGGREGATED | arithmetic rollup of tier 1 | 619,389 |
| 3 ESTIMATED | tier 1 x an assumed rate | 191,640 |
| 4 ASSUMED | constant, no measurement | 372 |

**Tiers 1 and 2 are real values.** 13,184,460 daily observations and 36,204,423 geography rows were returned by a provider for a named artist on a named date, and the quarterly figures are arithmetic on those.

`Observed_Values_Only.csv.gz` contains tier 1 exclusively - 13,184,460 rows in which every single number was measured. Use it where no assumption is acceptable.

## The constants that tiers 3 and 4 depend on

| Constant | Value | What it assumes |
|---|---:|---|
| `STREAMS_PER_LISTENER_MONTH` | 3.5 | Held constant for every artist, quarter and year. Revenue level scales linearly with it: at 5.0 revenue would be 43% higher, at 2.0 43% lower. Cannot be replaced without track-level stream counts, which both providers deny (HTTP 401). |
| `SPOTIFY_PER_STREAM` | 0.004 | Flat across all 31 quarters. No Nigerian rate card obtained; actual payouts vary by territory, subscription tier and distributor. |
| `YOUTUBE_PER_VIEW` | 0.004 | Flat across all quarters; real RPM varies by territory and format. |
| `DEEZER_PER_STREAM` | 0.004 | Deezer is under 1% of total revenue, so sensitivity is negligible. |
| `DEEZER_STREAMS_PER_FAN_MONTH` | 2.0 | Same structural weakness as the Spotify multiplier. |
| `VIEWS_PER_SUBSCRIBER_MONTH` | 13.527 | The fallback era lies BEFORE the observed window, so the rate there is an extrapolation, not a measurement; it is floored at the lowest observed ratio (5.99). Applied ONLY where observation is absent or inadequate; every row carries youtube_views_source. |
| `MIN_OBSERVED_SPAN_COVERAGE` | 0.9 | A judgement threshold, not a measurement. Quarters it rejects are labelled estimated rather than silently published low. |
| `UNMEASURED_UPLIFT_RATE` | 0.3 | NOT a platform and must never be presented as one. No Boomplay, Audiomack, Apple Music or Amazon revenue is measured anywhere in it. |
| `NAIRA_PER_USD` | 1500 | The real NGN/USD rate moved materially across 2019-2026. Every naira figure in the delivery is therefore a constant-rate conversion, not a market conversion, and cross-year naira comparisons are affected. |
| `TRACKS_PER_QUARTER` | 2 | REPLACEABLE: actual release dates for 100,019 songs are now held in Artist_Catalogue_Summary.csv and could replace this with a counted value. |
| `AVG_PRODUCTION_COST_NGN` | 750000 | No measured cost input exists anywhere in the pipeline. |
| `AVG_DISTRIBUTION_COST_NGN` | 15000 | No measured cost input. |
| `AVG_PROMOTION_COST_NGN` | 250000 | No measured cost input. |
| `AVG_HOSTING_COST_QUARTERLY_NGN` | 50000 | No measured cost input. |

Revenue cannot be made tier 1 on the current subscriptions: both providers deny track-level stream counts (HTTP 401), so plays are inferred from listener reach rather than counted. That is a limit of the data available, not a modelling choice. Cost has no measured component at all beyond the number of artists.

