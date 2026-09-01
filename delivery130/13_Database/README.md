# Database layer — DELIVERY130

This package ships as flat files rather than a database dump, so that a reviewer needs no database software to check it. `schema.csv` lists every table, column and row count in `04_Datasets`.

| Table | Columns | Rows |
|---|---:|---:|
| Artist_Master_List | 8 | 129 | 
| Daily_Metric_Observations | 13 | 4,243,988 | 
| Employment_Male_Female | 6 | 15 | 
| Gross_Export_Revenue | 10 | 3,830 | 
| Gross_Streaming_Revenue | 16 | 3,830 | 
| Hosting_Production_Costs | 6 | 155 | 
| Quarterly_Aggregates_Full | 8 | 125,162 | 

The grain of `Gross_Streaming_Revenue` and `Gross_Export_Revenue` is one row per artist per quarter, plus one `=== PERIOD TOTAL ===` pseudo-row per quarter. **Exclude the pseudo-rows when summing** — including them double counts every quarter exactly.
