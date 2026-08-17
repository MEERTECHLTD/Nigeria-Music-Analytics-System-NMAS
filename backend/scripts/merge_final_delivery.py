#!/usr/bin/env python3
"""
MERGE + REGROUP -> "NBS FINAL delivery"

Joins the two providers into one series per variable and regroups the former
Chartmetric-only delivery alongside it:

  Chartmetric   2024-01-01 -> 2026    (archive floor 2024-01-01, 850,059 rows)
  Soundcharts   2019-01-01 -> 2026   (reaches 5 years deeper; adds Boomplay,
                                      Audiomack, radio airplay, city geography)

Precedence where both answer the same (artist, platform, variable, date):
CHARTMETRIC WINS. It is the already-delivered, already-published figure — a
merge must not silently restate numbers NBS has seen. Every displaced
Soundcharts row is counted and reported rather than dropped in silence.

Output schema is byte-identical to the existing Daily_Metric_Observations.csv
(13 columns). Provenance is carried in source_endpoint, which Soundcharts rows
prefix with `soundcharts:`.
"""

from __future__ import annotations

import csv
import gzip
import re
import sys
from sys import intern
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from nmas.metrics import METRICS  # noqa: E402
from nmas.soundcharts_metrics import ALL_METRICS  # noqa: E402

ROOT = BACKEND.parent
FINAL = ROOT / "NBS FINAL delivery"
CM_OBS = ROOT / "delivery" / "04_Datasets" / "Daily_Metric_Observations.csv"
SC_SHARDS = BACKEND / "data" / "soundcharts" / "shards"
SC_CITY = BACKEND / "data" / "soundcharts" / "city_shards"
RESOLUTION = BACKEND / "data" / "soundcharts" / "artist_resolution.csv"

OUT_OBS = FINAL / "04_Datasets" / "Daily_Metric_Observations.csv"
# City detail is superseded in the delivery by Geography_Full_Daily.csv.gz and
# Nigeria_City_Geography_Quarterly.csv; the merge keeps writing it as repository
# evidence, outside the delivered set.
OUT_CITY = BACKEND / "data" / "soundcharts" / "spotify_city_geography_merged.csv"
OUT_AGG = FINAL / "04_Datasets" / "Quarterly_Aggregates_Full.csv"
OUT_RES = FINAL / "04_Datasets" / "Artist_Resolution_Soundcharts.csv"
OUT_COVERAGE = FINAL / "04_Datasets" / "Coverage_By_Quarter.csv"
OUT_REPORT = FINAL / "07_Quality_Checks" / "Merge_Provenance_Report.md"
OUT_DUPES = FINAL / "07_Quality_Checks" / "Duplicates_Removed_Report.csv"
# Daily microdata for all 752 frame artists would be ~19.7M rows / 3.7 GB, which
# is not a deliverable CSV. The delivered microdata therefore keeps the scope NBS
# already receives at daily grain — the 131 in-sample artists, now spanning 31
# quarters instead of 9 — and the remaining frame artists' daily rows go to a
# gzipped companion so nothing extracted is discarded. Quarterly aggregates cover
# all 752 either way, and that is the level the headline indicators use.
OUT_EXTENDED = FINAL / "04_Datasets" / "Daily_Observations_Extended_Frame.csv.gz"
FRAME = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"

SCHEMA = [
    "date", "period_label", "entity_type", "entity_id", "entity_name",
    "platform", "geo_scope", "variable_name", "variable_value", "unit",
    "source_endpoint", "source_field", "extraction_timestamp",
]

# Aggregation rule per variable, taken from whichever catalogue defines it.
RULES: dict[str, str] = {m.name: m.aggregation_rule for m in METRICS.values()}
for metric in ALL_METRICS:
    RULES.setdefault(metric.variable_name, metric.aggregation_rule)
# Cumulative counters that cannot genuinely decline: a negative quarter delta is
# a reset/backfill artifact, classified UNK. Likes CAN genuinely decline (content
# removal, unlikes), so TikTok/Facebook likes keep real negative net_change.
CUMULATIVE_COUNTERS = {"YouTube_channel_views_daily"}

