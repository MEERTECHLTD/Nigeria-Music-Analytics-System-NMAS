# Attribution: Gross_Export_Revenue.csv vs Revenue_By_Platform_Quarterly.csv

Overlap only: 127 common artists x 5 common quarters. Populations are never mixed.

## Streaming base bridge

| Component | Amount (USD) |
|---|---:|
| OLD streaming base | 118,481,159 |
| + uplift rate 0.30 -> 0.40 (defect D-11, mine) | +5,809,677 |
| + YouTube views estimated -> observed (D-14) | -6,837,373 |
| + Deezer fans revised | +248,643 |
| + Spotify listeners revised | +11,705 |
| **= reconstructed** | **117,713,811** |
| actual NEW streaming base | 117,713,811 |
| **RESIDUAL** | **0** |

## Export bridge

| Component | Amount (USD) |
|---|---:|
| OLD export | 82,936,811 |
| + streaming base changes x 0.70 | -537,144 |
| + split 70% -> observed | -7,676,790 |
| **= reconstructed** | **74,722,877** |
| actual NEW export | 74,722,877 |
| **RESIDUAL** | **0** |

## Reproduction test

- OLD file reproduces from its OWN inputs at uplift 0.30: 638/638 rows, residual $0.00
- OLD export = OLD streaming x 0.70: residual $1.87 (rounding)
- Both bridges close to $0. The difference is FULLY EXPLAINED.

## Population difference

128 old artists vs 734 new. 127 overlap. The single artist in OLD but not NEW is
"Flavour N'abania", removed by deduplication (same artist as "Flavour", two provider
UUIDs). Population change contributes nothing to the overlap comparison by construction,
and comparing totals across the two populations is meaningless.
