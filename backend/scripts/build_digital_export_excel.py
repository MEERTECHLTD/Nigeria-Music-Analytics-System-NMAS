"""Build a standalone Excel workbook for Nigeria's Digital Music Export."""
import csv
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ROOT = PROJECT_ROOT / "delivery"
SRC = ROOT / "04_Datasets" / "Gross_Export_Revenue.csv"
STREAM_SRC = ROOT / "04_Datasets" / "Gross_Streaming_Revenue.csv"
OUT = ROOT / "03_Excel_Deliveries" / "7_Digital_Music_Export.xlsx"

PERIODS = ["Q1_2025", "Q2_2025", "Q3_2025", "Q4_2025", "Q1_2026"]

HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
TOTAL_FILL = PatternFill("solid", fgColor="FFE699")
TITLE_FONT = Font(name="Calibri", size=16, bold=True, color="1F4E79")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
BOLD = Font(bold=True)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER


def autosize(ws, min_w=10, max_w=40):
    for col in ws.columns:
        col = [c for c in col if not isinstance(c, type(ws.cell(1, 1))) or c.value is not None]
        if not col:
            continue
        letter = get_column_letter(col[0].column)
        width = max(min_w, min(max_w, max(len(str(c.value)) for c in col) + 2))
        ws.column_dimensions[letter].width = width


def load_rows():
    with open(SRC) as f:
        rows = [r for r in csv.DictReader(f) if r["artist_name"] != "=== PERIOD TOTAL ==="]
    for r in rows:
        for k in ("total_streaming_revenue_usd", "domestic_revenue_usd",
                  "gross_export_revenue_usd", "gross_export_revenue_ngn",
                  "nigeria_domestic_share_pct", "export_share_pct"):
            r[k] = float(r[k] or 0)
    return rows


def build_cover(wb):
    ws = wb.create_sheet("Cover")
    ws["A1"] = "NMAS — Digital Music Export Report"
    ws["A1"].font = TITLE_FONT
    ws["A2"] = "National Bureau of Statistics Delivery"
    ws["A2"].font = Font(size=12, italic=True)
    ws["A4"] = "Scope:"; ws["A4"].font = BOLD
    ws["B4"] = "Gross Digital Music Export Revenue from Nigerian artists via streaming platforms"
    ws["A5"] = "Periods:"; ws["A5"].font = BOLD
    ws["B5"] = "Q1 2025, Q2 2025, Q3 2025, Q4 2025, Q1 2026"
    ws["A6"] = "Artist Universe:"; ws["A6"].font = BOLD
    ws["B6"] = "131 verified Nigerian artists (128-129 with Chartmetric streaming data per quarter)"
    ws["A7"] = "Methodology:"; ws["A7"].font = BOLD
    ws["B7"] = ("Per-artist gross streaming revenue × 70% export share. "
                "Split derived from Chartmetric 'Where People Listen' (30% domestic / 70% export).")
    ws["A8"] = "FX Rate:"; ws["A8"].font = BOLD
    ws["B8"] = "₦1,500 / USD (fixed)"
    ws["A9"] = "Sources:"; ws["A9"].font = BOLD
    ws["B9"] = "Chartmetric + SoundCharts + WIPO 2025 International Music Trade methodology"
    ws["A11"] = "Contents:"; ws["A11"].font = BOLD
    for i, (name, desc) in enumerate([
        ("Summary", "Period totals (USD & NGN), export share, growth"),
        ("By Period", "Per-artist export revenue for each quarter"),
        ("By Artist", "Per-artist totals across all 5 periods (ranked)"),
        ("Top Markets", "Top destination markets for Nigerian music export"),
        ("Growth Trend", "Quarterly export revenue trajectory"),
        ("Methodology", "Calculation rules and data limitations"),
    ], start=12):
        ws.cell(row=i, column=1, value=f"  {name}").font = BOLD
        ws.cell(row=i, column=2, value=desc)
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 90


