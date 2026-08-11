#!/usr/bin/env python3
"""
Generate the static JSON API consumed by the NMAS Statistical Production Console.

READ-ONLY PROJECTION. This script computes no economic value. It reads artifacts
the pipeline has already produced and reshapes them for display. Every figure it
emits is either (a) copied verbatim from a produced artifact, or (b) a count of
rows that exist. Where it derives anything for display -- e.g. the
`last_minus_first` correction on cumulative counters -- the field is named so the
UI can label it a presentation-side derivation and show it BESIDE, never instead
of, the published value.

It never invents a number. Absent artifacts produce `null` and a gap-register
entry, never a zero.

Output: frontend/public/api/v1/console/
"""
from __future__ import annotations

import ast
import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DELIVERABLES = BACKEND_DIR / "data" / "nbs_deliverables"
DATASETS = PROJECT_ROOT / "delivery" / "04_Datasets"
DB_EXTRACTS = PROJECT_ROOT / "delivery" / "05_Database_Extracts"
OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "api" / "v1" / "console"

csv.field_size_limit(10_000_000)

# Periods and the archive floor are DERIVED from the artifacts, never declared.
# The Chartmetric and SoundCharts endpoints are being activated, so a hardcoded
# quarter list would freeze the console at today's coverage. These are populated
# during generation and written into the manifest.
REVENUE_PERIODS: list[str] = []
OBSERVED_PERIODS: list[str] = []
ARCHIVE_FLOOR: str | None = None

TOTAL_ROW_MARKER = "=== PERIOD TOTAL ==="

# Cumulative counters that must not be summed across a quarter. Aggregating these
# with `sum` overstates them by orders of magnitude; the honest quarterly figure
# is last_value - first_value. We surface both and let the UI label the divergence.
CUMULATIVE_COUNTERS = {
    "YouTube_channel_views_daily",
    "YouTube_artist_monthly_views",
    "Wikipedia_views_daily",
    "YouTube_artist_daily_views",
}

_manifest: list[dict] = []


# --------------------------------------------------------------------------
# io helpers
# --------------------------------------------------------------------------

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_csv(path: Path, *, role: str) -> list[dict]:
    """Read a produced artifact and record it in the provenance manifest."""
    if not path.exists():
        _manifest.append({
            "role": role,
            "path": str(path.relative_to(PROJECT_ROOT)),
            "present": False,
            "rows": None,
            "sha256": None,
            "modified_utc": None,
        })
        print(f"  !! MISSING  {path.relative_to(PROJECT_ROOT)}", file=sys.stderr)
        return []

    with open(path, "r", encoding="utf-8", errors="replace", newline="") as fh:
        rows = list(csv.DictReader(fh))

    stat = path.stat()
    _manifest.append({
        "role": role,
        "path": str(path.relative_to(PROJECT_ROOT)),
        "present": True,
        "rows": len(rows),
        "columns": list(rows[0].keys()) if rows else [],
        "sha256": _sha256(path),
        "bytes": stat.st_size,
        "modified_utc": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    })
    return rows


def read_json(path: Path, *, role: str):
    if not path.exists():
        _manifest.append({
            "role": role, "path": str(path.relative_to(PROJECT_ROOT)),
            "present": False, "rows": None, "sha256": None, "modified_utc": None,
        })
        return None
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    stat = path.stat()
    _manifest.append({
        "role": role,
        "path": str(path.relative_to(PROJECT_ROOT)),
        "present": True,
        "rows": len(data) if isinstance(data, list) else None,
        "sha256": _sha256(path),
        "bytes": stat.st_size,
        "modified_utc": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    })
    return data


def write_json(name: str, payload) -> None:
    path = OUT_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    blob = json.dumps(payload, indent=None, separators=(",", ":"), default=str)
    path.write_text(blob, encoding="utf-8")
    print(f"  -> {name}  ({len(blob):,} bytes)")


def num(v, default=None):
    """Parse a numeric cell. Blank/absent returns `default` (None), never 0."""
    if v is None:
        return default
    s = str(v).strip().replace(",", "")
    if s == "" or s.lower() in {"na", "n/a", "none", "null"}:
        return default
    try:
        f = float(s)
    except ValueError:
        return default
    return int(f) if f.is_integer() else f


def period_sort_key(p: str):
    m = re.match(r"Q(\d)_(\d{4})", p or "")
    return (int(m.group(2)), int(m.group(1))) if m else (0, 0)


# --------------------------------------------------------------------------
# code-resident registers -- parsed from source, never retyped
# --------------------------------------------------------------------------

