#!/usr/bin/env python3
"""
DELIVERY130 — growth projection for the 130-artist cohort.

Model
    ln(revenue_t) = a + b*t + s2*Q2 + s3*Q3 + s4*Q4 + e

  Log-linear because the series compounds rather than adds: it runs from
  $1.87M to $28.6M, and a straight line on the level would fit the tail and
  ignore the base. b is therefore a growth RATE per quarter, not an amount.

  Quarterly dummies because the seasonality is real and one-directional: Q1 is
  the weakest quarter in three separate years, after the December peak. Fitting
  a trend without it would push the whole projection off by the Q1 effect and
  then blame the data.

Fitted on the COMPLETE quarters only. Q3 2026 is excluded: observations end
2026-08-11 and the quarter closes 2026-09-30, so it is an outturn-in-progress,
not a data point. Including it would drag the trend down with a quarter that
has not finished happening.

Everything here is a PROJECTION — a statement about quarters that do not exist
yet. It is labelled EST throughout and is never to be presented beside observed
revenue without that label. Intervals are prediction intervals from the fitted
residual spread; they express the model's own uncertainty and NOT the risk that
the model is the wrong shape, which no interval can express.
"""

from __future__ import annotations

import csv
import math
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import NAIRA_PER_USD  # noqa: E402

D = ROOT / "delivery130" / "04_Datasets"
OUTDIR = ROOT / "delivery130" / "14_Growth_Projection"
TOTAL_ROW = "=== PERIOD TOTAL ==="
INCOMPLETE = {"Q3_2026"}          # the revenue series end 2026-08-11 (45.7% of the quarter); quarter ends 09-30
HORIZON = 8                        # quarters projected forward

# The series contains a STRUCTURAL BREAK and must not be fitted whole. Growth on
# a trailing-twelve-month basis ran +102% to Q2 2022, fell to +4% through 2025,
# and is re-accelerating to +12% by Q2 2026 — the market matured as provider
# coverage stopped expanding and the base grew. A log-linear fit over all 30
# quarters returns +41.9%/year and projects Q4 2026 at $55M against a last
# observed quarter of $28.6M: it fits the 2019-2021 base effect and calls it the
# future. The projection is therefore fitted on the MATURE REGIME only.
#
# Window sensitivity, all ending Q2 2026:
#     last  8 quarters  +12.07%/year
#     last 12 quarters   +9.12%/year   <- used
#     last 16 quarters  +10.26%/year
#     last 20 quarters  +19.17%/year   (reaches back into the transition)
#     last 30 quarters  +41.88%/year   (the whole series; not a forecast basis)
# 12 quarters is three full seasonal cycles, long enough to identify the
# quarterly effects and short enough to exclude the transition. The alternatives
# are published beside it so the reader sees the range, not one number.
FIT_WINDOW = 12
SENSITIVITY_WINDOWS = (8, 12, 16, 20, 30)


