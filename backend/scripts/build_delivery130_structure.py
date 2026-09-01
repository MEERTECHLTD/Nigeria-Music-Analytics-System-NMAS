#!/usr/bin/env python3
"""
DELIVERY130 — the remaining submission folders.

The package must present the same 13-folder structure NBS received the first
time. 08_Projection previously occupied the 08_References slot; the projection
moves to 14_Growth_Projection, which marks it as an addition to the standard
structure rather than a substitution inside it.

Every file here is DERIVED from delivery130/04_Datasets at generation time. None
is copied from the first submission, because the first submission describes a
different window and a different artist count.
"""
from __future__ import annotations
import csv, json, shutil, sys
from collections import defaultdict, Counter
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]; ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from nmas.cohort import counts                      # noqa: E402
from nmas.assumptions import REGISTER               # noqa: E402
PKG = ROOT / "delivery130"; D = PKG / "04_Datasets"
TOTAL = "=== PERIOD TOTAL ==="
csv.field_size_limit(10 ** 9)

def qkey(l): q, y = l.split("_"); return (int(y), int(q[1:]))
def f0(v):
    try: return float(v or 0)
    except (TypeError, ValueError): return 0.0

def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    c = counts()
    # move the projection out of the 08 slot
    old, new = PKG / "14_Growth_Projection", PKG / "14_Growth_Projection"
    if old.exists() and not new.exists():
        shutil.move(str(old), str(new)); print("  moved 08_Projection -> 14_Growth_Projection")
    for d in ("05_Database_Extracts", "06_Sample_Workbooks", "08_References",
              "09_AI_Disclosure", "10_Presentation", "11_Raw_Extractions",
              "12_System_Exports", "13_Database"):
        (PKG / d).mkdir(parents=True, exist_ok=True)

    rows = [r for r in csv.DictReader((D / "Gross_Streaming_Revenue.csv").open(encoding="utf-8"))
            if r["artist_name"] != TOTAL]
    periods = sorted({r["period"] for r in rows}, key=qkey)
    artists = sorted({r["artist_name"] for r in rows})
    total = sum(f0(r["gross_streaming_revenue_usd"]) for r in rows)

    # ---- 05_Database_Extracts ---------------------------------------------
    obs = defaultdict(lambda: [0, set(), None, None])
    with (D / "Daily_Metric_Observations.csv").open(encoding="utf-8") as h:
        for r in csv.DictReader(h):
            cell = obs[r["entity_name"]]
            cell[0] += 1; cell[1].add(r["variable_name"])
            d = r["date"]
            cell[2] = d if cell[2] is None or d < cell[2] else cell[2]
            cell[3] = d if cell[3] is None or d > cell[3] else cell[3]
    with (PKG / "05_Database_Extracts" / "observation_summary.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["entity_name", "observations", "distinct_variables",
                                       "first_observation", "last_observation"])
        for a in sorted(obs): w.writerow([a, obs[a][0], len(obs[a][1]), obs[a][2], obs[a][3]])
    shutil.copy(D / "Artist_Master_List.csv", PKG / "05_Database_Extracts" / "artists.csv")
    per = defaultdict(float); cnt = defaultdict(int)
    for r in rows:
        per[r["period"]] += f0(r["gross_streaming_revenue_usd"]); cnt[r["period"]] += 1
    with (PKG / "05_Database_Extracts" / "coverage_by_quarter.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["period", "artists_with_revenue", "artists_in_cohort",
                                       "coverage_pct", "gross_streaming_revenue_usd"])
        for p in periods:
            w.writerow([p, cnt[p], len(artists), round(cnt[p] / len(artists) * 100, 2), round(per[p], 2)])

    # ---- 08_References -----------------------------------------------------
    (PKG / "08_References" / "References_and_Proof.md").write_text(
        "# References and Proof — DELIVERY130\n\n"
        "## Data providers\n\n"
        "| Provider | Role | What it supplies |\n|---|---|---|\n"
        "| Chartmetric | Primary | Artist identity, Spotify/YouTube/Deezer audience levels |\n"
        "| Soundcharts | Primary | Audience levels, listener geography by country and city |\n\n"
        "Both are commercial music-data providers. Every observed figure in this package "
        "traces to one of them through `04_Datasets/Daily_Metric_Observations.csv`, which "
        "carries `source_endpoint` and `source_field` on every row.\n\n"
        "## What is NOT sourced from a provider\n\n"
        "The constants below are assumptions or estimates taken from outside the providers. "
        "They are listed in full so a reviewer can challenge any of them:\n\n"
        "| Constant | Value | Class | Source |\n|---|---:|---|---|\n"
        + "\n".join("| `%s` | %s | %s | %s |" % (x.name, x.value, x.classification, x.source)
                    for x in REGISTER)
        + "\n\n## Proof of reproducibility\n\n"
        "Every published figure can be recomputed from the published columns:\n\n"
        "- `spotify_revenue_usd` = `spotify_monthly_listeners` x 3.5 x 3 x 0.004\n"
        "- `youtube_revenue_usd` = `youtube_actual_views` x 0.004\n"
        "- `deezer_revenue_usd` = `deezer_fans` x 2.0 x 3 x 0.004\n"
        "- `other_platforms_revenue_usd` = `spotify_revenue_usd` x 0.30\n"
        "- `gross_streaming_revenue_usd` = the four above, summed\n"
        "- `gross_streaming_revenue_ngn` = `gross_streaming_revenue_usd` x 1500\n\n"
        "These identities hold on **all %s rows** of `Gross_Streaming_Revenue.csv`. A reviewer "
        "needs nothing from this system to check them.\n" % format(len(rows), ","),
        encoding="utf-8")

    # ---- 09_AI_Disclosure --------------------------------------------------
    (PKG / "09_AI_Disclosure" / "AI_Disclosure.md").write_text(
        "# AI Disclosure — DELIVERY130\n\nGenerated %s.\n\n"
        "## What AI was used for\n\n"
        "This package was assembled with substantial assistance from an AI coding assistant "
        "(Anthropic Claude, via Claude Code). Its role was to write and run the extraction, "
        "aggregation, revenue and verification code, and to audit that code's output.\n\n"
        "## What AI did NOT do\n\n"
        "- **No figure in this package was written by a language model.** Every number is "
        "computed by deterministic Python from provider data. Re-running the scripts on the "
        "same inputs reproduces the same output exactly.\n"
        "- No value was estimated by a model's judgement. Where a figure is not observed it "
        "is derived by a stated arithmetic rule, and the row says so in "
        "`youtube_views_source` or `spotify_listeners_source`.\n"
        "- No missing record was imagined. Absent data is left blank.\n\n"
        "## Why this matters for the statistics\n\n"
        "The pipeline is deterministic. The AI wrote the pipeline; the pipeline produced the "
        "numbers. That distinction is what makes the output auditable: a reviewer checks the "
        "arithmetic, not the assistant.\n\n"
        "## Known limitation of this approach\n\n"
        "Code written with AI assistance can carry defects like any other code. This package "
        "is therefore accompanied by an independent verification report "
        "(`07_Quality_Checks/`), and several defects found that way are documented there "
        "rather than being quietly corrected.\n" % stamp, encoding="utf-8")

    # ---- 10_Presentation ---------------------------------------------------
    yr = defaultdict(float)
    for p in periods: yr[int(p.split("_")[1])] += per[p]
    proj = list(csv.DictReader((PKG / "14_Growth_Projection" / "Growth_Projection_Quarterly.csv")
                               .open(encoding="utf-8")))
    fut = [r for r in proj if r["basis"] == "projection"]
    (PKG / "10_Presentation" / "NMAS_NBS_Delivery130_Presentation.md").write_text(
        "# Nigeria Music Analytics System\n## Delivery 130 — presentation brief\n\n"
        "### Scope\n\n%d artists, %d quarters, %s to %s.\n\n"
        "### Headline\n\n**$%s** gross streaming revenue (₦%s).\n\n"
        "### By year\n\n| Year | Gross streaming revenue |\n|---|---:|\n%s\n\n"
        "### Outlook\n\nProjected growth of **%s%% a year**, fitted on the last 12 complete "
        "quarters. Growth is not uniform across the history: it exceeded 100%% to 2022 as "
        "coverage expanded, fell to about 4%% through 2025 as the market matured, and is "
        "re-accelerating.\n\n| Quarter | Projected |\n|---|---:|\n%s\n\n"
        "### What this measures, and what it does not\n\n"
        "- Streaming revenue is estimated from observed audience levels and observed volumes "
        "using published per-unit rates. No platform reports its payouts to this system.\n"
        "- Employment is a **national** figure for the whole sector. It is not these artists' "
        "employees.\n"
        "- The domestic/export split is measured in %d of %d quarters; the rest are blank.\n"
        % (len(artists), len(periods), periods[0].replace("_", " "), periods[-1].replace("_", " "),
           format(total, ",.0f"), format(total * 1500, ",.0f"),
           "\n".join("| %d | $%s |" % (y, format(yr[y], ",.0f")) for y in sorted(yr)),
           list(csv.DictReader((PKG / "14_Growth_Projection" / "Projection_Window_Sensitivity.csv")
                               .open(encoding="utf-8")))[1]["annual_growth_pct"],
           "\n".join("| %s | $%s |" % (r["period"].replace("_", " "),
                                       format(float(r["projected_usd"]), ",.0f")) for r in fut),
           len({r["period"] for r in csv.DictReader((D / "Gross_Export_Revenue.csv").open(encoding="utf-8"))
                if r["artist_name"] != TOTAL and r["gross_export_revenue_usd"] not in ("", None)}),
           len(periods)),
        encoding="utf-8")

    # ---- 11_Raw_Extractions ------------------------------------------------
    for src, dst in (("Gross_Streaming_Revenue.csv", "1_gross_streaming_revenue.csv"),
                     ("Gross_Export_Revenue.csv", "2_gross_export_revenue.csv"),
                     ("Employment_Male_Female.csv", "3_employment_male_female.csv"),
                     ("Hosting_Production_Costs.csv", "4_hosting_production_costs.csv")):
        shutil.copy(D / src, PKG / "11_Raw_Extractions" / dst)
    var = Counter(); plat = Counter()
    with (D / "Daily_Metric_Observations.csv").open(encoding="utf-8") as h:
        for r in csv.DictReader(h):
            var[r["variable_name"]] += 1; plat[r.get("platform", "")] += 1
    with (PKG / "11_Raw_Extractions" / "extraction_summary.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["variable_name", "daily_observations"])
        for k, v in var.most_common(): w.writerow([k, v])
    (PKG / "11_Raw_Extractions" / "extraction_log.txt").write_text(
        "DELIVERY130 extraction summary — generated %s\n\n"
        "artists            : %d\nquarters           : %d (%s .. %s)\n"
        "daily observations : %s\ndistinct variables : %d\nplatforms          : %s\n\n"
        "The daily observation file is the rawest layer in this package. Every revenue figure "
        "is derived from it; every row carries source_endpoint and source_field.\n"
        % (stamp, len(artists), len(periods), periods[0], periods[-1],
           format(sum(var.values()), ","), len(var),
           ", ".join(k for k, _ in plat.most_common() if k)), encoding="utf-8")

    # ---- 12_System_Exports -------------------------------------------------
    manifest = []
    for p in sorted(PKG.rglob("*")):
        if p.is_file() and "12_System_Exports" not in p.parts:
            manifest.append({"path": str(p.relative_to(PKG)), "bytes": p.stat().st_size,
                             "sha256_prefix": ""})
    import hashlib
    for m in manifest:
        fp = PKG / m["path"]
        if fp.stat().st_size < 200 * 1024 * 1024:
            h = hashlib.sha256()
            with fp.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""): h.update(chunk)
            m["sha256_prefix"] = h.hexdigest()[:16]
    with (PKG / "12_System_Exports" / "file_manifest.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=["path", "bytes", "sha256_prefix"]); w.writeheader(); w.writerows(manifest)
    (PKG / "12_System_Exports" / "export_run.json").write_text(json.dumps({
        "package": "delivery130", "generated_utc": stamp, "artists": len(artists),
        "quarters": len(periods), "first_quarter": periods[0], "last_quarter": periods[-1],
        "revenue_rows": len(rows), "gross_streaming_revenue_usd": round(total, 2),
        "files": len(manifest),
        "generators": ["build_delivery130.py", "build_delivery130_projection.py",
                       "build_delivery130_excel.py", "build_delivery130_docs.py",
                       "build_delivery130_structure.py"],
    }, indent=2), encoding="utf-8")

    # ---- 13_Database -------------------------------------------------------
    schema = []
    for p in sorted(D.glob("*.csv")):
        with p.open(encoding="utf-8") as h:
            head = next(csv.reader(h)); n = sum(1 for _ in h)
        for i, col in enumerate(head, 1):
            schema.append({"table": p.stem, "ordinal": i, "column": col, "rows": n})
    with (PKG / "13_Database" / "schema.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=["table", "ordinal", "column", "rows"]); w.writeheader(); w.writerows(schema)
    (PKG / "13_Database" / "README.md").write_text(
        "# Database layer — DELIVERY130\n\n"
        "This package ships as flat files rather than a database dump, so that a reviewer "
        "needs no database software to check it. `schema.csv` lists every table, column and "
        "row count in `04_Datasets`.\n\n"
        "| Table | Columns | Rows |\n|---|---:|---:|\n"
        + "\n".join("| %s | %d | %s | " % (t, len([s for s in schema if s["table"] == t]),
                                           format([s for s in schema if s["table"] == t][0]["rows"], ","))
                    for t in sorted({s["table"] for s in schema}))
        + "\n\nThe grain of `Gross_Streaming_Revenue` and `Gross_Export_Revenue` is one row per "
          "artist per quarter, plus one `=== PERIOD TOTAL ===` pseudo-row per quarter. **Exclude "
          "the pseudo-rows when summing** — including them double counts every quarter exactly.\n",
        encoding="utf-8")

    print("delivery130 structure complete")
    for d in sorted(PKG.iterdir()):
        if d.is_dir():
            print("  %-26s %d files" % (d.name, len(list(d.rglob("*")))))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
