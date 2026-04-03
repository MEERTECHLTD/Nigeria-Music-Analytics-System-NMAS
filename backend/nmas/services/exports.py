from __future__ import annotations

import csv
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from ..config import get_settings
from ..metrics import PENDING_DERIVED_METHODS, observed_metrics
from ..models import (
    Artist,
    AuditLog,
    CoverageGap,
    ExportArtifact,
    ExtractionJob,
    JobRun,
    LimitationFlag,
    MethodologyEntry,
    NormalizedMetricObservation,
    Track,
)
from .quarterly import compute_quarterly_aggregates


def sync_methodology_entries(session: Session) -> None:
    for metric in observed_metrics():
        existing = session.exec(select(MethodologyEntry).where(MethodologyEntry.variable_name == metric.name)).first()
        if existing is None:
            existing = MethodologyEntry(
                variable_name=metric.name,
                source="Chartmetric Developer API",
                endpoint=metric.endpoint_template,
                field_name=", ".join(metric.source_field_candidates),
                definition=metric.definition,
                unit=metric.unit,
                generation_method=f"Raw provider extraction. Quarterly rule: {metric.aggregation_rule}.",
                coverage_limitations=metric.coverage_limitations,
                geo_limitations=metric.geo_limitations,
                platform_scope=metric.platform,
                fallback_logic=metric.fallback_logic,
                missing_data_treatment=metric.missing_data_treatment,
                aggregation_rule=metric.aggregation_rule,
                methodology_status=metric.methodology_status,
            )
        else:
            existing.source = "Chartmetric Developer API"
            existing.endpoint = metric.endpoint_template
            existing.field_name = ", ".join(metric.source_field_candidates)
            existing.definition = metric.definition
            existing.unit = metric.unit
            existing.generation_method = f"Raw provider extraction. Quarterly rule: {metric.aggregation_rule}."
            existing.coverage_limitations = metric.coverage_limitations
            existing.geo_limitations = metric.geo_limitations
            existing.platform_scope = metric.platform
            existing.fallback_logic = metric.fallback_logic
            existing.missing_data_treatment = metric.missing_data_treatment
            existing.aggregation_rule = metric.aggregation_rule
            existing.methodology_status = metric.methodology_status
            existing.updated_at = datetime.now(timezone.utc)
        session.add(existing)

    for variable_name, meta in PENDING_DERIVED_METHODS.items():
        existing = session.exec(select(MethodologyEntry).where(MethodologyEntry.variable_name == variable_name)).first()
        if existing is None:
            existing = MethodologyEntry(
                variable_name=variable_name,
                source="Pending approved methodology",
                endpoint="N/A",
                field_name="N/A",
                definition=meta["definition"],
                unit="pending",
                generation_method="Placeholder only. Do not treat as observed.",
                coverage_limitations=meta["coverage_limitations"],
                geo_limitations="Pending approved scope.",
                platform_scope="Requires external inputs.",
                fallback_logic="No fallback.",
                missing_data_treatment="Do not generate until methodology is approved.",
                aggregation_rule="pending",
                methodology_status=meta["status"],
            )
            session.add(existing)


def ensure_observation_methodology_entries(session: Session, observations: list[NormalizedMetricObservation]) -> None:
    base_metric = next(metric for metric in observed_metrics() if metric.name == "Where_People_Listen")
    for observation in observations:
        if not observation.variable_name.startswith("Where_People_Listen_"):
            continue
        existing = session.exec(
            select(MethodologyEntry).where(MethodologyEntry.variable_name == observation.variable_name)
        ).first()
        if existing is not None:
            continue
        session.add(
            MethodologyEntry(
                variable_name=observation.variable_name,
                source="Chartmetric Developer API",
                endpoint=base_metric.endpoint_template,
                field_name="listeners_pct",
                definition=f"Nigeria city-level listener share proxy for {observation.geo_label or observation.variable_name}.",
                unit="share_pct",
                generation_method="Raw provider extraction at city level. Quarterly rule: last_value.",
                coverage_limitations=base_metric.coverage_limitations,
                geo_limitations=base_metric.geo_limitations,
                platform_scope=base_metric.platform,
                fallback_logic=base_metric.fallback_logic,
                missing_data_treatment=base_metric.missing_data_treatment,
                aggregation_rule=base_metric.aggregation_rule,
                methodology_status="observed",
            )
        )