UNITS: dict[str, str] = {m.name: m.unit for m in METRICS.values()}
for metric in ALL_METRICS:
    UNITS.setdefault(metric.variable_name, metric.unit)


def fold(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", text.lower().replace("&", "and"))


def norm_value(value: float) -> str:
    """One numeric convention for every row.

    The incumbent file writes every figure as a float, so follower counts arrive
    as "185.0". Counts are integers and are written as integers; genuine
    fractions keep up to six decimals with trailing zeros stripped.
    """
    if value == int(value):
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def quarter_of(date_str: str) -> str:
    try:
        year, month = int(date_str[:4]), int(date_str[5:7])
    except (ValueError, IndexError):
        return ""
    return f"Q{(month - 1) // 3 + 1}_{year}"


class Aggregator:
    """Accumulates quarterly figures without holding every row in memory."""

    def __init__(self) -> None:
        # (entity_name, variable, quarter, geo) -> stats
        self.cells: dict[tuple, dict] = {}

    def add(self, entity: str, variable: str, quarter: str, geo: str,
            date_str: str, value: float, platform: str, provider: str) -> None:
        key = (entity, variable, quarter, geo)
        cell = self.cells.get(key)
        if cell is None:
            cell = {
                "platform": platform, "n": 0, "total": 0.0,
                "first_date": date_str, "first": value,
                "last_date": date_str, "last": value,
                "min": value, "max": value, "providers": set(),
            }
            self.cells[key] = cell
        cell["n"] += 1
        cell["total"] += value
        if date_str < cell["first_date"]:
            cell["first_date"], cell["first"] = date_str, value
        if date_str > cell["last_date"]:
            cell["last_date"], cell["last"] = date_str, value
        cell["min"] = min(cell["min"], value)
        cell["max"] = max(cell["max"], value)
        cell["providers"].add(provider)

    def rows(self):
        for (entity, variable, quarter, geo), cell in self.cells.items():
            rule = RULES.get(variable, "last_value")
            # Three-case treatment for net_change cells (D-15 ruling):
            #   computable delta            -> value, classification AGG
            #   single observation          -> UNK: a delta requires two points
            #   negative delta on a metric that cannot genuinely decline
            #     (cumulative counter reset or provider backfill)
            #                               -> UNK, raw delta preserved in delta_raw
            # 0 asserts "no activity"; UNK states "cannot measure it". They enter
            # national accounts differently, so a non-computable delta is never
            # written as zero. Negative net_change on follower-type metrics is a
            # REAL decline (people unfollow) and stays a valid value.
            classification = "AGG"
            delta_raw = ""
            if rule == "sum":
                value = cell["total"]
            elif rule == "net_change":
                raw = cell["last"] - cell["first"]
                delta_raw = round(raw, 4)
                if cell["first_date"] == cell["last_date"]:
                    classification, value = "UNK", None
                elif raw < 0 and variable in CUMULATIVE_COUNTERS:
                    classification, value = "UNK", None
                else:
                    value = raw
            else:
                value = cell["last"]
            yield {
                "period_label": quarter, "entity_type": "artist", "entity_name": entity,
                "platform": cell["platform"], "geo_scope": geo, "variable_name": variable,
                "aggregation_rule": rule,
                "variable_value": round(value, 4) if value is not None else "",
                "observations": cell["n"], "period_min": cell["min"], "period_max": cell["max"],
                "first_observed": cell["first_date"], "last_observed": cell["last_date"],
                "unit": UNITS.get(variable, ""),
                "providers": "+".join(sorted(cell["providers"])),
                "classification": classification, "delta_raw": delta_raw,
            }


def main() -> int:
    if not CM_OBS.exists():
        print(f"missing incumbent dataset: {CM_OBS}")
        return 1
    for target in (OUT_OBS, OUT_CITY, OUT_AGG, OUT_RES, OUT_COVERAGE, OUT_REPORT):
        target.parent.mkdir(parents=True, exist_ok=True)

    in_sample = {
        (r.get("artist_name") or "").strip()
        for r in csv.DictReader(FRAME.open(encoding="utf-8"))
        if (r.get("in_sample") or "").strip().upper() == "Y"
    }
    # Plausibility guard rulings (backend/scripts/plausibility_sweep.py). Where a
    # provider's record for an (artist, metric) series was diagnosed defective —
    # stub profile or single-metric ingestion failure, see nmas/plausibility.py —
    # that provider's rows for the whole series are excluded here, and the other
    # provider's observations flow through. Category 4 (both defective) drops both
    # sides: the series becomes UNK and the gap stays a gap.
    guard_rulings: dict[tuple, str] = {}
    rulings_path = BACKEND / "data" / "soundcharts" / "plausibility_rulings.csv"
    if rulings_path.exists():
        for ruling in csv.DictReader(rulings_path.open(encoding="utf-8")):
            if ruling["category"] == "2":
                guard_rulings[(fold(ruling["artist"]), ruling["metric"])] = ruling["provider_excluded"]
            elif ruling["category"] == "4":
                guard_rulings[(fold(ruling["artist"]), ruling["metric"])] = "both"
    guard_hits: dict[tuple, int] = defaultdict(int)

    agg = Aggregator()
    coverage: dict[tuple, int] = defaultdict(int)
    seen: set[tuple] = set()
    from_chartmetric: set[tuple] = set()
    counts = {"chartmetric": 0, "soundcharts": 0, "displaced": 0, "malformed": 0,
              "duplicate_within_chartmetric": 0, "duplicate_within_soundcharts": 0,
              "period_relabelled": 0, "extended_frame": 0, "excluded_by_guard": 0}
    duplicate_rows: list[tuple] = []
    per_variable: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    year_span: dict[str, list] = {}

    def consider(row: dict, provider: str, writer) -> None:
        date_str = (row.get("date") or "")[:10]
        entity = row.get("entity_name") or ""
        variable = row.get("variable_name") or ""
        raw = row.get("variable_value")
        if not date_str or not variable or raw in (None, ""):
            counts["malformed"] += 1
            return
        try:
            value = float(raw)
        except (TypeError, ValueError):
            counts["malformed"] += 1
            return

        excluded = guard_rulings.get((fold(entity), variable))
        if excluded and (excluded == "both" or excluded == provider):
            counts["excluded_by_guard"] += 1
            guard_hits[(entity, variable, provider)] += 1
            return

        geo = row.get("geo_scope") or "global"
        # Cross-provider collisions are only possible for artists both providers
        # cover — the 131 in-sample ones. A non-sample Soundcharts artist has no
        # Chartmetric rows to collide with, and its shard is already unique per
        # (variable, geo, date) by construction, with folded frame names verified
        # unique across shards. Tracking those 7.2M rows in the dedup set would
        # cost gigabytes to detect collisions that cannot occur. Components are
        # interned so the set holds shared strings rather than 10.7M fresh ones.
        tracked = provider == "chartmetric" or entity in in_sample
        key = (intern(fold(entity)), intern(row.get("platform") or ""),
               intern(variable), intern(geo), intern(date_str))
        if tracked and key in seen:
            # Distinguish the two collision kinds. A Soundcharts row losing to a
            # Chartmetric row is the precedence rule working as intended. A row
            # colliding with its OWN provider is a duplicate observation inside
            # the source file, which is an integrity finding and is reported.
            if provider == "soundcharts":
                if key in from_chartmetric:
                    counts["displaced"] += 1
                    kind = "displaced_by_chartmetric"
                else:
                    counts["duplicate_within_soundcharts"] += 1
                    kind = "duplicate_within_soundcharts"
            else:
                counts["duplicate_within_chartmetric"] += 1
                kind = "duplicate_within_chartmetric"
            # Evidence, so a removed row can be audited rather than taken on trust.
            duplicate_rows.append((kind, provider, entity, row.get("platform") or "",
                                   variable, geo, date_str, raw))
            return
        if tracked:
            if provider == "chartmetric":
                from_chartmetric.add(key)
            seen.add(key)

        # period_label is recomputed from the observation's own date rather than
        # trusted: a quarter is a property of the date, and any disagreement in a
        # source file would otherwise propagate into the aggregates.
        quarter = quarter_of(date_str)
        if quarter != (row.get("period_label") or quarter):
            counts["period_relabelled"] += 1
        out = {k: row.get(k, "") for k in SCHEMA}
        out["period_label"] = quarter
        out["variable_value"] = norm_value(value)
        out["date"] = date_str
        out["geo_scope"] = geo
        target = writer
        if provider == "soundcharts" and entity not in in_sample:
            target = extended_writer
            counts["extended_frame"] += 1
        target.writerow(out)
        counts[provider] += 1
        per_variable[variable][provider] += 1
        coverage[(quarter, variable, provider)] += 1
        agg.add(entity, variable, quarter, geo, date_str, value,
                row.get("platform") or "", provider)
        span = year_span.setdefault(provider, [date_str, date_str])
        span[0] = min(span[0], date_str)
        span[1] = max(span[1], date_str)

    with OUT_OBS.open("w", newline="", encoding="utf-8") as handle, \
            gzip.open(OUT_EXTENDED, "wt", newline="", encoding="utf-8") as ext_handle:
        writer = csv.DictWriter(handle, fieldnames=SCHEMA)
        writer.writeheader()
        extended_writer = csv.DictWriter(ext_handle, fieldnames=SCHEMA)
        extended_writer.writeheader()

        # Incumbent first so it wins every collision.
        print("reading Chartmetric observations...", flush=True)
        with CM_OBS.open(encoding="utf-8") as source:
            for index, row in enumerate(csv.DictReader(source), start=1):
                consider(row, "chartmetric", writer)
                if index % 250_000 == 0:
                    print(f"  {index:,} rows", flush=True)

        shards = sorted(SC_SHARDS.glob("*.csv")) if SC_SHARDS.exists() else []
        print(f"reading {len(shards)} Soundcharts shards...", flush=True)
        for index, shard in enumerate(shards, start=1):
            with shard.open(encoding="utf-8") as source:
                for row in csv.DictReader(source):
                    consider(row, "soundcharts", writer)
            if index % 100 == 0:
                print(f"  {index}/{len(shards)} shards", flush=True)

    # ---- duplicate evidence ----------------------------------------------
    with OUT_DUPES.open("w", newline="", encoding="utf-8") as handle:
        dupe_writer = csv.writer(handle)
        dupe_writer.writerow(["removal_kind", "provider", "entity_name", "platform",
                              "variable_name", "geo_scope", "date", "discarded_value"])
        dupe_writer.writerows(duplicate_rows)

    # ---- city geography side file ----------------------------------------
    city_total = 0
    city_shards = sorted(SC_CITY.glob("*.csv")) if SC_CITY.exists() else []
    if city_shards:
        with OUT_CITY.open("w", newline="", encoding="utf-8") as handle:
            city_writer = None
            for shard in city_shards:
                with shard.open(encoding="utf-8") as source:
                    reader = csv.DictReader(source)
                    if city_writer is None:
                        city_writer = csv.DictWriter(handle, fieldnames=reader.fieldnames or [])
                        city_writer.writeheader()
                    for row in reader:
                        city_writer.writerow(row)
                        city_total += 1

    # ---- quarterly aggregates --------------------------------------------
    agg_fields = [
        "period_label", "entity_type", "entity_name", "platform", "geo_scope",
        "variable_name", "aggregation_rule", "variable_value", "unit",
        "observations", "period_min", "period_max", "first_observed",
        "last_observed", "providers", "classification", "delta_raw",
    ]
    agg_rows = 0
    agg_unk = 0
    with OUT_AGG.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=agg_fields)
        writer.writeheader()
        for row in agg.rows():
            writer.writerow(row)
            agg_rows += 1
            if row["classification"] == "UNK":
                agg_unk += 1

    # ---- coverage by quarter ---------------------------------------------
    with OUT_COVERAGE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["period_label", "variable_name", "provider", "observations"])
        for (quarter, variable, provider), n in sorted(coverage.items()):
            writer.writerow([quarter, variable, provider, n])

    # ---- resolution audit copy -------------------------------------------
    if RESOLUTION.exists():
        OUT_RES.write_text(RESOLUTION.read_text(encoding="utf-8"), encoding="utf-8")

    # ---- provenance report -----------------------------------------------
    total = counts["chartmetric"] + counts["soundcharts"]
    lines = [
        "# Merge Provenance Report",
        "",
        f"Generated {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Row provenance",
        "",
        "| Provider | Rows | Share | Date span |",
        "|---|---:|---:|---|",
    ]
    for provider in ("chartmetric", "soundcharts"):
        n = counts[provider]
        span = year_span.get(provider, ["-", "-"])
        share = f"{100 * n / total:.1f}%" if total else "-"
        lines.append(f"| {provider} | {n:,} | {share} | {span[0]} → {span[1]} |")
    lines += [
        f"| **total** | **{total:,}** | 100% | |",
        "",
        "## Precedence",
        "",
        f"- Soundcharts rows displaced by an existing Chartmetric figure: **{counts['displaced']:,}**",
        "- Rule: where both providers report the same artist, platform, variable and date,",
        "  the Chartmetric value is kept because it is the already-delivered figure.",
        f"- Rows rejected as malformed or non-numeric: {counts['malformed']:,}",
        "",
        "## Duplicate observations inside a single source",
        "",
        "A row colliding with another row from the SAME provider on the same artist,",
        "platform, variable, geography and date is a duplicate observation in that",
        "source file, not a merge decision. Counted here rather than dropped silently:",
        "",
        f"- Duplicates within the Chartmetric delivery: **{counts['duplicate_within_chartmetric']:,}**",
        f"- Duplicates within the Soundcharts extraction: **{counts['duplicate_within_soundcharts']:,}**",
        "",
        "## Plausibility guard exclusions",
        "",
        "Where the two providers disagreed by more than 10x on the same series and one",
        "side's record was diagnosed defective (stub profile or single-metric ingestion",
        "failure — see `07_Quality_Checks/Plausibility_Rulings.csv` for every ruling with",
        "both defect-test results), the defective provider's rows for that series were",
        "excluded and the other provider's observations carried the series:",
        "",
        f"- Rows excluded by guard rulings: **{counts['excluded_by_guard']:,}** "
        f"across {len(guard_hits)} (artist, metric, provider) series",
    ] + [
        f"  - {entity} · {variable}: {n:,} {provider} rows excluded"
        for (entity, variable, provider), n in sorted(guard_hits.items(), key=lambda kv: -kv[1])
    ] + [
        "",
        "## Files written",
        "",
        f"- `04_Datasets/Daily_Metric_Observations.csv` — {total - counts['extended_frame']:,} daily "
        f"observations: all {counts['chartmetric']:,} Chartmetric rows plus Soundcharts rows for the "
        f"{len(in_sample)} in-sample artists",
        f"- `04_Datasets/Daily_Observations_Extended_Frame.csv.gz` — {counts['extended_frame']:,} daily "
        "observations for the remaining frame artists, gzipped (uncompressed it exceeds 3 GB)",
        f"- `04_Datasets/Quarterly_Aggregates_Full.csv` — {agg_rows:,} quarterly cells",
        f"- `04_Datasets/Spotify_City_Geography.csv` — {city_total:,} city-level listener rows",
        "- `04_Datasets/Coverage_By_Quarter.csv` — observation counts per quarter, variable, provider",
        "- `04_Datasets/Artist_Resolution_Soundcharts.csv` — name→UUID decisions with confidence",
        "",
        "## Variables by provider",
        "",
        "| Variable | Chartmetric | Soundcharts |",
        "|---|---:|---:|",
    ]
    for variable in sorted(per_variable):
        row = per_variable[variable]
        lines.append(f"| {variable} | {row.get('chartmetric', 0):,} | {row.get('soundcharts', 0):,} |")
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nMERGED  chartmetric={counts['chartmetric']:,}  soundcharts={counts['soundcharts']:,}"
          f"  displaced={counts['displaced']:,}  malformed={counts['malformed']:,}"
          f"  guard_excluded={counts['excluded_by_guard']:,}")
    print(f"total daily rows : {total:,}  "
          f"(main {total - counts['extended_frame']:,} / extended {counts['extended_frame']:,})")
    print(f"quarterly cells  : {agg_rows:,}  (UNK non-computable deltas: {agg_unk:,})")
    print(f"city rows        : {city_total:,}")
    print(f"written under    : {FINAL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
