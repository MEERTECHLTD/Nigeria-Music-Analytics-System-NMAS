# Verification Report — DELIVERY130

Generated 2026-09-01 00:02 UTC by `backend/scripts/verify_delivery130.py`, which recomputes every figure
from the published files using its own arithmetic. It imports no build script, so a
defect in the generators cannot hide behind a check that shares their logic.

## 1. Overall status

## **VERIFIED** — 28 of 28 checks pass.

## 2. Source of truth

`delivery130/04_Datasets/Gross_Streaming_Revenue.csv`, excluding its 31
`=== PERIOD TOTAL ===` pseudo-rows.

**Authoritative gross streaming revenue: $476,964,216.75** (₦715,446,325,125.00) over 130 artists and 31 quarters,
across 3,826 artist-quarter rows.

> Summing that file **without** excluding the pseudo-rows gives $953,928,433.50 — exactly double.
> The rows are reproduced because the first submission carried them; they are a trap
> for any reviewer who sums the column blind, and are called out here for that reason.

## 3. Results

| Section | Check | Expected | Actual | Status |
|---|---|---|---|---|
| Arithmetic | spotify_revenue_usd = listeners x 3.5 x 3 x 0.004 | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | youtube_revenue_usd = views x 0.004 | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | deezer_revenue_usd = fans x 2.0 x 3 x 0.004 | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | other_platforms_usd = spotify x 0.30 | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | gross_usd = sum of its four components | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | gross_ngn = gross_usd x 1500 | 0 failing rows | 0 of 3,826 | PASS |
| Arithmetic | est_spotify_quarterly_streams = listeners x 3.5 x 3 | 0 failing rows | 0 of 3,826 | PASS |
| Aggregation | period-total rows equal the sum of their quarter | 31 match | 0 mismatch | PASS |
| Integrity | no duplicate (period, artist) | 0 | 0 | PASS |
| Integrity | distinct artists | 130 | 130 | PASS |
| Integrity | distinct quarters | 31 | 31 | PASS |
| Integrity | no negative revenue | 0 | 0 | PASS |
| Integrity | no blank key fields | 0 | 0 | PASS |
| Provenance | every row states its YouTube volume basis | 0 unlabelled | 0 | PASS |
| Integrity | domestic share within 0-100% | 0 out of range | 0 | PASS |
| Integrity | domestic% + export% = 100 where measured | 0 | 0 | PASS |
| Classification | unmeasured export is BLANK, never zero | 0 zeros | 0 | PASS |
| Platform | platform artist_count equals the package | 130 | 130 | PASS |
| Platform | platform declares its scope | cohort130 | cohort130 | PASS |
| Cross-artifact | Excel 1 Gross_Streaming_Revenue | $476,964,216.75 | $476,964,216.75 | PASS |
| Cross-artifact | Excel 5 Artist_Totals | $476,964,216.75 | $476,964,216.75 | PASS |
| Cross-artifact | 11_Raw_Extractions copy | $476,964,216.75 | $476,964,216.75 | PASS |
| Cross-artifact | 05_Database_Extracts coverage | $476,964,216.75 | $476,964,216.75 | PASS |
| Cross-artifact | 14_Growth_Projection observed | $476,964,216.75 | $476,964,216.75 | PASS |
| Cross-artifact | Platform summary.json | $476,964,216.75 | $476,964,216.75 | PASS |
| Excel | no cell stored as a formula | 0 | 0 | PASS |
| Structure | all 13 submission folders present | 13 | 13 | PASS |
| Structure | no folder is empty | 0 | 0 | PASS |

## 4. Per-quarter reconciliation

| Quarter | Artists | Gross USD | Gross NGN |
|---|---:|---:|---:|
| Q1 2019 | 92 | $1,872,809.25 | ₦2,809,213,875 |
| Q2 2019 | 108 | $2,323,531.26 | ₦3,485,296,890 |
| Q3 2019 | 117 | $3,218,095.33 | ₦4,827,142,995 |
| Q4 2019 | 118 | $4,262,610.88 | ₦6,393,916,320 |
| Q1 2020 | 119 | $3,987,687.47 | ₦5,981,531,205 |
| Q2 2020 | 119 | $4,568,682.54 | ₦6,853,023,810 |
| Q3 2020 | 119 | $5,247,262.97 | ₦7,870,894,455 |
| Q4 2020 | 120 | $5,432,256.97 | ₦8,148,385,455 |
| Q1 2021 | 121 | $5,875,940.51 | ₦8,813,910,765 |
| Q2 2021 | 121 | $6,943,010.24 | ₦10,414,515,360 |
| Q3 2021 | 121 | $8,947,657.74 | ₦13,421,486,610 |
| Q4 2021 | 122 | $12,461,484.56 | ₦18,692,226,840 |
| Q1 2022 | 123 | $12,522,069.94 | ₦18,783,104,910 |
| Q2 2022 | 123 | $13,725,219.54 | ₦20,587,829,310 |
| Q3 2022 | 126 | $16,545,833.53 | ₦24,818,750,295 |
| Q4 2022 | 128 | $17,741,891.81 | ₦26,612,837,715 |
| Q1 2023 | 128 | $19,660,327.37 | ₦29,490,491,055 |
| Q2 2023 | 128 | $23,324,978.72 | ₦34,987,468,080 |
| Q3 2023 | 128 | $20,941,938.91 | ₦31,412,908,365 |
| Q4 2023 | 128 | $21,429,816.82 | ₦32,144,725,230 |
| Q1 2024 | 128 | $20,850,286.89 | ₦31,275,430,335 |
| Q2 2024 | 128 | $23,032,148.22 | ₦34,548,222,330 |
| Q3 2024 | 128 | $23,051,208.66 | ₦34,576,812,990 |
| Q4 2024 | 129 | $23,152,246.24 | ₦34,728,369,360 |
| Q1 2025 | 130 | $20,985,647.56 | ₦31,478,471,340 |
| Q2 2025 | 130 | $24,001,481.50 | ₦36,002,222,250 |
| Q3 2025 | 130 | $23,834,738.58 | ₦35,752,107,870 |
| Q4 2025 | 129 | $24,891,805.71 | ₦37,337,708,565 |
| Q1 2026 | 129 | $25,010,048.03 | ₦37,515,072,045 |
| Q2 2026 | 128 | $28,565,229.17 | ₦42,847,843,755 |
| Q3 2026 | 128 | $28,556,269.83 | ₦42,834,404,745 |
| **Total** | **130** | **$476,964,216.75** | **₦715,446,325,125** |

## 5. What a reviewer can reproduce without this system

Every published figure derives from other published columns by the identities in
section 3. A reviewer needs only `04_Datasets/Gross_Streaming_Revenue.csv` and a
spreadsheet to check all 3,826 rows.

## 6. What this report does NOT establish

- That a provider's audience figure is itself correct. That is the provider's
  measurement, and no check here can confirm it.
- That the per-unit rates match what a platform actually paid. No platform reports
  payouts to this system; the rates are documented assumptions.
- That estimated rows are close to the truth. They are labelled, not validated.
- The growth projection describes quarters that have not happened. It is not a
  measurement and is excluded from every reconciliation above.
