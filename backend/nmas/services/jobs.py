from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, delete, select

from ..metrics import METRICS, get_metric_definition
from ..models import (
    Artist,
    AuditLog,
    CoverageGap,
    ExtractionJob,
    JobCheckpoint,
    JobFailure,
    JobRun,
    LimitationFlag,
    NormalizedMetricObservation,
    RawApiPayload,
    Track,
)
from .chartmetric import ChartmetricClient, ChartmetricRequestError


def create_job(session: Session, payload: dict[str, Any]) -> ExtractionJob:
    _validate_job_payload(payload)
    job = ExtractionJob(
        name=payload["name"],
        provider=payload.get("provider", "chartmetric"),
        status="ready",
        cadence=payload.get("cadence", "daily"),
        period_definitions=payload["periods"],
        entity_scope=payload.get("entity_scope", {}),
        variable_names=payload["variable_names"],
        platform_names=payload.get("platform_names", []),
        configuration=payload.get("configuration", {}),
    )
    session.add(job)
    session.flush()
    session.add(
        AuditLog(
            category="jobs",
            action="create_job",
            actor="system",
            job_id=job.id,
            details={"name": job.name, "periods": job.period_definitions, "variables": job.variable_names},
        )
    )
    return job


def list_jobs(session: Session) -> list[ExtractionJob]:
    return list(session.exec(select(ExtractionJob).order_by(ExtractionJob.created_at.desc())))


def list_job_runs(session: Session, job_id: str | None = None) -> list[JobRun]:
    statement = select(JobRun)
    if job_id:
        statement = statement.where(JobRun.job_id == job_id)
    statement = statement.order_by(JobRun.started_at.desc())
    return list(session.exec(statement))