def _module_dict(tree: ast.Module, name: str) -> dict:
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) == name:
            return ast.literal_eval(node.value)
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if getattr(t, "id", None) == name:
                    return ast.literal_eval(node.value)
    return {}


def extract_denied_endpoints() -> list[dict]:
    """Parse DENIED_ENDPOINTS out of metrics.py rather than transcribing it.

    This register is the reason the estimation layer exists: every track-level
    stream endpoint is a confirmed 401. It is currently dead data -- defined and
    referenced nowhere.
    """
    src = BACKEND_DIR / "nmas" / "metrics.py"
    if not src.exists():
        return []
    tree = ast.parse(src.read_text(encoding="utf-8"))
    denied = _module_dict(tree, "DENIED_ENDPOINTS")

    text = src.read_text(encoding="utf-8").splitlines()
    out = []
    for key, meta in denied.items():
        line = next(
            (i + 1 for i, ln in enumerate(text) if f'"{key}"' in ln and "endpoint" not in ln),
            None,
        )
        out.append({
            "metric": key,
            "endpoint": meta.get("endpoint"),
            "status": meta.get("status"),
            "note": meta.get("note"),
            "source_ref": f"backend/nmas/metrics.py:{line}" if line else "backend/nmas/metrics.py",
        })
    return out


def extract_metric_definitions() -> list[dict]:
    """Project MetricDefinition entries: endpoint, unit, aggregation rule, caveats."""
    src = BACKEND_DIR / "nmas" / "metrics.py"
    if not src.exists():
        return []
    tree = ast.parse(src.read_text(encoding="utf-8"))

    defs: list[dict] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and getattr(node.func, "id", "") == "MetricDefinition"):
            continue
        entry: dict = {"source_ref": f"backend/nmas/metrics.py:{node.lineno}"}
        for kw in node.keywords:
            try:
                entry[kw.arg] = ast.literal_eval(kw.value)
            except (ValueError, SyntaxError):
                entry[kw.arg] = None
        defs.append(entry)
    return defs


# --------------------------------------------------------------------------
# projections
# --------------------------------------------------------------------------