def qkey(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def qlabel(idx):
    y, q = 2019 + idx // 4, idx % 4 + 1
    return "Q%d_%d" % (q, y)


def solve(A, b):
    """Gaussian elimination with partial pivoting."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        p = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[p][col]) < 1e-12:
            raise SystemExit("singular design matrix")
        M[col], M[p] = M[p], M[col]
        for r in range(n):
            if r == col:
                continue
            f = M[r][col] / M[col][col]
            for k in range(col, n + 1):
                M[r][k] -= f * M[col][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def ols(X, y):
    k = len(X[0])
    XtX = [[sum(X[r][i] * X[r][j] for r in range(len(X))) for j in range(k)] for i in range(k)]
    Xty = [sum(X[r][i] * y[r] for r in range(len(X))) for i in range(k)]
    beta = solve(XtX, Xty)
    fit = [sum(beta[j] * X[r][j] for j in range(k)) for r in range(len(X))]
    resid = [y[r] - fit[r] for r in range(len(X))]
    dof = max(len(X) - k, 1)
    sigma = math.sqrt(sum(e * e for e in resid) / dof)
    ybar = sum(y) / len(y)
    ss_tot = sum((v - ybar) ** 2 for v in y)
    r2 = 1 - sum(e * e for e in resid) / ss_tot if ss_tot else 0.0
    return beta, sigma, r2, fit


def main() -> int:
    rows = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))
            if r["artist_name"] != TOTAL_ROW]
    obs = defaultdict(float)
    artists = defaultdict(set)
    for r in rows:
        obs[r["period"]] += float(r["gross_streaming_revenue_usd"] or 0)
        artists[r["period"]].add(r["artist_name"])
    periods = sorted(obs, key=qkey)
    base = qkey(periods[0])

    def idx(label):
        y, q = qkey(label)
        return (y - base[0]) * 4 + (q - base[1])

    complete = [p for p in periods if p not in INCOMPLETE and obs[p] > 0]
    fit_p = complete[-FIT_WINDOW:]
    X, y = [], []
    for p in fit_p:
        t = idx(p)
        q = qkey(p)[1]
        X.append([1.0, float(t), 1.0 if q == 2 else 0.0, 1.0 if q == 3 else 0.0,
                  1.0 if q == 4 else 0.0])
        y.append(math.log(obs[p]))
    beta, sigma, r2, fitted = ols(X, y)
    a, b, s2, s3, s4 = beta

    qoq = math.exp(b) - 1
    yoy = math.exp(4 * b) - 1
    z = 1.96

    def predict(t, q):
        m = a + b * t + (s2 if q == 2 else 0) + (s3 if q == 3 else 0) + (s4 if q == 4 else 0)
        # exp of a normal mean is the MEDIAN; the mean carries the +sigma^2/2 term
        return math.exp(m + sigma * sigma / 2), math.exp(m - z * sigma), math.exp(m + z * sigma)

    # window sensitivity — the same model on different histories
    sens = []
    for w in SENSITIVITY_WINDOWS:
        sub = complete[-w:]
        if len(sub) < 6:
            continue
        Xs, ys = [], []
        for p in sub:
            t = idx(p)
            qq = qkey(p)[1]
            Xs.append([1.0, float(t), 1.0 if qq == 2 else 0.0, 1.0 if qq == 3 else 0.0,
                       1.0 if qq == 4 else 0.0])
            ys.append(math.log(obs[p]))
        try:
            bw, sw, rw, _ = ols(Xs, ys)
        except SystemExit:
            continue
        sens.append({"window_quarters": w, "from": sub[0], "to": sub[-1],
                     "quarterly_growth_pct": round((math.exp(bw[1]) - 1) * 100, 3),
                     "annual_growth_pct": round((math.exp(4 * bw[1]) - 1) * 100, 3),
                     "r2_log": round(rw, 4), "residual_sigma_log": round(sw, 4),
                     "used": "yes" if w == FIT_WINDOW else "no"})

    OUTDIR.mkdir(parents=True, exist_ok=True)
    with (OUTDIR / "Projection_Window_Sensitivity.csv").open("w", newline="", encoding="utf-8") as h:
        wtr = csv.DictWriter(h, fieldnames=list(sens[0].keys()))
        wtr.writeheader()
        wtr.writerows(sens)

    # ---- fitted vs observed (back-test) + forward projection ---------------
    cols = ["period", "basis", "observed_usd", "projected_usd", "lower_95_usd",
            "upper_95_usd", "projected_ngn", "artists_in_scope", "classification"]
    out = []
    for p in periods:
        t, q = idx(p), qkey(p)[1]
        mid, lo, hi = predict(t, q)
        out.append({"period": p,
                    "basis": "incomplete quarter (excluded from fit)" if p in INCOMPLETE
                             else ("observed, in fit window" if p in fit_p
                                   else "observed, outside fit window"),
                    "observed_usd": round(obs[p], 2),
                    "projected_usd": round(mid, 2), "lower_95_usd": round(lo, 2),
                    "upper_95_usd": round(hi, 2),
                    "projected_ngn": round(round(mid, 2) * NAIRA_PER_USD, 2),
                    "artists_in_scope": len(artists[p]),
                    "classification": "OBS" if p not in INCOMPLETE else "PARTIAL"})
    last_t = idx(periods[-1])
    for k in range(1, HORIZON + 1):
        t = last_t + k
        lab = qlabel(t)
        q = qkey(lab)[1]
        mid, lo, hi = predict(t, q)
        out.append({"period": lab, "basis": "projection", "observed_usd": "",
                    "projected_usd": round(mid, 2), "lower_95_usd": round(lo, 2),
                    "upper_95_usd": round(hi, 2),
                    "projected_ngn": round(round(mid, 2) * NAIRA_PER_USD, 2),
                    "artists_in_scope": "", "classification": "EST"})
    with (OUTDIR / "Growth_Projection_Quarterly.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=cols)
        w.writeheader()
        w.writerows(out)

    # ---- annual roll-up ----------------------------------------------------
    ann = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for r in out:
        yr = int(r["period"].split("_")[1])
        cell = ann[yr]
        cell[0] += float(r["observed_usd"] or 0)
        cell[1] += float(r["projected_usd"])
        cell[2] += 1 if r["basis"] == "projection" else 0
        cell[3] += 1
    with (OUTDIR / "Growth_Projection_Annual.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(["year", "observed_usd", "projected_usd", "projected_ngn",
                    "quarters_projected", "quarters_total", "classification"])
        for yr in sorted(ann):
            o, pr, npj, n = ann[yr]
            w.writerow([yr, round(o, 2), round(pr, 2), round(pr * NAIRA_PER_USD, 2),
                        int(npj), n, "EST" if npj else "OBS"])

    # ---- per-artist growth, observed CAGR ---------------------------------
    per = defaultdict(dict)
    for r in rows:
        per[r["artist_name"]][r["period"]] = float(r["gross_streaming_revenue_usd"] or 0)
    first_p, last_p = complete[0], complete[-1]
    yrs = (idx(last_p) - idx(first_p)) / 4.0
    arows = []
    for name, d in per.items():
        f, l = d.get(first_p, 0.0), d.get(last_p, 0.0)
        cagr = ((l / f) ** (1 / yrs) - 1) if (f > 0 and l > 0 and yrs > 0) else None
        arows.append({"artist_name": name,
                      "first_quarter": first_p, "first_usd": round(f, 2),
                      "last_quarter": last_p, "last_usd": round(l, 2),
                      "total_usd": round(sum(d.values()), 2),
                      "quarters_with_revenue": len([v for v in d.values() if v > 0]),
                      "cagr_pct": "" if cagr is None else round(cagr * 100, 2),
                      "classification": "OBS" if cagr is not None else "UNK"})
    arows.sort(key=lambda r: -r["total_usd"])
    with (OUTDIR / "Growth_By_Artist.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=list(arows[0].keys()))
        w.writeheader()
        w.writerows(arows)

    fut = [r for r in out if r["basis"] == "projection"]
    L = []
    L.append("# Growth projection — 130-artist cohort\n")
    L.append("## Model\n")
    L.append("    ln(revenue_t) = a + b*t + s2*Q2 + s3*Q3 + s4*Q4\n")
    L.append("Log-linear because the series compounds: it runs from $%s to $%s, and a"
             % (format(obs[periods[0]], ",.0f"), format(obs[complete[-1]], ",.0f")))
    L.append("straight line on the level would fit the tail and ignore the base. Quarterly")
    L.append("dummies because the seasonality is real and one-directional — Q1 is the")
    L.append("weakest quarter in three separate years, after the December peak.\n")
    L.append("## Why the whole series is NOT fitted\n")
    L.append("The series contains a structural break. Trailing-twelve-month growth ran")
    L.append("+102%% to Q2 2022, fell to +4%% through 2025, and is re-accelerating to +12%%")
    L.append("by Q2 2026 — the market matured as provider coverage stopped expanding and")
    L.append("the base grew. Fitting all 30 quarters returns +41.9%%/year and projects")
    L.append("Q4 2026 at $55M against a last observed quarter of $28.6M: it fits the")
    L.append("2019–2021 base effect and calls it the future.\n")
    L.append("The projection is fitted on the **last %d complete quarters (%s – %s)**."
             % (len(fit_p), fit_p[0].replace("_", " "), fit_p[-1].replace("_", " ")))
    L.append("Q3 2026 is excluded separately: the revenue series end 2026-08-11 (45.7% of the quarter) and the quarter")
    L.append("closes 2026-09-30, so it is an outturn in progress, not a data point.\n")
    L.append("### Window sensitivity\n")
    L.append("| Window | Period | Annual growth | R² |")
    L.append("|---|---|---:|---:|")
    for x in sens:
        L.append("| %d quarters%s | %s – %s | %+.2f%% | %.4f |"
                 % (x["window_quarters"], " **(used)**" if x["used"] == "yes" else "",
                    x["from"].replace("_", " "), x["to"].replace("_", " "),
                    x["annual_growth_pct"], x["r2_log"]))
    L.append("")
    L.append("## Fit\n")
    L.append("| Statistic | Value |")
    L.append("|---|---:|")
    L.append("| Quarterly growth rate | %.2f%% |" % (qoq * 100))
    L.append("| Implied annual growth | %.2f%% |" % (yoy * 100))
    L.append("| R² (log scale) | %.4f |" % r2)
    L.append("| Residual sigma (log) | %.4f |" % sigma)
    L.append("| Q2 seasonal effect | %+.2f%% |" % ((math.exp(s2) - 1) * 100))
    L.append("| Q3 seasonal effect | %+.2f%% |" % ((math.exp(s3) - 1) * 100))
    L.append("| Q4 seasonal effect | %+.2f%% |" % ((math.exp(s4) - 1) * 100))
    L.append("\nSeasonal effects are relative to Q1, the base quarter.\n")
    L.append("## Projection — %d quarters forward\n" % HORIZON)
    L.append("| Quarter | Projected USD | 95% lower | 95% upper |")
    L.append("|---|---:|---:|---:|")
    for r in fut:
        L.append("| %s | $%s | $%s | $%s |"
                 % (r["period"].replace("_", " "), format(r["projected_usd"], ",.0f"),
                    format(r["lower_95_usd"], ",.0f"), format(r["upper_95_usd"], ",.0f")))
    L.append("")
    L.append("## What this is not\n")
    L.append("Every projected figure is **EST** — a statement about quarters that have not")
    L.append("happened. It must never be presented beside observed revenue without that")
    L.append("label, and it must never be summed into an observed total.\n")
    L.append("The intervals are prediction intervals from the fitted residual spread. They")
    L.append("express the model's own uncertainty. They do **not** express the risk that")
    L.append("the model is the wrong shape — that a platform changes its payout, that a")
    L.append("provider changes what it reports, or that the market breaks trend. No")
    L.append("interval can. The 20- and 30-quarter rows in the sensitivity table are there")
    L.append("precisely to show how much the answer moves with that judgement.\n")
    L.append("The projection also inherits every assumption in the revenue it is fitted to:")
    L.append("the per-stream rates, the 3.5 streams/listener multiplier and the 0.30")
    L.append("unmeasured-platform uplift are ASM/EST, so the LEVEL being projected is")
    L.append("itself an estimate. The GROWTH RATE is more robust than the level, because")
    L.append("those constants scale both ends of the series equally.\n")
    (OUTDIR / "Projection_Method.md").write_text("\n".join(L), encoding="utf-8")

    print("projection written to delivery130/14_Growth_Projection/")
    print("  fit: %d complete quarters | quarterly growth %.2f%% | annual %.2f%% | R2 %.4f"
          % (len(fit_p), qoq * 100, yoy * 100, r2))
    print("  seasonality vs Q1: Q2 %+.1f%%  Q3 %+.1f%%  Q4 %+.1f%%"
          % ((math.exp(s2) - 1) * 100, (math.exp(s3) - 1) * 100, (math.exp(s4) - 1) * 100))
    for r in fut:
        print("    %-9s $%-14s [$%s - $%s]" % (r["period"], format(r["projected_usd"], ",.0f"),
              format(r["lower_95_usd"], ",.0f"), format(r["upper_95_usd"], ",.0f")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
