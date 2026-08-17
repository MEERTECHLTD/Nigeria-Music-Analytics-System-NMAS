#!/usr/bin/env python3
"""Pass 6: nothing estimated/assumed rendered as observed; UNK is blank, never zero."""
import csv, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
D=ROOT/"NBS FINAL delivery/04_Datasets"
fail=[]
# aggregates: UNK => blank value; AGG => non-blank
n_unk=n_agg=0
with (D/"Quarterly_Aggregates_Full.csv").open(encoding="utf-8") as h:
    for r in csv.DictReader(h):
        c=r.get("classification")
        if c=="UNK":
            n_unk+=1
            if (r["variable_value"] or "").strip()!="":
                fail.append("aggregates UNK with value: %s %s %s"%(r["entity_name"],r["variable_name"],r["period_label"]))
        elif c=="AGG":
            n_agg+=1
            if (r["variable_value"] or "").strip()=="":
                fail.append("aggregates AGG blank: %s %s %s"%(r["entity_name"],r["variable_name"],r["period_label"]))
# revenue: split UNK => blank split fields; OBS/ASM => populated
with (D/"Revenue_By_Platform_Quarterly.csv").open(encoding="utf-8") as h:
    for r in csv.DictReader(h):
        sc=r.get("split_classification")
        if sc=="UNK" and (r["export_revenue_usd"] or r["domestic_revenue_usd"]):
            fail.append("revenue UNK split with values: %s %s"%(r["artist_name"],r["period_label"]))
        if sc in ("OBS","ASM") and not r["export_revenue_usd"]:
            fail.append("revenue %s split missing values: %s %s"%(sc,r["artist_name"],r["period_label"]))
# static API: pre-2021 export nulls
summary=json.loads((ROOT/"frontend/public/api/v1/nbs/summary.json").read_text())
for e in summary["export_revenue"]:
    y=int(e["period"].split("_")[1])
    if y<2021 and e["gross_export_revenue_usd"] is not None:
        fail.append("summary.json %s: export should be null (UNK), got %s"%(e["period"],e["gross_export_revenue_usd"]))
print("CLASSIFICATION: %s (aggregates AGG=%s UNK=%s)"%("PASS" if not fail else "FAIL",format(n_agg,","),format(n_unk,",")))
for f in fail[:10]: print("  "+f)
sys.exit(1 if fail else 0)