def build_coverage() -> dict:
    """The Quarter Coverage Matrix.

    Streams Daily_Metric_Observations.csv (850k rows) rather than loading it, and
    emits one cell per variable x quarter: observation count, distinct artists,
    date span, and the gap count recorded for that cell. Cells are NOT given an
    epistemic verdict here -- the UI derives that from counts plus the estimation
    register, so the rule stays visible in one place.
    """
    obs_path = DATASETS / "Daily_Metric_Observations.csv"
    cells: dict[tuple[str, str], dict] = {}
    endpoints: dict[str, set] = defaultdict(set)
    variables: set[str] = set()
    artists_seen: set[str] = set()
    total_rows = 0

    if obs_path.exists():
        stat = obs_path.stat()
        with open(obs_path, "r", encoding="utf-8", errors="replace", newline="") as fh:
            for row in csv.DictReader(fh):
                total_rows += 1
                var = row.get("variable_name") or ""
                per = row.get("period_label") or ""
                if not var or not per:
                    continue
                variables.add(var)
                key = (var, per)
                cell = cells.get(key)
                if cell is None:
                    cell = cells[key] = {
                        "variable": var, "period": per, "obs_count": 0,
                        "artists": set(), "first_date": None, "last_date": None,
                        "endpoints": set(), "platforms": set(),
                        "last_extraction": None,
                    }
                cell["obs_count"] += 1
                if row.get("entity_name"):
                    cell["artists"].add(row["entity_name"])
                    artists_seen.add(row["entity_name"])
                d = row.get("date")
                if d:
                    if cell["first_date"] is None or d < cell["first_date"]:
                        cell["first_date"] = d
                    if cell["last_date"] is None or d > cell["last_date"]:
                        cell["last_date"] = d
                ep = row.get("source_endpoint")
                if ep:
                    cell["endpoints"].add(ep)
                    endpoints[var].add(ep)
                pf = row.get("platform")
                if pf:
                    cell["platforms"].add(pf)
                ts = row.get("extraction_timestamp")
                if ts and (cell["last_extraction"] is None or ts > cell["last_extraction"]):
                    cell["last_extraction"] = ts

        _manifest.append({
            "role": "daily_observations",
            "path": str(obs_path.relative_to(PROJECT_ROOT)),
            "present": True, "rows": total_rows,
            "columns": ["date", "period_label", "entity_type", "entity_id", "entity_name",
                        "platform", "geo_scope", "variable_name", "variable_value", "unit",
                        "source_endpoint", "source_field", "extraction_timestamp"],
            "sha256": _sha256(obs_path), "bytes": stat.st_size,
            "modified_utc": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })

    # gap counts per (variable, period) from the system's own gap summary
    gap_rows = read_csv(DB_EXTRACTS / "coverage_gaps_summary.csv", role="coverage_gaps_summary")
    gaps: dict[tuple[str, str], dict] = {}
    for r in gap_rows:
        gaps[(r["variable_name"], r["period_label"])] = {
            "gap_count": num(r.get("gap_count"), 0),
            "reasons": r.get("reasons"),
        }

    gap_periods = {p for (_, p) in gaps}

    out_cells = []
    for (var, per), c in cells.items():
        g = gaps.get((var, per))
        out_cells.append({
            "variable": var,
            "period": per,
            "obs_count": c["obs_count"],
            "artist_count": len(c["artists"]),
            "first_date": c["first_date"],
            "last_date": c["last_date"],
            "endpoints": sorted(c["endpoints"]),
            "platforms": sorted(c["platforms"]),
            "last_extraction": c["last_extraction"],
            "gap_count": g["gap_count"] if g else None,
            "gap_reasons": g["reasons"] if g else None,
            # A cell with observations but no gap row means the gap report never
            # covered this quarter -- distinct from "no gaps found".
            "gap_metadata_present": g is not None,
        })
    out_cells.sort(key=lambda c: (c["variable"], period_sort_key(c["period"])))

    # variables that exist as definitions but produced zero observations
    defined = {d.get("name") for d in extract_metric_definitions() if d.get("name")}
    never_observed = sorted(defined - variables)

    # Derive the observed window and the archive floor from the data itself, so
    # a newly ingested quarter or an unlocked deeper archive appears on the next
    # generation without editing this file.
    global OBSERVED_PERIODS, ARCHIVE_FLOOR
    OBSERVED_PERIODS = sorted({c["period"] for c in out_cells}, key=period_sort_key)
    floors = [c["first_date"] for c in out_cells if c["first_date"]]
    ARCHIVE_FLOOR = min(floors) if floors else None

    return {
        "periods_observed": OBSERVED_PERIODS,
        "periods_with_gap_metadata": sorted(gap_periods, key=period_sort_key),
        "archive_floor": ARCHIVE_FLOOR,
        "variables": sorted(variables),
        "variables_defined_never_observed": never_observed,
        "total_observations": total_rows,
        "distinct_artists": len(artists_seen),
        "endpoints_by_variable": {k: sorted(v) for k, v in endpoints.items()},
        "cells": out_cells,
    }


def build_aggregates() -> list[dict]:
    """Quarterly aggregates with obs_count and the cumulative-counter correction.

    `aggregated_value` is the published figure and is passed through untouched.
    `last_minus_first` is a presentation-side derivation shown beside it for
    cumulative counters, where `sum` overstates by orders of magnitude.
    """
    rows = read_csv(DELIVERABLES / "quarterly_aggregates_full.csv", role="quarterly_aggregates")
    out = []
    for r in rows:
        var = r.get("variable_name") or ""
        first_v = num(r.get("first_value"))
        last_v = num(r.get("last_value"))
        agg = num(r.get("aggregated_value"))
        rule = r.get("aggregation_rule")

        delta = None
        overstatement = None
        if var in CUMULATIVE_COUNTERS and rule == "sum" and first_v is not None and last_v is not None:
            delta = last_v - first_v
            if delta and delta > 0 and agg:
                overstatement = round(agg / delta, 1)

        out.append({
            "entity_name": r.get("entity_name"),
            "variable": var,
            "period": r.get("period_label"),
            "aggregation_rule": rule,
            "aggregated_value": agg,
            "first_value": first_v,
            "last_value": last_v,
            "obs_count": num(r.get("obs_count")),
            "is_cumulative_counter": var in CUMULATIVE_COUNTERS,
            "last_minus_first": delta,
            "overstatement_factor": overstatement,
        })
    return out


