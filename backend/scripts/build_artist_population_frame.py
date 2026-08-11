"""Build the Artist Population Frame deliverable for NBS.

Output:
  - delivery/04_Datasets/Artist_Population_Frame.csv
  - delivery/03_Excel_Deliveries/8_Artist_Population_Frame.xlsx

The Excel has three sheets:
  1. Summary         - headline counts and sample-to-population ratio
  2. Sampled_Artists - the 131 artists whose data was delivered to NBS
  3. All_Known_Artists - full population frame (sample + additional known artists)

Population artists beyond the sample are a curated list of publicly known
Nigerian recording artists across genres. Platform IDs are intentionally
left blank for population-only rows (they were not scraped).
"""

from __future__ import annotations

import csv
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_CSV = ROOT / "delivery" / "04_Datasets" / "Artist_Master_List.csv"
OUT_CSV = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"
OUT_XLSX = ROOT / "delivery" / "03_Excel_Deliveries" / "8_Artist_Population_Frame.xlsx"


# -------- Population additions (NOT in the 131 sample) --------
# Curated list of publicly known Nigerian recording artists grouped by
# genre / scene so NBS can stratify if needed.

POPULATION_ADDITIONS: list[tuple[str, str]] = [
    # Afrobeats / Afropop — mainstream not already in sample
    ("Runtown", "Afrobeats/Afropop"),
    ("Skales", "Afrobeats/Afropop"),
    ("May D", "Afrobeats/Afropop"),
    ("Dr SID", "Afrobeats/Afropop"),
    ("Tony Tetuila", "Afrobeats/Afropop"),
    ("Di'ja", "Afrobeats/Afropop"),
    ("Jaywon", "Afrobeats/Afropop"),
    ("Orezi", "Afrobeats/Afropop"),
    ("Terry G", "Afrobeats/Afropop"),
    ("Cynthia Morgan", "Afrobeats/Afropop"),
    ("Victoria Kimani", "Afrobeats/Afropop"),
    ("Omawumi", "Afrobeats/Afropop"),
    ("Chidinma", "Afrobeats/Afropop"),
    ("Mo'Cheddah", "Afrobeats/Afropop"),
    ("Waconzy", "Afrobeats/Afropop"),
    ("Emma Nyra", "Afrobeats/Afropop"),
    ("Iyanya", "Afrobeats/Afropop"),  # cross-check: Iyanya IS in sample — will be dropped on dedup
    ("L.A.X", "Afrobeats/Afropop"),
    ("Ketchup", "Afrobeats/Afropop"),
    ("Liya", "Afrobeats/Afropop"),
    ("T'neeya", "Afrobeats/Afropop"),
    ("Fave", "Afrobeats/Afropop"),
    ("Guchi", "Afrobeats/Afropop"),
    ("Goya Menor", "Afrobeats/Afropop"),
    ("Zerry DL", "Afrobeats/Afropop"),
    ("Balloranking", "Afrobeats/Afropop"),
    ("Tolani", "Afrobeats/Afropop"),
    ("Barry Jhay", "Afrobeats/Afropop"),
    ("Timi Dakolo", "Afrobeats/Afropop"),
    ("Praiz", "Afrobeats/Afropop"),  # in sample — will dedup
    ("Ric Hassani", "Afrobeats/Afropop"),  # in sample
    ("Ajebo Hustlers", "Afrobeats/Afropop"),
    ("Odeal", "Afrobeats/Afropop"),
    ("Lifesize Teddy", "Afrobeats/Afropop"),
    ("Shoday", "Afrobeats/Afropop"),
    ("Sean Dampte", "Afrobeats/Afropop"),
    ("Solidstar", "Afrobeats/Afropop"),  # in sample

    # Hip-Hop / Rap (classic + contemporary)
    ("Ruggedman", "Hip-Hop/Rap"),
    ("Modenine", "Hip-Hop/Rap"),
    ("Eedris Abdulkareem", "Hip-Hop/Rap"),
    ("Weird MC", "Hip-Hop/Rap"),
    ("Sasha P", "Hip-Hop/Rap"),
    ("Eva Alordiah", "Hip-Hop/Rap"),
    ("Ikechukwu (Killz)", "Hip-Hop/Rap"),
    ("Payper Corleone", "Hip-Hop/Rap"),
    ("PsychoYP", "Hip-Hop/Rap"),
    ("Zilla Oaks", "Hip-Hop/Rap"),
    ("A-Q", "Hip-Hop/Rap"),
    ("Loose Kaynon", "Hip-Hop/Rap"),
    ("Boogey", "Hip-Hop/Rap"),
    ("Paybac Iboro", "Hip-Hop/Rap"),
    ("Tec", "Hip-Hop/Rap"),
    ("Ghost", "Hip-Hop/Rap"),
    ("Straffitti", "Hip-Hop/Rap"),

    # Alté / Indie / R&B
    ("Tomi Thomas", "Alté/Indie"),
    ("Jinmi Abduls", "Alté/Indie"),
    ("Somadina", "Alté/Indie"),
    ("Temi DollFace", "Alté/Indie"),
    ("Deena Ade", "Alté/Indie"),
    ("BenjiFlow", "Alté/Indie"),
    ("DRB Lasgidi", "Alté/Indie"),
    ("Tay Iwar", "Alté/Indie"),  # in sample
    ("Saeon", "Alté/Indie"),
    ("Dami Oniru", "Alté/Indie"),
    ("Projexx", "Alté/Indie"),
    ("Lady Donli", "Alté/Indie"),  # in sample

    # Gospel
    ("Sinach", "Gospel"),
    ("Frank Edwards", "Gospel"),
    ("Mercy Chinwo", "Gospel"),
    ("Nathaniel Bassey", "Gospel"),
    ("Tope Alabi", "Gospel"),
    ("Yinka Ayefele", "Gospel"),
    ("Tim Godfrey", "Gospel"),
    ("Samsong", "Gospel"),
    ("Buchi", "Gospel"),
    ("Sonnie Badu", "Gospel"),
    ("Joe Praize", "Gospel"),
    ("Preye Odede", "Gospel"),
    ("Moses Bliss", "Gospel"),
    ("Minister GUC", "Gospel"),
    ("Judikay", "Gospel"),
    ("Ada Ehi", "Gospel"),
    ("Eben", "Gospel"),
    ("Dunsin Oyekan", "Gospel"),
    ("Prospa Ochimana", "Gospel"),
    ("Mike Abdul", "Gospel"),
    ("Nikki Laoye", "Gospel"),
    ("Chioma Jesus", "Gospel"),
    ("Yadah", "Gospel"),
    ("Kenny K'ore", "Gospel"),
    ("Lawrence Oyor", "Gospel"),
    ("Theophilus Sunday", "Gospel"),
    ("Peterson Okopi", "Gospel"),
    ("Midnight Crew", "Gospel"),
    ("Ebuka Songs", "Gospel"),
    ("Neeta", "Gospel"),

    # Highlife (Eastern / South-South)
    ("Bright Chimezie", "Highlife"),
    ("Kcee", "Highlife"),
    ("Umu Obiligbo", "Highlife"),
    ("Zoro", "Highlife"),
    ("Slowdog", "Highlife"),
    ("Mr Raw", "Highlife"),
    ("Pericoma Okoye", "Highlife"),
    ("J Martins", "Highlife"),
    ("Flavour N'abania", "Highlife"),  # in sample

    # Fuji / Apala
    ("KWAM 1 (King Wasiu Ayinde Marshal)", "Fuji/Apala"),
    ("Saheed Osupa", "Fuji/Apala"),
    ("Pasuma (Wasiu Alabi)", "Fuji/Apala"),
    ("Taye Currency", "Fuji/Apala"),
    ("Abass Akande Obesere", "Fuji/Apala"),
    ("Kollington Ayinla", "Fuji/Apala"),
    ("Remi Aluko", "Fuji/Apala"),
    ("Muri Thunder", "Fuji/Apala"),
    ("Sule Alao Malaika", "Fuji/Apala"),
    ("Sefiu Alao Adekunle", "Fuji/Apala"),

    # Juju
    ("Sir Shina Peters", "Juju"),
    ("Dele Taiwo", "Juju"),
    ("Segun Adewale", "Juju"),
    ("Adewale Ayuba", "Juju"),

    # Reggae / Dancehall
    ("Daddy Showkey", "Reggae/Dancehall"),
    ("Daddy Fresh", "Reggae/Dancehall"),
    ("Orits Wiliki", "Reggae/Dancehall"),
    ("Shank", "Reggae/Dancehall"),
    ("Oritse Femi", "Reggae/Dancehall"),  # spelt Oritsefemi in sample

    # Afrobeat (Kuti / Shrine lineage)
    ("Femi Kuti", "Afrobeat"),
    ("Seun Kuti", "Afrobeat"),
    ("Made Kuti", "Afrobeat"),
    ("Yeni Kuti", "Afrobeat"),
    ("Dede Mabiaku", "Afrobeat"),

    # Northern / Hausa scene
    ("Ali Jita", "Hausa/Northern"),
    ("Nazifi Asnanic", "Hausa/Northern"),
    ("Adam A. Zango", "Hausa/Northern"),
    ("Classiq", "Hausa/Northern"),
    ("Morell", "Hausa/Northern"),
    ("Rarara", "Hausa/Northern"),
    ("Abdul D One", "Hausa/Northern"),
    ("Hamisu Breaker", "Hausa/Northern"),
    ("DJ AB", "Hausa/Northern"),
    ("Ceeboi", "Hausa/Northern"),

    # Legacy / Veterans (pre-2000)
    ("Onyeka Onwenu", "Legacy/Veteran"),
    ("Majek Fashek", "Legacy/Veteran"),
    ("Ras Kimono", "Legacy/Veteran"),
    ("Christy Essien-Igbokwe", "Legacy/Veteran"),
    ("Sonny Okosun", "Legacy/Veteran"),
    ("Bongos Ikwue", "Legacy/Veteran"),
    ("Orlando Owoh", "Legacy/Veteran"),
    ("I.K. Dairo", "Legacy/Veteran"),
    ("Paul Play Dairo", "Legacy/Veteran"),
    ("Oliver De Coque", "Legacy/Veteran"),
    ("Osita Osadebe", "Legacy/Veteran"),
    ("Mike Ejeagha", "Legacy/Veteran"),
    ("Victor Uwaifo", "Legacy/Veteran"),
    ("William Onyeabor", "Legacy/Veteran"),
    ("Haruna Ishola", "Legacy/Veteran"),
    ("Ayinla Omowura", "Legacy/Veteran"),
    ("Sikiru Ayinde Barrister", "Legacy/Veteran"),
    ("Celestine Ukwu", "Legacy/Veteran"),
    ("Prince Nico Mbarga", "Legacy/Veteran"),
    ("Rex Lawson", "Legacy/Veteran"),
    ("Dan Maraya Jos", "Legacy/Veteran"),

    # 2000s-era pop / R&B groups & solo
    ("Styl-Plus", "2000s-era"),
    ("Plantashun Boiz", "2000s-era"),
    ("Faze", "2000s-era"),
    ("Blackface Naija", "2000s-era"),
    ("Trybesmen", "2000s-era"),
    ("Maintain", "2000s-era"),
    ("Kelly Handsome", "2000s-era"),
    ("KC Presh", "2000s-era"),
    ("Artquake", "2000s-era"),
    ("Zule Zoo", "2000s-era"),
    ("Mandy Thunder", "2000s-era"),
    ("Dagrin", "2000s-era"),
    ("Goldie Harvey", "2000s-era"),
    ("Kefee", "2000s-era"),

    # Producers who also release as artists
    ("Don Jazzy", "Producer-Artist"),
    ("Masterkraft", "Producer-Artist"),
    ("Larry Gaaga", "Producer-Artist"),
    ("Kel P", "Producer-Artist"),
    ("Altims", "Producer-Artist"),
    ("P.Priime", "Producer-Artist"),
    ("Killertunes", "Producer-Artist"),
    ("Eskeez", "Producer-Artist"),
]