def list_observations(
    session: Session,
    job_id: str | None = None,
    variable_name: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[NormalizedMetricObservation]:
    statement = select(NormalizedMetricObservation)
    if job_id:
        statement = statement.where(NormalizedMetricObservation.job_id == job_id)
    if variable_name:
        statement = statement.where(NormalizedMetricObservation.variable_name == variable_name)
    statement = statement.order_by(NormalizedMetricObservation.observation_date.asc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def list_limitations(
    session: Session,
    job_id: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[LimitationFlag]:
    statement = select(LimitationFlag)
    if job_id:
        statement = statement.where(LimitationFlag.job_id == job_id)
    statement = statement.order_by(LimitationFlag.created_at.desc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def list_coverage_gaps(
    session: Session,
    job_id: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[CoverageGap]:
    statement = select(CoverageGap)
    if job_id:
        statement = statement.where(CoverageGap.job_id == job_id)
    statement = statement.order_by(CoverageGap.gap_start.asc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def list_raw_payloads(
    session: Session,
    job_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[RawApiPayload]:
    statement = select(RawApiPayload)
    if job_id:
        statement = statement.where(RawApiPayload.job_id == job_id)
    statement = statement.order_by(RawApiPayload.requested_at.desc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def run_job(session: Session, job_id: str, resume: bool = False, actor: str = "system") -> JobRun:
    job = session.get(ExtractionJob, job_id)
    if job is None:
        raise KeyError(f"Job not found: {job_id}")

    latest_run = session.exec(
        select(JobRun).where(JobRun.job_id == job_id).order_by(JobRun.started_at.desc())
    ).first()

    run = JobRun(
        job_id=job.id,
        status="running",
        resumed_from_run_id=latest_run.id if resume and latest_run else None,
    )
    job.status = "running"
    job.last_run_started_at = datetime.now(timezone.utc)
    job.updated_at = datetime.now(timezone.utc)
    session.add(job)
    session.add(run)
    session.flush()

    units = _build_units(session, job)
    run.total_units = len(units)
    session.add(run)
    session.flush()

    client = ChartmetricClient()
    summary = defaultdict(int)

    for unit in units:
        if _checkpoint_exists(session, job.id, unit["unit_key"]):
            run.skipped_units += 1
            summary["skipped"] += 1
            continue

        entity = unit["entity"]
        try:
            provider_response, extraction = client.extract_metric(
                unit["metric_name"],
                unit["chartmetric_id"],
                unit["period_label"],
                unit["start_date"],
                unit["end_date"],
            )
            raw_payload = RawApiPayload(
                provider="chartmetric",
                endpoint=provider_response.endpoint,
                request_method="GET",
                request_params=provider_response.params,
                request_context={
                    "period_label": unit["period_label"],
                    "entity_name": unit["entity_name"],
                    "metric_name": unit["metric_name"],
                },
                entity_type=unit["entity_type"],
                entity_id=entity.id,
                chartmetric_entity_id=unit["chartmetric_id"],
                job_id=job.id,
                job_run_id=run.id,
                status_code=provider_response.status_code,
                attempt_count=provider_response.attempts,
                requested_at=provider_response.requested_at,
                received_at=provider_response.received_at,
                response_json=provider_response.payload,
                response_text=provider_response.response_text,
                response_hash=provider_response.payload_hash,
                error_classification=provider_response.error_classification,
                normalized_note=extraction.normalization_note,
            )
            session.add(raw_payload)
            session.flush()

            _store_observations(session, job, run, unit, raw_payload.id, extraction.observations)
            _store_limitations(session, job, run, unit, extraction.limitations)
            _replace_coverage_gaps(session, job, run, unit, extraction.observations)
            _upsert_checkpoint(session, job, run, unit)

            run.completed_units += 1
            summary["completed"] += 1
            summary["observations"] += len(extraction.observations)
            summary["limitations"] += len(extraction.limitations)
        except ChartmetricRequestError as exc:
            run.failed_units += 1
            summary["failed"] += 1
            session.add(
                JobFailure(
                    job_id=job.id,
                    job_run_id=run.id,
                    unit_key=unit["unit_key"],
                    error_type="chartmetric_request_error",
                    error_message=str(exc),
                    retryable=exc.retryable,
                )
            )
        except Exception as exc:  # pragma: no cover - defensive guard
            run.failed_units += 1
            summary["failed"] += 1
            session.add(
                JobFailure(
                    job_id=job.id,
                    job_run_id=run.id,
                    unit_key=unit["unit_key"],
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                    retryable=False,
                )
            )

        session.add(run)
        session.flush()

    run.status = "completed_with_errors" if run.failed_units else "completed"
    run.finished_at = datetime.now(timezone.utc)
    run.summary = dict(summary)
    job.status = run.status
    job.last_run_finished_at = run.finished_at
    job.updated_at = datetime.now(timezone.utc)
    session.add(job)
    session.add(run)
    session.add(
        AuditLog(
            category="jobs",
            action="run_job",
            actor=actor,
            job_id=job.id,
            job_run_id=run.id,
            details=dict(summary),
        )
    )
    return run


def retry_failed_units(session: Session, job_id: str, actor: str = "system") -> JobRun:
    """Re-run only the units that failed in the latest run by clearing their checkpoints."""
    job = session.get(ExtractionJob, job_id)
    if job is None:
        raise KeyError(f"Job not found: {job_id}")

    latest_run = session.exec(
        select(JobRun).where(JobRun.job_id == job_id).order_by(JobRun.started_at.desc())
    ).first()
    if latest_run is None:
        raise KeyError("No previous run exists to retry.")

    # Delete checkpoints for failed units so they get re-processed
    failed_keys = [
        f.unit_key
        for f in session.exec(
            select(JobFailure).where(
                JobFailure.job_id == job_id,
                JobFailure.job_run_id == latest_run.id,
                JobFailure.retryable == True,  # noqa: E712
            )
        )
    ]
    if not failed_keys:
        raise KeyError("No retryable failures found in the latest run.")

    for key in failed_keys:
        session.exec(
            delete(JobCheckpoint).where(
                JobCheckpoint.job_id == job_id,
                JobCheckpoint.unit_key == key,
            )
        )

    session.add(
        AuditLog(
            category="jobs",
            action="retry_failed_units",
            actor=actor,
            job_id=job.id,
            details={"retryable_unit_count": len(failed_keys)},
        )
    )

    return run_job(session, job_id, resume=True, actor=actor)


def _validate_job_payload(payload: dict[str, Any]) -> None:
    if not payload.get("periods"):
        raise ValueError("At least one period definition is required.")
    if not payload.get("variable_names"):
        raise ValueError("At least one variable is required.")
    for variable_name in payload["variable_names"]:
        if variable_name not in METRICS:
            raise ValueError(f"Unsupported variable: {variable_name}")


def _build_units(session: Session, job: ExtractionJob) -> list[dict[str, Any]]:
    scope = job.entity_scope or {}
    artist_ids = set(scope.get("artist_ids", []))
    track_ids = set(scope.get("track_ids", []))
    artist_statuses = set(scope.get("artist_statuses", ["verified", "pending"]))
    track_statuses = set(scope.get("track_statuses", ["verified", "pending"]))
    include_tracks = bool(scope.get("include_tracks", True))

    artist_statement = select(Artist)
    if artist_statuses:
        artist_statement = artist_statement.where(Artist.status.in_(artist_statuses))
    artists = list(session.exec(artist_statement))

    track_statement = select(Track)
    if track_statuses:
        track_statement = track_statement.where(Track.status.in_(track_statuses))
    tracks = list(session.exec(track_statement))

    if artist_ids:
        artists = [artist for artist in artists if artist.id in artist_ids]
    if track_ids:
        tracks = [track for track in tracks if track.id in track_ids]
    if not include_tracks:
        tracks = []

    units: list[dict[str, Any]] = []
    for metric_name in job.variable_names:
        metric = get_metric_definition(metric_name)
        entities = artists if metric.entity_type == "artist" else tracks
        for period in job.period_definitions:
            start_date = _coerce_date(period["start_date"])
            end_date = _coerce_date(period["end_date"])
            for entity in entities:
                chartmetric_id = (
                    entity.chartmetric_artist_id if metric.entity_type == "artist" else entity.chartmetric_track_id
                )
                if chartmetric_id is None:
                    continue
                entity_name = entity.artist_name if metric.entity_type == "artist" else entity.track_name
                units.append(
                    {
                        "unit_key": f"{metric_name}:{chartmetric_id}:{period['label']}",
                        "metric_name": metric_name,
                        "metric": metric,
                        "entity": entity,
                        "entity_type": metric.entity_type,
                        "entity_name": entity_name,
                        "chartmetric_id": chartmetric_id,
                        "period_label": period["label"],
                        "start_date": start_date,
                        "end_date": end_date,
                    }
                )
    return units


def _coerce_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value))


def _checkpoint_exists(session: Session, job_id: str, unit_key: str) -> bool:
    statement = select(JobCheckpoint).where(
        JobCheckpoint.job_id == job_id,
        JobCheckpoint.unit_key == unit_key,
        JobCheckpoint.status == "completed",
    )
    return session.exec(statement).first() is not None


def _upsert_checkpoint(session: Session, job: ExtractionJob, run: JobRun, unit: dict[str, Any]) -> None:
    statement = select(JobCheckpoint).where(
        JobCheckpoint.job_id == job.id,
        JobCheckpoint.unit_key == unit["unit_key"],
    )
    checkpoint = session.exec(statement).first()
    if checkpoint is None:
        checkpoint = JobCheckpoint(
            job_id=job.id,
            job_run_id=run.id,
            unit_key=unit["unit_key"],
            status="completed",
            entity_type=unit["entity_type"],
            entity_id=unit["entity"].id,
            chartmetric_entity_id=unit["chartmetric_id"],
            variable_name=unit["metric_name"],
            platform=unit["metric"].platform,
            period_label=unit["period_label"],
            checkpoint_data={
                "start_date": unit["start_date"].isoformat(),
                "end_date": unit["end_date"].isoformat(),
            },
        )
    else:
        checkpoint.job_run_id = run.id
        checkpoint.status = "completed"
        checkpoint.updated_at = datetime.now(timezone.utc)
    session.add(checkpoint)


def _store_observations(
    session: Session,
    job: ExtractionJob,
    run: JobRun,
    unit: dict[str, Any],
    raw_payload_id: str,
    observations: list[Any],
) -> None:
    for observation in observations:
        statement = select(NormalizedMetricObservation).where(
            NormalizedMetricObservation.provider == "chartmetric",
            NormalizedMetricObservation.entity_type == unit["entity_type"],
            NormalizedMetricObservation.chartmetric_entity_id == unit["chartmetric_id"],
            NormalizedMetricObservation.observation_date == observation.observation_date,
            NormalizedMetricObservation.platform == unit["metric"].platform,
            NormalizedMetricObservation.geo_scope == observation.geo_scope,
            NormalizedMetricObservation.geo_label == observation.geo_label,
            NormalizedMetricObservation.variable_name == observation.variable_name,
            NormalizedMetricObservation.source_endpoint == unit["metric"].endpoint_template,
            NormalizedMetricObservation.source_field == observation.source_field,
        )
        existing = session.exec(statement).first()
        if existing is None:
            existing = NormalizedMetricObservation(
                provider="chartmetric",
                job_id=job.id,
                job_run_id=run.id,
                raw_payload_id=raw_payload_id,
                entity_type=unit["entity_type"],
                entity_id=unit["entity"].id,
                chartmetric_entity_id=unit["chartmetric_id"],
                entity_name=unit["entity_name"],
                observation_date=observation.observation_date,
                period_label=unit["period_label"],
                platform=unit["metric"].platform,
                geo_scope=observation.geo_scope,
                geo_label=observation.geo_label,
                variable_name=observation.variable_name,
                variable_value=observation.value,
                unit=observation.unit,
                source_endpoint=unit["metric"].endpoint_template,
                source_field=observation.source_field,
                aggregation_rule=observation.aggregation_rule,
                is_fallback=observation.is_fallback,
                fallback_source=observation.fallback_source,
                provenance_note=observation.provenance_note,
            )
        else:
            existing.job_run_id = run.id
            existing.raw_payload_id = raw_payload_id
            existing.variable_value = observation.value
            existing.extraction_timestamp = datetime.now(timezone.utc)
            existing.is_fallback = observation.is_fallback
            existing.fallback_source = observation.fallback_source
            existing.provenance_note = observation.provenance_note
        session.add(existing)


def _store_limitations(
    session: Session,
    job: ExtractionJob,
    run: JobRun,
    unit: dict[str, Any],
    limitations: list[Any],
) -> None:
    for limitation in limitations:
        session.add(
            LimitationFlag(
                job_id=job.id,
                job_run_id=run.id,
                entity_type=unit["entity_type"],
                entity_id=unit["entity"].id,
                chartmetric_entity_id=unit["chartmetric_id"],
                variable_name=limitation.variable_name,
                platform=limitation.platform,
                period_label=unit["period_label"],
                geo_scope=limitation.geo_scope,
                limitation_code=limitation.code,
                description=limitation.description,
                fallback_applied=limitation.fallback_applied,
                details=limitation.details,
            )
        )


def _replace_coverage_gaps(
    session: Session,
    job: ExtractionJob,
    run: JobRun,
    unit: dict[str, Any],
    observations: list[Any],
) -> None:
    session.exec(
        delete(CoverageGap).where(
            CoverageGap.job_id == job.id,
            CoverageGap.entity_id == unit["entity"].id,
            CoverageGap.variable_name == unit["metric_name"],
            CoverageGap.platform == unit["metric"].platform,
            CoverageGap.period_label == unit["period_label"],
        )
    )
    observed_dates = sorted({item.observation_date for item in observations})
    expected_dates = _expected_dates(unit["start_date"], unit["end_date"], job.cadence)
    missing_dates = [expected for expected in expected_dates if expected not in observed_dates]
    step_days = 7 if job.cadence == "weekly" else 1
    for gap_start, gap_end in _collapse_dates(missing_dates, step_days):
        session.add(
            CoverageGap(
                job_id=job.id,
                job_run_id=run.id,
                entity_type=unit["entity_type"],
                entity_id=unit["entity"].id,
                chartmetric_entity_id=unit["chartmetric_id"],
                variable_name=unit["metric_name"],
                platform=unit["metric"].platform,
                period_label=unit["period_label"],
                geo_scope=unit["metric"].geo_scope_default,
                gap_start=gap_start,
                gap_end=gap_end,
                reason="missing_observation_in_expected_window",
                severity="medium",
                details={"period_label": unit["period_label"]},
            )
        )


def _expected_dates(start_date: date, end_date: date, cadence: str) -> list[date]:
    step = timedelta(days=7 if cadence == "weekly" else 1)
    dates: list[date] = []
    current = start_date
    while current <= end_date:
        dates.append(current)
        current += step
    return dates


def _collapse_dates(values: list[date], step_days: int) -> list[tuple[date, date]]:
    if not values:
        return []
    groups: list[tuple[date, date]] = []
    start = values[0]
    previous = values[0]
    for current in values[1:]:
        if current == previous + timedelta(days=step_days):
            previous = current
            continue
        groups.append((start, previous))
        start = current
        previous = current
    groups.append((start, previous))
    return groups
