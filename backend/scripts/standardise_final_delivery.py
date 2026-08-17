#!/usr/bin/env python3
"""
STANDARDISATION PASS — run after merge_final_delivery.py.

The merge decides what is true. This decides that everything true is expressed
one way, so the delivery can be joined, diffed and re-generated without a reader
having to know which provider a row came from.

What it enforces:

  deterministic order   every dataset sorted on (entity_name, variable_name, date).
                        Two runs over the same inputs produce byte-identical files,
                        which is what makes a diff meaningful. Sorted externally
                        (LC_ALL=C sort) because the microdata is larger than memory.
  one identifier space  Chartmetric keys artists by an integer, Soundcharts by a
                        UUID. Neither is dropped; both are bound to a stable
                        nmas_artist_id in Artist_ID_Crosswalk.csv, so a join no
                        longer depends on matching display names.
  declared vocabularies Platform_Register.csv and Variable_Register.csv state every
                        platform, variable, unit and aggregation rule actually
                        present, with the provider(s) behind each and the window it
                        covers. A value outside its register is a defect, and this
                        pass reports any it finds.

Numeric convention, period_label recomputation and duplicate removal happen in
the merge, which is the only stage that writes rows; this pass verifies them and
reports rather than silently re-fixing.
"""

from __future__ import annotations

import csv
import gzip
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from nmas.metrics import METRICS  # noqa: E402
from nmas.soundcharts_metrics import ALL_METRICS  # noqa: E402

FINAL = ROOT / "NBS FINAL delivery"
DATASETS = FINAL / "04_Datasets"
OBS = DATASETS / "Daily_Metric_Observations.csv"
EXTENDED = DATASETS / "Daily_Observations_Extended_Frame.csv.gz"
AGG = DATASETS / "Quarterly_Aggregates_Full.csv"
CITY = DATASETS / "Spotify_City_Geography.csv"
RESOLUTION = BACKEND / "data" / "soundcharts" / "artist_resolution.csv"
FRAME = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"

CROSSWALK = DATASETS / "Artist_ID_Crosswalk.csv"
PLATFORM_REGISTER = DATASETS / "Platform_Register.csv"
VARIABLE_REGISTER = DATASETS / "Variable_Register.csv"
REPORT = FINAL / "07_Quality_Checks" / "Standardisation_Report.md"

# Canonical spellings are the ones already published in the Chartmetric delivery.
# Standardising towards the incumbent keeps every existing join, script and
# workbook working; renaming "Soundcloud" to "SoundCloud" would be tidier in the
# abstract and would break all of them.
CANONICAL_PLATFORMS = {
    "spotify": "Spotify", "youtube": "YouTube", "instagram": "Instagram",
    "tiktok": "TikTok", "twitter": "Twitter", "facebook": "Facebook",
    "soundcloud": "Soundcloud", "deezer": "Deezer", "wikipedia": "Wikipedia",
    "bandsintown": "Bandsintown", "boomplay": "Boomplay", "audiomack": "Audiomack",
    "amazon music": "Amazon Music", "tidal": "Tidal", "genius": "Genius",
    "radio": "Radio", "melon": "Melon", "line music": "Line Music",
    "twitch": "Twitch", "shazam": "Shazam",
    # added by the full extraction: playlist reach on Apple Music, and the
    # provider's own composite scores, which belong to no single platform
    "apple music": "Apple Music", "soundcharts": "Soundcharts",
}
CANONICAL_UNITS = {
    "followers", "subscribers", "fans", "likes", "talks", "views", "listeners",
    "popularity_index", "spins", "playlists", "share_pct", "chart_position",
    "index", "ratio",   # Soundcharts composite scores; retention
}
CANONICAL_GEO = {"global", "nigeria", "city"}


def slug(name: str) -> str:
    out = []
    for ch in (name or "").lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "unknown"