def generate_export_bundle(session: Session, job_id: str, actor: str = "system") -> list[ExportArtifact]:
    settings = get_settings()
    job = session.get(ExtractionJob, job_id)
    if job is None:
        raise KeyError(f"Job not found: {job_id}")

    latest_run = session.exec(
        select(JobRun).where(JobRun.job_id == job_id).order_by(JobRun.started_at.desc())
    ).first()
    if latest_run is None:
        raise ValueError("Cannot export before at least one job run exists.")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    export_dir = settings.export_root_path / f"{timestamp}_{job.id}"
    export_dir.mkdir(parents=True, exist_ok=True)

    observations = list(
        session.exec(
            select(NormalizedMetricObservation).where(NormalizedMetricObservation.job_id == job_id)
        )
    )
    ensure_observation_methodology_entries(session, observations)
    artists = list(session.exec(select(Artist).order_by(Artist.artist_name.asc())))
    tracks = list(session.exec(select(Track).order_by(Track.track_name.asc())))
    methodology_entries = list(
        session.exec(select(MethodologyEntry).order_by(MethodologyEntry.variable_name.asc()))
    )
    coverage_gaps = list(session.exec(select(CoverageGap).where(CoverageGap.job_id == job_id)))
    limitations = list(session.exec(select(LimitationFlag).where(LimitationFlag.job_id == job_id)))
    quarterly = compute_quarterly_aggregates(session, job_id)

    artifacts: list[ExportArtifact] = []
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "nmas_chartmetric_metrics.csv",
            "metrics",
            [
                "date",
                "period_label",
                "entity_type",
                "entity_id",
                "entity_name",
                "platform",
                "geo_scope",
                "variable_name",
                "variable_value",
                "unit",
                "source_endpoint",
                "source_field",
                "extraction_timestamp",
            ],
            [
                {
                    "date": item.observation_date.isoformat(),
                    "period_label": item.period_label,
                    "entity_type": item.entity_type,
                    "entity_id": item.chartmetric_entity_id,
                    "entity_name": item.entity_name,
                    "platform": item.platform,
                    "geo_scope": item.geo_scope if not item.geo_label else f"{item.geo_scope}:{item.geo_label}",
                    "variable_name": item.variable_name,
                    "variable_value": item.variable_value,
                    "unit": item.unit,
                    "source_endpoint": item.source_endpoint,
                    "source_field": item.source_field,
                    "extraction_timestamp": item.extraction_timestamp.isoformat(),
                }
                for item in observations
            ],
        )
    )
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "nmas_artists.csv",
            "artists",
            [
                "cm_artist_id",
                "artist_name",
                "country",
                "genres",
                "label",
                "spotify_id",
                "youtube_id",
                "status",
            ],
            [
                {
                    "cm_artist_id": item.chartmetric_artist_id,
                    "artist_name": item.artist_name,
                    "country": item.country,
                    "genres": item.genres,
                    "label": item.label,
                    "spotify_id": item.spotify_id,
                    "youtube_id": item.youtube_id,
                    "status": item.status,
                }
                for item in artists
            ],
        )
    )
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "nmas_tracks.csv",
            "tracks",
            [
                "cm_track_id",
                "track_name",
                "primary_artist_name",
                "spotify_id",
                "youtube_id",
                "isrc",
                "status",
            ],
            [
                {
                    "cm_track_id": item.chartmetric_track_id,
                    "track_name": item.track_name,
                    "primary_artist_name": item.primary_artist_name,
                    "spotify_id": item.spotify_id,
                    "youtube_id": item.youtube_id,
                    "isrc": item.isrc,
                    "status": item.status,
                }
                for item in tracks
            ],
        )
    )
    artifacts.append(
        _write_text_artifact(
            session,
            job,
            latest_run,
            export_dir / "nmas_variable_methodology.md",
            "methodology",
            _render_methodology_markdown(methodology_entries),
            record_count=len(methodology_entries),
        )
    )
    artifacts.append(
        _write_text_artifact(
            session,
            job,
            latest_run,
            export_dir / "nmas_extraction_notes.md",
            "extraction_notes",
            _render_extraction_notes(job, latest_run, observations, coverage_gaps, limitations),
            record_count=len(observations),
        )
    )
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "coverage_report.csv",
            "coverage_report",
            [
                "variable_name",
                "platform",
                "period_label",
                "geo_scope",
                "gap_start",
                "gap_end",
                "reason",
                "severity",
            ],
            [
                {
                    "variable_name": gap.variable_name,
                    "platform": gap.platform,
                    "period_label": gap.period_label,
                    "geo_scope": gap.geo_scope,
                    "gap_start": gap.gap_start.isoformat(),
                    "gap_end": gap.gap_end.isoformat(),
                    "reason": gap.reason,
                    "severity": gap.severity,
                }
                for gap in coverage_gaps
            ],
        )
    )
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "limitations_report.csv",
            "limitations_report",
            [
                "variable_name",
                "platform",
                "period_label",
                "geo_scope",
                "limitation_code",
                "description",
                "fallback_applied",
            ],
            [
                {
                    "variable_name": limitation.variable_name,
                    "platform": limitation.platform,
                    "period_label": limitation.period_label,
                    "geo_scope": limitation.geo_scope,
                    "limitation_code": limitation.limitation_code,
                    "description": limitation.description,
                    "fallback_applied": limitation.fallback_applied,
                }
                for limitation in limitations
            ],
        )
    )
    artifacts.append(
        _write_csv_artifact(
            session,
            job,
            latest_run,
            export_dir / "quarterly_aggregates.csv",
            "quarterly_aggregates",
            [
                "entity_type",
                "entity_name",
                "chartmetric_entity_id",
                "variable_name",
                "platform",
                "geo_scope",
                "geo_label",
                "period_label",
                "aggregation_rule",
                "aggregated_value",
                "unit",
                "qoq_change",
                "yoy_change",
            ],
            quarterly,
        )
    )
    artifacts.append(
        _write_text_artifact(
            session,
            job,
            latest_run,
            export_dir / "job_summary_report.md",
            "job_summary",
            _render_job_summary(job, latest_run, quarterly),
            record_count=len(quarterly),
        )
    )

    session.add(
        AuditLog(
            category="exports",
            action="generate_export_bundle",
            actor=actor,
            job_id=job.id,
            job_run_id=latest_run.id,
            details={"artifact_count": len(artifacts), "directory": str(export_dir)},
        )
    )
    return artifacts