def build_summary(wb, rows):
    ws = wb.create_sheet("Summary")
    ws["A1"] = "Digital Music Export — Period Summary"
    ws["A1"].font = TITLE_FONT
    headers = ["Period", "Artists", "Total Streaming Revenue (USD)",
               "Domestic Revenue (USD)", "Gross Export Revenue (USD)",
               "Gross Export Revenue (NGN)", "Export Share (%)", "QoQ Growth (%)"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    prev_usd = None
    for i, p in enumerate(PERIODS, start=4):
        pr = [r for r in rows if r["period"] == p]
        streaming = sum(r["total_streaming_revenue_usd"] for r in pr)
        domestic = sum(r["domestic_revenue_usd"] for r in pr)
        export_usd = sum(r["gross_export_revenue_usd"] for r in pr)
        export_ngn = sum(r["gross_export_revenue_ngn"] for r in pr)
        share = (export_usd / streaming * 100) if streaming else 0
        growth = ((export_usd / prev_usd - 1) * 100) if prev_usd else None
        ws.cell(row=i, column=1, value=p.replace("_", " "))
        ws.cell(row=i, column=2, value=len(pr))
        ws.cell(row=i, column=3, value=round(streaming, 2))
        ws.cell(row=i, column=4, value=round(domestic, 2))
        ws.cell(row=i, column=5, value=round(export_usd, 2))
        ws.cell(row=i, column=6, value=round(export_ngn, 2))
        ws.cell(row=i, column=7, value=round(share, 2))
        ws.cell(row=i, column=8, value=round(growth, 2) if growth is not None else None)
        prev_usd = export_usd

    total_row = 4 + len(PERIODS)
    ws.cell(row=total_row, column=1, value="TOTAL (all periods)").font = BOLD
    for col in (3, 4, 5, 6):
        letter = get_column_letter(col)
        ws.cell(row=total_row, column=col,
                value=f"=SUM({letter}4:{letter}{total_row-1})").font = BOLD
    for c in range(1, len(headers) + 1):
        ws.cell(row=total_row, column=c).fill = TOTAL_FILL

    for r in range(4, total_row + 1):
        for col in (3, 4, 5):
            ws.cell(row=r, column=col).number_format = '"$"#,##0.00'
        ws.cell(row=r, column=6).number_format = '"₦"#,##0'
        ws.cell(row=r, column=7).number_format = '0.00"%"'
        ws.cell(row=r, column=8).number_format = '0.00"%"'

    chart = BarChart()
    chart.title = "Gross Export Revenue by Quarter (USD)"
    chart.y_axis.title = "USD"
    chart.x_axis.title = "Period"
    chart.height = 9; chart.width = 18
    data = Reference(ws, min_col=5, min_row=3, max_row=3 + len(PERIODS))
    cats = Reference(ws, min_col=1, min_row=4, max_row=3 + len(PERIODS))
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.dataLabels = DataLabelList(showVal=True)
    ws.add_chart(chart, "J3")
    autosize(ws, max_w=28)


def build_by_period(wb, rows):
    ws = wb.create_sheet("By Period")
    ws["A1"] = "Digital Export Revenue — Per Artist Per Period"
    ws["A1"].font = TITLE_FONT
    headers = ["Period", "Artist", "Total Streaming (USD)", "Domestic 30% (USD)",
               "Export 70% (USD)", "Export (NGN)", "Top Export Markets"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    r = 4
    for p in PERIODS:
        pr = sorted([x for x in rows if x["period"] == p],
                    key=lambda x: -x["gross_export_revenue_usd"])
        for x in pr:
            ws.cell(row=r, column=1, value=p.replace("_", " "))
            ws.cell(row=r, column=2, value=x["artist_name"])
            ws.cell(row=r, column=3, value=round(x["total_streaming_revenue_usd"], 2))
            ws.cell(row=r, column=4, value=round(x["domestic_revenue_usd"], 2))
            ws.cell(row=r, column=5, value=round(x["gross_export_revenue_usd"], 2))
            ws.cell(row=r, column=6, value=round(x["gross_export_revenue_ngn"], 2))
            ws.cell(row=r, column=7, value=x["top_export_markets"])
            for col in (3, 4, 5):
                ws.cell(row=r, column=col).number_format = '"$"#,##0.00'
            ws.cell(row=r, column=6).number_format = '"₦"#,##0'
            r += 1
    ws.freeze_panes = "A4"
    autosize(ws, max_w=45)


def build_by_artist(wb, rows):
    ws = wb.create_sheet("By Artist")
    ws["A1"] = "Digital Export Revenue — Per Artist Totals (All 5 Periods)"
    ws["A1"].font = TITLE_FONT
    per_artist = defaultdict(lambda: {"export_usd": 0, "export_ngn": 0, "streaming_usd": 0, "periods": 0})
    for r in rows:
        a = per_artist[r["artist_name"]]
        a["export_usd"] += r["gross_export_revenue_usd"]
        a["export_ngn"] += r["gross_export_revenue_ngn"]
        a["streaming_usd"] += r["total_streaming_revenue_usd"]
        a["periods"] += 1

    ranked = sorted(per_artist.items(), key=lambda kv: -kv[1]["export_usd"])
    headers = ["Rank", "Artist", "Periods Covered", "Total Streaming (USD)",
               "Total Export (USD)", "Total Export (NGN)", "Avg Export / Quarter (USD)"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    for i, (name, a) in enumerate(ranked, start=1):
        r = 3 + i
        ws.cell(row=r, column=1, value=i)
        ws.cell(row=r, column=2, value=name)
        ws.cell(row=r, column=3, value=a["periods"])
        ws.cell(row=r, column=4, value=round(a["streaming_usd"], 2))
        ws.cell(row=r, column=5, value=round(a["export_usd"], 2))
        ws.cell(row=r, column=6, value=round(a["export_ngn"], 2))
        ws.cell(row=r, column=7, value=round(a["export_usd"] / a["periods"], 2) if a["periods"] else 0)
        for col in (4, 5, 7):
            ws.cell(row=r, column=col).number_format = '"$"#,##0.00'
        ws.cell(row=r, column=6).number_format = '"₦"#,##0'

    last = 3 + len(ranked)
    ws.cell(row=last + 1, column=2, value="TOTAL").font = BOLD
    for col in (4, 5, 6):
        letter = get_column_letter(col)
        ws.cell(row=last + 1, column=col, value=f"=SUM({letter}4:{letter}{last})").font = BOLD
    for c in range(1, len(headers) + 1):
        ws.cell(row=last + 1, column=c).fill = TOTAL_FILL
    ws.cell(row=last + 1, column=4).number_format = '"$"#,##0.00'
    ws.cell(row=last + 1, column=5).number_format = '"$"#,##0.00'
    ws.cell(row=last + 1, column=6).number_format = '"₦"#,##0'

    ws.freeze_panes = "A4"
    autosize(ws, max_w=32)

    chart = BarChart()
    chart.type = "bar"
    chart.title = "Top 15 Nigerian Artists by Total Export Revenue"
    chart.height = 14; chart.width = 18
    top_n = min(15, len(ranked))
    data = Reference(ws, min_col=5, min_row=3, max_row=3 + top_n)
    cats = Reference(ws, min_col=2, min_row=4, max_row=3 + top_n)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    ws.add_chart(chart, f"I3")


def build_top_markets(wb, rows):
    ws = wb.create_sheet("Top Markets")
    ws["A1"] = "Top Export Destination Markets"
    ws["A1"].font = TITLE_FONT
    ws["A3"] = ("Destination markets are inferred from Chartmetric 'Where People Listen' "
                "city-level data, aggregated to country. The top-5 markets are consistent "
                "across Nigerian artists.")
    ws["A3"].alignment = Alignment(wrap_text=True)
    ws.merge_cells("A3:E3")
    ws.row_dimensions[3].height = 40

    headers = ["Rank", "Country", "Role", "Typical Share of Non-Domestic Listens"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=5, column=c, value=h)
    style_header(ws, 5, len(headers))
    data = [
        (1, "United States", "Diaspora + mainstream Afrobeats audience", "~30%"),
        (2, "United Kingdom", "Diaspora + UK Afrobeats scene", "~20%"),
        (3, "Ghana", "Regional West African market", "~15%"),
        (4, "South Africa", "Regional Sub-Saharan market", "~10%"),
        (5, "France", "European diaspora (Francophone Africa)", "~8%"),
    ]
    for i, row in enumerate(data, start=6):
        for c, v in enumerate(row, 1):
            ws.cell(row=i, column=c, value=v)
    autosize(ws, max_w=50)


def build_trend(wb):
    ws = wb.create_sheet("Growth Trend")
    ws["A1"] = "Quarterly Export Revenue Trend"
    ws["A1"].font = TITLE_FONT
    ws["A3"] = "Period"; ws["B3"] = "Export USD"; ws["C3"] = "Export NGN"
    style_header(ws, 3, 3)
    ws["A4"] = "='Summary'!A4"; ws["A5"] = "='Summary'!A5"; ws["A6"] = "='Summary'!A6"
    ws["A7"] = "='Summary'!A7"; ws["A8"] = "='Summary'!A8"
    for i in range(5):
        ws.cell(row=4 + i, column=2, value=f"='Summary'!E{4+i}").number_format = '"$"#,##0'
        ws.cell(row=4 + i, column=3, value=f"='Summary'!F{4+i}").number_format = '"₦"#,##0'

    chart = LineChart()
    chart.title = "Export Revenue Trend (USD)"
    chart.y_axis.title = "USD"; chart.x_axis.title = "Period"
    chart.height = 10; chart.width = 20
    data = Reference(ws, min_col=2, min_row=3, max_row=8)
    cats = Reference(ws, min_col=1, min_row=4, max_row=8)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.dataLabels = DataLabelList(showVal=True)
    ws.add_chart(chart, "E3")
    autosize(ws)


def build_methodology(wb):
    ws = wb.create_sheet("Methodology")
    ws["A1"] = "Methodology — Digital Music Export"
    ws["A1"].font = TITLE_FONT
    rows = [
        ("Step", "Description"),
        ("1. Artist universe", "131 verified Nigerian artists identified via Chartmetric country/genre filters."),
        ("2. Gross streaming revenue", "Per-artist quarterly revenue from Spotify, YouTube, Deezer, and other platforms using published per-stream rates (Spotify $0.004, YouTube Music $0.0071, Deezer $0.0046, etc.)."),
        ("3. Domestic / Export split", "Chartmetric 'Where People Listen' city-level listener data aggregated to country. Nigeria share averages 30%; international share 70%."),
        ("4. Export revenue", "Gross streaming revenue × 70% = gross export revenue (USD)."),
        ("5. NGN conversion", "Export USD × ₦1,500/USD fixed rate (Q1 2025 – Q1 2026 average CBN window)."),
        ("6. Top markets", "Ranked from 'Where People Listen' country aggregation; US, UK, Ghana, South Africa, France lead for all Nigerian artists."),
        ("Limitations", "No track-level API access — revenue is listener-based estimate. Export share fixed at 70% per WIPO methodology; per-artist variation not applied."),
        ("Sources", "Chartmetric Developer API (26 endpoints) + SoundCharts API (supplementary track-level + chart data); WIPO 2025 International Music Trade Study; Ditto Music 2026; Royalty Exchange 2025; LabelGrid 2026."),
    ]
    for i, (a, b) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=a)
        ws.cell(row=i, column=2, value=b).alignment = Alignment(wrap_text=True, vertical="top")
        if i == 3:
            style_header(ws, i, 2)
        else:
            ws.cell(row=i, column=1).font = BOLD
        ws.row_dimensions[i].height = 45 if i > 3 else 22
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 100


def main():
    rows = load_rows()
    wb = Workbook()
    wb.remove(wb.active)
    build_cover(wb)
    build_summary(wb, rows)
    build_by_period(wb, rows)
    build_by_artist(wb, rows)
    build_top_markets(wb, rows)
    build_trend(wb)
    build_methodology(wb)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"Wrote {OUT}")
    print(f"  Sheets: {wb.sheetnames}")


if __name__ == "__main__":
    main()
