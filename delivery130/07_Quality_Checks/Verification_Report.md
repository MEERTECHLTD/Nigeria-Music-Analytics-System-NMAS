# Verification Report — DELIVERY130

Generated 2026-09-01 00:43 UTC by `backend/scripts/verify_delivery130.py`, which recomputes every figure
from the published files using its own arithmetic. It imports no build script, so a
defect in the generators cannot hide behind a check that shares their logic.

## 1. Overall status

## **VERIFIED** — 28 of 28 checks pass.

## 2. Source of truth

`delivery130/04_Datasets/Gross_Streaming_Revenue.csv`, excluding its 31
`=== PERIOD TOTAL ===` pseudo-rows.

**Authoritative gross streaming revenue: $476,918,406.15** (₦715,377,609,225.00) over 129 artists and 31 quarters,
across 3,799 artist-quarter rows.

> Summing that file **without** excluding the pseudo-rows gives $953,836,812.30 — exactly double.
> The rows are reproduced because the first submission carried them; they are a trap
> for any reviewer who sums the column blind, and are called out here for that reason.

## 3. Results

| Section | Check | Expected | Actual | Status |
|---|---|---|---|---|
| Arithmetic | spotify_revenue_usd = listeners x 3.5 x 3 x 0.004 | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | youtube_revenue_usd = views x 0.004 | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | deezer_revenue_usd = fans x 2.0 x 3 x 0.004 | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | other_platforms_usd = spotify x 0.30 | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | gross_usd = sum of its four components | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | gross_ngn = gross_usd x 1500 | 0 failing rows | 0 of 3,799 | PASS |
| Arithmetic | est_spotify_quarterly_streams = listeners x 3.5 x 3 | 0 failing rows | 0 of 3,799 | PASS |
| Aggregation | period-total rows equal the sum of their quarter | 31 match | 0 mismatch | PASS |
| Integrity | no duplicate (period, artist) | 0 | 0 | PASS |
| Integrity | distinct artists | 129 | 129 | PASS |
| Integrity | distinct quarters | 31 | 31 | PASS |
| Integrity | no negative revenue | 0 | 0 | PASS |
| Integrity | no blank key fields | 0 | 0 | PASS |
| Provenance | every row states its YouTube volume basis | 0 unlabelled | 0 | PASS |
| Integrity | domestic share within 0-100% | 0 out of range | 0 | PASS |
| Integrity | domestic% + export% = 100 where measured | 0 | 0 | PASS |
| Classification | unmeasured export is BLANK, never zero | 0 zeros | 0 | PASS |
| Platform | platform artist_count equals the package | 129 | 129 | PASS |
| Platform | platform declares its scope | cohort130 | cohort130 | PASS |
| Cross-artifact | Excel 1 Gross_Streaming_Revenue | $476,918,406.15 | $476,918,406.15 | PASS |
| Cross-artifact | Excel 5 Artist_Totals | $476,918,406.15 | $476,918,406.15 | PASS |
| Cross-artifact | 11_Raw_Extractions copy | $476,918,406.15 | $476,918,406.15 | PASS |
| Cross-artifact | 05_Database_Extracts coverage | $476,918,406.15 | $476,918,406.15 | PASS |
| Cross-artifact | 14_Growth_Projection observed | $476,918,406.15 | $476,918,406.15 | PASS |
| Cross-artifact | Platform summary.json | $476,918,406.15 | $476,918,406.15 | PASS |
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
| Q1 2020 | 118 | $3,987,687.25 | ₦5,981,530,875 |
| Q2 2020 | 118 | $4,568,682.30 | ₦6,853,023,450 |
| Q3 2020 | 118 | $5,247,262.71 | ₦7,870,894,065 |
| Q4 2020 | 119 | $5,450,699.72 | ₦8,176,049,580 |
| Q1 2021 | 120 | $5,875,940.25 | ₦8,813,910,375 |
| Q2 2021 | 120 | $6,943,009.98 | ₦10,414,514,970 |
| Q3 2021 | 120 | $8,947,657.45 | ₦13,421,486,175 |
| Q4 2021 | 121 | $12,461,484.25 | ₦18,692,226,375 |
| Q1 2022 | 122 | $12,548,977.87 | ₦18,823,466,805 |
| Q2 2022 | 122 | $13,725,219.23 | ₦20,587,828,845 |
| Q3 2022 | 125 | $16,545,833.22 | ₦24,818,749,830 |
| Q4 2022 | 127 | $17,741,891.50 | ₦26,612,837,250 |
| Q1 2023 | 127 | $19,660,327.06 | ₦29,490,490,590 |
| Q2 2023 | 127 | $23,324,978.41 | ₦34,987,467,615 |
| Q3 2023 | 127 | $20,941,938.60 | ₦31,412,907,900 |
| Q4 2023 | 127 | $21,429,816.51 | ₦32,144,724,765 |
| Q1 2024 | 127 | $20,850,286.58 | ₦31,275,429,870 |
| Q2 2024 | 127 | $23,032,147.91 | ₦34,548,221,865 |
| Q3 2024 | 127 | $23,051,208.35 | ₦34,576,812,525 |
| Q4 2024 | 128 | $23,154,211.86 | ₦34,731,317,790 |
| Q1 2025 | 129 | $20,985,647.25 | ₦31,478,470,875 |
| Q2 2025 | 129 | $24,001,481.19 | ₦36,002,221,785 |
| Q3 2025 | 129 | $23,834,738.27 | ₦35,752,107,405 |
| Q4 2025 | 128 | $24,798,685.61 | ₦37,198,028,415 |
| Q1 2026 | 128 | $25,010,047.72 | ₦37,515,071,580 |
| Q2 2026 | 127 | $28,565,228.86 | ₦42,847,843,290 |
| Q3 2026 | 127 | $28,556,269.52 | ₦42,834,404,280 |
| **Total** | **129** | **$476,918,406.15** | **₦715,377,609,225** |

## 5. Incomplete quarter disclosed

Q3 2026 is an unfinished quarter — the revenue series end 2026-08-11 (45.7% of the quarter), the quarter closes
2026-09-30. It is included in the headline at $28,556,269.52, **5.99%** of the total.
Restricted to the 30 complete quarters the figure is **$448,362,136.63**. It is excluded from
every growth calculation. Both totals are published so neither is mistaken for the
other.

## 6. What a reviewer can reproduce without this system

Every published figure derives from other published columns by the identities in
section 3. A reviewer needs only `04_Datasets/Gross_Streaming_Revenue.csv` and a
spreadsheet to check all 3,799 rows.

## 7. What this report does NOT establish

- That a provider's audience figure is itself correct. That is the provider's
  measurement, and no check here can confirm it.
- That the per-unit rates match what a platform actually paid. No platform reports
  payouts to this system; the rates are documented assumptions.
- That estimated rows are close to the truth. They are labelled, not validated.
- The growth projection describes quarters that have not happened. It is not a
  measurement and is excluded from every reconciliation above.
