#!/usr/bin/env python3
"""
EXCEL DELIVERABLE for the merged 2019-2026 series.

Reads what merge_final_delivery.py wrote under "NBS FINAL delivery" and builds
    03_Excel_Deliveries/7_NMAS_Extended_History_2019_2026.xlsx

Sheet order follows how a statistician reads a delivery: what this is and where
it came from, then the headline quarterly series, then the cuts that answer the
specific questions NBS raised (domestic vs export, Nigerian DSPs, radio
airplay), then the per-artist microdata, and finally the audit trail.

Every figure traces to Quarterly_Aggregates_Full.csv; nothing is computed here
that is not already in the delivered CSVs.
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
FINAL = ROOT / "NBS FINAL delivery"
AGG = FINAL / "04_Datasets" / "Quarterly_Aggregates_Full.csv"
COVERAGE = FINAL / "04_Datasets" / "Coverage_By_Quarter.csv"
RESOLUTION = FINAL / "04_Datasets" / "Artist_Resolution_Soundcharts.csv"
REPORT = FINAL / "07_Quality_Checks" / "Merge_Provenance_Report.md"
OUT = FINAL / "03_Excel_Deliveries" / "10_NMAS_Extended_History_2019_2026.xlsx"

HEAD_FILL = PatternFill("solid", fgColor="1F3864")
HEAD_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14)
NOTE_FONT = Font(italic=True, size=10, color="555555")

HEADLINE_VARIABLES = [
    "Spotify_monthly_listeners_daily",
    "Spotify_followers_daily",
    "Spotify_domestic_listeners_daily",
    "Spotify_total_listeners_daily",
    "YouTube_subscribers_daily",
    "YouTube_channel_views_daily",
    "Boomplay_followers_daily",
    "Audiomack_followers_daily",
    "Radio_spins_daily_NG",
    "Playlist_reach_daily",
]


def period_key(label: str) -> tuple[int, int]:
    try:
        quarter, year = label.split("_")
        return int(year), int(quarter[1:])
    except Exception:
        return (0, 0)




def apply_presentation(sheet, header_row: int = 1) -> None:
    """NBS presentation standard, applied uniformly (D-05/D-06).

    Number formats are driven by the HEADER NAME so every sheet in every
    workbook renders the same metric class the same way; numerals are right
    aligned and tabular; every data range gets an autofilter and a print area.
    A blank cell stays blank: it means NOT MEASURED, and formatting must never
    turn it into a zero.
    """
    from openpyxl.styles import Alignment as _Al
    from openpyxl.utils import get_column_letter as _gc
    if sheet.max_row < header_row + 1 or sheet.max_column < 1:
        return
    headers = [(c.value or "") for c in sheet[header_row]]

    def fmt_for(header):
        h = str(header).lower()
        if "share" in h or "pct" in h or h.endswith("(%)"):
            return "0.00%" if "share" in h and "pct" not in h else "#,##0.00"
        if "_usd" in h or "(usd" in h or h.endswith("usd"):
            return "#,##0.00"
        if "_ngn" in h or "(ngn" in h or h.endswith("ngn"):
            return "#,##0"
        if "ratio" in h:
            return "0.0000"
        return "#,##0"

    for col_idx, header in enumerate(headers, 1):
        fmt = fmt_for(header)
        for row in sheet.iter_rows(min_row=header_row + 1, min_col=col_idx,
                                   max_col=col_idx, max_row=sheet.max_row):
            cell = row[0]
            if isinstance(cell.value, (int, float)):
                cell.number_format = fmt
                cell.alignment = _Al(horizontal="right")
    dims = "A%d:%s%d" % (header_row, _gc(sheet.max_column), sheet.max_row)
    sheet.auto_filter.ref = dims
    sheet.print_area = dims
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True

def style_header(sheet, row: int = 1) -> None:
    for cell in sheet[row]:
        if cell.value is None:
            continue
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    sheet.freeze_panes = sheet.cell(row=row + 1, column=1)
    apply_presentation(sheet, header_row=row)


def autosize(sheet, widths: dict[int, int]) -> None:
    for index, width in widths.items():
        sheet.column_dimensions[get_column_letter(index)].width = width


def main() -> int:
    if not AGG.exists():
        print(f"missing {AGG} — run merge_final_delivery.py first")
        return 1

    rows = list(csv.DictReader(AGG.open(encoding="utf-8")))
    print(f"read {len(rows):,} quarterly cells", flush=True)

    def value(row) -> float:
        try:
            return float(row["variable_value"])
        except (TypeError, ValueError):
            return 0.0

    periods = sorted({r["period_label"] for r in rows if r["period_label"]}, key=period_key)
    artists = sorted({r["entity_name"] for r in rows if r["entity_name"]})
    providers_by_var: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        providers_by_var[row["variable_name"]].add(row.get("providers", ""))

    workbook = Workbook()

    # ---- 1. Cover ---------------------------------------------------------
    cover = workbook.active
    cover.title = "Cover"
    provenance_note = ""
    if REPORT.exists():
        for line in REPORT.read_text(encoding="utf-8").splitlines():
            if line.startswith("| soundcharts"):
                provenance_note = line.strip("| ").replace("|", " / ")
                break
    cover["A1"] = "NMAS — Extended Historical Series 2019–2026"
    cover["A1"].font = TITLE_FONT
    lines = [
        "",
        ("Scope", f"{len(artists):,} artists · {len(periods)} quarters · {periods[0] if periods else '-'} → {periods[-1] if periods else '-'}"),
        ("Providers", "Chartmetric (2024-01-01 onward) merged with Soundcharts (2019-01-01 onward)"),
        ("Why two providers", "Chartmetric's archive floor is 2024-01-01 and its tier denies Boomplay, Audiomack and radio airplay. Soundcharts supplies all three and reaches 2019."),
        ("Precedence", "Where both providers report the same artist, platform, variable and date, the Chartmetric figure is kept — it is the already-delivered number."),
        ("Quarterly rule", "Stock variables (followers, listeners) use net change within the quarter; flow variables (views, spins) are summed; index variables take the last observation."),
        ("Traceability", "Every cell traces to 04_Datasets/Quarterly_Aggregates_Full.csv, which traces to Daily_Metric_Observations.csv and its source_endpoint."),
        ("Generated", datetime.now(timezone.utc).isoformat()),
    ]
    row_index = 3
    for label, text in [line for line in lines if isinstance(line, tuple)]:
        cover.cell(row=row_index, column=1, value=label).font = Font(bold=True)
        cover.cell(row=row_index, column=2, value=text).alignment = Alignment(wrap_text=True, vertical="top")
        row_index += 1
    cover.cell(row=row_index + 1, column=1,
               value="Figures are observed platform metrics, not financial accounts. "
                     "Gaps are preserved as gaps — no interpolation.").font = NOTE_FONT
    autosize(cover, {1: 20, 2: 118})

    # ---- 2. Quarterly headline -------------------------------------------
    headline = workbook.create_sheet("Quarterly_Headline")
    headline.append(["variable_name", "unit", "aggregation_rule"] + periods)
    totals: dict[tuple[str, str], float] = defaultdict(float)
    meta: dict[str, tuple[str, str]] = {}
    for row in rows:
        variable = row["variable_name"]
        if variable not in HEADLINE_VARIABLES:
            continue
        totals[(variable, row["period_label"])] += value(row)
        meta.setdefault(variable, (row.get("unit", ""), row.get("aggregation_rule", "")))
    for variable in HEADLINE_VARIABLES:
        if variable not in meta:
            continue
        unit, rule = meta[variable]
        # A quarter with no observation of this variable is left EMPTY, never 0.
        # Writing 0 for Boomplay in 2019 would assert zero followers where the
        # provider simply has no history.
        headline.append([variable, unit, rule] +
                        [(round(totals[(variable, p)], 2) if (variable, p) in totals else None)
                         for p in periods])
    style_header(headline)
    autosize(headline, {1: 36, 2: 16, 3: 16, **{i: 14 for i in range(4, 4 + len(periods))}})

    # ---- 3. Domestic vs export ------------------------------------------
    export = workbook.create_sheet("Domestic_vs_Export")
    export.append(["period_label", "domestic_listeners_NG", "total_listeners",
                   "export_listeners", "export_share_pct", "artists_reporting"])
    domestic: dict[str, float] = defaultdict(float)
    total: dict[str, float] = defaultdict(float)
    reporting: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row["variable_name"] == "Spotify_domestic_listeners_daily":
            domestic[row["period_label"]] += value(row)
            reporting[row["period_label"]].add(row["entity_name"])
        elif row["variable_name"] == "Spotify_total_listeners_daily":
            total[row["period_label"]] += value(row)
    for period in periods:
        dom = domestic.get(period)
        tot = total.get(period)
        # The city breakdown only populates from 2021-08-30. Before that a total
        # exists with no split. Substituting 0 for the unmeasured domestic figure
        # would report a 100% export share for 2019-2021 — an invented finding.
        if dom is None or not tot:
            export.append([period, None, round(tot, 2) if tot else None,
                           None, None, len(reporting.get(period, ())) or None])
            continue
        exported = max(tot - dom, 0.0)
        export.append([period, round(dom, 2), round(tot, 2), round(exported, 2),
                       round(100 * exported / tot, 2), len(reporting.get(period, ()))])
    export.append([])
    export.append(["Domestic is the sum of Nigerian city listeners the provider reports; "
                   "it is a lower bound, so export share is an upper bound."])
    export.append(["Blank domestic and share cells mean the provider published no city "
                   "breakdown for that quarter — the split was NOT measured before "
                   "2021-08-30. A blank is not a zero."])
    style_header(export)
    autosize(export, {1: 14, 2: 22, 3: 18, 4: 18, 5: 18, 6: 18})

    # ---- 4. Nigerian DSPs (new coverage) ---------------------------------
    dsp = workbook.create_sheet("Nigerian_DSPs")
    dsp.append(["period_label", "Boomplay_followers", "Audiomack_followers",
                "Boomplay_artists", "Audiomack_artists"])
    dsp_totals: dict[tuple[str, str], float] = defaultdict(float)
    dsp_artists: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in rows:
        variable = row["variable_name"]
        if variable in ("Boomplay_followers_daily", "Audiomack_followers_daily"):
            dsp_totals[(variable, row["period_label"])] += value(row)
            dsp_artists[(variable, row["period_label"])].add(row["entity_name"])
    for period in periods:
        def cell(variable):
            key = (variable, period)
            return round(dsp_totals[key], 2) if key in dsp_totals else None

        def artists_cell(variable):
            return len(dsp_artists.get((variable, period), ())) or None

        dsp.append([period, cell("Boomplay_followers_daily"),
                    cell("Audiomack_followers_daily"),
                    artists_cell("Boomplay_followers_daily"),
                    artists_cell("Audiomack_followers_daily")])
    dsp.append([])
    dsp.append(["Neither platform was obtainable from Chartmetric on this subscription "
                "(both returned 401). Provider history begins 2023 (Boomplay) and 2024 (Audiomack)."])
    style_header(dsp)
    autosize(dsp, {1: 14, 2: 22, 3: 22, 4: 18, 5: 18})

    # ---- 5. Radio airplay ------------------------------------------------
    radio = workbook.create_sheet("Radio_Airplay_NG")
    radio.append(["period_label", "total_spins_NG", "artists_with_airplay"])
    spins: dict[str, float] = defaultdict(float)
    spin_artists: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row["variable_name"] == "Radio_spins_daily_NG":
            spins[row["period_label"]] += value(row)
            spin_artists[row["period_label"]].add(row["entity_name"])
    for period in periods:
        radio.append([period,
                      int(spins[period]) if period in spins else None,
                      len(spin_artists.get(period, ())) or None])
    radio.append([])
    radio.append(["Counts songs aired on the Nigerian stations Soundcharts monitors. "
                  "Airplay was requested by NBS and is not available on the Chartmetric tier."])
    style_header(radio)
    autosize(radio, {1: 14, 2: 18, 3: 22})

    # ---- 6. Coverage by variable ----------------------------------------
    cover_sheet = workbook.create_sheet("Coverage")
    cover_sheet.append(["variable_name", "unit", "quarters_present", "first_quarter",
                        "last_quarter", "artists", "observations", "providers"])
    per_var: dict[str, dict] = {}
    for row in rows:
        variable = row["variable_name"]
        entry = per_var.setdefault(variable, {
            "unit": row.get("unit", ""), "quarters": set(), "artists": set(), "obs": 0,
        })
        entry["quarters"].add(row["period_label"])
        entry["artists"].add(row["entity_name"])
        try:
            entry["obs"] += int(row.get("observations") or 0)
        except ValueError:
            pass
    for variable in sorted(per_var):
        entry = per_var[variable]
        ordered = sorted(entry["quarters"], key=period_key)
        provider_set = {p for combo in providers_by_var[variable] for p in combo.split("+") if p}
        cover_sheet.append([variable, entry["unit"], len(ordered), ordered[0], ordered[-1],
                            len(entry["artists"]), entry["obs"], "+".join(sorted(provider_set))])
    style_header(cover_sheet)
    autosize(cover_sheet, {1: 38, 2: 14, 3: 16, 4: 14, 5: 14, 6: 12, 7: 14, 8: 26})

    # ---- 7. Artist microdata --------------------------------------------
    detail = workbook.create_sheet("Artist_Quarterly")
    fields = ["period_label", "entity_name", "platform", "variable_name", "geo_scope",
              "variable_value", "unit", "aggregation_rule", "classification", "delta_raw",
              "observations", "first_observed", "last_observed", "providers"]
    detail.append(fields)
    ordered_rows = sorted(rows, key=lambda r: (r["entity_name"], r["variable_name"], period_key(r["period_label"])))
    written = 0
    for row in ordered_rows:
        if written >= 1_000_000:  # Excel hard limit is 1,048,576 rows
            break
        detail.append([row.get(f, "") for f in fields])
        written += 1
    if written < len(ordered_rows):
        print(f"  NOTE: Artist_Quarterly truncated at {written:,} of {len(ordered_rows):,} rows "
              f"(Excel row limit) — full data is in Quarterly_Aggregates_Full.csv", flush=True)
    style_header(detail)
    autosize(detail, {1: 14, 2: 26, 3: 16, 4: 36, 5: 14, 6: 18, 7: 14, 8: 18, 9: 14, 10: 16, 11: 16, 12: 22})

    # ---- 7b. Provenance and duplicate removal ---------------------------
    prov = workbook.create_sheet("Provenance")
    prov.append(["metric", "value", "note"])
    dupes = FINAL / "07_Quality_Checks" / "Duplicates_Removed_Report.csv"
    dupe_counts: dict[str, int] = {}
    if dupes.exists():
        with dupes.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                kind = row.get("removal_kind", "")
                dupe_counts[kind] = dupe_counts.get(kind, 0) + 1
    prov_rows = [
        ("Quarters covered", len(periods),
         f"{periods[0] if periods else '-'} to {periods[-1] if periods else '-'}; the former delivery covered 9"),
        ("Artists in quarterly aggregates", len(artists), "Frame artists with at least one observation"),
        ("Duplicates removed — within Chartmetric", dupe_counts.get("duplicate_within_chartmetric", 0),
         "Exact repeat observations already present in the delivered dataset"),
        ("Duplicates removed — within Soundcharts", dupe_counts.get("duplicate_within_soundcharts", 0),
         "Repeat daily crawls collapsed to one observation per date"),
        ("Soundcharts rows displaced", dupe_counts.get("displaced_by_chartmetric", 0),
         "Both providers answered; the already-delivered Chartmetric figure was kept"),
    ]
    for label, value, note in prov_rows:
        prov.append([label, value, note])
    prov.append([])
    prov.append(["Every removal is itemised in 07_Quality_Checks/Duplicates_Removed_Report.csv, "
                 "and every rule applied in 07_Quality_Checks/Standardisation_Report.md."])
    style_header(prov)
    autosize(prov, {1: 42, 2: 16, 3: 92})

    # ---- 8. Resolution audit --------------------------------------------
    if RESOLUTION.exists():
        audit = workbook.create_sheet("Artist_Resolution")
        resolution_rows = list(csv.DictReader(RESOLUTION.open(encoding="utf-8")))
        if resolution_rows:
            headers = list(resolution_rows[0].keys())
            audit.append(headers)
            for row in resolution_rows:
                audit.append([row.get(h, "") for h in headers])
            style_header(audit)
            autosize(audit, {1: 28, 2: 14, 3: 38, 4: 26, 5: 24, 6: 12, 7: 16, 8: 20, 9: 16})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(OUT)
    size_mb = OUT.stat().st_size / 1_048_576
    print(f"\nwrote {OUT}")
    print(f"  {len(workbook.sheetnames)} sheets: {', '.join(workbook.sheetnames)}")
    print(f"  {size_mb:.1f} MB · {written:,} microdata rows · {len(periods)} quarters · {len(artists):,} artists")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
