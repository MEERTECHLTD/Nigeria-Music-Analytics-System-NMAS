# Standardisation Report

Generated 2026-08-17T01:54:46.761312+00:00

## Rules enforced

| Rule | Applied to |
|---|---|
| Deterministic order — (entity_name, variable_name, date) | every dataset below |
| One numeric convention — integers as integers, fractions to 6dp | variable_value |
| period_label recomputed from the observation date | every row |
| Duplicate (artist, platform, variable, geo, date) removed once | see Duplicates_Removed_Report.csv |
| Canonical platform spellings, taken from the incumbent delivery | Platform_Register.csv |
| Declared unit and aggregation vocabulary | Variable_Register.csv |
| Provider ids bound to a stable nmas_artist_id | Artist_ID_Crosswalk.csv |

## Datasets standardised

| File | Rows |
|---|---:|
| 04_Datasets/Daily_Metric_Observations.csv | 4,243,988 |
| 04_Datasets/Daily_Observations_Extended_Frame.csv.gz | 8,940,472 |
| 04_Datasets/Quarterly_Aggregates_Full.csv | 420,891 |
| 04_Datasets/Spotify_City_Geography.csv | 1,288,942 |

## Vocabularies present

- Platforms: 18 — Amazon Music, Apple Music, Audiomack, Bandsintown, Boomplay, Deezer, Facebook, Genius, Instagram, Radio, Soundcharts, Soundcloud, Spotify, Tidal, TikTok, Twitter, Wikipedia, YouTube
- Units: 11 — fans, followers, index, likes, listeners, playlists, popularity_index, spins, subscribers, talks, views
- geo_scope: global, nigeria
- Variables: 59
- Artists in daily microdata: 131

## Conformance

No defects. Every platform, unit and geo_scope is in its register, every period_label agrees with its date, and no value carries a float artefact.

## Aggregates UNK versus revenue clamp — a designed difference, not a defect

`Quarterly_Aggregates_Full.csv` classifies a non-computable net change as `UNK`
with a blank value: a single-observation quarter (a delta requires two points) or
a negative delta on a cumulative counter (a reset/backfill artifact). The revenue
model instead clamps those same cases to a ZERO contribution — a deliberate
conservative choice that understates and never overstates, registered in the
assumptions register. The two artifacts therefore differ on these cells BY
DESIGN: a statistical table must not assert activity it cannot measure, while a
conservative estimate may forgo revenue it cannot substantiate. The raw delta is
preserved in the aggregates' `delta_raw` column so the anomaly stays traceable.

## Identifier spaces

Chartmetric keys an artist by integer, Soundcharts by UUID. Neither is
rewritten in the observation rows — that would destroy provenance — and both
are bound to a stable `nmas_artist_id` in Artist_ID_Crosswalk.csv. Join on
that column rather than on display names.

