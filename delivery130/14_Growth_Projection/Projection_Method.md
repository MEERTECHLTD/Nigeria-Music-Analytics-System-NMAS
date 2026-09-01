# Growth projection — 130-artist cohort

## Model

    ln(revenue_t) = a + b*t + s2*Q2 + s3*Q3 + s4*Q4

Log-linear because the series compounds: it runs from $1,872,809 to $27,542,908, and a
straight line on the level would fit the tail and ignore the base. Quarterly
dummies because the seasonality is real and one-directional — Q1 is the
weakest quarter in three separate years, after the December peak.

## Why the whole series is NOT fitted

The series contains a structural break. Trailing-twelve-month growth ran
+102% to Q2 2022, fell to +4% through 2025, and is re-accelerating to +12%
by Q2 2026 — the market matured as provider coverage stopped expanding and
the base grew. Fitting all 30 quarters returns +41.9%/year and projects
Q4 2026 at $55M against a last observed quarter of $28.6M: it fits the
2019–2021 base effect and calls it the future.

The projection is fitted on the **last 12 complete quarters (Q3 2023 – Q2 2026)**.
Q3 2026 is excluded separately: the revenue series end 2026-08-11 (45.7% of the quarter) and the quarter
closes 2026-09-30, so it is an outturn in progress, not a data point.

### Window sensitivity

| Window | Period | Annual growth | R² |
|---|---|---:|---:|
| 8 quarters | Q3 2024 – Q2 2026 | +9.98% | 0.8561 |
| 12 quarters **(used)** | Q3 2023 – Q2 2026 | +8.19% | 0.9121 |
| 16 quarters | Q3 2022 – Q2 2026 | +10.32% | 0.8479 |
| 20 quarters | Q3 2021 – Q2 2026 | +20.09% | 0.7736 |
| 30 quarters | Q1 2019 – Q2 2026 | +42.26% | 0.8910 |

## Fit

| Statistic | Value |
|---|---:|
| Quarterly growth rate | 1.99% |
| Implied annual growth | 8.19% |
| R² (log scale) | 0.9121 |
| Residual sigma (log) | 0.0299 |
| Q2 seasonal effect | +7.57% |
| Q3 seasonal effect | +6.23% |
| Q4 seasonal effect | +3.61% |

Seasonal effects are relative to Q1, the base quarter.

## Projection — 8 quarters forward

| Quarter | Projected USD | 95% lower | 95% upper |
|---|---:|---:|---:|
| Q4 2026 | $26,641,062 | $25,114,348 | $28,235,362 |
| Q1 2027 | $26,224,069 | $24,721,252 | $27,793,415 |
| Q2 2027 | $28,770,807 | $27,122,045 | $30,492,559 |
| Q3 2027 | $28,976,807 | $27,316,239 | $30,710,887 |
| Q4 2027 | $28,823,544 | $27,171,759 | $30,548,452 |
| Q1 2028 | $28,372,390 | $26,746,460 | $30,070,300 |
| Q2 2028 | $31,127,762 | $29,343,930 | $32,990,563 |
| Q3 2028 | $31,350,637 | $29,554,033 | $33,226,776 |

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
