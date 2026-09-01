# Methodology and Sources — DELIVERY130

## Population

The first submission's artist list: 131 rows describing 129 artists (one artist is
held twice under two provider UUIDs and is merged here).

## Revenue

Per artist per quarter, revenue is built from observed audience levels and observed
volumes where they exist, and from documented estimates where they do not. Every row
states which. Platform revenue is volume x a per-unit rate; the unmeasured-platform
uplift is a flat proportion of Spotify revenue for platforms never queried and is
carried OUTSIDE the platform breakdown so it cannot be mistaken for measurement.

## Constants

Every non-observed constant used anywhere in this package, with its class:

| Constant | Value | Class | Meaning |
|---|---:|---|---|
| `STREAMS_PER_LISTENER_MONTH` | 3.5 | EST | Converts Spotify monthly listeners (reach) into plays (volume). |
| `SPOTIFY_PER_STREAM` | 0.004 | EST | Payout per Spotify stream. |
| `YOUTUBE_PER_VIEW` | 0.004 | EST | Payout per YouTube view. |
| `DEEZER_PER_STREAM` | 0.004 | EST | Payout per Deezer stream. |
| `DEEZER_STREAMS_PER_FAN_MONTH` | 2.0 | EST | Converts Deezer fans into plays. |
| `VIEWS_PER_SUBSCRIBER_MONTH` | 13.527 | EST | Estimates YouTube views where no observed quarter volume exists (all quarters before Q3 2021, quarters whose observations do not span the period, and artists the views series never covers). |
| `COUNTER_RESTATEMENT_FACTOR` | 50.0 | ASM | Above this, a one-interval jump in a cumulative counter is a provider restatement (channel merge or backfill), not consumption, and is repriced at the median rate. |
| `VIEWS_PER_LISTENER_MONTH` | 12.48 | EST | Estimates YouTube views for artists holding a YouTube listener level but no observed view volume and no subscriber level. |
| `MIN_OBSERVED_SPAN_COVERAGE` | 0.9 | ASM | Below this, a cumulative counter's (last - first) delta measures a shorter window than the quarter and is not a valid quarterly volume, so the modelled fallback is used instead. |
| `UNMEASURED_UPLIFT_RATE` | 0.3 | ASM | Uplift for platforms never queried (Apple Music, Amazon, Boomplay, Audiomack and others). |
| `NAIRA_PER_USD` | 1500 | ASM | Fixed conversion for all naira figures. |
| `TRACKS_PER_QUARTER` | 2 | ASM | Multiplier for per-track cost categories. |
| `AVG_PRODUCTION_COST_NGN` | 750000 | ASM | Studio production cost. |
| `AVG_DISTRIBUTION_COST_NGN` | 15000 | ASM | Digital distribution cost. |
| `AVG_PROMOTION_COST_NGN` | 250000 | ASM | Promotion and marketing cost. |
| `AVG_HOSTING_COST_QUARTERLY_NGN` | 50000 | ASM | Web hosting and CDN cost. |

`EST` is an estimate derived from data; `ASM` is an assumption taken from a source
outside this system. Neither is an observation and neither is rendered as one.

## Classification vocabulary

| Code | Meaning |
|---|---|
| OBS | Observed directly from a provider endpoint |
| CNT | Counted from observed records |
| AGG | Aggregated from observations |
| EST | Estimated from observed data using a stated rule |
| ASM | Assumed from a source outside this system |
| UNK | Not measured. Never rendered as zero |
