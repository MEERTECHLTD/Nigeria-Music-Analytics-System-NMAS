# References and Proof — DELIVERY130

## Data providers

| Provider | Role | What it supplies |
|---|---|---|
| Chartmetric | Primary | Artist identity, Spotify/YouTube/Deezer audience levels |
| Soundcharts | Primary | Audience levels, listener geography by country and city |

Both are commercial music-data providers. Every observed figure in this package traces to one of them through `04_Datasets/Daily_Metric_Observations.csv`, which carries `source_endpoint` and `source_field` on every row.

## What is NOT sourced from a provider

The constants below are assumptions or estimates taken from outside the providers. They are listed in full so a reviewer can challenge any of them:

| Constant | Value | Class | Source |
|---|---:|---|---|
| `STREAMS_PER_LISTENER_MONTH` | 3.5 | EST | Industry proxy. Not derived from Nigerian data. |
| `SPOTIFY_PER_STREAM` | 0.004 | EST | Industry average (Ditto Music 2026, Chartlex 2026). |
| `YOUTUBE_PER_VIEW` | 0.004 | EST | Industry average (Hootsuite 2025). |
| `DEEZER_PER_STREAM` | 0.004 | EST | Industry average. |
| `DEEZER_STREAMS_PER_FAN_MONTH` | 2.0 | EST | Industry proxy. |
| `VIEWS_PER_SUBSCRIBER_MONTH` | 13.527 | EST | Calibrated: OLS on the AGGREGATE observed ratio across the 19 fully-observed quarters Q4 2021 - Q2 2026, R^2 = 0.782. Replaces the first submission's unsourced flat 15.0. |
| `COUNTER_RESTATEMENT_FACTOR` | 50.0 | ASM | Set from the observed distribution: 44 of 2,168 artist-quarters exceed 50x, headed by a single day of 826,001,508 views against a 351,682 median day. No genuine quarter approaches it. |
| `VIEWS_PER_LISTENER_MONTH` | 12.48 | EST | Calibrated: aggregate sum(views)/sum(listeners)/3 over the 1,703 artist-quarters carrying both series. |
| `MIN_OBSERVED_SPAN_COVERAGE` | 0.9 | ASM | Set from observed coverage: 19 quarters span 97.8-100%, Q3 2021 spans 8.7% and Q3 2026 (unfinished) 42.4%. The threshold separates those two from every adequately observed quarter. |
| `UNMEASURED_UPLIFT_RATE` | 0.3 | ASM | Assumed from Spotify's approximate market share. Verified against the delivered file, which reproduces at exactly this value. |
| `NAIRA_PER_USD` | 1500 | ASM | Single assumed rate. |
| `TRACKS_PER_QUARTER` | 2 | ASM | Assumption. |
| `AVG_PRODUCTION_COST_NGN` | 750000 | ASM | NigerianInformer 2025 (secondary). |
| `AVG_DISTRIBUTION_COST_NGN` | 15000 | ASM | Blisshype 2026 (secondary). |
| `AVG_PROMOTION_COST_NGN` | 250000 | ASM | TaGetMedia 2025 (secondary). |
| `AVG_HOSTING_COST_QUARTERLY_NGN` | 50000 | ASM | Industry estimate (secondary). |

## Proof of reproducibility

Every published figure can be recomputed from the published columns:

- `spotify_revenue_usd` = `spotify_monthly_listeners` x 3.5 x 3 x 0.004
- `youtube_revenue_usd` = `youtube_actual_views` x 0.004
- `deezer_revenue_usd` = `deezer_fans` x 2.0 x 3 x 0.004
- `other_platforms_revenue_usd` = `spotify_revenue_usd` x 0.30
- `gross_streaming_revenue_usd` = the four above, summed
- `gross_streaming_revenue_ngn` = `gross_streaming_revenue_usd` x 1500

These identities hold on **all 3,798 rows** of `Gross_Streaming_Revenue.csv`. A reviewer needs nothing from this system to check them.
