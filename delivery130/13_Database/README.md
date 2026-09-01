# Database layer — DELIVERY130

This package ships as flat files rather than a database dump, so that a reviewer needs no database software to check it. `schema.csv` lists every table, column and row count in `04_Datasets`.

| Table | Columns | Rows |
|---|---:|---:|
| Artist_Master_List | 8 | 129 | 
| Artist_Residency_Classification | 13 | 129 | 
| Daily_Metric_Observations | 13 | 4,243,988 | 
| Domestic_Production_Account | 8 | 31 | 
| Employment_Male_Female | 6 | 15 | 
| GNI_Diaspora_Account | 8 | 31 | 
| Gross_Export_Revenue | 10 | 3,829 | 
| Gross_Streaming_Revenue | 19 | 3,829 | 
| Hosting_Production_Costs | 6 | 155 | 
| National_Accounts_Aggregates | 8 | 62 | 
| Quarterly_Aggregates_Full | 8 | 125,162 | 
| Revenue_And_Cost_By_Platform | 13 | 264 | 

The grain of `Gross_Streaming_Revenue` and `Gross_Export_Revenue` is one row per artist per quarter, plus one `=== PERIOD TOTAL ===` pseudo-row per quarter. **Exclude the pseudo-rows when summing** — including them double counts every quarter exactly.
