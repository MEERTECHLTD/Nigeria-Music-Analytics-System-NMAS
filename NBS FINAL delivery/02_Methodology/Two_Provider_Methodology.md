# Two-Provider Methodology, 2019–2026

How the extended series was constructed, what each decision was, and where the
figures stop being trustworthy. Written so the construction can be audited or
disagreed with, not just accepted.

## 1. Why a second provider

The previous delivery covered nine quarters because Chartmetric's archive floor is
2024-01-01. No configuration, tier or query gets earlier data out of it — the
history is not there. A 2019 baseline therefore required a provider whose archive
starts earlier.

Three further gaps were closed at the same time. On the Chartmetric subscription
in use, these endpoints return HTTP 401 and were catalogued as denied:

- Boomplay and Audiomack — the two DSPs that carry the most Nigerian domestic
  consumption
- radio airplay — requested directly by NBS in correspondence
- track-level stream counts, Apple Music, Pandora, iTunes, chart endpoints

Soundcharts answers the first two on this account. Track-level streams remain
unavailable from either provider, which is why revenue is still derived from
artist-level metrics rather than measured streams.

## 2. Provider coverage, verified not assumed

Each figure below was established by querying the live account, not by reading
documentation. The first year a metric returned observations:

| Metric family | First year | Endpoint |
| --- | --- | --- |
| Followers — Spotify, YouTube, Instagram, Facebook, Twitter, SoundCloud, Deezer | 2019 | `/artist/{uuid}/audience/{platform}` |
| Spotify monthly listeners | 2019 | `/artist/{uuid}/streaming/spotify/listening` |
| Spotify total listeners | 2019 | `/artist/{uuid}/streaming/spotify` (`value`) |
| City-level listener geography | **2021** (2021-02-26) | `/artist/{uuid}/streaming/spotify` (`cityPlots`) |
| Playlist count and reach | 2019 | `/artist/{uuid}/playlist/reach/spotify` |
| Nigerian radio spins | 2019 | `/artist/{uuid}/broadcasts?countryCode=NG` |
| Spotify popularity | 2020 | `/artist/{uuid}/popularity/spotify` |
| Boomplay, TikTok, Genius | 2023 | `/artist/{uuid}/audience/{platform}` |
| Audiomack, Amazon Music, Bandsintown | 2024 | `/artist/{uuid}/audience/{platform}` |
| Tidal | 2026 | `/artist/{uuid}/audience/{platform}` |

A series that starts after 2019 does so because the provider's history does. This
is recorded per variable in `04_Datasets/Variable_Register.csv` rather than left
for a reader to infer from a gap.

## 3. Entity resolution

The population frame carries Chartmetric ids but no Spotify ids (0 of 855), so
resolution went through name search and was then adjudicated:

| Class | Artists | Admitted | Meaning |
| --- | --- | --- | --- |
| `exact_ng` | 520 | yes | Name matches exactly, provider says Nigeria |
| `exact_foreign` | 121 | yes | Name matches exactly, provider says another country |
| `exact_no_country` | 104 | yes | Name matches exactly, provider country blank |
| `ng_only` | 7 | yes | No exact match, exactly one Nigerian candidate |
| `ambiguous` | 4 | **no** | Several Nigerian candidates, none exact |
| `unmatched` | 99 | **no** | Provider returned nothing usable |

**Exact name matches are admitted whatever country the provider reports.** The
provider's country code is its own classification: it is blank for 104 artists and
set to a diaspora country for 121 more — Aṣa (FR), Crayon (FR), Nonso Amadi (CA),
Maleek Berry (GB), Amaarae (GH). The population frame was built from Nigerian
sources and is the authority on who is in scope; diaspora artists are moreover
precisely what export revenue measures.

`ambiguous` and `unmatched` artists are held out of the series. Attributing the
wrong artist's metrics to a Nigerian act would corrupt the aggregate in a way that
a missing artist does not. All 855 decisions, admitted or not, are listed in
`04_Datasets/Artist_Resolution_Soundcharts.csv`.

The 99 unmatched names are concentrated among older, regional and Northern
(Hausa-language) artists with little platform presence — a coverage bias worth
stating plainly, because it means the series under-represents exactly the part of
the sector least visible to streaming platforms.

## 4. Merge rule and precedence

Both providers reuse the same `variable_name`, so one variable is one continuous
series from 2019 to the present rather than two adjacent series a reader must
splice.

Where both answer the same `(artist, platform, variable, geo_scope, date)`, the
**Chartmetric value is kept**. It is the already-delivered, already-published
figure, and a merge that silently restated numbers NBS has already received would
be indefensible regardless of which provider is more accurate. The displaced
Soundcharts rows are counted and itemised in
`07_Quality_Checks/Duplicates_Removed_Report.csv`.

Consequence worth understanding: for 2024 onward the figures are Chartmetric's, so
the extended series does not change any number NBS has seen. Only the 2019–2023
segment and the new variables are new.

## 5. Duplicate removal

Two distinct kinds, counted separately because they mean different things.