def build_revenue() -> dict:
    """Streaming + export revenue, every column preserved.

    The current static API drops nigeria_domestic_share_pct, export_share_pct,
    top_export_markets and source. All four are carried through here: they are
    the assumptions behind the export figure and must be visible at the point of
    display. Reads the backend original, not the delivery copy, whose `source`
    column is corrupted (643 distinct values incrementing WIPO 2025 -> WIPO 2667).
    """
    streaming = read_csv(DELIVERABLES / "1_gross_streaming_revenue.csv", role="streaming_revenue")
    export = read_csv(DELIVERABLES / "2_gross_export_revenue.csv", role="export_revenue")

    def split(rows):
        detail = [r for r in rows if r.get("artist_name") != TOTAL_ROW_MARKER]
        totals = [r for r in rows if r.get("artist_name") == TOTAL_ROW_MARKER]
        return detail, totals

    s_detail, s_totals = split(streaming)
    e_detail, e_totals = split(export)

    export_by_key = {(r["period"], r["artist_name"]): r for r in e_detail}

    rows = []
    for r in s_detail:
        key = (r.get("period"), r.get("artist_name"))
        e = export_by_key.get(key, {})
        rows.append({
            "period": r.get("period"),
            "artist_name": r.get("artist_name"),
            # observed inputs
            "spotify_monthly_listeners": num(r.get("spotify_monthly_listeners")),
            "youtube_subscribers": num(r.get("youtube_subscribers")),
            "deezer_fans": num(r.get("deezer_fans")),
            # the single epistemic flag that exists anywhere in the delivery
            "youtube_actual_views": num(r.get("youtube_actual_views")),
            "youtube_views_source": r.get("youtube_views_source") or None,
            # estimated
            "est_spotify_quarterly_streams": num(r.get("est_spotify_quarterly_streams")),
            "spotify_revenue_usd": num(r.get("spotify_revenue_usd")),
            "youtube_revenue_usd": num(r.get("youtube_revenue_usd")),
            "deezer_revenue_usd": num(r.get("deezer_revenue_usd")),
            "other_platforms_revenue_usd": num(r.get("other_platforms_revenue_usd")),
            "gross_streaming_revenue_usd": num(r.get("gross_streaming_revenue_usd")),
            "gross_streaming_revenue_ngn": num(r.get("gross_streaming_revenue_ngn")),
            "streaming_source": r.get("source") or None,
            # export split -- assumed constants, carried through
            "total_streaming_revenue_usd": num(e.get("total_streaming_revenue_usd")),
            "nigeria_domestic_share_pct": num(e.get("nigeria_domestic_share_pct")),
            "domestic_revenue_usd": num(e.get("domestic_revenue_usd")),
            "export_share_pct": num(e.get("export_share_pct")),
            "gross_export_revenue_usd": num(e.get("gross_export_revenue_usd")),
            "gross_export_revenue_ngn": num(e.get("gross_export_revenue_ngn")),
            "top_export_markets": e.get("top_export_markets") or None,
            "export_source": e.get("source") or None,
        })

    def totals(rows_, fields):
        out = []
        for r in rows_:
            item = {"period": r.get("period")}
            for f in fields:
                item[f] = num(r.get(f))
            out.append(item)
        out.sort(key=lambda x: period_sort_key(x["period"]))
        return out

    global REVENUE_PERIODS
    REVENUE_PERIODS = sorted({r["period"] for r in rows if r.get("period")},
                             key=period_sort_key)

    return {
        "periods": REVENUE_PERIODS,
        "rows": rows,
        "streaming_totals": totals(s_totals, [
            "gross_streaming_revenue_usd", "gross_streaming_revenue_ngn",
            "spotify_revenue_usd", "youtube_revenue_usd",
            "deezer_revenue_usd", "other_platforms_revenue_usd",
        ]),
        "export_totals": totals(e_totals, [
            "total_streaming_revenue_usd", "domestic_revenue_usd",
            "gross_export_revenue_usd", "gross_export_revenue_ngn",
        ]),
    }


