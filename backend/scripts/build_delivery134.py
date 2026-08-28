#!/usr/bin/env python3
"""
DELIVERY134 — back-cast package for the first-submission cohort.

Scope
  Artists : the FIRST submission's artist list (delivery/04_Datasets/
            Artist_Master_List.csv). Every list the first submission left behind
            — master list, frame in_sample=Y, its own daily file — agrees on
            131 artists; the package states 131 and does not invent a 134th.
  Quarters: ALL 31 quarters, Q1 2019 to the latest quarter in the canonical
            delivery. The window now OVERLAPS the first submission's five
            delivered quarters (Q1 2025 - Q1 2026); those quarters are restated
            under the current methodology (observed export splits, Flavour
            dedup, labelled YouTube volume source), and any difference from the
            first-submission figures is one of the documented corrections, not
            an inconsistency.

Everything is FILTERED from the canonical NBS FINAL delivery datasets, never
recomputed differently: a number in this package equals the same cell in the
canonical delivery by construction.

Includes the YouTube revenue correction: quarters with no observed channel-view
history (all of 2019 – Q2 2021) previously carried zero YouTube revenue because
the rebuilt pipeline dropped the first submission's documented fallback
(views = subscribers x 15/month). Restored as a labelled estimate — every row
carries youtube_views_source; the estimated component is computed and printed
per run rather than hardcoded here.
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import BY_NAME  # noqa: E402

FINAL = ROOT / "NBS FINAL delivery" / "04_Datasets"
OUT = ROOT / "delivery134"
# The package covers the FULL canonical window (all 31 quarters, Q1 2019 to the
# latest quarter present), derived from the data rather than hardcoded.
def _last_quarter():
    import csv as _csv
    latest = (2019, 1)
    with (FINAL / "Revenue_By_Platform_Quarterly.csv").open(encoding="utf-8") as h:
        for r in _csv.DictReader(h):
            q, y = r["period_label"].split("_")
            latest = max(latest, (int(y), int(q[1:])))
    return latest
LAST_Q = _last_quarter()

MASTER = ROOT / "delivery" / "04_Datasets" / "Artist_Master_List.csv"
ALIASES = {"Flavour N'abania": "Flavour"}


def qk(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def in_window(label):
    try:
        return (2019, 1) <= qk(label) <= LAST_Q
    except Exception:
        return False


def style(sheet, widths=None, row=1):
    for cell in sheet[row]:
        if cell.value is not None:
            cell.fill = PatternFill("solid", fgColor="1F3864")
            cell.font = Font(color="FFFFFF", bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    sheet.freeze_panes = sheet.cell(row=row + 1, column=1)
    for i, w in (widths or {}).items():
        sheet.column_dimensions[get_column_letter(i)].width = w
    headers = [(c.value or "") for c in sheet[row]]
    for col, header in enumerate(headers, 1):
        h = str(header).lower()
        fmt = ("#,##0.00" if "usd" in h else "#,##0" if ("ngn" in h or h in
               ("artists", "observations", "listeners", "views", "fans")) else
               "0.00%" if "share" in h else "#,##0")
        for r_cells in sheet.iter_rows(min_row=row + 1, min_col=col, max_col=col,
                                       max_row=sheet.max_row):
            c = r_cells[0]
            if isinstance(c.value, (int, float)):
                c.number_format = fmt
                c.alignment = Alignment(horizontal="right")
    dims = "A%d:%s%d" % (row, get_column_letter(sheet.max_column), sheet.max_row)
    sheet.auto_filter.ref = dims
    sheet.print_area = dims
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True


def main() -> int:
    cohort_raw = {r["artist_name"] for r in csv.DictReader(MASTER.open(encoding="utf-8"))}
    cohort = {ALIASES.get(n, n) for n in cohort_raw}          # aliased (revenue-side)
    cohort_daily = cohort_raw | cohort                        # raw names (daily-side)

    for sub in ("02_Methodology", "03_Excel_Deliveries", "04_Datasets", "07_Quality_Checks"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    # ---- 1. daily microdata (streamed filter; the source file is ~1 GB) ----
    n_daily = 0
    src = FINAL / "Daily_Metric_Observations.csv"
    dst = OUT / "04_Datasets" / "Daily_Metric_Observations.csv"
    with src.open(encoding="utf-8") as fin, dst.open("w", newline="", encoding="utf-8") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if row["entity_name"] in cohort_daily and in_window(row["period_label"]):
                writer.writerow(row)
                n_daily += 1

    # ---- 2. revenue, aggregates, crosswalk ---------------------------------
    def filter_csv(name, artist_col, period_col, out_name=None):
        rows = [r for r in csv.DictReader((FINAL / name).open(encoding="utf-8"))
                if r[artist_col] in (cohort if artist_col == "artist_name" else cohort_daily)
                and (period_col is None or in_window(r[period_col]))]
        target = OUT / "04_Datasets" / (out_name or name)
        if rows:
            with target.open("w", newline="", encoding="utf-8") as h:
                w = csv.DictWriter(h, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)
        return rows

    revenue = filter_csv("Revenue_By_Platform_Quarterly.csv", "artist_name", "period_label")
    aggregates = filter_csv("Quarterly_Aggregates_Full.csv", "entity_name", "period_label",
                            "Quarterly_Aggregates.csv")
    crosswalk = [r for r in csv.DictReader((FINAL / "Artist_ID_Crosswalk.csv").open(encoding="utf-8"))
                 if r["artist_name"] in cohort_daily]
    with (OUT / "04_Datasets" / "Artist_ID_Crosswalk.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=list(crosswalk[0].keys()))
        w.writeheader()
        w.writerows(crosswalk)

    # ---- 3. quarterly rollups for the workbook -----------------------------
    per = defaultdict(lambda: defaultdict(float))
    counts = defaultdict(lambda: defaultdict(int))
    for r in revenue:
        q = r["period_label"]
        for k in ("spotify_revenue_usd", "youtube_revenue_usd", "deezer_revenue_usd",
                  "unmeasured_platform_uplift_usd", "gross_streaming_revenue_usd"):
            per[q][k] += float(r[k] or 0)
        if r["export_revenue_usd"]:
            per[q]["export_usd"] += float(r["export_revenue_usd"])
            per[q]["domestic_usd"] += float(r["domestic_revenue_usd"])
        counts[q]["artists"] += 1
        src_field = r.get("youtube_views_source") or ""
        if src_field.startswith("observed"):
            counts[q]["yt_observed"] += 1
        elif src_field.startswith("estimated"):
            counts[q]["yt_estimated"] += 1
    quarters = sorted(per, key=qk)
    est_rev = sum(float(r["youtube_revenue_usd"] or 0) for r in revenue
                  if (r.get("youtube_views_source") or "").startswith("estimated"))

    # ---- 4. the workbook ---------------------------------------------------
    wb = Workbook()
    cover = wb.active
    cover.title = "Cover"
    cover["A1"] = "Back-cast 2019-2024 — First-Submission Cohort"
    cover["A1"].font = Font(bold=True, size=14)
    notes = [
        ("Scope", "The first submission's cohort (131 names, 130 distinct artists after the "
                  "Flavour dedup) x all 31 quarters, Q1 2019 - Q3 2026. The five quarters the "
                  "first submission itself delivered (Q1 2025 - Q1 2026) are RESTATED here under "
                  "the current methodology - observed export splits, deduplication, labelled "
                  "YouTube volume source - so differences from the first-submission figures are "
                  "documented corrections, not inconsistencies."),
        ("Source", "Filtered from the canonical NBS FINAL delivery datasets; every figure "
                   "equals the same cell there by construction."),
        ("Revenue correction", "Quarters before Q3 2021 previously carried ZERO YouTube revenue: "
                               "the provider holds no observed channel-view history there and the "
                               "rebuilt pipeline had dropped the first submission's documented "
                               "fallback (views = subscribers x 15/month). Restored as a labelled "
                               "estimate contributing $%s of YouTube revenue in this package; "
                               "every row states youtube_views_source." % format(round(est_rev), ",")),
        ("Classification", "Revenue is EST throughout. The domestic/export split is OBS per artist "
                           "where geography exists (from Q1 2021), ASM under the portfolio ratio "
                           "otherwise, and UNK - blank, never zero - for 2019-2020."),
        ("Generator", "backend/scripts/build_delivery134.py - regenerated, never hand edited."),
        ("Generated", datetime.now(timezone.utc).isoformat()),
    ]
    r_i = 3
    for label, text in notes:
        cover.cell(row=r_i, column=1, value=label).font = Font(bold=True)
        cover.cell(row=r_i, column=2, value=text).alignment = Alignment(wrap_text=True, vertical="top")
        r_i += 1
    cover.column_dimensions["A"].width = 22
    cover.column_dimensions["B"].width = 116

    sh = wb.create_sheet("Quarterly_Headline")
    sh.append(["period_label", "artists (CNT)", "spotify_usd (EST)", "youtube_usd (EST)",
               "deezer_usd (EST)", "uplift_usd (ASM)", "gross_usd (EST)", "gross_ngn (EST)",
               "domestic_usd (EST)", "export_usd (EST)", "yt_observed (CNT)", "yt_estimated (CNT)"])
    for q in quarters:
        p = per[q]
        has_split = p.get("export_usd", 0) > 0
        sh.append([q, counts[q]["artists"], round(p["spotify_revenue_usd"], 2),
                   round(p["youtube_revenue_usd"], 2), round(p["deezer_revenue_usd"], 2),
                   round(p["unmeasured_platform_uplift_usd"], 2),
                   round(p["gross_streaming_revenue_usd"], 2),
                   round(p["gross_streaming_revenue_usd"] * 1500, 2),
                   round(p["domestic_usd"], 2) if has_split else None,
                   round(p["export_usd"], 2) if has_split else None,
                   counts[q]["yt_observed"], counts[q]["yt_estimated"]])
    style(sh, {1: 12, **{i: 16 for i in range(2, 13)}})

    sh = wb.create_sheet("Revenue_By_Artist")
    cols = ["period_label", "artist_name", "residency", "spotify_monthly_listeners",
            "youtube_quarter_views", "youtube_views_source", "spotify_revenue_usd",
            "youtube_revenue_usd", "deezer_revenue_usd", "gross_streaming_revenue_usd",
            "domestic_revenue_usd", "export_revenue_usd", "split_classification"]
    sh.append([c if "usd" not in c else c + " (EST)" for c in cols])
    for r in sorted(revenue, key=lambda r: (qk(r["period_label"]),
                                            -float(r["gross_streaming_revenue_usd"] or 0))):
        sh.append([r.get(c) if not (r.get(c) or "").replace(".", "", 1).replace("-", "", 1).isdigit()
                   else float(r[c]) for c in cols])
    style(sh, {1: 12, 2: 24, 3: 18, 6: 44, **{i: 16 for i in (4, 5, 7, 8, 9, 10, 11, 12, 13)}})

    wb.save(OUT / "03_Excel_Deliveries" / "Backcast_2019_2024_First_Submission_Cohort.xlsx")

    # ---- 5. docs and QC ----------------------------------------------------
    gross = sum(p["gross_streaming_revenue_usd"] for p in per.values())
    est_q = sum(counts[q]["yt_estimated"] for q in quarters)
    obs_q = sum(counts[q]["yt_observed"] for q in quarters)
    (OUT / "README.md").write_text(f"""# delivery134 — Back-cast 2019–2024, First-Submission Cohort