**Within the delivered Chartmetric dataset — 130,663 rows.** The delivered file
contains 850,059 rows but only 719,396 distinct
`(artist, platform, variable, geo, date)` combinations: 15.4% are exact repeats of
an observation already present. These are removed, keeping the first occurrence.

**Within the Soundcharts extraction — repeat daily crawls.** Several endpoints,
`/playlist/reach` most visibly, return more than one item for the same calendar
date with different values (436, 432, 436, 543 on a single day) and no field that
distinguishes them: no crawl id, no timestamp, and the `type` parameter does not
separate them. They are repeated crawls of one day. Since a daily series must carry
exactly one observation per date, extraction collapses them keeping the last value
returned, which is the latest crawl under the ascending date sort.

Every removed row is itemised with its discarded value, so any removal can be
checked rather than taken on trust.

## 5b. A provider pagination defect, and how it was caught

`/artist/{uuid}/streaming/spotify` — the endpoint behind total listeners and the
whole city breakdown — behaves incorrectly when given a window longer than a
quarter. Asked for a full year it returns roughly 15 observations while reporting
`total: 54`, sets `next: null` so a well-behaved client stops paginating, and sorts
DESCENDING, so what survives is the last quarter of the year and what disappears is
everything earlier. Offset-walking does not recover the missing rows: successive
offsets slide by about a week and return overlapping records.

The extraction initially used yearly windows, which is correct and three times
cheaper for every other endpoint. The defect surfaced during aggregation: Q1 and Q2
of every year from 2021 showed 2 to 6 artists reporting total listeners, against
560 to 685 in Q3 and Q4 of the same years. A provider genuinely missing half of
each year would not produce that shape.

Requesting the endpoint per quarter returns the complete set with `total` matching
the item count. Re-extracting those three variables across all 750 artists
recovered **218,827 observations (181,157 → 399,984)** and **744,527 city rows
(544,415 → 1,288,942)**, and moved the first quarter with a measurable domestic
share from Q3 2021 to Q1 2021. Every other endpoint was verified complete against
its own reported total before this was accepted as fixed.

## 6. Quarterly aggregation

| Rule | Applied to | Definition |
| --- | --- | --- |
| `net_change` | followers, subscribers, fans, listeners | last observation minus first, within the quarter |
| `sum` | views, spins | total across the quarter |
| `last_value` | popularity index, playlist counts, city listeners | final observation in the quarter |

Stock variables use net change because a follower count is a level, and summing
levels across days produces a number with no meaning. Flow variables are summed
because a spin or a view is an event. Each cell records its rule, its observation
count and its first and last observed date, so a quarter built from three
observations is never mistaken for one built from ninety.

## 7. Domestic and export split

`/artist/{uuid}/streaming/spotify` returns a total listener figure together with a
`cityPlots` breakdown carrying country codes. Nigerian cities are summed into
`Spotify_domestic_listeners_daily`; the total is `Spotify_total_listeners_daily`.
Export is the difference.

This replaces the previous approach, in which the export figure rested on five
hardcoded percentages in a Python tuple and a single market string repeated
identically on every artist-quarter row.

**Two limits matter.**

First, coverage in time. The `value` field — total listeners — reaches 2019-05-16,
but the `cityPlots` breakdown it sits beside does not populate until 2021-02-26.
An observed domestic share therefore exists only from Q1 2021 onward. For 2019 and
2020 there is a total and no split, and presenting a split for those quarters would
mean inventing one; the workbook leaves those cells blank, and a blank is not a
zero. Probing a single artist made the geography look available from 2019 — it was
the total that was available, and only the full extraction across 750 artists
showed where the breakdown actually starts. The register states the first
observation of every variable for this reason.

Second, coverage in space. The provider reports only cities large enough to appear
in its breakdown, so the Nigerian sum is a **lower bound** on domestic listening,
and the export share derived from it is therefore an **upper bound**. It should be
presented as a ceiling, not a point estimate. City detail is delivered in
`04_Datasets/Spotify_City_Geography.csv` so the bound can be inspected directly.

## 8. What is still not measured

- **Track-level streams.** Denied by both providers on these subscriptions.
  Revenue remains derived from artist-level metrics times industry per-stream
  rates, and is an estimate, not an observation.
- **Employment and production costs.** Still from external secondary sources
  (US ITA, UNESCO, Nairametrics, Vanguard, NigerianInformer, TaGetMedia), not from
  either platform provider.
- **Boomplay and Audiomack before 2023 and 2024.** No provider history exists, so
  the domestic-DSP picture cannot be extended to 2019.
- **Radio outside the monitored panel.** Spin counts cover the Nigerian stations
  Soundcharts monitors, which is not all Nigerian radio.
- **The 103 held-out artists.** Skewed towards older, regional and Northern acts.

## 9. Reproducibility

Extraction is resumable and idempotent: one shard per artist, written atomically,
skipped if present. Merge, standardisation, Excel and the console artifact are
deterministic — every dataset is sorted on `(entity_name, variable_name, date)`, so
re-running over unchanged inputs produces byte-identical files and any diff
reflects a real change in the data.

```bash
nmas-sc backfill all      # extract 2019 → current quarter
nmas-sc all               # merge → standardise → excel → console
nmas-sc status            # pipeline state
```