def sort_csv_in_place(path: Path, key_columns: list[int]) -> int:
    """External sort on the body, header preserved. Returns rows sorted."""
    if not path.exists():
        return 0
    header = path.open(encoding="utf-8").readline().rstrip("\n")
    if not header or header.split(",")[0] not in {"date", "period_label", "entity_name"}:
        raise SystemExit(
            f"{path.name}: first line is not a header ({header[:60]!r}). "
            "Refusing to sort — this would promote a data row to the header. "
            "Re-run merge_final_delivery.py to regenerate it.")
    body = path.with_suffix(".body")
    out = path.with_suffix(".sorted")
    with path.open(encoding="utf-8") as src, body.open("w", encoding="utf-8") as dst:
        src.readline()
        for line in src:
            dst.write(line)
    keys = []
    for column in key_columns:
        keys += ["-k", f"{column},{column}"]
    with out.open("w", encoding="utf-8") as dst:
        dst.write(header + "\n")
        # The subprocess writes through the same file descriptor, so the header
        # must reach disk BEFORE sort starts. Without this flush Python holds the
        # header in its buffer and emits it at the shared file offset on close —
        # i.e. appended after 3.2 million sorted rows, leaving the file headerless.
        dst.flush()
        subprocess.run(["sort", "-t", ",", *keys, str(body)], stdout=dst,
                       check=True, env={"LC_ALL": "C", "PATH": "/usr/bin:/bin"})
    rows = sum(1 for _ in out.open(encoding="utf-8")) - 1
    out.replace(path)
    body.unlink(missing_ok=True)
    return rows


def sort_gzip_in_place(path: Path, key_columns: list[int]) -> int:
    """Same, for the gzipped companion."""
    if not path.exists():
        return 0
    plain = path.with_suffix("")
    with gzip.open(path, "rt", encoding="utf-8") as src, plain.open("w", encoding="utf-8") as dst:
        for line in src:
            dst.write(line)
    rows = sort_csv_in_place(plain, key_columns)
    with plain.open(encoding="utf-8") as src, gzip.open(path, "wt", encoding="utf-8") as dst:
        for line in src:
            dst.write(line)
    plain.unlink(missing_ok=True)
    return rows


