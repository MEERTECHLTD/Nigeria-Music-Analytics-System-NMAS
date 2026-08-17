#!/usr/bin/env python3
"""
EMPLOYMENT GENERATOR — resolves D-10.

Employment previously had no generator: the CSV and workbook were hand-carried
copies with constants buried in a retired script. This generator makes the
indicator reproducible and honest about what it is.

CLASSIFICATION: ASM, entirely. Every figure below is an assumption from
secondary sources, not a measurement. There is no primary source anywhere in
this pipeline that observes music-sector employment.

WHAT THIS DELIBERATELY DOES NOT DO: extend the series to 2019. The secondary
sources (US ITA Nigeria 2024; UNESCO 2023; Vanguard 2024; Nairametrics 2025)
support a level around 2024-2025 only. Back-casting employment to 2019 by
running the assumed 2% quarterly growth backwards would manufacture six years
of numbers no source supports — that is fabrication, and the gap is registered
as UNK instead. What would resolve it: an NBS labour force survey module or an
industry census covering the music sector.
"""

from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
FINAL = ROOT / "NBS FINAL delivery"

# ---------------------------------------------------------------------------
# ASSUMPTION BLOCK — the entire content of this indicator.
# Values reproduce the previously delivered figures exactly (delivery/04_Datasets/
# Employment_Male_Female.csv, immutable evidence), now with their basis stated.
# ---------------------------------------------------------------------------
DIRECT_EMPLOYMENT_BASE = 300_000      # US ITA Nigeria 2024; UNESCO 2023
INDIRECT_EMPLOYMENT_BASE = 1_000_000  # US ITA Nigeria 2024; UNESCO 2023
MALE_SHARE = 0.62                     # Aggregated: US ITA, Vanguard 2024, Nairametrics 2025
QOQ_GROWTH = 0.02                     # assumed 2% quarterly growth, no primary source
BASE_QUARTER = "Q1_2025"              # the quarter the source level anchors to
QUARTERS = ["Q1_2025", "Q2_2025", "Q3_2025", "Q4_2025", "Q1_2026"]
SOURCE_DIRECT = "US ITA Nigeria 2024; UNESCO 2023"
SOURCE_TOTAL = "Aggregated (US ITA, Vanguard 2024, Nairametrics 2025)"

OUT_CSV = FINAL / "04_Datasets" / "Employment_Male_Female.csv"
OUT_XLSX = FINAL / "03_Excel_Deliveries" / "3_Employment_Male_Female.xlsx"


def rows():
    for i, quarter in enumerate(QUARTERS):
        growth = (1 + QOQ_GROWTH) ** i
        direct = round(DIRECT_EMPLOYMENT_BASE * growth)
        indirect = round(INDIRECT_EMPLOYMENT_BASE * growth)
        for category, total, source in (
            ("Direct Employment (Artists, Producers, Engineers, Managers)", direct, SOURCE_DIRECT),
            ("Indirect Employment (Distribution, Marketing, Retail, Tech)", indirect, SOURCE_DIRECT),
            ("TOTAL MUSIC INDUSTRY", direct + indirect, SOURCE_TOTAL),
        ):
            male = round(total * MALE_SHARE)
            yield {"period": quarter, "category": category, "classification": "ASM",
                   "total_employment": total, "male": male, "female": total - male,
                   "source": source}


def main() -> int:
    all_rows = list(rows())
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(all_rows[0].keys()))
        writer.writeheader()
        writer.writerows(all_rows)

    wb = Workbook()
    cover = wb.active
    cover.title = "Cover"
    cover["A1"] = "3 - Employment, Male and Female"
    cover["A1"].font = Font(bold=True, size=14)
    notes = [
        ("Classification", "ASM - ASSUMED, in full. No figure in this workbook is a measurement."),
        ("Basis", "Sector level anchored to %s from %s; gender split %.0f/%.0f from %s; "
                  "%.0f%% assumed quarterly growth." % (BASE_QUARTER, SOURCE_DIRECT,
                  MALE_SHARE * 100, (1 - MALE_SHARE) * 100, SOURCE_TOTAL, QOQ_GROWTH * 100)),
        ("Coverage", "%s to %s ONLY. The series is deliberately NOT back-cast to 2019: no source "
                     "supports earlier levels, and extending the growth assumption backwards would "
                     "manufacture six years of unsupported numbers. 2019-2024 employment is UNK." %
                     (QUARTERS[0], QUARTERS[-1])),
        ("What would resolve it", "An NBS labour force survey module or industry census covering "
                                  "the music sector."),
        ("Generator", "backend/scripts/build_employment.py - this workbook is regenerated, never "
                      "hand edited."),
        ("Generated", datetime.now(timezone.utc).isoformat()),
    ]
    r = 3
    for label, text in notes:
        cover.cell(row=r, column=1, value=label).font = Font(bold=True)
        cover.cell(row=r, column=2, value=text).alignment = Alignment(wrap_text=True, vertical="top")
        r += 1
    cover.column_dimensions["A"].width = 24
    cover.column_dimensions["B"].width = 110

    sh = wb.create_sheet("Employment")
    headers = ["period", "category", "classification", "total_employment (ASM)",
               "male (ASM)", "female (ASM)", "source"]
    sh.append(headers)
    for row in all_rows:
        sh.append([row["period"], row["category"], row["classification"],
                   row["total_employment"], row["male"], row["female"], row["source"]])
    from openpyxl.styles import PatternFill
    for cell in sh[1]:
        cell.fill = PatternFill("solid", fgColor="1F3864")
        cell.font = Font(color="FFFFFF", bold=True)
    sh.freeze_panes = "A2"
    for row in sh.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, (int, float)):
                cell.number_format = "#,##0"
                cell.alignment = Alignment(horizontal="right")
    from openpyxl.utils import get_column_letter
    dims = "A1:%s%d" % (get_column_letter(sh.max_column), sh.max_row)
    sh.auto_filter.ref = dims
    sh.print_area = dims
    for idx, width in ((1, 10), (2, 56), (3, 14), (4, 20), (5, 14), (6, 14), (7, 46)):
        sh.column_dimensions[get_column_letter(idx)].width = width

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)
    print("wrote %s (%d rows) and %s" % (OUT_CSV.name, len(all_rows), OUT_XLSX.name))
    # confirm the regenerated figures reproduce the delivered evidence exactly
    old = ROOT / "delivery" / "04_Datasets" / "Employment_Male_Female.csv"
    if old.exists():
        theirs = {(r["period"], r["category"]): r["total_employment"]
                  for r in csv.DictReader(old.open(encoding="utf-8"))}
        mismatches = sum(1 for r in all_rows
                         if theirs.get((r["period"], r["category"])) not in
                         (None, str(r["total_employment"])))
        print("reproduction against delivered evidence: %d mismatches" % mismatches)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
