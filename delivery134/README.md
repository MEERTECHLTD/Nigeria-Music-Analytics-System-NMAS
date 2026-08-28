# delivery134 — Back-cast 2019–2024, First-Submission Cohort

**131 first-submission names — 130 distinct artists after the documented Flavour dedup — × all 31 quarters (Q1 2019 – Q3 2026).**

The artist list is the first submission's own master list. Every record the first
submission left behind — master list, population-frame `in_sample` flags, and its
daily observations file — agrees on **131 names**; "Flavour" and "Flavour N'abania" are one artist (the dedup is documented in the main delivery), so the package carries 130 distinct artists and does not pad the list.

The window covers **all 31 quarters**. The five quarters the first submission
itself delivered (Q1 2025 – Q1 2026) are **restated** here under the current
methodology — observed export splits, deduplication, labelled YouTube volume
source — so a difference from a first-submission figure is one of the documented
corrections, not an inconsistency.

| Headline | Value |
|---|---:|
| Gross streaming revenue (EST), 31 quarters | $476,964,216 |
| Daily observations | 4,243,988 |
| Revenue rows | 3,826 |
| Quarterly aggregate cells | 125,162 |
| YouTube volume observed / estimated (artist-quarters) | 1,875 / 920 |

## The revenue correction carried in this package

Quarters before Q3 2021 previously carried **zero** YouTube revenue: the data
provider holds no observed channel-view history there, and the rebuilt pipeline
had silently dropped the first submission's documented fallback
(views = subscribers × 15/month, applied to 426 of its 638 delivered rows).
Restored as a **labelled estimate** — every row carries `youtube_views_source`
stating observed versus estimated — contributing **$33,155,557** of labelled estimated YouTube revenue in this
package (for example, Q1 2019 moves from $36,097 to $804,569).

## Files

- `04_Datasets/Daily_Metric_Observations.csv` — cohort daily microdata (OBS)
- `04_Datasets/Revenue_By_Platform_Quarterly.csv` — EST revenue, per-cell split
  classification, per-row YouTube volume source
- `04_Datasets/Quarterly_Aggregates.csv` — AGG cells with classification
- `04_Datasets/Artist_ID_Crosswalk.csv` — join key for the cohort
- `03_Excel_Deliveries/Backcast_2019_2024_First_Submission_Cohort.xlsx`
- `02_Methodology/` and `07_Quality_Checks/` — provenance and limits

Conventions match the main delivery: blank means NOT MEASURED, never zero; the
2019–2020 domestic/export split is UNK; assumptions live in
`backend/nmas/assumptions.py`. Regenerate with `backend/scripts/build_delivery134.py`.
