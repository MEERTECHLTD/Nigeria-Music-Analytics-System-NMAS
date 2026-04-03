from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import select
from sqlalchemy import func

from .config import get_settings
from .database import init_db, session_scope
from .models import (
    Artist,
    AuditLog,
    CoverageGap,
    ExportArtifact,
    ExtractionJob,
    JobCheckpoint,
    JobFailure,
    JobRun,
    LimitationFlag,
    NormalizedMetricObservation,
    RawApiPayload,
    Track,
)
from .schemas import (
    ArtistImportRequest,
    ArtistResponse,
    ArtistUpdateRequest,
    CoverageGapResponse,
    DashboardResponse,
    ExportArtifactResponse,
    ExportRequest,
    ImportResult,
    JobCreateRequest,
    JobResponse,
    JobRunResponse,
    LimitationResponse,
    MethodologyResponse,
    ObservationResponse,
    PaginatedResponse,
    ProviderHealthResponse,
    QuarterlyAggregateResponse,
    RawPayloadResponse,
    TrackImportRequest,
    TrackResponse,
    TrackUpdateRequest,
)
from .services.chartmetric import ChartmetricClient
from .services.entities import (
    import_artists_from_csv,
    import_tracks_from_csv,
    list_artists,
    list_tracks,
    update_artist,
    update_track,
)
from .services.exports import generate_export_bundle, list_export_artifacts, sync_methodology_entries
from .services.jobs import (
    create_job,
    list_coverage_gaps,
    list_jobs,
    list_job_runs,
    list_limitations,
    list_observations,
    list_raw_payloads,
    retry_failed_units,
    run_job,
)
from .services.quarterly import compute_quarterly_aggregates, default_periods


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        with session_scope() as session:
            sync_methodology_entries(session)
        yield

    app = FastAPI(
        title="NMAS NBS Delivery Platform",
        version="2.0.0",
        description="Chartmetric-first extraction and reporting platform for NBS delivery.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health ──────────────────────────────────────────────

    @app.get("/")
    def root() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "NMAS NBS Delivery Platform",
            "version": "2.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "status": "healthy",
            "provider": "chartmetric",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # ── Reference data ──────────────────────────────────────

    @app.get("/api/v1/reference-periods/defaults")
    def reference_period_defaults() -> list[dict[str, object]]:
        return default_periods()

    # ── Admin ───────────────────────────────────────────────

    @app.get("/api/v1/admin/provider-health", response_model=ProviderHealthResponse)
    def provider_health() -> ProviderHealthResponse:
        return ProviderHealthResponse(**ChartmetricClient().provider_health())

    @app.get("/api/v1/admin/dashboard", response_model=DashboardResponse)
    def admin_dashboard() -> DashboardResponse:
        with session_scope() as session:
            last_exports = [
                ExportArtifactResponse.model_validate(artifact)
                for artifact in list_export_artifacts(session)[:5]
            ]
            return DashboardResponse(
                provider=ProviderHealthResponse(**ChartmetricClient().provider_health()),
                artists_total=_count(session, Artist),
                tracks_total=_count(session, Track),
                jobs_total=len(list_jobs(session)),
                active_job_runs=_count_running_runs(session),
                observations_total=_count(session, NormalizedMetricObservation),
                coverage_gaps_total=_count(session, CoverageGap),
                limitations_total=_count(session, LimitationFlag),
                last_exports=last_exports,
            )

    @app.get("/api/v1/admin/audit-logs")
    def get_audit_logs(
        limit: int = Query(default=100, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> PaginatedResponse:
        with session_scope() as session:
            total = int(session.exec(select(func.count()).select_from(AuditLog)).one())
            items = list(
                session.exec(
                    select(AuditLog)
                    .order_by(AuditLog.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            return PaginatedResponse(
                total=total,
                limit=limit,
                offset=offset,
                items=[
                    {
                        "id": log.id,
                        "category": log.category,
                        "action": log.action,
                        "actor": log.actor,
                        "entity_type": log.entity_type,
                        "entity_id": log.entity_id,
                        "job_id": log.job_id,
                        "details": log.details,
                        "created_at": log.created_at.isoformat(),
                    }
                    for log in items
                ],
            )

    # ── Entity Universe: Artists ────────────────────────────

    @app.get("/api/v1/entities/artists", response_model=list[ArtistResponse])
    def get_artists(
        status: str | None = None,
        limit: int = Query(default=200, le=1000),
        offset: int = Query(default=0, ge=0),
    ) -> list[ArtistResponse]:
        with session_scope() as session:
            artists = list_artists(session, status=status, limit=limit, offset=offset)
            return [ArtistResponse.model_validate(item) for item in artists]

    @app.post("/api/v1/entities/artists/import", response_model=ImportResult)
    def import_artists(request: ArtistImportRequest) -> ImportResult:
        with session_scope() as session:
            result = import_artists_from_csv(session, request.csv_text, request.actor)
            return ImportResult(**result)

    @app.patch("/api/v1/entities/artists/{artist_id}", response_model=ArtistResponse)
    def patch_artist(artist_id: str, request: ArtistUpdateRequest) -> ArtistResponse:
        with session_scope() as session:
            try:
                artist = update_artist(session, artist_id, request.model_dump(exclude_none=True))
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            return ArtistResponse.model_validate(artist)

    @app.get("/api/v1/entities/artists/{artist_id}", response_model=ArtistResponse)
    def get_artist(artist_id: str) -> ArtistResponse:
        with session_scope() as session:
            artist = session.get(Artist, artist_id)
            if artist is None:
                raise HTTPException(status_code=404, detail=f"Artist not found: {artist_id}")
            return ArtistResponse.model_validate(artist)

    # ── Entity Universe: Tracks ─────────────────────────────

    @app.get("/api/v1/entities/tracks", response_model=list[TrackResponse])
    def get_tracks(
        status: str | None = None,
        limit: int = Query(default=200, le=1000),
        offset: int = Query(default=0, ge=0),
    ) -> list[TrackResponse]:
        with session_scope() as session:
            tracks = list_tracks(session, status=status, limit=limit, offset=offset)
            return [TrackResponse.model_validate(item) for item in tracks]

    @app.post("/api/v1/entities/tracks/import", response_model=ImportResult)
    def import_tracks(request: TrackImportRequest) -> ImportResult:
        with session_scope() as session:
            result = import_tracks_from_csv(session, request.csv_text, request.actor)
            return ImportResult(**result)

    @app.patch("/api/v1/entities/tracks/{track_id}", response_model=TrackResponse)
    def patch_track(track_id: str, request: TrackUpdateRequest) -> TrackResponse:
        with session_scope() as session:
            try:
                track = update_track(session, track_id, request.model_dump(exclude_none=True))
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            return TrackResponse.model_validate(track)

    @app.get("/api/v1/entities/tracks/{track_id}", response_model=TrackResponse)
    def get_track(track_id: str) -> TrackResponse:
        with session_scope() as session:
            track = session.get(Track, track_id)
            if track is None:
                raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
            return TrackResponse.model_validate(track)

    # ── Methodology ─────────────────────────────────────────

    @app.get("/api/v1/methodology", response_model=list[MethodologyResponse])
    def get_methodology() -> list[MethodologyResponse]:
        with session_scope() as session:
            sync_methodology_entries(session)
            from .models import MethodologyEntry

            entries = list(session.exec(select(MethodologyEntry).order_by(MethodologyEntry.variable_name.asc())))
            return [MethodologyResponse.model_validate(entry) for entry in entries]

    # ── Jobs ────────────────────────────────────────────────

    @app.get("/api/v1/jobs", response_model=list[JobResponse])
    def get_jobs() -> list[JobResponse]:
        with session_scope() as session:
            return [JobResponse.model_validate(item) for item in list_jobs(session)]

    @app.post("/api/v1/jobs", response_model=JobResponse)
    def post_job(request: JobCreateRequest) -> JobResponse:
        with session_scope() as session:
            try:
                job = create_job(
                    session,
                    {
                        "name": request.name,
                        "provider": request.provider,
                        "cadence": request.cadence,
                        "periods": [period.model_dump(mode="json") for period in request.periods],
                        "variable_names": request.variable_names,
                        "platform_names": request.platform_names,
                        "entity_scope": request.entity_scope.model_dump(),
                        "configuration": request.configuration,
                    },
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            return JobResponse.model_validate(job)

    @app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
    def get_job(job_id: str) -> JobResponse:
        with session_scope() as session:
            job = session.get(ExtractionJob, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
            return JobResponse.model_validate(job)

    @app.get("/api/v1/jobs/{job_id}/runs", response_model=list[JobRunResponse])
    def get_job_runs(job_id: str) -> list[JobRunResponse]:
        with session_scope() as session:
            return [JobRunResponse.model_validate(item) for item in list_job_runs(session, job_id)]

    @app.post("/api/v1/jobs/{job_id}/run", response_model=JobRunResponse)
    def post_job_run(job_id: str) -> JobRunResponse:
        with session_scope() as session:
            try:
                run = run_job(session, job_id, resume=False)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            return JobRunResponse.model_validate(run)

    @app.post("/api/v1/jobs/{job_id}/resume", response_model=JobRunResponse)
    def post_job_resume(job_id: str) -> JobRunResponse:
        with session_scope() as session:
            try:
                run = run_job(session, job_id, resume=True)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            return JobRunResponse.model_validate(run)

    @app.post("/api/v1/jobs/{job_id}/retry-failed", response_model=JobRunResponse)
    def post_retry_failed(job_id: str) -> JobRunResponse:
        with session_scope() as session:
            try:
                run = retry_failed_units(session, job_id)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            return JobRunResponse.model_validate(run)

    @app.post("/api/v1/jobs/{job_id}/pause")
    def pause_job(job_id: str) -> dict[str, str]:
        with session_scope() as session:
            job = session.get(ExtractionJob, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
            if job.status != "running":
                raise HTTPException(status_code=400, detail="Job is not currently running.")
            job.status = "paused"
            job.updated_at = datetime.now(timezone.utc)
            session.add(job)
            session.add(
                AuditLog(
                    category="jobs",
                    action="pause_job",
                    actor="admin",
                    job_id=job.id,
                )
            )
            return {"status": "paused", "job_id": job_id}

    # ── Job failures ────────────────────────────────────────

    @app.get("/api/v1/jobs/{job_id}/failures")
    def get_job_failures(job_id: str) -> list[dict[str, object]]:
        with session_scope() as session:
            failures = list(
                session.exec(
                    select(JobFailure)
                    .where(JobFailure.job_id == job_id)
                    .order_by(JobFailure.created_at.desc())
                )
            )
            return [
                {
                    "id": f.id,
                    "unit_key": f.unit_key,
                    "error_type": f.error_type,
                    "error_message": f.error_message,
                    "retryable": f.retryable,
                    "attempt_count": f.attempt_count,
                    "created_at": f.created_at.isoformat(),
                }
                for f in failures
            ]

    # ── Observations ────────────────────────────────────────

    @app.get("/api/v1/observations", response_model=list[ObservationResponse])
    def get_observations(
        job_id: str | None = None,
        variable_name: str | None = None,
        limit: int = Query(default=500, le=5000),
        offset: int = Query(default=0, ge=0),
    ) -> list[ObservationResponse]:
        with session_scope() as session:
            return [
                ObservationResponse.model_validate(item)
                for item in list_observations(session, job_id, variable_name=variable_name, limit=limit, offset=offset)
            ]

    # ── Coverage & Limitations ──────────────────────────────

    @app.get("/api/v1/coverage-gaps", response_model=list[CoverageGapResponse])
    def get_coverage_gaps(
        job_id: str | None = None,
        limit: int = Query(default=500, le=5000),
        offset: int = Query(default=0, ge=0),
    ) -> list[CoverageGapResponse]:
        with session_scope() as session:
            return [
                CoverageGapResponse.model_validate(item)
                for item in list_coverage_gaps(session, job_id, limit=limit, offset=offset)
            ]

    @app.get("/api/v1/limitations", response_model=list[LimitationResponse])
    def get_limitations(
        job_id: str | None = None,
        limit: int = Query(default=500, le=5000),
        offset: int = Query(default=0, ge=0),
    ) -> list[LimitationResponse]:
        with session_scope() as session:
            return [
                LimitationResponse.model_validate(item)
                for item in list_limitations(session, job_id, limit=limit, offset=offset)
            ]

    # ── Raw Payloads ────────────────────────────────────────

    @app.get("/api/v1/raw-payloads", response_model=list[RawPayloadResponse])
    def get_raw_payloads(
        job_id: str | None = None,
        limit: int = Query(default=100, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> list[RawPayloadResponse]:
        with session_scope() as session:
            return [
                RawPayloadResponse.model_validate(item)
                for item in list_raw_payloads(session, job_id, limit=limit, offset=offset)
            ]

    @app.get("/api/v1/raw-payloads/{payload_id}")
    def get_raw_payload_detail(payload_id: str) -> dict[str, object]:
        with session_scope() as session:
            payload = session.get(RawApiPayload, payload_id)
            if payload is None:
                raise HTTPException(status_code=404, detail=f"Payload not found: {payload_id}")
            return {
                "id": payload.id,
                "provider": payload.provider,
                "endpoint": payload.endpoint,
                "request_params": payload.request_params,
                "request_context": payload.request_context,
                "status_code": payload.status_code,
                "attempt_count": payload.attempt_count,
                "requested_at": payload.requested_at.isoformat(),
                "received_at": payload.received_at.isoformat() if payload.received_at else None,
                "response_json": payload.response_json,
                "response_hash": payload.response_hash,
                "error_classification": payload.error_classification,
            }

    # ── Quarterly Reporting ─────────────────────────────────

    @app.get("/api/v1/reports/quarterly", response_model=list[QuarterlyAggregateResponse])
    def quarterly_report(job_id: str) -> list[QuarterlyAggregateResponse]:
        with session_scope() as session:
            return [QuarterlyAggregateResponse(**row) for row in compute_quarterly_aggregates(session, job_id)]

    # ── Exports ─────────────────────────────────────────────

    @app.post("/api/v1/exports", response_model=list[ExportArtifactResponse])
    def post_exports(request: ExportRequest) -> list[ExportArtifactResponse]:
        with session_scope() as session:
            try:
                artifacts = generate_export_bundle(session, request.job_id, request.actor)
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            return [ExportArtifactResponse.model_validate(item) for item in artifacts]

    @app.get("/api/v1/exports", response_model=list[ExportArtifactResponse])
    def get_exports() -> list[ExportArtifactResponse]:
        with session_scope() as session:
            return [ExportArtifactResponse.model_validate(item) for item in list_export_artifacts(session)]

    @app.get("/api/v1/exports/{artifact_id}/download")
    def download_export(artifact_id: str) -> FileResponse:
        with session_scope() as session:
            artifact = session.get(ExportArtifact, artifact_id)
            if artifact is None:
                raise HTTPException(status_code=404, detail=f"Artifact not found: {artifact_id}")
            path = Path(artifact.file_path)
            if not path.exists():
                raise HTTPException(status_code=404, detail="Export file no longer exists on disk.")
            return FileResponse(
                path=str(path),
                filename=path.name,
                media_type="application/octet-stream",
            )

    return app


def _count(session, model) -> int:
    statement = select(func.count()).select_from(model)
    return int(session.exec(statement).one())


def _count_running_runs(session) -> int:
    statement = (
        select(func.count())
        .select_from(JobRun)
        .where(JobRun.status == "running")
    )
    return int(session.exec(statement).one())