def list_export_artifacts(session: Session) -> list[ExportArtifact]:
    return list(session.exec(select(ExportArtifact).order_by(ExportArtifact.created_at.desc())))


def _write_csv_artifact(
    session: Session,
    job: ExtractionJob,
    job_run: JobRun,
    path: Path,
    export_type: str,
    fieldnames: list[str],
    rows: list[dict[str, object]],
) -> ExportArtifact:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return _store_artifact(session, job, job_run, path, export_type, "csv", len(rows))


def _write_text_artifact(
    session: Session,
    job: ExtractionJob,
    job_run: JobRun,
    path: Path,
    export_type: str,
    content: str,
    record_count: int,
) -> ExportArtifact:
    path.write_text(content, encoding="utf-8")
    return _store_artifact(session, job, job_run, path, export_type, path.suffix.lstrip("."), record_count)


def _store_artifact(
    session: Session,
    job: ExtractionJob,
    job_run: JobRun,
    path: Path,
    export_type: str,
    format_name: str,
    record_count: int,
) -> ExportArtifact:
    sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    artifact = ExportArtifact(
        job_id=job.id,
        job_run_id=job_run.id,
        export_type=export_type,
        format=format_name,
        file_path=str(path),
        sha256=sha256,
        record_count=record_count,
        metadata_json={"filename": path.name},
    )
    session.add(artifact)
    session.flush()
    return artifact


