from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PeriodDefinition(BaseModel):
    label: str
    start_date: date
    end_date: date


class EntityScopeInput(BaseModel):
    artist_ids: list[str] = Field(default_factory=list)
    track_ids: list[str] = Field(default_factory=list)
    artist_statuses: list[str] = Field(default_factory=lambda: ["verified", "pending"])
    track_statuses: list[str] = Field(default_factory=lambda: ["verified", "pending"])
    include_tracks: bool = True


class ArtistImportRequest(BaseModel):
    csv_text: str
    actor: str = "system"


class TrackImportRequest(BaseModel):
    csv_text: str
    actor: str = "system"


class ArtistUpdateRequest(BaseModel):
    artist_name: str | None = None
    chartmetric_artist_id: int | None = None
    country: str | None = None
    genres: str | None = None
    label: str | None = None
    spotify_id: str | None = None
    youtube_id: str | None = None
    status: str | None = None
    notes: str | None = None


class TrackUpdateRequest(BaseModel):
    track_name: str | None = None
    chartmetric_track_id: int | None = None
    primary_artist_name: str | None = None
    isrc: str | None = None
    spotify_id: str | None = None
    youtube_id: str | None = None
    status: str | None = None
    notes: str | None = None


class ImportResult(BaseModel):
    created: int
    updated: int
    linked: int = 0
    warnings: list[str] = Field(default_factory=list)


class ArtistResponse(ORMModel):
    id: str
    chartmetric_artist_id: int | None
    artist_name: str
    country: str
    genres: str | None
    label: str | None
    spotify_id: str | None
    youtube_id: str | None
    status: str
    notes: str | None
    updated_at: datetime


class TrackResponse(ORMModel):
    id: str
    chartmetric_track_id: int | None
    track_name: str
    primary_artist_name: str | None
    isrc: str | None
    spotify_id: str | None
    youtube_id: str | None
    status: str
    notes: str | None
    updated_at: datetime


class JobCreateRequest(BaseModel):
    name: str
    provider: str = "chartmetric"
    cadence: str = "daily"
    periods: list[PeriodDefinition]
    variable_names: list[str]
    platform_names: list[str] = Field(default_factory=list)
    entity_scope: EntityScopeInput = Field(default_factory=EntityScopeInput)
    configuration: dict[str, Any] = Field(default_factory=dict)


class JobResponse(ORMModel):
    id: str
    name: str
    provider: str
    status: str
    cadence: str
    period_definitions: list[dict[str, Any]]
    variable_names: list[str]
    platform_names: list[str]
    entity_scope: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    last_run_started_at: datetime | None
    last_run_finished_at: datetime | None


class JobRunResponse(ORMModel):
    id: str
    job_id: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    total_units: int
    completed_units: int
    skipped_units: int
    failed_units: int
    summary: dict[str, Any]


class ObservationResponse(ORMModel):
    id: str
    entity_type: str
    entity_name: str
    chartmetric_entity_id: int | None
    observation_date: date
    period_label: str
    platform: str
    geo_scope: str
    geo_label: str
    variable_name: str
    variable_value: float
    unit: str
    source_endpoint: str
    source_field: str
    extraction_timestamp: datetime
    is_fallback: bool


class MethodologyResponse(ORMModel):
    variable_name: str
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
    methodology_status: str


class LimitationResponse(ORMModel):
    variable_name: str
    platform: str
    period_label: str
    geo_scope: str
    limitation_code: str
    description: str
    fallback_applied: bool
    details: dict[str, Any]
    created_at: datetime


class CoverageGapResponse(ORMModel):
    variable_name: str
    platform: str
    period_label: str
    geo_scope: str
    gap_start: date
    gap_end: date
    reason: str
    severity: str
    details: dict[str, Any]
    created_at: datetime


class RawPayloadResponse(ORMModel):
    id: str
    provider: str
    endpoint: str
    status_code: int | None
    attempt_count: int
    requested_at: datetime
    received_at: datetime | None
    entity_type: str | None
    chartmetric_entity_id: int | None
    error_classification: str | None


class ExportRequest(BaseModel):
    job_id: str
    actor: str = "system"


class ExportArtifactResponse(ORMModel):
    id: str
    job_id: str
    job_run_id: str | None
    export_type: str
    format: str
    file_path: str
    sha256: str
    record_count: int
    metadata_json: dict[str, Any]
    created_at: datetime


class QuarterlyAggregateResponse(BaseModel):
    entity_type: str
    entity_name: str
    chartmetric_entity_id: int | None
    variable_name: str
    platform: str
    geo_scope: str
    geo_label: str
    period_label: str
    aggregation_rule: str
    aggregated_value: float
    unit: str
    qoq_change: float | None = None
    yoy_change: float | None = None


class ProviderHealthResponse(BaseModel):
    provider: str
    base_url: str
    auth_mode: str
    access_token_configured: bool
    refresh_token_configured: bool
    throttle_seconds: float
    max_retries: int


class PaginatedResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[dict[str, Any]]


class DashboardResponse(BaseModel):
    provider: ProviderHealthResponse
    artists_total: int
    tracks_total: int
    jobs_total: int
    active_job_runs: int
    observations_total: int
    coverage_gaps_total: int
    limitations_total: int
    last_exports: list[ExportArtifactResponse]