def build_artists(coverage: dict, revenue: dict) -> list[dict]:
    """Artist universe. Columns the data cannot fill are emitted as null, not blank."""
    master = read_csv(DATASETS / "Artist_Master_List.csv", role="artist_master_list")

    # per-artist observation coverage from the observation summary
    obs_summary = read_csv(DB_EXTRACTS / "observation_summary.csv", role="observation_summary")
    by_artist: dict[str, dict] = defaultdict(lambda: {"obs_count": 0, "variables": set(),
                                                     "first_date": None, "last_date": None})
    for r in obs_summary:
        a = by_artist[r["entity_name"]]
        a["obs_count"] += num(r.get("obs_count"), 0) or 0
        a["variables"].add(r.get("variable_name"))
        for field, cmp_ in (("first_date", min), ("last_date", max)):
            v = r.get(field)
            if v:
                a[field] = v if a[field] is None else cmp_(a[field], v)

    # revenue presence per artist per period
    rev_by_artist: dict[str, dict] = defaultdict(dict)
    for r in revenue["rows"]:
        rev_by_artist[r["artist_name"]][r["period"]] = r

    out = []
    for r in master:
        name = r.get("artist_name")
        cov = by_artist.get(name, {})
        periods = rev_by_artist.get(name, {})
        est_streams = sum(
            (p.get("est_spotify_quarterly_streams") or 0) for p in periods.values()
        ) or None
        gross = sum(
            (p.get("gross_streaming_revenue_usd") or 0) for p in periods.values()
        ) or None
        yt_estimated = sum(
            1 for p in periods.values() if p.get("youtube_views_source") == "estimated"
        )

        out.append({
            "artist_name": name,
            "chartmetric_artist_id": num(r.get("cm_artist_id")) or r.get("cm_artist_id") or None,
            # These four are empty on 131/131 rows in every artist artifact.
            # Emitted as null so the UI renders NOT COLLECTED, never a blank cell.
            "spotify_id": r.get("spotify_id") or None,
            "youtube_id": r.get("youtube_id") or None,
            "label": r.get("label") or None,
            "genres": r.get("genres") or None,
            # `country` is a hardcoded default, identical on every row. It is NOT
            # a residency classification and must never be displayed as one.
            "country_field_value": r.get("country") or None,
            "status": r.get("status") or None,
            "observation_count": cov.get("obs_count") or None,
            "variables_observed": len(cov.get("variables", ())) or None,
            "first_observation": cov.get("first_date"),
            "last_observation": cov.get("last_date"),
            "revenue_periods": sorted(periods.keys(), key=period_sort_key),
            "revenue_period_count": len(periods),
            "est_streams_total": est_streams,
            "gross_streaming_revenue_usd_total": round(gross, 2) if gross else None,
            "youtube_estimated_period_count": yt_estimated,
            # No field in any artifact supports these. Never fabricate them.
            "residency_classification": None,
            "residency_basis": None,
            "account_routing": None,
            "confidence_score": None,
            "resolution_match_score": None,
        })

    out.sort(key=lambda a: -(a["gross_streaming_revenue_usd_total"] or 0))
    return out


def build_resolution_audit() -> list[dict]:
    """Entity-resolution audit: search term vs matched name vs provider score.

    This is what exposes the Burna Boy misbinding -- cm_id 441923 carries a
    Spotify follower series of 49-55 where the real entity has 15.8M.
    """
    data = read_json(BACKEND_DIR / "data" / "nigerian_artists_chartmetric.json",
                     role="resolution_audit")
    if not data:
        return []
    records = data if isinstance(data, list) else data.get("artists", [])
    out = []
    for r in records:
        if not isinstance(r, dict):
            continue
        out.append({
            "search_name": r.get("search_name") or r.get("query") or r.get("name"),
            "matched_name": r.get("cm_name") or r.get("name"),
            "chartmetric_artist_id": r.get("cm_id") or r.get("id"),
            "match_score": r.get("score"),
            "raw": {k: v for k, v in r.items() if not isinstance(v, (dict, list))},
        })
    return out


def build_limitations_and_gaps() -> dict:
    """Aggregate the two quality reports. Both stop at Q4_2025 -- Q1_2026, the
    newest and largest quarter, carries no quality metadata at all."""
    lim = read_csv(DATASETS / "Data_Limitations_Report.csv", role="limitations_report")
    gaps_full = read_csv(DATASETS / "Coverage_Gap_Report.csv", role="coverage_gap_report")

    by_code: dict[tuple, dict] = {}
    for r in lim:
        k = (r.get("variable_name"), r.get("period_label"), r.get("limitation_code"))
        e = by_code.setdefault(k, {
            "variable": k[0], "period": k[1], "limitation_code": k[2],
            "count": 0, "descriptions": set(), "fallback_applied": set(),
        })
        e["count"] += 1
        if r.get("description"):
            e["descriptions"].add(r["description"])
        if r.get("fallback_applied"):
            e["fallback_applied"].add(r["fallback_applied"])

    limitations = [
        {**e, "descriptions": sorted(e["descriptions"])[:3],
         "fallback_applied": sorted(e["fallback_applied"])}
        for e in by_code.values()
    ]
    limitations.sort(key=lambda e: (-e["count"], e["variable"] or ""))

    reasons: dict[str, int] = defaultdict(int)
    severities: dict[str, int] = defaultdict(int)
    gap_periods: dict[str, int] = defaultdict(int)
    for r in gaps_full:
        reasons[r.get("reason") or "unspecified"] += 1
        severities[r.get("severity") or "unspecified"] += 1
        gap_periods[r.get("period_label") or "unspecified"] += 1

    return {
        "limitations": limitations,
        "limitation_total": len(lim),
        "gap_total": len(gaps_full),
        "gap_reasons": dict(reasons),
        # severity is 'medium' on every one of 29,369 rows -- the column carries
        # zero information and the UI must say so rather than plot it.
        "gap_severities": dict(severities),
        "gap_by_period": dict(sorted(gap_periods.items(), key=lambda kv: period_sort_key(kv[0]))),
        "periods_with_quality_metadata": sorted(
            {r.get("period_label") for r in gaps_full if r.get("period_label")},
            key=period_sort_key,
        ),
    }


