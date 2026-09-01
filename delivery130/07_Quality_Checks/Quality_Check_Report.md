# Quality Check Report — DELIVERY130

Each check states its predicate and what a failure would mean. Checks that cannot
fail by construction are not reported as passes.

| # | Check | Predicate | Result |
|---|---|---|---|
| 1 | One row per artist-quarter | no duplicate (period, artist) | PASS — 0 duplicates |
| 2 | No negative revenue | gross >= 0 on every row | PASS |
| 3 | Period totals reconcile | pseudo-row == sum of its quarter | PASS — all 31 quarters to the cent |
| 4 | Artist count | distinct artists == cohort definition | PASS — 129 |
| 5 | Export blanks are blank | unmeasured split is empty, never 0 | PASS — 23 of 31 quarters measured; the rest carry empty cells |

## Coverage, stated rather than checked

- YouTube volume: 1,875 rows observed, 920 estimated, 1,004 with no YouTube presence.
- Export split: measured in 23 of 31 quarters.
- Q3 2026 is incomplete and is excluded from growth calculations.

## What these checks do not establish

They establish internal consistency. They cannot establish that a provider's
audience figure is correct, that a per-stream rate matches what a platform actually
paid, or that an estimate is close to the truth. Those are limitations of the
inputs, and they are documented rather than tested.
