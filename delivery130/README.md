# DELIVERY130 — Nigeria Music Analytics System
### Submission package for the National Bureau of Statistics

**129 artists x 31 quarters, Q1 2019 – Q3 2026.** Generated 2026-09-01.

| Headline | Value |
|---|---:|
| Gross streaming revenue (EST), all 31 quarters | $469,833,610 |
| — of which Q3 2026, an INCOMPLETE quarter | $28,424,708 |
| Gross streaming revenue, COMPLETE quarters only | $441,408,902 |
| In naira, at 1,500/USD | ₦704,750,415,210 |
| Artists | 129 |
| Quarters | 31 |
| Artist-quarter revenue rows | 3,798 |
| Quarters with a measured export split | 23 of 31 |
| Projected annual growth | 8.192% |

## The cohort

These are the artists of the first submission. That submission's master list holds
**131 rows** but describes **129 artists**. 2 pairs are one person carried twice under
two provider UUIDs:

- **Flavour** and **Flavour N'abania**
- **Odunsi (The Engine)** and **Odunsi**

This package counts people, so it carries 129. No artist has been added to pad the
list and none has been dropped. The second pair was found by independent
verification after the package was first built, not by the pipeline — the earlier
count of 130 was wrong and is corrected here.

## Arrangement

The file structure and column layout follow the first submission exactly, so the two
packages can be read side by side and diffed:

```
delivery130/
  01_Executive_Summary/   Executive_Summary.md
  02_Methodology/         Methodology_and_Sources.md
  03_Excel_Deliveries/    1..9 workbooks, numbered as the first submission
  04_Datasets/            the CSVs, same columns as the first submission
  07_Quality_Checks/      Quality_Check_Report.md
  14_Growth_Projection/          growth projection, model note and sensitivity
```

`Gross_Streaming_Revenue.csv` and `Gross_Export_Revenue.csv` reproduce the first
submission's `=== PERIOD TOTAL ===` pseudo-rows, so a reader who summed that file
the same way gets the same answer here. **Those rows must be excluded when summing**
— including them double counts every quarter exactly.

## What changed against the first submission

The first submission delivered 5 quarters. This delivers 31. The 26 additional
quarters were never previously reported. For the 5 that overlap, the figures are
**restated** under the current methodology; the full reconciliation, closing to
$0.00, is at `_audit/reconciliation/first_submission_vs_delivery134.md`.

## Reading the numbers

- **Blank is not zero.** A blank export figure means the split was not measured that
  quarter, not that nothing was exported. Before Q1 2021 no listener geography exists.
- **Every row states its own basis.** `youtube_views_source` says whether YouTube
  volume was observed or estimated; `spotify_listeners_source` does the same for
  Spotify. 1,876 of 3,798 rows carry observed YouTube volume, 919 are estimated, and 1,003
  have no YouTube presence at all.
- **Employment is national.** It is the whole Nigerian music sector from secondary
  sources. It is not a count of these artists' employees and is not scaled to them.
- **Costs are recomputed on this cohort**, not filtered from a larger population.
- **The projection is EST.** It describes quarters that have not happened and must
  never be summed into an observed total.
