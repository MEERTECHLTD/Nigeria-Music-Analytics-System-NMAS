# NMAS Extraction Notes

- Job: All Nigerian Artists (131) - Full Extraction Q1_2024 to Q4_2025
- Provider: chartmetric
- Cadence: daily
- Periods: Q1_2024, Q2_2024, Q3_2024, Q4_2024, Q1_2025, Q2_2025, Q3_2025, Q4_2025
- Variables: Spotify_monthly_listeners_daily, Spotify_followers_daily, YouTube_subscribers_daily, Shazam_counts_daily, Shazam_chart_position_daily, Where_People_Listen, TikTok_followers_daily, TikTok_likes_daily, Instagram_followers_daily, Twitter_followers_daily, Soundcloud_followers_daily, Wikipedia_views_daily, Bandsintown_followers_daily
- Observations stored: 265538
- Coverage gaps logged: 29369
- Limitations logged: 5895

## Notes

- Global-only metrics are labelled explicitly at record level.
- Where People Listen rows are preserved as Nigeria city-level proxy data when present.
- No interpolation or silent gap filling is applied.
- Unsupported economic indicators remain outside the observed dataset until approved methodology exists.

## Document Conflict Handling

- The codebase supports configurable period sets because the brief and payment/correspondence documents reference different quarter combinations.
- Extraction notes should travel with each export to explain the exact period set used for that run.

## Run Summary

- Run status: completed_with_errors
- Total units: 13624
- Completed units: 13410
- Skipped units: 0
- Failed units: 214
