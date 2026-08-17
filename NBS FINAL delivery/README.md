# NMAS — NBS Final Delivery

Nigerian music sector statistics, **Q1 2019 – Q3 2026 (31 quarters)**, from two
commercial data providers merged under a documented precedence and plausibility
rule, with every value classified as observed, counted, aggregated, estimated,
assumed, or unavailable.

**Start with** `02_Methodology/Data_and_Methodology_Handbook.md` — generated
from the delivered artifacts, it states how every number was obtained, the
revenue composition disclosure (71.6% of revenue rests on assumed multipliers),
the sensitivity of the headline to each assumption, and every remaining
limitation.

## Populations — quote the right number

| Population | Count |
|---|---:|
| Population frame | 855 |
| Resolved and fetched | 752 |
| Revenue-bearing (any quarter) | 734 |
| Revenue-bearing in a single quarter | 270–728 |

These are different populations. Comparing across them produced a withdrawn
audit finding (D-01); every comparison in this delivery states its population.

## Layout

```text
02_Methodology/
  Data_and_Methodology_Handbook.md     THE reference — generated, cannot drift
  Two_Provider_Methodology.md          how the two providers were joined
04_Datasets/
  Daily_Metric_Observations.csv        daily microdata, in-sample artists, OBS
  Daily_Observations_Extended_Frame.csv.gz  daily microdata, remaining artists
  Quarterly_Aggregates_Full.csv        AGG cells + classification + delta_raw
  Revenue_By_Platform_Quarterly.csv    EST revenue + per-cell split classification
  NBS_Accounts_Quarterly.csv           domestic production vs GNI diaspora books
  Cost_By_Category_Quarterly.csv       ASM cost card x measured artist counts
  Employment_Male_Female.csv           ASM, sourced, Q1 2025+ only (no back-cast)
  Export_Markets_Quarterly.csv         export destinations by country, AGG
  Nigeria_City_Geography_Quarterly.csv Nigerian city detail, AGG
  World_City_Geography_Quarterly.csv   foreign city detail, AGG
  Geography_Full_Daily.csv.gz          complete unreduced geography record, OBS
  Radio_Stations_Quarterly.csv         airplay by station and country
  Artist_Catalogue_Summary.csv         songs, albums, charts, events per artist
  Artist_ID_Crosswalk.csv              nmas_artist_id ↔ provider ids — JOIN ON THIS
  Variable_Register.csv                every variable: window, rule, providers
  Platform_Register.csv                canonical platform names
  Artist_Residency_Classification.csv  residency signal + NBS adjudication flags
  Artist_Resolution_Soundcharts.csv    name → UUID decisions with confidence
  Data_Provenance_Audit.csv            every field's tier and constants
  Observed_Values_Only.csv.gz          tier-1 rows exclusively
03_Excel_Deliveries/                   nine workbooks, cover sheets, classification
                                       marked at point of display
07_Quality_Checks/
  Merge_Provenance_Report.md           row provenance + guard exclusions itemised
  Plausibility_Rulings.csv             all 63 provider-disagreement rulings
  Duplicates_Removed_Report.csv        every removed duplicate, itemised
  Standardisation_Report.md            rules enforced; UNK-vs-clamp design note
08_References/
  NBS_Response_Notes.md                answers to the NBS correspondence
```

Chartmetric-era artifacts that predate this delivery (Gross_Export_Revenue.csv
and six others) are retired from this package and retained unchanged at
`delivery/04_Datasets/` as immutable evidence — that extraction cannot be
re-run.

## Conventions

- A **blank** cell means NOT MEASURED; **zero** means measured as zero. Never interchangeable.
- Every assumption lives in `backend/nmas/assumptions.py` (single source; UI
  imports a generated copy; a drift test enforces agreement).
- Every dataset is deterministically sorted; regeneration is byte-identical.
- Corrections are rules that regenerate output — no record is ever hand-edited.

## Regenerating

```bash
backend/.venv/bin/python3 backend/scripts/plausibility_sweep.py
backend/.venv/bin/python3 backend/scripts/merge_final_delivery.py
backend/.venv/bin/python3 backend/scripts/standardise_final_delivery.py
backend/.venv/bin/python3 backend/scripts/build_nbs_accounts.py
backend/.venv/bin/python3 backend/scripts/build_employment.py
backend/.venv/bin/python3 backend/scripts/build_all_excel.py
backend/.venv/bin/python3 backend/scripts/build_final_excel.py
backend/.venv/bin/python3 backend/scripts/generate_nbs_static_api.py
backend/.venv/bin/python3 backend/scripts/generate_extended_console_api.py
backend/.venv/bin/python3 backend/scripts/build_handbook.py
```
