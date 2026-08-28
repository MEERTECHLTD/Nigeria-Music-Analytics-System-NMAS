#!/usr/bin/env python3
"""
DELIVERY130 — Excel deliverables and submission documents.

Mirrors the first submission's 03_Excel_Deliveries numbering so the two
packages line up file for file, and adds 9_Growth_Projection.xlsx, which the
first submission had no equivalent of.

Every workbook is generated from the CSVs in delivery130/04_Datasets — never
hand-entered, never recomputed on a different basis — so a figure in a workbook
equals the same cell in the dataset by construction.
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
from nmas.cohort import counts  # noqa: E402

PKG = ROOT / "delivery130"
D = PKG / "04_Datasets"
X = PKG / "03_Excel_Deliveries"
TOTAL_ROW = "=== PERIOD TOTAL ==="

csv.field_size_limit(10 ** 9)


def qkey(label):
    q, y = label.split("_")
    return (int(y), int(q[1:]))


def num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() and abs(f) < 1e15 else f
    except (TypeError, ValueError):
        return None


def style(ws, freeze=True):
    for c in ws[1]:
        if c.value is not None:
            c.fill = PatternFill("solid", fgColor="1F3864")
            c.font = Font(color="FFFFFF", bold=True)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    if freeze:
        ws.freeze_panes = "A2"
    widths = {}
    for row in ws.iter_rows():
        for c in row:
            if c.value is not None:
                widths[c.column] = min(max(widths.get(c.column, 10), len(str(c.value)) + 2), 46)
    for col, w in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = w
    headers = [str(c.value or "").lower() for c in ws[1]]
    for i, h in enumerate(headers, 1):
        fmt = ("#,##0.00" if "usd" in h else "#,##0" if ("ngn" in h or "views" in h
               or "listeners" in h or "subscribers" in h or "fans" in h or "streams" in h
               or "count" in h or "artists" in h or "employment" in h or h in ("male", "female"))
               else "0.00" if "pct" in h or "cagr" in h else None)
        if not fmt:
            continue
        for row in ws.iter_rows(min_row=2, min_col=i, max_col=i):
            if isinstance(row[0].value, (int, float)):
                row[0].number_format = fmt
                row[0].alignment = Alignment(horizontal="right")
    ref = "A1:%s%d" % (get_column_letter(ws.max_column), ws.max_row)
    ws.auto_filter.ref = ref
    ws.print_area = ref
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def sheet_from_csv(ws, path, keep=None):
    with path.open(encoding="utf-8") as h:
        rd = csv.reader(h)
        head = next(rd)
        idxs = [i for i, c in enumerate(head) if keep is None or c in keep]
        ws.append([head[i] for i in idxs])
        n = 0
        for row in rd:
            ws.append([num(row[i]) if num(row[i]) is not None else row[i] for i in idxs])
            n += 1
    style(ws)
    return n


def book(name, builder):
    wb = Workbook()
    wb.remove(wb.active)
    builder(wb)
    path = X / name
    wb.save(path)
    print("  %-44s %6.2f MB" % (name, path.stat().st_size / 1e6))


def main() -> int:
    X.mkdir(parents=True, exist_ok=True)
    c = counts()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rev = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))]
    body = [r for r in rev if r["artist_name"] != TOTAL_ROW]
    periods = sorted({r["period"] for r in body}, key=qkey)
    artists = sorted({r["artist_name"] for r in body})
    gross = defaultdict(float)
    for r in body:
        gross[r["period"]] += float(r["gross_streaming_revenue_usd"] or 0)

    def cover(wb, title, lines):
        ws = wb.create_sheet("Cover", 0)
        ws["A1"] = title
        ws["A1"].font = Font(bold=True, size=14)
        ws["A3"] = "Nigeria Music Analytics System — National Bureau of Statistics"
        ws["A4"] = "Scope: %d artists (first-submission cohort) x %d quarters, %s – %s" % (
            len(artists), len(periods), periods[0].replace("_", " "), periods[-1].replace("_", " "))
        ws["A5"] = "Generated %s. Source: delivery130/04_Datasets — figures equal those cells." % stamp
        for i, t in enumerate(lines, start=7):
            ws["A%d" % i] = t
        ws.column_dimensions["A"].width = 118
        for row in ws.iter_rows():
            for cell in row:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
        return ws

    print("building workbooks in %s" % X.relative_to(ROOT))

    book("1_Gross_Streaming_Revenue.xlsx", lambda wb: (
        cover(wb, "1 — Gross Streaming Revenue", [
            "One row per artist per quarter, plus the '=== PERIOD TOTAL ===' row the first "
            "submission used, so this file sums the same way that one did.",
            "youtube_views_source states, for every row, whether YouTube volume was observed "
            "or estimated. Estimated rows are EST and must not be read as measurement.",
            "other_platforms_revenue_usd is the 0.30 uplift for platforms never queried "
            "(Apple Music, Amazon, Boomplay, Audiomack and others). It is an assumption, "
            "not a measured platform.",
        ]),
        sheet_from_csv(wb.create_sheet("Streaming_Revenue"), D / "Gross_Streaming_Revenue.csv")))

    book("2_Gross_Export_Revenue.xlsx", lambda wb: (
        cover(wb, "2 — Gross Export Revenue", [
            "The domestic/export split is derived from OBSERVED Spotify listener geography "
            "where the provider published it. Blank means the split was not measured for "
            "that artist-quarter — blank is not zero.",
            "top_export_markets is computed PER ARTIST from that artist's own observed "
            "listener geography. The first submission wrote one identical market list on "
            "every row; that literal is not reproduced here.",
        ]),
        sheet_from_csv(wb.create_sheet("Export_Revenue"), D / "Gross_Export_Revenue.csv")))

    book("3_Employment_Male_Female.xlsx", lambda wb: (
        cover(wb, "3 — Employment, Male and Female", [
            "NATIONAL sector totals for the Nigerian music industry, from secondary sources.",
            "This is NOT a count of these 130 artists' employees and is NOT scaled to them. "
            "It is carried at the level its sources support and no other.",
        ]),
        sheet_from_csv(wb.create_sheet("Employment"), D / "Employment_Male_Female.csv")))

    book("4_Hosting_Production_Costs.xlsx", lambda wb: (
        cover(wb, "4 — Hosting and Production Costs", [
            "Recomputed on this cohort's own artist counts: unit cost x tracks x the "
            "distinct artists observed in that quarter. It is NOT the portfolio cost file "
            "filtered, which would bill 130 artists for a larger population.",
            "The unit costs are ASSUMPTIONS from secondary sources. Only the artist counts "
            "are measured.",
        ]),
        sheet_from_csv(wb.create_sheet("Costs"), D / "Hosting_Production_Costs.csv")))

    def perf(wb):
        cover(wb, "5 — Artist Platform Performance", [
            "Per-artist platform detail for every quarter: audience levels, the volume each "
            "revenue figure was derived from, and the revenue itself.",
        ])
        sheet_from_csv(wb.create_sheet("Artist_Platform_Detail"), D / "Gross_Streaming_Revenue.csv",
                       keep={"period", "artist_name", "spotify_monthly_listeners",
                             "youtube_subscribers", "youtube_actual_views", "youtube_views_source",
                             "deezer_fans", "est_spotify_quarterly_streams",
                             "spotify_revenue_usd", "youtube_revenue_usd", "deezer_revenue_usd",
                             "gross_streaming_revenue_usd"})
        ws = wb.create_sheet("Artist_Totals")
        ws.append(["artist_name", "quarters_with_revenue", "total_gross_usd",
                   "first_quarter", "last_quarter"])
        tot = defaultdict(float)
        qs = defaultdict(list)
        for r in body:
            v = float(r["gross_streaming_revenue_usd"] or 0)
            tot[r["artist_name"]] += v
            if v > 0:
                qs[r["artist_name"]].append(r["period"])
        for a in sorted(tot, key=lambda k: -tot[k]):
            seq = sorted(qs[a], key=qkey)
            ws.append([a, len(seq), round(tot[a], 2), seq[0] if seq else "", seq[-1] if seq else ""])
        style(ws)
    book("5_Artist_Platform_Performance.xlsx", perf)

    def full(wb):
        cover(wb, "6 — Full Artist Data, Q1 2019 – Q3 2026", [
            "The complete quarterly matrix: every artist against every quarter, with the "
            "quarter total beneath. Blank means the artist produced no revenue row that "
            "quarter — not measured, not zero.",
        ])
        ws = wb.create_sheet("Matrix_Gross_USD")
        ws.append(["artist_name"] + [p.replace("_", " ") for p in periods] + ["total_usd"])
        cell = defaultdict(dict)
        for r in body:
            cell[r["artist_name"]][r["period"]] = float(r["gross_streaming_revenue_usd"] or 0)
        order = sorted(artists, key=lambda a: -sum(cell[a].values()))
        for a in order:
            ws.append([a] + [cell[a].get(p, None) for p in periods] + [round(sum(cell[a].values()), 2)])
        ws.append(["=== PERIOD TOTAL ==="] + [round(gross[p], 2) for p in periods]
                  + [round(sum(gross.values()), 2)])
        style(ws)
    book("6_NMAS_Full_Artist_Data_Q1_2019_Q3_2026.xlsx", full)

    def dex(wb):
        cover(wb, "7 — Digital Music Export", [
            "Export earnings by quarter, with the number of artist-quarters whose split was "
            "actually measured shown against the number in scope. Quarters before Q1 2021 "
            "have no observed geography at all and are left blank, never zero.",
        ])
        ws = wb.create_sheet("Export_By_Quarter")
        ws.append(["period", "total_streaming_usd", "domestic_usd", "export_usd", "export_ngn",
                   "export_share_pct", "artist_quarters_measured", "artist_quarters_in_scope"])
        ex = [r for r in csv.DictReader((D / "Gross_Export_Revenue.csv").open(encoding="utf-8"))
              if r["artist_name"] != TOTAL_ROW]
        byq = defaultdict(list)
        for r in ex:
            byq[r["period"]].append(r)
        for p in periods:
            rs = byq[p]
            m = [r for r in rs if r["gross_export_revenue_usd"] not in ("", None)]
            tot = sum(float(r["total_streaming_revenue_usd"] or 0) for r in rs)
            if m:
                dom = sum(float(r["domestic_revenue_usd"] or 0) for r in m)
                exp = sum(float(r["gross_export_revenue_usd"] or 0) for r in m)
                exn = sum(float(r["gross_export_revenue_ngn"] or 0) for r in m)
                ws.append([p.replace("_", " "), round(tot, 2), round(dom, 2), round(exp, 2),
                           round(exn, 2), round(exp / (dom + exp) * 100, 2) if (dom + exp) else None,
                           len(m), len(rs)])
            else:
                ws.append([p.replace("_", " "), round(tot, 2), None, None, None, None, 0, len(rs)])
        style(ws)
        sheet_from_csv(wb.create_sheet("Export_By_Artist"), D / "Gross_Export_Revenue.csv")
    book("7_Digital_Music_Export.xlsx", dex)

    book("8_Artist_Master_List.xlsx", lambda wb: (
        cover(wb, "8 — Artist Master List", [
            "%d rows, one per artist. The first submission's list held %d rows because "
            "\"Flavour\" and \"Flavour N'abania\" are the same artist under two provider "
            "UUIDs; they are one row here." % (c["distinct_artists"], c["master_list_rows"]),
        ]),
        sheet_from_csv(wb.create_sheet("Artist_Master_List"), D / "Artist_Master_List.csv")))

    def proj(wb):
        cover(wb, "9 — Growth Projection", [
            "PROJECTION. Every forward figure is EST — a statement about quarters that have "
            "not happened. It must never be summed into an observed total.",
            "Fitted on the last 12 complete quarters, not the whole series: growth broke "
            "structurally after 2022 and a whole-series fit returns +41.9%/year against an "
            "actual recent rate near 9%.",
            "The 95% bands are prediction intervals from the fitted residual spread. They "
            "express the model's uncertainty, not the risk that the model is the wrong shape.",
        ])
        P = PKG / "08_Projection"
        sheet_from_csv(wb.create_sheet("Quarterly"), P / "Growth_Projection_Quarterly.csv")
        sheet_from_csv(wb.create_sheet("Annual"), P / "Growth_Projection_Annual.csv")
        sheet_from_csv(wb.create_sheet("Window_Sensitivity"), P / "Projection_Window_Sensitivity.csv")
        sheet_from_csv(wb.create_sheet("By_Artist"), P / "Growth_By_Artist.csv")
    book("9_Growth_Projection.xlsx", proj)

    print("\ndelivery130 workbooks: %d artists, %d quarters, gross $%s"
          % (len(artists), len(periods), format(sum(gross.values()), ",.2f")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
