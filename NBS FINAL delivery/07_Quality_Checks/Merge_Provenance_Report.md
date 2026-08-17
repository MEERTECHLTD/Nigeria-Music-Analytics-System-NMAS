# Merge Provenance Report

Generated 2026-08-17T01:54:02.817582+00:00

## Row provenance

| Provider | Rows | Share | Date span |
|---|---:|---:|---|
| chartmetric | 711,450 | 5.4% | 2024-01-01 → 2026-03-31 |
| soundcharts | 12,473,010 | 94.6% | 2019-01-01 → 2026-08-16 |
| **total** | **13,184,460** | 100% | |

## Precedence

- Soundcharts rows displaced by an existing Chartmetric figure: **443,547**
- Rule: where both providers report the same artist, platform, variable and date,
  the Chartmetric value is kept because it is the already-delivered figure.
- Rows rejected as malformed or non-numeric: 0

## Duplicate observations inside a single source

A row colliding with another row from the SAME provider on the same artist,
platform, variable, geography and date is a duplicate observation in that
source file, not a merge decision. Counted here rather than dropped silently:

- Duplicates within the Chartmetric delivery: **129,206**
- Duplicates within the Soundcharts extraction: **0**

## Plausibility guard exclusions

Where the two providers disagreed by more than 10x on the same series and one
side's record was diagnosed defective (stub profile or single-metric ingestion
failure — see `07_Quality_Checks/Plausibility_Rulings.csv` for every ruling with
both defect-test results), the defective provider's rows for that series were
excluded and the other provider's observations carried the series:

- Rows excluded by guard rulings: **15,863** across 35 (artist, metric, provider) series
  - 9ice · Instagram_followers_daily: 1,755 soundcharts rows excluded
  - Flavour N'abania · YouTube_subscribers_daily: 1,182 chartmetric rows excluded
  - 9ice · YouTube_subscribers_daily: 1,176 chartmetric rows excluded
  - Burna Boy · Spotify_followers_daily: 1,150 chartmetric rows excluded
  - Burna Boy · Spotify_monthly_listeners_daily: 1,103 chartmetric rows excluded
  - Portable · Spotify_monthly_listeners_daily: 822 soundcharts rows excluded
  - BNXN · Instagram_followers_daily: 694 soundcharts rows excluded
  - Portable · Spotify_followers_daily: 614 soundcharts rows excluded
  - Mayorkun · TikTok_followers_daily: 596 soundcharts rows excluded
  - Ruger · Soundcloud_followers_daily: 563 soundcharts rows excluded
  - Olamide · TikTok_followers_daily: 555 soundcharts rows excluded
  - Aṣa · YouTube_subscribers_daily: 455 chartmetric rows excluded
  - Aṣa · YouTube_channel_views_daily: 455 chartmetric rows excluded
  - Flavour N'abania · YouTube_channel_views_daily: 455 chartmetric rows excluded
  - Dice Ailes · YouTube_subscribers_daily: 451 chartmetric rows excluded
  - Nonso Amadi · Deezer_fans_daily: 442 chartmetric rows excluded
  - Shallipopi · Soundcloud_followers_daily: 419 chartmetric rows excluded
  - CKay · Deezer_fans_daily: 287 chartmetric rows excluded
  - Teni · Deezer_fans_daily: 268 chartmetric rows excluded
  - Bloody Civilian · Soundcloud_followers_daily: 243 soundcharts rows excluded
  - Shallipopi · TikTok_followers_daily: 203 soundcharts rows excluded
  - Seyi Shay · Deezer_fans_daily: 174 chartmetric rows excluded
  - Darkoo · Deezer_fans_daily: 174 chartmetric rows excluded
  - Vector · Deezer_fans_daily: 174 chartmetric rows excluded
  - Bella Shmurda · Deezer_fans_daily: 173 chartmetric rows excluded
  - Ycee · Deezer_fans_daily: 173 chartmetric rows excluded
  - Libianca · Deezer_fans_daily: 173 chartmetric rows excluded
  - Maleek Berry · Deezer_fans_daily: 173 chartmetric rows excluded
  - Reekado Banks · Deezer_fans_daily: 173 chartmetric rows excluded
  - Sarz · YouTube_subscribers_daily: 169 soundcharts rows excluded
  - D'banj · Soundcloud_followers_daily: 131 chartmetric rows excluded
  - Shallipopi · TikTok_likes_daily: 129 soundcharts rows excluded
  - P-Square · Instagram_followers_daily: 106 soundcharts rows excluded
  - Burna Boy · Deezer_fans_daily: 42 chartmetric rows excluded
  - Bracket · YouTube_subscribers_daily: 11 soundcharts rows excluded

## Files written