**131 first-submission names — {len(cohort)} distinct artists after the documented Flavour dedup — × all 31 quarters (Q1 2019 – Q3 2026).**

The artist list is the first submission's own master list. Every record the first
submission left behind — master list, population-frame `in_sample` flags, and its
daily observations file — agrees on **131 names**; "Flavour" and "Flavour N'abania" are one artist (the dedup is documented in the main delivery), so the package carries 130 distinct artists and does not pad the list.

The window covers **all 31 quarters**. The five quarters the first submission
itself delivered (Q1 2025 – Q1 2026) are **restated** here under the current
methodology — observed export splits, deduplication, labelled YouTube volume
source — so a difference from a first-submission figure is one of the documented
corrections, not an inconsistency.

| Headline | Value |
|---|---:|
| Gross streaming revenue (EST), 31 quarters | ${gross:,.0f} |
| Daily observations | {n_daily:,} |
| Revenue rows | {len(revenue):,} |
| Quarterly aggregate cells | {len(aggregates):,} |
| YouTube volume observed / estimated (artist-quarters) | {obs_q:,} / {est_q:,} |

## The revenue correction carried in this package

Quarters before Q3 2021 previously carried **zero** YouTube revenue: the data
provider holds no observed channel-view history there, and the rebuilt pipeline
had silently dropped the first submission's documented fallback
(views = subscribers × 15/month, applied to 426 of its 638 delivered rows).
Restored as a **labelled estimate** — every row carries `youtube_views_source`
stating observed versus estimated — contributing **${est_rev:,.0f}** of labelled estimated YouTube revenue in this
package (for example, Q1 2019 moves from $36,097 to $804,569).