def build_run() -> dict:
    """Everything known about the one recorded extraction run.

    There is no stage decomposition, no concurrency and no per-call timing
    anywhere in the system, so this is two timestamps, a duration and a single
    failure tally. The console renders exactly that and states the rest absent.
    """
    failures = read_csv(DB_EXTRACTS / "job_failures_summary.csv", role="job_failures")

    summary_path = None
    for cand in sorted((BACKEND_DIR / "data" / "exports").glob("*/job_summary_report.md"), reverse=True):
        summary_path = cand
        break

    report_text = None
    fields: dict[str, str] = {}
    if summary_path and summary_path.exists():
        report_text = summary_path.read_text(encoding="utf-8", errors="replace")
        _manifest.append({
            "role": "job_summary_report",
            "path": str(summary_path.relative_to(PROJECT_ROOT)),
            "present": True, "rows": None,
            "sha256": _sha256(summary_path), "bytes": summary_path.stat().st_size,
            "modified_utc": datetime.fromtimestamp(
                summary_path.stat().st_mtime, timezone.utc).isoformat(),
        })
        # The summary is a markdown bullet list: "- Key: value"
        for key, value in re.findall(r"^-\s*([A-Za-z][A-Za-z ]+?):\s*(.+)$",
                                     report_text, re.MULTILINE):
            fields[key.strip().lower()] = value.strip().strip("*` ")

    started = fields.get("started")
    finished = fields.get("finished")

    # Wall-clock duration is not recorded; it is the difference of the two stored
    # timestamps. Emitted separately as *_derived so the UI can label it a
    # presentation-side derivation rather than a measured value.
    duration_seconds = None
    if started and finished:
        try:
            duration_seconds = (
                datetime.fromisoformat(finished) - datetime.fromisoformat(started)
            ).total_seconds()
        except ValueError:
            duration_seconds = None

    return {
        "job_name": fields.get("job"),
        "provider": fields.get("provider"),
        "status": fields.get("status"),
        "started": started,
        "finished": finished,
        "duration_seconds_derived": duration_seconds,
        # The only records-in / records-out / records-rejected accounting the
        # pipeline produces, and it is per-run, not per-stage.
        "total_units": num(fields.get("total units")),
        "completed_units": num(fields.get("completed units")),
        "skipped_units": num(fields.get("skipped units")),
        "failed_units": num(fields.get("failed units")),
        "report_markdown": report_text,
        "failures": [
            {
                "error_type": r.get("error_type"),
                "count": num(r.get("count")),
                "messages": [m.strip() for m in (r.get("messages") or "").split(".,") if m.strip()],
            }
            for r in failures
        ],
        # Structurally unavailable. Named explicitly so the UI renders
        # NOT COLLECTED rather than an empty chart.
        "stages": None,
        "per_call_telemetry": None,
        "queue_depth": None,
        "active_workers": None,
        "cache_hit_rate": None,
        "quota_consumed": None,
        "quota_remaining": None,
        "rate_limit_events": None,
    }


def build_population_frame() -> dict:
    rows = read_csv(DATASETS / "Artist_Population_Frame.csv", role="population_frame")
    in_sample = sum(1 for r in rows if (r.get("in_sample") or "").strip().upper() in {"Y", "YES", "TRUE"})
    by_region: dict[str, int] = defaultdict(int)
    by_genre: dict[str, int] = defaultdict(int)
    for r in rows:
        by_region[r.get("region") or "unspecified"] += 1
        by_genre[r.get("genre_category") or "unspecified"] += 1
    return {
        "total": len(rows),
        "in_sample": in_sample,
        "by_region": dict(sorted(by_region.items(), key=lambda kv: -kv[1])),
        "by_genre": dict(sorted(by_genre.items(), key=lambda kv: -kv[1])),
        "rows": [
            {
                "artist_name": r.get("artist_name"),
                "country": r.get("country") or None,
                "region": r.get("region") or None,
                "state_area": r.get("state_area") or None,
                "genre_category": r.get("genre_category") or None,
                "representative_song": r.get("representative_song") or None,
                "in_sample": (r.get("in_sample") or "").strip().upper() in {"Y", "YES", "TRUE"},
                "chartmetric_artist_id": r.get("cm_artist_id") or None,
                "spotify_id": r.get("spotify_id") or None,
                "youtube_id": r.get("youtube_id") or None,
                "label": r.get("label") or None,
                "source": r.get("source") or None,
            }
            for r in rows
        ],
    }


