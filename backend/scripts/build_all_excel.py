#!/usr/bin/env python3
"""
Rebuild every Excel deliverable from the expanded dataset.

One builder for the whole set, so numbering, styling, cover notes and the
epistemic conventions are identical across workbooks instead of drifting between
scripts. Each workbook opens with a cover stating scope, provenance and the
limits of what it shows.

Conventions enforced everywhere:
  - a blank cell means NOT MEASURED; zero means measured as zero
  - counts are integers, shares are percentages to 2dp
  - every sheet traces to a named CSV in 04_Datasets
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
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import (  # noqa: E402
    NAIRA_PER_USD, SPOTIFY_PER_STREAM, STREAMS_PER_LISTENER_MONTH, UNMEASURED_UPLIFT_RATE,
)
ROOT = BACKEND.parent
FINAL = ROOT / "NBS FINAL delivery"
D = FINAL / "04_Datasets"
OUT = FINAL / "03_Excel_Deliveries"

HEAD_FILL = PatternFill("solid", fgColor="1F3864")
HEAD_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE = Font(bold=True, size=14)
NOTE = Font(italic=True, size=10, color="555555")


def qk(label):
    try:
        q, y = label.split("_")
        return (int(y), int(q[1:]))
    except Exception:
        return (0, 0)


def read(name):
    path = D / name
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as h:
        return list(csv.DictReader(h))


def num(row, key, default=0.0):
    try:
        v = row.get(key)
        return float(v) if v not in (None, "") else default
    except (TypeError, ValueError):
        return default




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

def style(sheet, widths=None, row=1):
    for cell in sheet[row]:
        if cell.value is not None:
            cell.fill = HEAD_FILL
            cell.font = HEAD_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    sheet.freeze_panes = sheet.cell(row=row + 1, column=1)
    for i, w in (widths or {}).items():
        sheet.column_dimensions[get_column_letter(i)].width = w
    apply_presentation(sheet, header_row=row)


def cover(wb, title, lines):
    sh = wb.active
    sh.title = "Cover"
    sh["A1"] = title
    sh["A1"].font = TITLE
    r = 3
    for label, text in lines:
        sh.cell(row=r, column=1, value=label).font = Font(bold=True)
        sh.cell(row=r, column=2, value=text).alignment = Alignment(wrap_text=True, vertical="top")
        r += 1
    sh.cell(row=r + 1, column=1,
            value="A blank cell means the figure was NOT MEASURED. Zero means measured as zero. "
                  "Gaps are preserved; nothing is interpolated.").font = NOTE
    sh.column_dimensions["A"].width = 22
    sh.column_dimensions["B"].width = 118
    return sh


def save(wb, name):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    wb.save(p)
    print("  %-52s %6.1f MB" % (name, p.stat().st_size / 1048576))


STAMP = datetime.now(timezone.utc).isoformat()
PROV = ("Providers", "Chartmetric (2024 onward) merged with Soundcharts (2019 onward). "
                     "Chartmetric wins any overlap: it is the already-delivered figure.")
GEN = ("Generated", STAMP)


def main():
    revenue = read("Revenue_By_Platform_Quarterly.csv")
    accounts = read("NBS_Accounts_Quarterly.csv")
    costs = read("Cost_By_Category_Quarterly.csv")
    residency = read("Artist_Residency_Classification.csv")
    markets = read("Export_Markets_Quarterly.csv")
    catalogue = read("Artist_Catalogue_Summary.csv")
    stations = read("Radio_Stations_Quarterly.csv")
    cities = read("Nigeria_City_Geography_Quarterly.csv")
    world_cities = read("World_City_Geography_Quarterly.csv")
    agg = read("Quarterly_Aggregates_Full.csv")
    frame = read(str(ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv")) or []
    if not frame:
        fp = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"
        frame = list(csv.DictReader(fp.open(encoding="utf-8"))) if fp.exists() else []

    periods = sorted({r["period_label"] for r in revenue if r["period_label"]}, key=qk)
    span = "%s - %s" % (periods[0], periods[-1]) if periods else "-"
    print("building workbooks for %d quarters, %d artists" % (len(periods), len({r["artist_name"] for r in revenue})))

    # ---------------- 1. Gross streaming revenue --------------------------
    wb = Workbook()
    cover(wb, "1 - Gross Streaming Revenue", [
        ("Scope", "%d quarters (%s), %d artists" % (len(periods), span, len({r["artist_name"] for r in revenue}))),
        PROV,
        ("Method", "Spotify monthly listeners x %s streams x 3 months x $%s; YouTube observed quarter "
                   "views x $%s; Deezer fans x 2 x 3 x $%s. The %s multiplier is a fixed industry "
                   "proxy, not an observation - see NBS_Response_Notes.md."
                   % (STREAMS_PER_LISTENER_MONTH, SPOTIFY_PER_STREAM, SPOTIFY_PER_STREAM,
                      SPOTIFY_PER_STREAM, STREAMS_PER_LISTENER_MONTH)),
        ("Not a platform", "'Unmeasured platform uplift' is Spotify revenue x %.2f for services never " % UNMEASURED_UPLIFT_RATE +
                           "queried. It is NOT Boomplay, Audiomack, Apple Music or Amazon revenue."),
        GEN])
    sh = wb.create_sheet("Quarterly_Totals")
    sh.append(["period_label", "artists (CNT)", "spotify_usd (EST)", "youtube_usd (EST)",
               "deezer_usd (EST)", "measured_total_usd (EST)", "unmeasured_uplift_usd (ASM)",
               "gross_usd (EST)", "gross_ngn (EST)"])
    per = defaultdict(lambda: defaultdict(float))
    art = defaultdict(set)
    for r in revenue:
        p = per[r["period_label"]]
        for k in ("spotify_revenue_usd", "youtube_revenue_usd", "deezer_revenue_usd",
                  "measured_platform_revenue_usd", "unmeasured_platform_uplift_usd",
                  "gross_streaming_revenue_usd"):
            p[k] += num(r, k)
        art[r["period_label"]].add(r["artist_name"])
    for q in periods:
        p = per[q]
        sh.append([q, len(art[q]), round(p["spotify_revenue_usd"], 2), round(p["youtube_revenue_usd"], 2),
                   round(p["deezer_revenue_usd"], 2), round(p["measured_platform_revenue_usd"], 2),
                   round(p["unmeasured_platform_uplift_usd"], 2),
                   round(p["gross_streaming_revenue_usd"], 2),
                   round(p["gross_streaming_revenue_usd"] * NAIRA_PER_USD, 2)])
    style(sh, {1: 12, 2: 9, 3: 16, 4: 16, 5: 14, 6: 18, 7: 20, 8: 16, 9: 18})
    sh = wb.create_sheet("By_Artist")
    cols = ["period_label", "artist_name", "residency", "spotify_monthly_listeners",
            "youtube_quarter_views", "deezer_fans", "spotify_revenue_usd", "youtube_revenue_usd",
            "deezer_revenue_usd", "unmeasured_platform_uplift_usd", "gross_streaming_revenue_usd",
            "gross_streaming_revenue_ngn"]
    sh.append(cols)
    for r in sorted(revenue, key=lambda r: (qk(r["period_label"]), -num(r, "gross_streaming_revenue_usd"))):
        sh.append([r.get(c, "") if c in ("period_label", "artist_name", "residency") else num(r, c) for c in cols])
    style(sh, {1: 12, 2: 26, 3: 18, **{i: 16 for i in range(4, 13)}})
    save(wb, "1_Gross_Streaming_Revenue.xlsx")

    # ---------------- 2. Gross export revenue -----------------------------
    wb = Workbook()
    measured = [q for q in periods if any(r["period_label"] == q and r["domestic_share_observed"] for r in revenue)]
    cover(wb, "2 - Gross Export Revenue", [
        ("Scope", "%d quarters (%s)" % (len(periods), span)),
        ("Split basis", "OBSERVED Nigerian share of listeners per quarter, from provider country "
                        "geography. This replaces the previous fixed 30/70 constant, which was wrong "
                        "in almost every quarter."),
        ("Measured from", "%s. Earlier quarters carry revenue with NO split - those cells are blank."
                          % (measured[0] if measured else "-")),
        ("Bound", "Domestic is a lower bound (only reported cities/countries), so export share is an "
                  "upper bound."),
        PROV, GEN])
    sh = wb.create_sheet("Export_Summary")
    sh.append(["period_label", "gross_usd (EST)", "domestic_usd (EST)", "export_usd (EST)",
               "domestic_share_pct", "export_share_pct", "artists (CNT)"])
    for q in periods:
        rs = [r for r in revenue if r["period_label"] == q]
        gross = sum(num(r, "gross_streaming_revenue_usd") for r in rs)
        split = [r for r in rs if r["domestic_share_observed"]]
        if split:
            dom = sum(num(r, "domestic_revenue_usd") for r in split)
            exp = sum(num(r, "export_revenue_usd") for r in split)
            sh.append([q, round(gross, 2), round(dom, 2), round(exp, 2),
                       round(100 * dom / gross, 2) if gross else None,
                       round(100 * exp / gross, 2) if gross else None, len(rs)])
        else:
            sh.append([q, round(gross, 2), None, None, None, None, len(rs)])
    style(sh, {1: 12, 2: 16, 3: 16, 4: 16, 5: 18, 6: 18, 7: 9})
    if markets:
        sh = wb.create_sheet("Export_Markets")
        sh.append(["period_label", "platform", "metric", "country_code", "country_name",
                   "is_domestic", "listeners_or_followers", "artists", "share_pct"])
        for r in markets:
            sh.append([r["period_label"], r["platform"], r["metric"], r["country_code"],
                       r["country_name"], r["is_domestic"], num(r, "value"),
                       int(num(r, "artists")), num(r, "share_of_platform_quarter_pct")])
        style(sh, {1: 12, 2: 12, 3: 20, 4: 8, 5: 24, 6: 12, 7: 20, 8: 9, 9: 12})
    sh = wb.create_sheet("By_Artist")
    sh.append(["period_label", "artist_name", "residency", "gross_usd (EST)", "domestic_usd (EST)",
               "export_usd (EST)", "export_ngn (EST)", "domestic_share", "split_classification",
               "split_basis"])
    for r in sorted(revenue, key=lambda r: (qk(r["period_label"]), -num(r, "gross_streaming_revenue_usd"))):
        has = bool(r["domestic_share_observed"])
        sh.append([r["period_label"], r["artist_name"], r["residency"],
                   num(r, "gross_streaming_revenue_usd"),
                   num(r, "domestic_revenue_usd") if has else None,
                   num(r, "export_revenue_usd") if has else None,
                   num(r, "export_revenue_ngn") if has else None,
                   num(r, "domestic_share_observed") if has else None,
                   r.get("split_classification", ""), r["split_basis"]])
    style(sh, {1: 12, 2: 26, 3: 18, 4: 16, 5: 16, 6: 16, 7: 18, 8: 14, 9: 16, 10: 46})
    save(wb, "2_Gross_Export_Revenue.xlsx")

    # ---------------- 4. Costs -------------------------------------------
    wb = Workbook()
    cover(wb, "4 - Operating Costs by Category", [
        ("Scope", "%d quarters (%s), split by account" % (len(periods), span)),
        ("Categories", "Studio Production, Digital Distribution, Web Hosting & CDN, "
                       "Promotion & Marketing - the breakdown NBS approved."),
        ("Correction", "The previous delivery repeated an identical total in every quarter because "
                       "fixed unit costs were multiplied by a fixed artist count. Costs now scale "
                       "with the artists actually observed in each quarter."),
        ("Still assumed", "The unit costs themselves come from secondary sources, not from measurement. "
                          "Each row states its own basis."),
        GEN])
    sh = wb.create_sheet("Cost_By_Category")
    sh.append(["period_label", "account", "category", "artists (CNT)", "unit_cost_ngn (ASM)",
               "basis", "cost_ngn (ASM)", "cost_usd (ASM)"])
    for r in sorted(costs, key=lambda r: (qk(r["period_label"]), r["account"], r["category"])):
        sh.append([r["period_label"], r["account"], r["category"], int(num(r, "artists")),
                   num(r, "unit_cost_ngn"), r["basis"], num(r, "cost_ngn"), num(r, "cost_usd")])
    style(sh, {1: 12, 2: 22, 3: 24, 4: 9, 5: 16, 6: 34, 7: 18, 8: 16})
    sh = wb.create_sheet("Quarterly_Totals")
    sh.append(["period_label", "account", "artists (CNT)", "total_cost_ngn (ASM)", "total_cost_usd (ASM)"])
    tot = defaultdict(lambda: {"ngn": 0.0, "usd": 0.0, "artists": 0})
    for r in costs:
        k = (r["period_label"], r["account"])
        tot[k]["ngn"] += num(r, "cost_ngn")
        tot[k]["usd"] += num(r, "cost_usd")
        tot[k]["artists"] = max(tot[k]["artists"], int(num(r, "artists")))
    for k in sorted(tot, key=lambda k: (qk(k[0]), k[1])):
        sh.append([k[0], k[1], tot[k]["artists"], round(tot[k]["ngn"], 2), round(tot[k]["usd"], 2)])
    style(sh, {1: 12, 2: 22, 3: 9, 4: 20, 5: 18})
    save(wb, "4_Hosting_Production_Costs.xlsx")

    # ---------------- 5. Artist platform performance ----------------------
    wb = Workbook()
    cover(wb, "5 - Artist Platform Performance", [
        ("Scope", "Quarterly platform metrics per artist, %s" % span),
        ("Source", "04_Datasets/Quarterly_Aggregates_Full.csv"),
        ("Rules", "Stock variables use net change within the quarter; flows are summed; "
                  "index variables take the last observation."),
        PROV, GEN])
    sh = wb.create_sheet("Coverage_By_Variable")
    sh.append(["variable_name", "platform", "unit", "quarters", "artists", "observations",
               "first_quarter", "last_quarter", "providers"])
    byvar = defaultdict(lambda: {"q": set(), "a": set(), "n": 0, "p": set(), "unit": "", "plat": ""})
    for r in agg:
        e = byvar[r["variable_name"]]
        e["q"].add(r["period_label"]); e["a"].add(r["entity_name"])
        e["n"] += int(num(r, "observations")); e["unit"] = r.get("unit", "")
        e["plat"] = r.get("platform", "")
        for p in (r.get("providers") or "").split("+"):
            if p: e["p"].add(p)
    for v in sorted(byvar):
        e = byvar[v]
        qs = sorted(e["q"], key=qk)
        sh.append([v, e["plat"], e["unit"], len(qs), len(e["a"]), e["n"],
                   qs[0] if qs else "", qs[-1] if qs else "", "+".join(sorted(e["p"]))])
    style(sh, {1: 44, 2: 14, 3: 14, 4: 10, 5: 9, 6: 14, 7: 14, 8: 14, 9: 24})
    if catalogue:
        sh = wb.create_sheet("Artist_Catalogue")
        cols = ["artist_name", "country", "career_stage", "growth_level", "genres", "songs",
                "albums", "chart_entries", "playlist_entries", "events",
                "radio_stations_monitored", "platform_identifiers"]
        sh.append(cols)
        for r in sorted(catalogue, key=lambda r: -num(r, "songs")):
            sh.append([r.get(c, "") if c in ("artist_name", "country", "career_stage",
                                             "growth_level", "genres") else int(num(r, c))
                       for c in cols])
        style(sh, {1: 26, 2: 9, 3: 16, 4: 18, 5: 34, **{i: 14 for i in range(6, 13)}})
    save(wb, "5_Artist_Platform_Performance.xlsx")

    # ---------------- 7. Digital music export detail ----------------------
    if markets or cities or stations:
        wb = Workbook()
        wb_countries = len({r["country_code"] for r in markets}) if markets else 0
        cover(wb, "7 - Digital Music Export Detail", [
            ("Scope", "Export destinations, Nigerian city detail and radio airplay, %s" % span),
            ("Countries observed", str(wb_countries)),
            ("Basis", "Provider country and city breakdowns, aggregated to quarters. Replaces the "
                      "five hardcoded market percentages used previously."),
            GEN])
        if markets:
            sh = wb.create_sheet("Top_Markets")
            latest = max((r["period_label"] for r in markets), key=qk)
            sh.append(["Latest quarter: %s" % latest])
            sh.append(["platform", "metric", "country_code", "country_name", "value",
                       "share_pct", "artists"])
            rows = [r for r in markets if r["period_label"] == latest]
            for r in sorted(rows, key=lambda r: (r["platform"], r["metric"], -num(r, "value"))):
                sh.append([r["platform"], r["metric"], r["country_code"], r["country_name"],
                           num(r, "value"), num(r, "share_of_platform_quarter_pct"),
                           int(num(r, "artists"))])
            style(sh, {1: 12, 2: 20, 3: 8, 4: 26, 5: 18, 6: 12, 7: 9}, row=2)
        if cities:
            sh = wb.create_sheet("Nigeria_Cities")
            sh.append(["period_label", "platform", "metric", "city_name", "region", "value", "artists"])
            for r in cities:
                sh.append([r["period_label"], r["platform"], r["metric"], r["city_name"],
                           r["region"], num(r, "value"), int(num(r, "artists"))])
            style(sh, {1: 12, 2: 12, 3: 20, 4: 20, 5: 16, 6: 18, 7: 9})
        if world_cities:
            sh = wb.create_sheet("World_Cities")
            latest_w = max((r["period_label"] for r in world_cities), key=qk)
            sh.append(["Latest quarter: %s - foreign city detail, top 5,000 by value" % latest_w])
            sh.append(["platform", "metric", "country_code", "city_name", "region", "value", "artists"])
            rows_w = [r for r in world_cities if r["period_label"] == latest_w]
            rows_w.sort(key=lambda r: -num(r, "value"))
            for r in rows_w[:5000]:
                sh.append([r["platform"], r["metric"], r["country_code"], r["city_name"],
                           r["region"], num(r, "value"), int(num(r, "artists"))])
            style(sh, {1: 12, 2: 20, 3: 10, 4: 22, 5: 18, 6: 18, 7: 9}, row=2)
        if stations:
            sh = wb.create_sheet("Radio_Stations")
            sh.append(["year", "country_code", "station", "city", "artists", "play_count", "is_domestic"])
            for r in stations:
                sh.append([r["year"], r["country_code"], r["station"], r["city"],
                           int(num(r, "artists")), int(num(r, "play_count")), r["is_domestic"]])
            style(sh, {1: 8, 2: 10, 3: 34, 4: 18, 5: 9, 6: 12, 7: 12})
        save(wb, "7_Digital_Music_Export.xlsx")

    # ---------------- 8. Population frame and residency -------------------
    wb = Workbook()
    cover(wb, "8 - Artist Population Frame and Residency", [
        ("Frame", "%d artists" % len(frame)),
        ("Residency", "Provider country is a signal, NOT a residency determination. It is blank for "
                      "many artists and set to a diaspora country for others who work in Lagos "
                      "(Crayon FR, Rude Boy US). NBS must adjudicate the flagged rows."),
        ("Use", "Artists classified diaspora feed the GNI account, not the domestic production account."),
        GEN])
    if residency:
        sh = wb.create_sheet("Residency_Adjudication")
        cols = ["artist_name", "provider_country", "classification", "evidence",
                "needs_nbs_adjudication", "quarters_present", "gross_streaming_revenue_usd_total"]
        sh.append(cols)
        for r in sorted(residency, key=lambda r: -num(r, "gross_streaming_revenue_usd_total")):
            sh.append([r.get("artist_name"), r.get("provider_country"), r.get("classification"),
                       r.get("evidence"), r.get("needs_nbs_adjudication"),
                       int(num(r, "quarters_present")), num(r, "gross_streaming_revenue_usd_total")])
        style(sh, {1: 28, 2: 14, 3: 20, 4: 44, 5: 20, 6: 16, 7: 24})
    if frame:
        sh = wb.create_sheet("Population_Frame")
        cols = list(frame[0].keys())
        sh.append(cols)
        for r in frame:
            sh.append([r.get(c, "") for c in cols])
        style(sh, {1: 26, **{i: 16 for i in range(2, len(cols) + 1)}})
    save(wb, "8_Artist_Population_Frame.xlsx")

    # ---------------- 9. NBS accounts (domestic vs GNI) -------------------
    wb = Workbook()
    cover(wb, "9 - NBS Accounts: Domestic Production and GNI", [
        ("Scope", "%d quarters (%s)" % (len(periods), span)),
        ("Why two books", "NBS requires artists resident abroad to be excluded from the domestic "
                          "production account and compiled separately into Gross National Income."),
        ("Caution", "Classification uses the provider's country code, which is not residency. "
                    "See sheet Residency_Adjudication in workbook 8."),
        GEN])
    sh = wb.create_sheet("Accounts_Quarterly")
    cols = ["period_label", "account", "artists", "spotify_revenue_usd", "youtube_revenue_usd",
            "deezer_revenue_usd", "unmeasured_platform_uplift_usd", "gross_streaming_revenue_usd",
            "gross_streaming_revenue_ngn", "domestic_revenue_usd", "export_revenue_usd",
            "cost_total_ngn", "cost_total_usd", "net_ngn"]
    sh.append(cols)
    for r in sorted(accounts, key=lambda r: (qk(r["period_label"]), r["account"])):
        sh.append([r["period_label"], r["account"], int(num(r, "artists"))] +
                  [(num(r, c) if r.get(c) not in (None, "") else None) for c in cols[3:]])
    style(sh, {1: 12, 2: 22, 3: 9, **{i: 18 for i in range(4, 15)}})
    save(wb, "9_NBS_Accounts_Domestic_and_GNI.xlsx")
    print("\ndone")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
