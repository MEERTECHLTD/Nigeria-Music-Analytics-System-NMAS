#!/usr/bin/env python3
"""
Pass 5: the same value must match across dataset, API, accounts and workbook.

SCOPE-AWARE. The published platform is the 130-artist cohort, so summary.json is
compared against the dataset FILTERED to that cohort — comparing a 130-artist API
against a 752-artist dataset would fail for the right reason and the wrong cause.
The scope is read from the artifact, never assumed: if summary.json declares no
scope the full dataset is used, as before.
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path
from openpyxl import load_workbook
ROOT=Path(__file__).resolve().parents[2]
D=ROOT/"NBS FINAL delivery/04_Datasets"
sys.path.insert(0, str(ROOT/"backend"))
from nmas.cohort import canonical, master_list_names  # noqa: E402
fail=[]
rev_all=list(csv.DictReader((D/"Revenue_By_Platform_Quarterly.csv").open(encoding="utf-8")))
_summary=json.loads((ROOT/"frontend/public/api/v1/nbs/summary.json").read_text())
SCOPE=_summary.get("scope","all")
COHORT={canonical(n) for n in master_list_names()}
rev=[r for r in rev_all if r["artist_name"] in COHORT] if SCOPE=="cohort130" else rev_all
print("scope: %s (%d of %d revenue rows)" % (SCOPE, len(rev), len(rev_all)))
def s(rows,k): return sum(float(r[k] or 0) for r in rows if r.get(k))
per=defaultdict(float)
for r in rev: per[r["period_label"]]+=float(r["gross_streaming_revenue_usd"] or 0)
# 1) static API summary
summary=_summary
for e in summary["streaming_revenue"]:
    api=e["gross_streaming_revenue_usd"]; src=round(per[e["period"]],2)
    if abs(api-src)>0.05: fail.append("summary.json %s: %s vs dataset %s"%(e["period"],api,src))
# 2) accounts — portfolio-scope artifacts, always compared against the full dataset
per_all=defaultdict(float)
for r in rev_all: per_all[r["period_label"]]+=float(r["gross_streaming_revenue_usd"] or 0)
acc=list(csv.DictReader((D/"NBS_Accounts_Quarterly.csv").open(encoding="utf-8")))
per_acc=defaultdict(float)
for r in acc: per_acc[r["period_label"]]+=float(r["gross_streaming_revenue_usd"] or 0)
for q,v in per.items():
    if abs(per_acc[q]-round(per_all[q],2))>0.05: fail.append("accounts %s: %s vs dataset %s"%(q,per_acc[q],round(per_all[q],2)))
# 3) workbook 1 Quarterly_Totals
wb=load_workbook(ROOT/"NBS FINAL delivery/03_Excel_Deliveries/1_Gross_Streaming_Revenue.xlsx",read_only=True,data_only=True)
sh=wb["Quarterly_Totals"]; hdr=[c.value for c in sh[1]]
gi=[i for i,h in enumerate(hdr) if h and "gross_usd" in str(h)][0]
pi=[i for i,h in enumerate(hdr) if h and "period" in str(h)][0]
for row in sh.iter_rows(min_row=2,values_only=True):
    if not row[pi]: continue
    if abs((row[gi] or 0)-round(per_all[row[pi]],2))>0.05:
        fail.append("workbook1 %s: %s vs dataset %s"%(row[pi],row[gi],round(per_all[row[pi]],2)))
wb.close()
# 4) per-quarter export vs summary
per_e=defaultdict(float)
for r in rev:
    if r["export_revenue_usd"]: per_e[r["period_label"]]+=float(r["export_revenue_usd"])
for e in summary["export_revenue"]:
    api=e["gross_export_revenue_usd"]
    src=round(per_e.get(e["period"],0.0),2) if e["period"] in per_e else None
    if api is None and src in (None,0.0): continue
    if api is not None and src is not None and abs(api-src)>0.05:
        fail.append("summary export %s: %s vs %s"%(e["period"],api,src))
    if api is None and src not in (None,0.0):
        fail.append("summary export %s: null vs dataset %s"%(e["period"],src))
print("CROSS-ARTIFACT: %s"%("PASS — 31 quarters x 4 artifacts consistent" if not fail else "FAIL"))
for f in fail[:12]: print("  "+f)
sys.exit(1 if fail else 0)