def _render_methodology_markdown(entries: list[MethodologyEntry]) -> str:
    lines = ["# NMAS Variable Methodology", ""]
    for entry in entries:
        lines.extend(
            [
                f"### Variable: {entry.variable_name}",
                f"- Source: {entry.source}",
                f"- Endpoint: {entry.endpoint}",
                f"- Field: {entry.field_name}",
                f"- Definition: {entry.definition}",
                f"- Unit: {entry.unit}",
                f"- Generation: {entry.generation_method}",
                f"- Coverage limitations: {entry.coverage_limitations}",
                f"- Geo limitations: {entry.geo_limitations}",
                f"- Platform scope: {entry.platform_scope}",
                f"- Fallback logic: {entry.fallback_logic}",
                f"- Missing data treatment: {entry.missing_data_treatment}",
                f"- Status: {entry.methodology_status}",
                "",
            ]
        )
    return "\n".join(lines).strip() + "\n"


def _render_extraction_notes(
    job: ExtractionJob,
    job_run: JobRun,
    observations: list[NormalizedMetricObservation],
    coverage_gaps: list[CoverageGap],
    limitations: list[LimitationFlag],
) -> str:
    lines = [
        "# NMAS Extraction Notes",
        "",
        f"- Job: {job.name}",
        f"- Provider: {job.provider}",
        f"- Cadence: {job.cadence}",
        f"- Periods: {', '.join(period['label'] for period in job.period_definitions)}",
        f"- Variables: {', '.join(job.variable_names)}",
        f"- Observations stored: {len(observations)}",
        f"- Coverage gaps logged: {len(coverage_gaps)}",
        f"- Limitations logged: {len(limitations)}",
        "",
        "## Notes",
        "",
        "- Global-only metrics are labelled explicitly at record level.",
        "- Where People Listen rows are preserved as Nigeria city-level proxy data when present.",
        "- No interpolation or silent gap filling is applied.",
        "- Unsupported economic indicators remain outside the observed dataset until approved methodology exists.",
        "",
        "## Document Conflict Handling",
        "",
        "- The codebase supports configurable period sets because the brief and payment/correspondence documents reference different quarter combinations.",
        "- Extraction notes should travel with each export to explain the exact period set used for that run.",
        "",
        "## Run Summary",
        "",
        f"- Run status: {job_run.status}",
        f"- Total units: {job_run.total_units}",
        f"- Completed units: {job_run.completed_units}",
        f"- Skipped units: {job_run.skipped_units}",
        f"- Failed units: {job_run.failed_units}",
    ]
    return "\n".join(lines) + "\n"


def _render_job_summary(job: ExtractionJob, job_run: JobRun, quarterly: list[dict[str, object]]) -> str:
    lines = [
        "# NMAS Job Summary",
        "",
        f"- Job: {job.name}",
        f"- Provider: {job.provider}",
        f"- Started: {job_run.started_at.isoformat()}",
        f"- Finished: {job_run.finished_at.isoformat() if job_run.finished_at else 'incomplete'}",
        f"- Status: {job_run.status}",
        f"- Total units: {job_run.total_units}",
        f"- Completed units: {job_run.completed_units}",
        f"- Skipped units: {job_run.skipped_units}",
        f"- Failed units: {job_run.failed_units}",
        "",
        "## Quarterly Aggregates Generated",
        "",
    ]

    if not quarterly:
        lines.append("- No quarterly aggregates available.")
    else:
        for row in quarterly[:50]:
            lines.append(
                f"- {row['entity_name']} | {row['variable_name']} | {row['period_label']} | {row['aggregated_value']} {row['unit']}"
            )
        if len(quarterly) > 50:
            lines.append(f"- Additional rows omitted from summary: {len(quarterly) - 50}")
    return "\n".join(lines) + "\n"