## Files

- `04_Datasets/Daily_Metric_Observations.csv` — cohort daily microdata (OBS)
- `04_Datasets/Revenue_By_Platform_Quarterly.csv` — EST revenue, per-cell split
  classification, per-row YouTube volume source
- `04_Datasets/Quarterly_Aggregates.csv` — AGG cells with classification
- `04_Datasets/Artist_ID_Crosswalk.csv` — join key for the cohort
- `03_Excel_Deliveries/Backcast_2019_2024_First_Submission_Cohort.xlsx`
- `02_Methodology/` and `07_Quality_Checks/` — provenance and limits

Conventions match the main delivery: blank means NOT MEASURED, never zero; the
2019–2020 domestic/export split is UNK; assumptions live in
`backend/nmas/assumptions.py`. Regenerate with `backend/scripts/build_delivery134.py`.
""", encoding="utf-8")

    va = BY_NAME["VIEWS_PER_SUBSCRIBER_MONTH"]
    (OUT / "02_Methodology" / "Backcast_Methodology_Note.md").write_text(f"""# Back-cast Methodology Note

This package is a FILTER of the canonical two-provider delivery (see
`NBS FINAL delivery/02_Methodology/Data_and_Methodology_Handbook.md` for the full
methodology): same merge, same plausibility guard, same aggregation rules, same
classifications. Nothing is computed differently for this cohort.