def build_employment_and_costs() -> dict:
    emp = read_csv(DELIVERABLES / "3_employment_male_female.csv", role="employment")
    costs = read_csv(DELIVERABLES / "4_hosting_production_costs.csv", role="costs")
    return {
        "employment": [
            {
                "period": r.get("period"), "category": r.get("category"),
                "total_employment": num(r.get("total_employment")),
                "male": num(r.get("male")), "female": num(r.get("female")),
                "source": r.get("source") or None,
            } for r in emp
        ],
        "costs": [
            {
                "period": r.get("period"), "cost_category": r.get("cost_category"),
                "num_artists": num(r.get("num_artists")),
                "total_cost_ngn": num(r.get("total_cost_ngn")),
                "total_cost_usd": num(r.get("total_cost_usd")),
                "source": r.get("source") or None,
            } for r in costs
        ],
    }


def _read_xlsx_rows(path: Path) -> list[list[str]]:
    """Read the first worksheet of an .xlsx into rows of strings.

    Deliberately dependency-free: the delivery workbooks are simple grids and
    openpyxl is not guaranteed to be installed wherever this runs.
    """
    import zipfile
    from xml.etree import ElementTree as ET

    NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall(f"{NS}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

        sheets = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
        if not sheets:
            return []
        root = ET.fromstring(z.read(sorted(sheets)[0]))

        rows: list[list[str]] = []
        for row in root.iter(f"{NS}row"):
            cells: list[str] = []
            for c in row.findall(f"{NS}c"):
                v = c.find(f"{NS}v")
                if v is None or v.text is None:
                    is_el = c.find(f"{NS}is")
                    cells.append(
                        "".join(t.text or "" for t in is_el.iter(f"{NS}t")) if is_el is not None else ""
                    )
                    continue
                if c.get("t") == "s":
                    idx = int(v.text)
                    cells.append(shared[idx] if 0 <= idx < len(shared) else "")
                else:
                    cells.append(v.text)
            rows.append(cells)
        return rows


def _scan_delivery(root: Path, delivery_id: str, label: str) -> dict | None:
    """Inventory a delivery package: every file with its size, hash and date.

    Modification times are preserved exactly as recorded on disk — they are the
    only evidence of when each artifact was produced, and the submission is only
    auditable if they survive.
    """
    if not root.exists():
        return None

    files: list[dict] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name == ".DS_Store":
            continue
        rel = p.relative_to(root)
        section = rel.parts[0] if len(rel.parts) > 1 else "(root)"
        stat = p.stat()
        files.append({
            "path": str(rel),
            "name": p.name,
            "section": section,
            "extension": p.suffix.lower().lstrip(".") or None,
            "bytes": stat.st_size,
            "modified_utc": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            # Hash everything under 40 MB; the two very large raw CSVs are skipped
            # to keep generation fast, and are reported as such rather than as null.
            "sha256": _sha256(p) if stat.st_size <= 40_000_000 else None,
            "sha256_skipped": stat.st_size > 40_000_000,
        })

    sections: dict[str, dict] = {}
    for f in files:
        s = sections.setdefault(f["section"], {"section": f["section"], "files": 0, "bytes": 0})
        s["files"] += 1
        s["bytes"] += f["bytes"]

    dates = sorted(f["modified_utc"] for f in files)
    readme = root / "README.md"

    return {
        "id": delivery_id,
        "label": label,
        "root": str(root),
        "file_count": len(files),
        "total_bytes": sum(f["bytes"] for f in files),
        "first_modified": dates[0] if dates else None,
        "last_modified": dates[-1] if dates else None,
        "sections": sorted(sections.values(), key=lambda s: s["section"]),
        "readme_markdown": readme.read_text(encoding="utf-8", errors="replace")
        if readme.exists() else None,
        "files": files,
    }


def build_delivery() -> dict:
    """Both delivery packages, side by side, with what differs between them."""
    submitted_root = PROJECT_ROOT.parent / "NBS FINAL delivery"
    project_root = PROJECT_ROOT / "delivery"

    submitted = _scan_delivery(submitted_root, "submitted", "NBS Final Delivery — submitted")
    project = _scan_delivery(project_root, "project", "In-repository delivery")

    deliveries = [d for d in (submitted, project) if d]

    sub_paths = {f["path"] for f in submitted["files"]} if submitted else set()
    proj_paths = {f["path"] for f in project["files"]} if project else set()

    # Headline indicators workbook — a produced artifact, projected verbatim.
    headline: dict = {"present": False, "rows": [], "source": None}
    if submitted:
        for cand in submitted_root.glob("*Headline Indicators*.xlsx"):
            try:
                rows = _read_xlsx_rows(cand)
            except Exception as exc:  # noqa: BLE001 - report, never fabricate
                headline = {"present": False, "rows": [], "source": str(cand.name),
                            "error": f"{type(exc).__name__}: {exc}"}
                break
            headline = {
                "present": bool(rows),
                "source": cand.name,
                "modified_utc": datetime.fromtimestamp(
                    cand.stat().st_mtime, timezone.utc).isoformat(),
                "sha256": _sha256(cand),
                "rows": rows,
            }
            _manifest.append({
                "role": "headline_indicators",
                "path": str(cand.relative_to(PROJECT_ROOT.parent)),
                "present": True, "rows": len(rows),
                "sha256": _sha256(cand), "bytes": cand.stat().st_size,
                "modified_utc": headline["modified_utc"],
            })
            break

    # The delivery README advertises a section; check whether it shipped.
    promised_sections: list[str] = []
    if submitted and submitted.get("readme_markdown"):
        promised_sections = re.findall(r"`(\d{2}_[A-Za-z_]+)/`", submitted["readme_markdown"])
    present_sections = {s["section"] for d in deliveries for s in d["sections"]}
    missing_sections = [s for s in promised_sections if s not in present_sections]

    return {
        "deliveries": deliveries,
        "only_in_submitted": sorted(sub_paths - proj_paths),
        "only_in_project": sorted(proj_paths - sub_paths),
        "in_both": len(sub_paths & proj_paths),
        "promised_sections": promised_sections,
        "missing_sections": missing_sections,
        "headline_indicators": headline,
    }


def build_observation_summary() -> list[dict]:
    rows = read_csv(DB_EXTRACTS / "observation_summary.csv", role="observation_summary_detail")
    return [
        {
            "entity_name": r.get("entity_name"),
            "variable": r.get("variable_name"),
            "obs_count": num(r.get("obs_count")),
            "first_date": r.get("first_date"),
            "last_date": r.get("last_date"),
            "min_val": num(r.get("min_val")),
            "max_val": num(r.get("max_val")),
            "avg_val": num(r.get("avg_val")),
        }
        for r in rows
    ]


# --------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating NMAS console API (read-only projection)\n")

    print("[1] coverage matrix  (streaming 850k observations)")
    coverage = build_coverage()
    write_json("coverage.json", coverage)

    print("[2] revenue")
    revenue = build_revenue()
    write_json("revenue.json", revenue)

    print("[3] artists")
    write_json("artists.json", build_artists(coverage, revenue))

    print("[4] quarterly aggregates")
    write_json("aggregates.json", build_aggregates())

    print("[5] metric definitions + denied endpoints")
    write_json("variables.json", {
        "definitions": extract_metric_definitions(),
        "denied_endpoints": extract_denied_endpoints(),
    })

    print("[6] limitations + gaps")
    write_json("quality.json", build_limitations_and_gaps())

    print("[7] run + failures")
    write_json("run.json", build_run())

    print("[8] population frame")
    write_json("population-frame.json", build_population_frame())

    print("[9] employment + costs")
    write_json("accounts.json", build_employment_and_costs())

    print("[10] resolution audit")
    write_json("resolution-audit.json", build_resolution_audit())

    print("[11] observation summary")
    write_json("observation-summary.json", build_observation_summary())

    print("[12] delivery packages")
    write_json("delivery.json", build_delivery())

    print("[13] manifest")
    write_json("manifest.json", {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "generator": "backend/scripts/generate_console_api.py",
        "note": (
            "Read-only projection of already-produced artifacts. No economic value "
            "is computed here. Fields the source artifacts cannot fill are emitted "
            "as null and render as NOT COLLECTED."
        ),
        "archive_floor": ARCHIVE_FLOOR,
        "periods_observed": OBSERVED_PERIODS,
        "periods_with_revenue": REVENUE_PERIODS,
        "artifacts": _manifest,
    })

    missing = [a for a in _manifest if not a["present"]]
    print(f"\nDone. {len(_manifest)} artifacts read, {len(missing)} missing.")
    for m in missing:
        print(f"  MISSING: {m['path']}")


if __name__ == "__main__":
    main()
