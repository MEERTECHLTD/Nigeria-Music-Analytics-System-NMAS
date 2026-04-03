from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Column, JSON, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class Artist(SQLModel, table=True):
    __tablename__ = "artists"
    __table_args__ = (UniqueConstraint("chartmetric_artist_id", name="uq_artist_chartmetric_id"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    chartmetric_artist_id: int | None = Field(default=None, index=True)
    artist_name: str = Field(index=True)
    country: str = Field(default="NG", index=True)
    genres: str | None = None
    label: str | None = None
    spotify_id: str | None = None
    youtube_id: str | None = None
    status: str = Field(default="pending", index=True)
    notes: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Track(SQLModel, table=True):
    __tablename__ = "tracks"
    __table_args__ = (UniqueConstraint("chartmetric_track_id", name="uq_track_chartmetric_id"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    chartmetric_track_id: int | None = Field(default=None, index=True)
    track_name: str = Field(index=True)
    primary_artist_name: str | None = None
    isrc: str | None = None
    spotify_id: str | None = None
    youtube_id: str | None = None
    status: str = Field(default="pending", index=True)
    notes: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ArtistTrackLink(SQLModel, table=True):
    __tablename__ = "artist_track_links"
    __table_args__ = (
        UniqueConstraint("artist_id", "track_id", "link_type", name="uq_artist_track_link"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    artist_id: str = Field(index=True, foreign_key="artists.id")
    track_id: str = Field(index=True, foreign_key="tracks.id")
    link_type: str = Field(default="primary")
    is_top_track: bool = Field(default=False)
    status: str = Field(default="verified")
    created_at: datetime = Field(default_factory=utc_now)


class PlatformAccount(SQLModel, table=True):
    __tablename__ = "platform_accounts"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "platform", "external_id", name="uq_platform_account"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    entity_type: str = Field(index=True)
    entity_id: str = Field(index=True)
    platform: str = Field(index=True)
    external_id: str = Field(index=True)
    handle: str | None = None
    url: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class EntityResolutionOverride(SQLModel, table=True):
    __tablename__ = "entity_resolution_overrides"

    id: str = Field(default_factory=new_id, primary_key=True)
    entity_type: str = Field(index=True)
    entity_id: str = Field(index=True)
    field_name: str = Field(index=True)
    override_value: str
    reason: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)


class RawApiPayload(SQLModel, table=True):
    __tablename__ = "raw_api_payloads"

    id: str = Field(default_factory=new_id, primary_key=True)
    provider: str = Field(index=True)
    endpoint: str
    request_method: str = Field(default="GET")
    request_params: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    request_context: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    entity_type: str | None = Field(default=None, index=True)
    entity_id: str | None = Field(default=None, index=True)
    chartmetric_entity_id: int | None = Field(default=None, index=True)
    job_id: str | None = Field(default=None, index=True, foreign_key="extraction_jobs.id")
    job_run_id: str | None = Field(default=None, index=True, foreign_key="job_runs.id")
    status_code: int | None = None
    attempt_count: int = 1
    requested_at: datetime = Field(default_factory=utc_now)
    received_at: datetime | None = None
    response_json: dict[str, Any] | list[Any] | None = Field(default=None, sa_column=Column(JSON))
    response_text: str | None = Field(default=None, sa_column=Column(Text))
    response_hash: str | None = None
    error_classification: str | None = None
    normalized_note: str | None = None


class ExtractionJob(SQLModel, table=True):
    __tablename__ = "extraction_jobs"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str = Field(index=True)
    provider: str = Field(default="chartmetric", index=True)
    status: str = Field(default="draft", index=True)
    cadence: str = Field(default="daily")
    period_definitions: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    entity_scope: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    variable_names: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    platform_names: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    configuration: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_run_started_at: datetime | None = None
    last_run_finished_at: datetime | None = None


class JobRun(SQLModel, table=True):
    __tablename__ = "job_runs"

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    status: str = Field(default="running", index=True)
    started_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None
    total_units: int = 0
    completed_units: int = 0
    skipped_units: int = 0
    failed_units: int = 0
    notes: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    resumed_from_run_id: str | None = Field(default=None, index=True)


class JobCheckpoint(SQLModel, table=True):
    __tablename__ = "job_checkpoints"
    __table_args__ = (UniqueConstraint("job_id", "unit_key", name="uq_job_checkpoint_unit"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    job_run_id: str = Field(index=True, foreign_key="job_runs.id")
    unit_key: str = Field(index=True)
    status: str = Field(default="completed", index=True)
    entity_type: str = Field(index=True)
    entity_id: str | None = Field(default=None, index=True)
    chartmetric_entity_id: int | None = Field(default=None, index=True)
    variable_name: str = Field(index=True)
    platform: str = Field(index=True)
    period_label: str = Field(index=True)
    checkpoint_data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class JobFailure(SQLModel, table=True):
    __tablename__ = "job_failures"

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    job_run_id: str = Field(index=True, foreign_key="job_runs.id")
    unit_key: str = Field(index=True)
    error_type: str
    error_message: str
    retryable: bool = False
    attempt_count: int = 1
    raw_payload_id: str | None = Field(default=None, foreign_key="raw_api_payloads.id")
    created_at: datetime = Field(default_factory=utc_now)


class NormalizedMetricObservation(SQLModel, table=True):
    __tablename__ = "normalized_metric_observations"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "entity_type",
            "chartmetric_entity_id",
            "observation_date",
            "platform",
            "geo_scope",
            "geo_label",
            "variable_name",
            "source_endpoint",
            "source_field",
            name="uq_normalized_observation",
        ),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    provider: str = Field(default="chartmetric", index=True)
    job_id: str | None = Field(default=None, index=True, foreign_key="extraction_jobs.id")
    job_run_id: str | None = Field(default=None, index=True, foreign_key="job_runs.id")
    raw_payload_id: str | None = Field(default=None, foreign_key="raw_api_payloads.id")
    entity_type: str = Field(index=True)
    entity_id: str | None = Field(default=None, index=True)
    chartmetric_entity_id: int | None = Field(default=None, index=True)
    entity_name: str
    observation_date: date = Field(index=True)
    period_label: str = Field(index=True)
    platform: str = Field(index=True)
    geo_scope: str = Field(index=True)
    geo_label: str = Field(default="", index=True)
    variable_name: str = Field(index=True)
    variable_value: float
    unit: str
    source_endpoint: str
    source_field: str
    extraction_timestamp: datetime = Field(default_factory=utc_now)
    aggregation_rule: str
    is_fallback: bool = False
    fallback_source: str | None = None
    provenance_note: str | None = None


class CoverageGap(SQLModel, table=True):
    __tablename__ = "coverage_gaps"

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    job_run_id: str = Field(index=True, foreign_key="job_runs.id")
    entity_type: str = Field(index=True)
    entity_id: str | None = Field(default=None, index=True)
    chartmetric_entity_id: int | None = Field(default=None, index=True)
    variable_name: str = Field(index=True)
    platform: str = Field(index=True)
    period_label: str = Field(index=True)
    geo_scope: str = Field(index=True)
    gap_start: date = Field(index=True)
    gap_end: date = Field(index=True)
    reason: str
    severity: str = Field(default="medium")
    details: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class LimitationFlag(SQLModel, table=True):
    __tablename__ = "limitation_flags"

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    job_run_id: str = Field(index=True, foreign_key="job_runs.id")
    entity_type: str = Field(index=True)
    entity_id: str | None = Field(default=None, index=True)
    chartmetric_entity_id: int | None = Field(default=None, index=True)
    variable_name: str = Field(index=True)
    platform: str = Field(index=True)
    period_label: str = Field(index=True)
    geo_scope: str = Field(default="global", index=True)
    limitation_code: str = Field(index=True)
    description: str
    fallback_applied: bool = False
    details: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class MethodologyEntry(SQLModel, table=True):
    __tablename__ = "methodology_entries"
    __table_args__ = (UniqueConstraint("variable_name", name="uq_methodology_variable_name"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    variable_name: str = Field(index=True)
    source: str
    endpoint: str
    field_name: str
    definition: str
    unit: str
    generation_method: str
    coverage_limitations: str
    geo_limitations: str
    platform_scope: str
    fallback_logic: str
    missing_data_treatment: str
    aggregation_rule: str
    methodology_status: str = Field(default="observed", index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class ExportArtifact(SQLModel, table=True):
    __tablename__ = "export_artifacts"

    id: str = Field(default_factory=new_id, primary_key=True)
    job_id: str = Field(index=True, foreign_key="extraction_jobs.id")
    job_run_id: str | None = Field(default=None, index=True, foreign_key="job_runs.id")
    export_type: str = Field(index=True)
    format: str = Field(index=True)
    file_path: str
    sha256: str
    record_count: int = 0
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: str = Field(default_factory=new_id, primary_key=True)
    category: str = Field(index=True)
    action: str = Field(index=True)
    actor: str = Field(default="system", index=True)
    entity_type: str | None = Field(default=None, index=True)
    entity_id: str | None = Field(default=None, index=True)
    job_id: str | None = Field(default=None, index=True, foreign_key="extraction_jobs.id")
    job_run_id: str | None = Field(default=None, index=True, foreign_key="job_runs.id")
    details: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