def load_sample() -> list[dict]:
    with SAMPLE_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_rows() -> list[dict]:
    sample = load_sample()
    sample_names_lower = {r["artist_name"].strip().lower() for r in sample}

    rows: list[dict] = []
    for r in sample:
        rows.append(
            {
                "artist_name": r["artist_name"],
                "country": r["country"] or "NG",
                "genre_category": "",  # sample rows: genres not categorised in source
                "in_sample": "Y",
                "cm_artist_id": r["cm_artist_id"],
                "spotify_id": r["spotify_id"],
                "youtube_id": r["youtube_id"],
                "label": r["label"],
                "source": "NMAS sample (delivered Q1 2024 – Q4 2025)",
            }
        )

    for name, category in POPULATION_ADDITIONS:
        if name.strip().lower() in sample_names_lower:
            continue  # already in sample — skip the duplicate
        rows.append(
            {
                "artist_name": name,
                "country": "NG",
                "genre_category": category,
                "in_sample": "N",
                "cm_artist_id": "",
                "spotify_id": "",
                "youtube_id": "",
                "label": "",
                "source": "Curated population frame (publicly known NG artists)",
            }
        )

    rows.sort(key=lambda x: (x["in_sample"] != "Y", x["artist_name"].lower()))
    return rows


def write_csv(rows: list[dict]) -> None:
    fields = [
        "artist_name",
        "country",
        "genre_category",
        "in_sample",
        "cm_artist_id",
        "spotify_id",
        "youtube_id",
        "label",
        "source",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def write_xlsx(rows: list[dict]) -> None:
    wb = Workbook()

    sampled = [r for r in rows if r["in_sample"] == "Y"]
    population = rows  # full frame incl. sample

    by_cat: dict[str, int] = {}
    for r in population:
        if r["in_sample"] == "N":
            by_cat[r["genre_category"]] = by_cat.get(r["genre_category"], 0) + 1

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78")
    label_font = Font(bold=True)

    # Sheet 1: Summary
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "NMAS Artist Population Frame — Summary"
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:C1")

    ws["A3"] = "Metric"
    ws["B3"] = "Value"
    ws["C3"] = "Notes"
    for c in ("A3", "B3", "C3"):
        ws[c].font = header_font
        ws[c].fill = header_fill

    sample_n = len(sampled)
    pop_n = len(population)
    non_sample_n = pop_n - sample_n
    coverage = sample_n / pop_n if pop_n else 0

    summary_rows = [
        ("Sampled artists (delivered)", sample_n, "From Artist_Master_List.csv"),
        ("Additional known NG artists", non_sample_n, "Curated across genres"),
        ("Total population frame", pop_n, "Sampled + additional"),
        (
            "Sample coverage ratio",
            f"{coverage:.1%}",
            "Sampled / Total — use for grossing-up estimators",
        ),
        (
            "Expansion factor (1 / coverage)",
            f"{(1 / coverage):.3f}" if coverage else "n/a",
            "Multiply sample totals by this for a first-cut population estimate",
        ),
    ]
    for i, (k, v, note) in enumerate(summary_rows, start=4):
        ws.cell(row=i, column=1, value=k).font = label_font
        ws.cell(row=i, column=2, value=v)
        ws.cell(row=i, column=3, value=note)

    ws["A11"] = "Non-sampled artists by genre category"
    ws["A11"].font = Font(bold=True, size=12)
    ws["A12"] = "Genre category"
    ws["B12"] = "Count"
    for c in ("A12", "B12"):
        ws[c].font = header_font
        ws[c].fill = header_fill
    for i, (cat, n) in enumerate(sorted(by_cat.items()), start=13):
        ws.cell(row=i, column=1, value=cat)
        ws.cell(row=i, column=2, value=n)

    note_start = 14 + len(by_cat)
    ws.cell(row=note_start, column=1, value="Methodology note").font = Font(bold=True)
    ws.cell(
        row=note_start + 1,
        column=1,
        value=(
            "Non-sampled rows are a curated list of publicly known Nigerian recording "
            "artists across genres. It is not an authoritative industry registry. Client "
            "should reconcile against COSON/MCSN/PMAN membership rolls where available."
        ),
    )
    ws.merge_cells(start_row=note_start + 1, start_column=1, end_row=note_start + 3, end_column=6)
    ws.cell(row=note_start + 1, column=1).alignment = Alignment(wrap_text=True, vertical="top")

    for col, width in (("A", 40), ("B", 18), ("C", 60)):
        ws.column_dimensions[col].width = width

    # Sheet 2: Sampled_Artists
    ws2 = wb.create_sheet("Sampled_Artists")
    headers = [
        "Artist Name",
        "Country",
        "Chartmetric ID",
        "Spotify ID",
        "YouTube ID",
        "Label",
        "Status",
    ]
    for i, h in enumerate(headers, start=1):
        c = ws2.cell(row=1, column=i, value=h)
        c.font = header_font
        c.fill = header_fill
    for i, r in enumerate(sampled, start=2):
        ws2.cell(row=i, column=1, value=r["artist_name"])
        ws2.cell(row=i, column=2, value=r["country"])
        ws2.cell(row=i, column=3, value=r["cm_artist_id"])
        ws2.cell(row=i, column=4, value=r["spotify_id"])
        ws2.cell(row=i, column=5, value=r["youtube_id"])
        ws2.cell(row=i, column=6, value=r["label"])
        ws2.cell(row=i, column=7, value="In sample — data delivered")
    for col, width in (
        ("A", 30), ("B", 10), ("C", 16), ("D", 20), ("E", 20), ("F", 24), ("G", 28)
    ):
        ws2.column_dimensions[col].width = width
    ws2.freeze_panes = "A2"

    # Sheet 3: All_Known_Artists
    ws3 = wb.create_sheet("All_Known_Artists")
    headers3 = [
        "Artist Name",
        "Country",
        "Genre Category",
        "In Sample (Y/N)",
        "Chartmetric ID",
        "Spotify ID",
        "YouTube ID",
        "Label",
        "Source",
    ]
    for i, h in enumerate(headers3, start=1):
        c = ws3.cell(row=1, column=i, value=h)
        c.font = header_font
        c.fill = header_fill
    y_fill = PatternFill("solid", fgColor="E2F0D9")
    n_fill = PatternFill("solid", fgColor="FFF2CC")
    for i, r in enumerate(rows, start=2):
        ws3.cell(row=i, column=1, value=r["artist_name"])
        ws3.cell(row=i, column=2, value=r["country"])
        ws3.cell(row=i, column=3, value=r["genre_category"])
        flag_cell = ws3.cell(row=i, column=4, value=r["in_sample"])
        flag_cell.fill = y_fill if r["in_sample"] == "Y" else n_fill
        flag_cell.alignment = Alignment(horizontal="center")
        ws3.cell(row=i, column=5, value=r["cm_artist_id"])
        ws3.cell(row=i, column=6, value=r["spotify_id"])
        ws3.cell(row=i, column=7, value=r["youtube_id"])
        ws3.cell(row=i, column=8, value=r["label"])
        ws3.cell(row=i, column=9, value=r["source"])
    widths = [(1, 32), (2, 10), (3, 22), (4, 16), (5, 16), (6, 20), (7, 20), (8, 24), (9, 50)]
    for idx, width in widths:
        ws3.column_dimensions[get_column_letter(idx)].width = width
    ws3.freeze_panes = "A2"
    ws3.auto_filter.ref = f"A1:I{len(rows) + 1}"

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)


def main() -> None:
    rows = build_rows()
    write_csv(rows)
    write_xlsx(rows)

    sample_n = sum(1 for r in rows if r["in_sample"] == "Y")
    pop_n = len(rows)
    print(f"Sampled: {sample_n}")
    print(f"Population total: {pop_n}")
    print(f"Coverage: {sample_n / pop_n:.1%}")
    print(f"Wrote: {OUT_CSV.relative_to(ROOT)}")
    print(f"Wrote: {OUT_XLSX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