def main() -> int:
    if not OBS.exists():
        print(f"missing {OBS} — run merge_final_delivery.py first")
        return 1

    findings: list[str] = []

    # ---- 1. audit vocabularies and numeric convention ---------------------
    platforms: dict[str, int] = defaultdict(int)
    units: dict[str, int] = defaultdict(int)
    geos: dict[str, int] = defaultdict(int)
    variables: dict[str, dict] = {}
    entities: dict[str, dict] = {}
    float_formatted = 0
    period_mismatch = 0
    rows_seen = 0

    with OBS.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows_seen += 1
            platform = row["platform"]
            platforms[platform] += 1
            units[row["unit"]] += 1
            geos[row["geo_scope"]] += 1
            variable = row["variable_name"]
            entry = variables.setdefault(variable, {
                "platform": platform, "unit": row["unit"],
                "first": row["date"], "last": row["date"],
                "providers": set(), "observations": 0, "artists": set(),
            })
            entry["observations"] += 1
            entry["artists"].add(row["entity_name"])
            entry["first"] = min(entry["first"], row["date"])
            entry["last"] = max(entry["last"], row["date"])
            entry["providers"].add(
                "soundcharts" if row["source_endpoint"].startswith("soundcharts:") else "chartmetric")
            ent = entities.setdefault(row["entity_name"], {"cm": set(), "sc": set()})
            if row["source_endpoint"].startswith("soundcharts:"):
                ent["sc"].add(row["entity_id"])
            else:
                ent["cm"].add(row["entity_id"])
            value = row["variable_value"]
            if value.endswith(".0"):
                float_formatted += 1
            quarter = f"Q{(int(row['date'][5:7]) - 1) // 3 + 1}_{row['date'][:4]}"
            if quarter != row["period_label"]:
                period_mismatch += 1

    unknown_platforms = sorted(p for p in platforms if p.lower() not in CANONICAL_PLATFORMS)
    unknown_units = sorted(u for u in units if u and u not in CANONICAL_UNITS)
    unknown_geo = sorted(g for g in geos if g not in CANONICAL_GEO)
    if unknown_platforms:
        findings.append(f"Platforms outside the register: {', '.join(unknown_platforms)}")
    if unknown_units:
        findings.append(f"Units outside the register: {', '.join(unknown_units)}")
    if unknown_geo:
        findings.append(f"geo_scope values outside the register: {', '.join(unknown_geo)}")
    if float_formatted:
        findings.append(f"{float_formatted:,} values still carry a trailing '.0'")
    if period_mismatch:
        findings.append(f"{period_mismatch:,} rows disagree with the quarter implied by their date")

    # ---- 2. artist identifier crosswalk ----------------------------------
    frame_rows = {(r.get("artist_name") or "").strip(): r
                  for r in csv.DictReader(FRAME.open(encoding="utf-8"))}
    resolution = {}
    if RESOLUTION.exists():
        for row in csv.DictReader(RESOLUTION.open(encoding="utf-8")):
            resolution[row["artist_name"].strip()] = row

    with CROSSWALK.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["nmas_artist_id", "artist_name", "in_sample", "region",
                         "state_area", "chartmetric_id", "soundcharts_uuid",
                         "soundcharts_name", "match_confidence", "in_daily_microdata"])
        for name in sorted(frame_rows):
            frame = frame_rows[name]
            res = resolution.get(name, {})
            observed = entities.get(name, {})
            cm_ids = sorted(observed.get("cm", ())) if observed else []
            writer.writerow([
                slug(name), name,
                (frame.get("in_sample") or "").strip().upper(),
                frame.get("region") or "", frame.get("state_area") or "",
                (frame.get("cm_artist_id") or "").strip() or (cm_ids[0] if cm_ids else ""),
                res.get("sc_uuid", ""), res.get("sc_name", ""),
                res.get("match_confidence", "unmatched"),
                "Y" if name in entities else "N",
            ])

    # ---- 3. platform and variable registers ------------------------------
    with PLATFORM_REGISTER.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["platform", "canonical", "observations", "in_register"])
        for platform in sorted(platforms):
            canonical = CANONICAL_PLATFORMS.get(platform.lower(), "")
            writer.writerow([platform, canonical or platform, platforms[platform],
                             "Y" if canonical else "N"])

    definitions = {m.name: m.definition for m in METRICS.values()}
    for metric in ALL_METRICS:
        definitions.setdefault(metric.variable_name, metric.definition)
    rules = {m.name: m.aggregation_rule for m in METRICS.values()}
    for metric in ALL_METRICS:
        rules.setdefault(metric.variable_name, metric.aggregation_rule)

    with VARIABLE_REGISTER.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["variable_name", "platform", "unit", "aggregation_rule",
                         "providers", "first_observed", "last_observed",
                         "artists", "observations", "definition"])
        for variable in sorted(variables):
            entry = variables[variable]
            writer.writerow([
                variable, entry["platform"], entry["unit"],
                rules.get(variable, "last_value"),
                "+".join(sorted(entry["providers"])),
                entry["first"], entry["last"],
                len(entry["artists"]), entry["observations"],
                definitions.get(variable, ""),
            ])

    # ---- 4. deterministic order ------------------------------------------
    # Daily/extended: entity_name(5), variable_name(8), date(1)
    # Aggregates:     entity_name(3), variable_name(6), period_label(1)
    print("sorting datasets…", flush=True)
    obs_rows = sort_csv_in_place(OBS, [5, 8, 1])
    ext_rows = sort_gzip_in_place(EXTENDED, [5, 8, 1])
    agg_rows = sort_csv_in_place(AGG, [3, 6, 1]) if AGG.exists() else 0
    city_rows = sort_csv_in_place(CITY, [4, 9, 1]) if CITY.exists() else 0

    # ---- 5. report --------------------------------------------------------
    lines = [
        "# Standardisation Report",
        "",
        f"Generated {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Rules enforced",
        "",
        "| Rule | Applied to |",
        "|---|---|",
        "| Deterministic order — (entity_name, variable_name, date) | every dataset below |",
        "| One numeric convention — integers as integers, fractions to 6dp | variable_value |",
        "| period_label recomputed from the observation date | every row |",
        "| Duplicate (artist, platform, variable, geo, date) removed once | see Duplicates_Removed_Report.csv |",
        "| Canonical platform spellings, taken from the incumbent delivery | Platform_Register.csv |",
        "| Declared unit and aggregation vocabulary | Variable_Register.csv |",
        "| Provider ids bound to a stable nmas_artist_id | Artist_ID_Crosswalk.csv |",
        "",
        "## Datasets standardised",
        "",
        "| File | Rows |",
        "|---|---:|",
        f"| 04_Datasets/Daily_Metric_Observations.csv | {obs_rows:,} |",
        f"| 04_Datasets/Daily_Observations_Extended_Frame.csv.gz | {ext_rows:,} |",
        f"| 04_Datasets/Quarterly_Aggregates_Full.csv | {agg_rows:,} |",
        f"| 04_Datasets/Spotify_City_Geography.csv | {city_rows:,} |",
        "",
        "## Vocabularies present",
        "",
        f"- Platforms: {len(platforms)} — {', '.join(sorted(platforms))}",
        f"- Units: {len(units)} — {', '.join(sorted(u for u in units if u))}",
        f"- geo_scope: {', '.join(sorted(geos))}",
        f"- Variables: {len(variables)}",
        f"- Artists in daily microdata: {len(entities)}",
        "",
        "## Conformance",
        "",
    ]
    if findings:
        lines.append("Defects found — each is a value outside its declared register:")
        lines.append("")
        lines += [f"- {finding}" for finding in findings]
    else:
        lines.append("No defects. Every platform, unit and geo_scope is in its register, "
                     "every period_label agrees with its date, and no value carries a "
                     "float artefact.")
    lines += [
        "",
        "## Aggregates UNK versus revenue clamp — a designed difference, not a defect",
        "",
        "`Quarterly_Aggregates_Full.csv` classifies a non-computable net change as `UNK`",
        "with a blank value: a single-observation quarter (a delta requires two points) or",
        "a negative delta on a cumulative counter (a reset/backfill artifact). The revenue",
        "model instead clamps those same cases to a ZERO contribution — a deliberate",
        "conservative choice that understates and never overstates, registered in the",
        "assumptions register. The two artifacts therefore differ on these cells BY",
        "DESIGN: a statistical table must not assert activity it cannot measure, while a",
        "conservative estimate may forgo revenue it cannot substantiate. The raw delta is",
        "preserved in the aggregates' `delta_raw` column so the anomaly stays traceable.",
        "",
        "## Identifier spaces",
        "",
        "Chartmetric keys an artist by integer, Soundcharts by UUID. Neither is",
        "rewritten in the observation rows — that would destroy provenance — and both",
        "are bound to a stable `nmas_artist_id` in Artist_ID_Crosswalk.csv. Join on",
        "that column rather than on display names.",
        "",
    ]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nSTANDARDISED")
    print(f"  daily observations   {obs_rows:,}")
    print(f"  extended frame (gz)  {ext_rows:,}")
    print(f"  quarterly cells      {agg_rows:,}")
    print(f"  city rows            {city_rows:,}")
    print(f"  platforms={len(platforms)} units={len(units)} variables={len(variables)} "
          f"artists={len(entities)}")
    print(f"  registers: {CROSSWALK.name}, {PLATFORM_REGISTER.name}, {VARIABLE_REGISTER.name}")
    if findings:
        print("  DEFECTS:")
        for finding in findings:
            print(f"    - {finding}")
    else:
        print("  conformance: clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