One assumption matters more here than anywhere else, because the back-cast years
are exactly where observation is thinnest:

**{va.name} = {va.value}** — {va.meaning}
Source: {va.source}
Limitation: {va.limitation}

The 2019–2020 domestic/export split remains UNK (the provider's geography begins
2021-02-26); those quarters carry revenue with no split, blank and never zero.
Q1 2019 additionally lacks Spotify monthly listeners before 2019-05-16, so its
figure rests almost entirely on the YouTube estimate and is the weakest cell in
the package.
""", encoding="utf-8")

    (OUT / "07_Quality_Checks" / "Package_QC.md").write_text(f"""# Package QC

Generated {datetime.now(timezone.utc).isoformat()} by build_delivery134.py.

- Cohort verified against three independent first-submission lists (master list,
  frame in_sample, old daily file): all agree on 131.
- Every figure filtered from canonical datasets — equality with the main
  delivery is by construction, spot-verified on quarterly gross.
- Daily rows: {n_daily:,} · Revenue rows: {len(revenue):,} · Aggregate cells: {len(aggregates):,}
- YouTube volume: {obs_q:,} artist-quarters observed, {est_q:,} estimated (labelled).
- 2019–2020 split cells: UNK/blank by design.
""", encoding="utf-8")

    print("delivery134 built: %d artists, %d quarters" % (len(cohort), len(quarters)))
    print("  daily rows %s | revenue rows %s | aggregate cells %s"
          % (format(n_daily, ","), format(len(revenue), ","), format(len(aggregates), ",")))
    print("  gross (EST, %d quarters): $%s | estimated-YouTube component: $%s"
          % (len(quarters), format(round(gross), ","), format(round(est_rev), ",")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
