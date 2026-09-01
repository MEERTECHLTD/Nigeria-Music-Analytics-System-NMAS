# Verification Report — DELIVERY130

Generated 2026-09-01 01:16 UTC by `backend/scripts/verify_delivery130.py`, which recomputes every figure
from the published files using its own arithmetic. It imports no build script, so a
defect in the generators cannot hide behind a check that shares their logic.

## 1. Overall status

## **VERIFIED** — 38 of 38 checks pass.

## 2. Source of truth

`delivery130/04_Datasets/Gross_Streaming_Revenue.csv`, excluding its 31
`=== PERIOD TOTAL ===` pseudo-rows.

**Authoritative gross streaming revenue: $469,833,610.14** (₦502,390,063,070.36) over 129 artists and 31 quarters,
across 3,798 artist-quarter rows.

> Summing that file **without** excluding the pseudo-rows gives $939,667,220.28 — exactly double.
> The rows are reproduced because the first submission carried them; they are a trap
> for any reviewer who sums the column blind, and are called out here for that reason.

## 3. Results

| Section | Check | Expected | Actual | Status |
|---|---|---|---|---|
| Arithmetic | spotify_revenue_usd = listeners x 3.5 x 3 x 0.004 | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | youtube_revenue_usd = views x 0.004 | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | deezer_revenue_usd = fans x 2.0 x 3 x 0.004 | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | other_platforms_usd = spotify x 0.30 | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | gross_usd = sum of its four components | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | gross_ngn = gross_usd x that quarter's own rate | 0 failing rows | 0 of 3,798 | PASS |
| Arithmetic | est_spotify_quarterly_streams = listeners x 3.5 x 3 | 0 failing rows | 0 of 3,798 | PASS |
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
| Cross-artifact | Excel 1 Gross_Streaming_Revenue | $469,833,610.14 | $469,833,610.14 | PASS |
| Cross-artifact | Excel 5 Artist_Totals | $469,833,610.14 | $469,833,610.14 | PASS |
| Cross-artifact | 11_Raw_Extractions copy | $469,833,610.14 | $469,833,610.14 | PASS |
| Cross-artifact | 05_Database_Extracts coverage | $469,833,610.14 | $469,833,610.14 | PASS |
| Cross-artifact | 14_Growth_Projection observed | $469,833,610.14 | $469,833,610.14 | PASS |
| Cross-artifact | Platform summary.json | $469,833,610.14 | $469,833,610.14 | PASS |
| Excel | no cell stored as a formula | 0 | 0 | PASS |
| NBS response | Artist_Residency_Classification.csv present | exists | yes | PASS |
| NBS response | Revenue_And_Cost_By_Platform.csv present | exists | yes | PASS |
| NBS response | Domestic_Production_Account.csv present | exists | yes | PASS |
| NBS response | GNI_Diaspora_Account.csv present | exists | yes | PASS |
| NBS response | National_Accounts_Aggregates.csv present | exists | yes | PASS |
| NBS response | platform revenue sums to the headline | $469,833,610.14 | $469,833,610.14 | PASS |
| NBS response | no cost claimed as directly platform-attributable | 0 direct | 0 direct | PASS |
| NBS response | every allocated cost states its basis | 0 blank | 0 | PASS |
| NBS response | domestic + diaspora within the headline | <= $469,833,610.14 | $469,833,590.13 | PASS |
| NBS response | statistical handbook present | exists | yes (25 KB) | PASS |
| Structure | all 13 submission folders present | 13 | 13 | PASS |
| Structure | no folder is empty | 0 | 0 | PASS |

## 4. Per-quarter reconciliation

| Quarter | Artists | Gross USD | Gross NGN |
|---|---:|---:|---:|
| Q1 2019 | 92 | $1,872,809.25 | ₦574,802,615 |
| Q2 2019 | 108 | $2,287,660.09 | ₦702,128,635 |
| Q3 2019 | 117 | $3,231,443.55 | ₦991,794,654 |
| Q4 2019 | 118 | $3,966,089.02 | ₦1,217,272,042 |
| Q1 2020 | 118 | $4,049,998.77 | ₦1,453,180,059 |
| Q2 2020 | 118 | $4,358,865.45 | ₦1,564,004,512 |
| Q3 2020 | 118 | $5,181,762.78 | ₦1,859,268,303 |
| Q4 2020 | 119 | $5,431,503.49 | ₦1,948,877,767 |
| Q1 2021 | 120 | $5,568,133.79 | ₦2,233,656,870 |
| Q2 2021 | 120 | $6,768,002.84 | ₦2,714,984,339 |
| Q3 2021 | 120 | $7,959,432.59 | ₦3,192,926,383 |
| Q4 2021 | 121 | $12,244,513.48 | ₦4,911,886,583 |
| Q1 2022 | 122 | $12,174,306.36 | ₦5,186,011,023 |
| Q2 2022 | 122 | $13,250,288.40 | ₦5,644,357,853 |
| Q3 2022 | 124 | $15,980,760.50 | ₦6,807,484,358 |
| Q4 2022 | 127 | $17,198,484.51 | ₦7,326,210,432 |
| Q1 2023 | 127 | $19,163,324.49 | ₦12,360,344,296 |
| Q2 2023 | 127 | $22,322,937.87 | ₦14,398,294,926 |
| Q3 2023 | 127 | $21,271,911.06 | ₦13,720,382,634 |
| Q4 2023 | 127 | $21,057,326.34 | ₦13,581,975,489 |
| Q1 2024 | 127 | $21,085,056.69 | ₦31,163,713,788 |
| Q2 2024 | 127 | $22,607,539.11 | ₦33,413,942,805 |
| Q3 2024 | 127 | $23,468,243.91 | ₦34,686,064,499 |
| Q4 2024 | 128 | $22,756,191.69 | ₦33,633,651,318 |
| Q1 2025 | 129 | $21,542,153.27 | ₦32,959,494,503 |
| Q2 2025 | 129 | $23,814,216.41 | ₦36,435,751,107 |
| Q3 2025 | 129 | $23,961,840.73 | ₦36,661,616,317 |
| Q4 2025 | 128 | $24,569,426.28 | ₦37,591,222,208 |
| Q1 2026 | 128 | $24,721,771.73 | ₦37,824,310,747 |
| Q2 2026 | 127 | $27,542,908.02 | ₦42,140,649,271 |
| Q3 2026 | 127 | $28,424,707.67 | ₦43,489,802,735 |
| **Total** | **129** | **$469,833,610.14** | **₦502,390,063,070** |

## 5. Incomplete quarter disclosed

Q3 2026 is an unfinished quarter — the revenue series end 2026-08-11 (45.7% of the quarter), the quarter closes
2026-09-30. It is included in the headline at $28,424,707.67, **6.05%** of the total.
Restricted to the 30 complete quarters the figure is **$441,408,902.47**. It is excluded from
every growth calculation. Both totals are published so neither is mistaken for the
other.

## 6. What a reviewer can reproduce without this system

Every published figure derives from other published columns by the identities in
section 3. A reviewer needs only `04_Datasets/Gross_Streaming_Revenue.csv` and a
spreadsheet to check all 3,798 rows.

## 7. What this report does NOT establish

- That a provider's audience figure is itself correct. That is the provider's
  measurement, and no check here can confirm it.
- That the per-unit rates match what a platform actually paid. No platform reports
  payouts to this system; the rates are documented assumptions.
- That estimated rows are close to the truth. They are labelled, not validated.
- The growth projection describes quarters that have not happened. It is not a
  measurement and is excluded from every reconciliation above.