- `04_Datasets/Daily_Metric_Observations.csv` — 4,243,988 daily observations: all 711,450 Chartmetric rows plus Soundcharts rows for the 131 in-sample artists
- `04_Datasets/Daily_Observations_Extended_Frame.csv.gz` — 8,940,472 daily observations for the remaining frame artists, gzipped (uncompressed it exceeds 3 GB)
- `04_Datasets/Quarterly_Aggregates_Full.csv` — 420,891 quarterly cells
- `04_Datasets/Spotify_City_Geography.csv` — 1,288,942 city-level listener rows
- `04_Datasets/Coverage_By_Quarter.csv` — observation counts per quarter, variable, provider
- `04_Datasets/Artist_Resolution_Soundcharts.csv` — name→UUID decisions with confidence

## Variables by provider

| Variable | Chartmetric | Soundcharts |
|---|---:|---:|
| Amazon_Music_followers_daily | 0 | 62,299 |
| Audiomack_followers_daily | 0 | 160,455 |
| Audiomack_listeners_daily | 0 | 247,459 |
| Bandsintown_followers_daily | 16,299 | 58,371 |
| Boomplay_followers_daily | 0 | 227,550 |
| Deezer_fans_daily | 33,035 | 1,084,620 |
| Facebook_followers_daily | 13,849 | 342,086 |
| Facebook_likes_daily | 13,849 | 0 |
| Facebook_talks_daily | 13,849 | 0 |
| Genius_followers_daily | 0 | 50,633 |
| Instagram_domestic_followers_daily | 0 | 10,335 |
| Instagram_followers_daily | 54,903 | 531,993 |
| Instagram_total_followers_daily | 0 | 10,612 |
| Playlist_Amazon_Music_count_daily | 0 | 44,714 |
| Playlist_Amazon_Music_editorial_count_daily | 0 | 44,714 |
| Playlist_Amazon_Music_editorial_reach_daily | 0 | 44,714 |
| Playlist_Amazon_Music_reach_daily | 0 | 44,714 |
| Playlist_Apple_Music_count_daily | 0 | 125,846 |
| Playlist_Apple_Music_editorial_count_daily | 0 | 125,846 |
| Playlist_Apple_Music_editorial_reach_daily | 0 | 125,846 |
| Playlist_Apple_Music_reach_daily | 0 | 125,846 |
| Playlist_Deezer_count_daily | 0 | 92,852 |
| Playlist_Deezer_editorial_count_daily | 0 | 92,852 |
| Playlist_Deezer_editorial_reach_daily | 0 | 92,852 |
| Playlist_Deezer_reach_daily | 0 | 92,852 |
| Playlist_YouTube_count_daily | 0 | 53,011 |
| Playlist_YouTube_editorial_count_daily | 0 | 53,011 |
| Playlist_YouTube_editorial_reach_daily | 0 | 53,011 |
| Playlist_YouTube_reach_daily | 0 | 53,011 |
| Playlist_count_daily | 0 | 227,236 |
| Playlist_editorial_count_daily | 0 | 227,236 |
| Playlist_editorial_reach_daily | 0 | 227,236 |
| Playlist_reach_daily | 0 | 227,236 |
| Radio_spins_daily_NG | 0 | 477,059 |
| Soundcharts_fanbase_score_daily | 0 | 145,870 |
| Soundcharts_score_daily | 0 | 145,870 |
| Soundcharts_trending_score_daily | 0 | 145,870 |
| Soundcloud_followers_daily | 34,202 | 395,199 |
| Spotify_domestic_listeners_daily | 0 | 167,662 |
| Spotify_followers_daily | 78,210 | 1,327,067 |
| Spotify_monthly_listeners_daily | 80,077 | 1,038,232 |
| Spotify_popularity_daily | 41,445 | 976,635 |
| Spotify_total_listeners_daily | 0 | 232,382 |
| Tidal_followers_daily | 0 | 7,675 |
| TikTok_domestic_followers_daily | 0 | 4,610 |
| TikTok_followers_daily | 47,151 | 170,999 |
| TikTok_likes_daily | 47,629 | 159,385 |
| TikTok_total_followers_daily | 0 | 4,751 |
| Twitter_followers_daily | 35,192 | 544,423 |
| Wikipedia_views_daily | 59,565 | 0 |
| YouTube_artist_daily_views | 11,512 | 0 |
| YouTube_artist_monthly_views | 10,095 | 0 |
| YouTube_channel_views_daily | 51,856 | 432,762 |
| YouTube_domestic_followers_daily | 0 | 6,950 |
| YouTube_domestic_listeners_daily | 0 | 183,736 |
| YouTube_listeners_daily | 0 | 204,659 |
| YouTube_subscribers_daily | 68,732 | 532,153 |
| YouTube_total_followers_daily | 0 | 7,437 |
| YouTube_total_listeners_daily | 0 | 200,575 |
