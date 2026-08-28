# Growth projection — 130-artist cohort

## Model

    ln(revenue_t) = a + b*t + s2*Q2 + s3*Q3 + s4*Q4

Log-linear because the series compounds: it runs from $1,872,809 to $28,565,229, and a
straight line on the level would fit the tail and ignore the base. Quarterly
dummies because the seasonality is real and one-directional — Q1 is the
weakest quarter in three separate years, after the December peak.

## Why the whole series is NOT fitted

The series contains a structural break. Trailing-twelve-month growth ran
+102%% to Q2 2022, fell to +4%% through 2025, and is re-accelerating to +12%%
by Q2 2026 — the market matured as provider coverage stopped expanding and
the base grew. Fitting all 30 quarters returns +41.9%%/year and projects
Q4 2026 at $55M against a last observed quarter of $28.6M: it fits the
2019–2021 base effect and calls it the future.

The projection is fitted on the **last 12 complete quarters (Q3 2023 – Q2 2026)**.
Q3 2026 is excluded separately: observations end 2026-08-16 and the quarter
closes 2026-09-30, so it is an outturn in progress, not a data point.

### Window sensitivity

| Window | Period | Annual growth | R² |
|---|---|---:|---:|
| 8 quarters | Q3 2024 – Q2 2026 | +12.06% | 0.8560 |
| 12 quarters **(used)** | Q3 2023 – Q2 2026 | +8.82% | 0.8886 |
| 16 quarters | Q3 2022 – Q2 2026 | +9.59% | 0.8529 |
| 20 quarters | Q3 2021 – Q2 2026 | +18.78% | 0.7883 |
| 30 quarters | Q1 2019 – Q2 2026 | +41.80% | 0.8850 |

## Fit

| Statistic | Value |
|---|---:|
| Quarterly growth rate | 2.14% |
| Implied annual growth | 8.82% |
| R² (log scale) | 0.8886 |
| Residual sigma (log) | 0.0387 |
| Q2 seasonal effect | +10.64% |
| Q3 seasonal effect | +6.08% |
| Q4 seasonal effect | +6.34% |

Seasonal effects are relative to Q1, the base quarter.

## Projection — 8 quarters forward

| Quarter | Projected USD | 95% lower | 95% upper |
|---|---:|---:|---:|
| Q4 2026 | $27,393,577 | $25,373,879 | $29,529,793 |
| Q1 2027 | $26,311,305 | $24,371,402 | $28,363,123 |
| Q2 2027 | $29,732,367 | $27,540,233 | $32,050,967 |
| Q3 2027 | $29,115,007 | $26,968,390 | $31,385,463 |
| Q4 2027 | $29,810,269 | $27,612,391 | $32,134,944 |
| Q1 2028 | $28,632,518 | $26,521,474 | $30,865,349 |
| Q2 2028 | $32,355,390 | $29,969,863 | $34,878,539 |
| Q3 2028 | $31,683,565 | $29,347,571 | $34,154,324 |

## What this is not

Every projected figure is **EST** — a statement about quarters that have not
happened. It must never be presented beside observed revenue without that
label, and it must never be summed into an observed total.

The intervals are prediction intervals from the fitted residual spread. They
express the model's own uncertainty. They do **not** express the risk that
the model is the wrong shape — that a platform changes its payout, that a
provider changes what it reports, or that the market breaks trend. No
interval can. The 20- and 30-quarter rows in the sensitivity table are there
precisely to show how much the answer moves with that judgement.

The projection also inherits every assumption in the revenue it is fitted to:
the per-stream rates, the 3.5 streams/listener multiplier and the 0.30
unmeasured-platform uplift are ASM/EST, so the LEVEL being projected is
itself an estimate. The GROWTH RATE is more robust than the level, because
those constants scale both ends of the series equally.
