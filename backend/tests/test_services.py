from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from nmas.config import get_settings
from nmas.metrics import METRICS, get_metric_definition
from nmas.models import (
    Artist,
    ArtistTrackLink,
    CoverageGap,
    ExtractionJob,
    JobCheckpoint,
    JobFailure,
    JobRun,
    LimitationFlag,
    MethodologyEntry,
    NormalizedMetricObservation,
    Track,
)
from nmas.services.chartmetric import (
    ChartmetricClient,
    ExtractionResult,
    LimitationNotice,
    NormalizedObservation,
    ProviderResponse,
)
from nmas.services.entities import import_artists_from_csv, import_tracks_from_csv
from nmas.services.exports import generate_export_bundle, sync_methodology_entries
from nmas.services.jobs import create_job, run_job, retry_failed_units
from nmas.services.quarterly import (
    compute_quarterly_aggregates,
    _apply_aggregation,
    _previous_quarter_label,
    _previous_year_label,
)


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


# ── Auth Tests ──────────────────────────────────────────────


def test_chartmetric_static_auth():
    settings = get_settings()
    settings.chartmetric_auth_mode = "static"
    settings.chartmetric_access_token = "test-token"
    client = ChartmetricClient(settings)
    assert client.ensure_access_token() == "test-token"


def test_chartmetric_static_auth_missing_token():
    settings = get_settings()
    settings.chartmetric_auth_mode = "static"
    settings.chartmetric_access_token = None
    client = ChartmetricClient(settings)
    with pytest.raises(RuntimeError, match="CHARTMETRIC_ACCESS_TOKEN"):
        client.ensure_access_token()


def test_chartmetric_refresh_auth(monkeypatch):
    settings = get_settings()
    settings.chartmetric_auth_mode = "refresh"
    settings.chartmetric_refresh_token = "refresh"
    settings.chartmetric_client_id = "client"
    settings.chartmetric_client_secret = "secret"

    class FakeResponse:
        status_code = 200

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {"access_token": "fresh-token"}

    client = ChartmetricClient(settings)
    monkeypatch.setattr(client.session, "post", lambda *args, **kwargs: FakeResponse())
    assert client.ensure_access_token() == "fresh-token"


def test_chartmetric_refresh_sends_correct_key(monkeypatch):
    """Verify the auth payload uses 'refreshtoken' (Chartmetric API key), not 'refresh_token'."""
    settings = get_settings()
    settings.chartmetric_auth_mode = "refresh"
    settings.chartmetric_refresh_token = "my-refresh"
    settings.chartmetric_client_id = None
    settings.chartmetric_client_secret = None

    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {"token": "t"}

    def capture_post(*args, **kwargs):
        captured["json"] = kwargs.get("json")
        return FakeResponse()

    client = ChartmetricClient(settings)
    monkeypatch.setattr(client.session, "post", capture_post)
    client.ensure_access_token()
    assert "refreshtoken" in captured["json"]
    assert "refresh_token" not in captured["json"]


def test_chartmetric_token_caching(monkeypatch):
    """Second call should use cached token within 45-minute window."""
    settings = get_settings()
    settings.chartmetric_auth_mode = "refresh"
    settings.chartmetric_refresh_token = "refresh"

    call_count = 0

    class FakeResponse:
        status_code = 200

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {"token": "cached-token"}

    def counting_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return FakeResponse()

    client = ChartmetricClient(settings)
    monkeypatch.setattr(client.session, "post", counting_post)
    client.ensure_access_token()
    client.ensure_access_token()
    assert call_count == 1


# ── Entity Import Tests ─────────────────────────────────────


def test_entity_import_and_track_linking(session):
    import_artists_from_csv(
        session,
        "artist_name,chartmetric_artist_id,country,status\nBurna Boy,441923,NG,verified",
    )
    import_tracks_from_csv(
        session,
        "track_name,chartmetric_track_id,artist_name,status,is_top_track\nLast Last,58291034,Burna Boy,verified,true",
    )
    session.commit()

    artists = list(session.exec(select(Artist)))
    tracks = list(session.exec(select(Track)))
    links = list(session.exec(select(ArtistTrackLink)))
    assert len(artists) == 1
    assert artists[0].chartmetric_artist_id == 441923
    assert len(tracks) == 1
    assert tracks[0].chartmetric_track_id == 58291034
    assert len(links) == 1
    assert links[0].is_top_track is True


def test_artist_import_upsert(session):
    """Importing the same artist twice should update, not duplicate."""
    csv = "artist_name,chartmetric_artist_id,status\nBurna Boy,441923,pending"
    import_artists_from_csv(session, csv)
    session.commit()
    result = import_artists_from_csv(session, csv.replace("pending", "verified"))
    session.commit()
    assert result["updated"] == 1
    artists = list(session.exec(select(Artist)))
    assert len(artists) == 1
    assert artists[0].status == "verified"


def test_artist_import_missing_name(session):
    result = import_artists_from_csv(session, "artist_name,status\n,pending")
    assert len(result["warnings"]) == 1


# ── Normalization Tests ──────────────────────────────────────


def test_normalization_uses_spotify_fallback_metric():
    client = ChartmetricClient()
    metric = get_metric_definition("Spotify_streams_daily")
    payload = {"data": [{"date": "2024-10-01", "popularity": 88}]}

    result = client._normalize(metric, payload, "Q4_2024")

    assert result.observations[0].variable_name == "Spotify_popularity_daily"
    assert result.observations[0].is_fallback is True
    assert result.limitations[0].code == "fallback_metric_used"


def test_normalization_empty_payload():
    client = ChartmetricClient()
    metric = get_metric_definition("YouTube_views_daily")
    result = client._normalize(metric, None, "Q4_2024")
    assert len(result.observations) == 0
    assert any(lim.code == "no_records" for lim in result.limitations)


def test_normalization_missing_value_field():
    client = ChartmetricClient()
    metric = get_metric_definition("Pandora_streams_daily")
    payload = {"data": [{"date": "2024-10-01", "unrelated_field": 42}]}
    result = client._normalize(metric, payload, "Q4_2024")
    assert len(result.observations) == 0
    assert any(lim.code == "missing_value_field" for lim in result.limitations)


def test_normalization_where_people_listen_filters_nigerian_cities():
    client = ChartmetricClient()
    metric = get_metric_definition("Where_People_Listen")
    payload = {
        "obj": [
            {"city": "Lagos", "country": "NG", "date": "2024-10-01", "listeners_pct": 35.0},
            {"city": "London", "country": "GB", "date": "2024-10-01", "listeners_pct": 10.0},
            {"city": "Abuja", "country": "NG", "date": "2024-10-01", "listeners_pct": 15.0},
        ]
    }
    result = client._normalize_where_people_listen(metric, payload)
    assert len(result.observations) == 2
    cities = {obs.geo_label for obs in result.observations}
    assert cities == {"Lagos", "Abuja"}
    assert all(obs.geo_scope == "nigeria" for obs in result.observations)


def test_normalization_skips_non_numeric_values():
    client = ChartmetricClient()
    metric = get_metric_definition("Spotify_followers_daily")
    payload = {"data": [{"date": "2024-10-01", "followers": "N/A"}]}
    result = client._normalize(metric, payload, "Q4_2024")
    assert len(result.observations) == 0


# ── Date Range Windowing ─────────────────────────────────────


def test_split_date_range_single_window():
    windows = ChartmetricClient._split_date_range(date(2024, 1, 1), date(2024, 3, 31), 365)
    assert len(windows) == 1
    assert windows[0] == (date(2024, 1, 1), date(2024, 3, 31))


def test_split_date_range_multiple_windows():
    windows = ChartmetricClient._split_date_range(date(2023, 1, 1), date(2024, 12, 31), 365)
    assert len(windows) >= 2
    assert windows[0][0] == date(2023, 1, 1)
    assert windows[-1][1] == date(2024, 12, 31)
    # No window exceeds max_days
    for start, end in windows:
        assert (end - start).days < 365


# ── Throttle Tests ───────────────────────────────────────────


def test_request_throttle():
    from nmas.services.chartmetric import RequestThrottle
    import time

    throttle = RequestThrottle(0.05)
    start = time.monotonic()
    throttle.wait()
    throttle.wait()
    elapsed = time.monotonic() - start
    assert elapsed >= 0.04  # at least one throttle interval


# ── Job Tests ────────────────────────────────────────────────


def _make_fake_extract(observations=None, limitations=None):
    def fake_extract_metric(self, metric_name, chartmetric_id, period_label, start_date, end_date):
        obs = observations or [
            NormalizedObservation(
                variable_name="Spotify_monthly_listeners_daily",
                observation_date=date(2024, 10, 1),
                value=10,
                geo_scope="global",
                geo_label="",
                unit="listeners",
                source_field="listeners",
                aggregation_rule="net_change",
            ),
        ]
        provider = ProviderResponse(
            endpoint=f"/api/artist/{chartmetric_id}/stat/spotify",
            params={"since": start_date.isoformat()},
            requested_at=datetime.now(timezone.utc),
            received_at=datetime.now(timezone.utc),
            status_code=200,
            attempts=1,
            payload={"data": []},
            response_text="{}",
        )
        extraction = ExtractionResult(
            requested_metric=metric_name,
            emitted_metric_names={o.variable_name for o in obs},
            endpoint="/api/artist/{chartmetric_id}/stat/spotify",
            platform="Spotify",
            observations=obs,
            limitations=limitations or [],
        )
        return provider, extraction

    return fake_extract_metric


def test_job_creation_validates_variables(session):
    with pytest.raises(ValueError, match="Unsupported variable"):
        create_job(session, {
            "name": "Bad Job",
            "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-12-31"}],
            "variable_names": ["Nonexistent_metric"],
        })


def test_job_creation_requires_periods(session):
    with pytest.raises(ValueError, match="period"):
        create_job(session, {"name": "No Periods", "periods": [], "variable_names": ["YouTube_views_daily"]})


def test_run_job_resume_skips_completed_units(session, monkeypatch):
    artist = Artist(artist_name="Burna Boy", chartmetric_artist_id=441923, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Test Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-03"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    monkeypatch.setattr(ChartmetricClient, "extract_metric", _make_fake_extract())

    first_run = run_job(session, job.id)
    session.commit()
    second_run = run_job(session, job.id, resume=True)
    session.commit()

    assert first_run.completed_units == 1
    assert second_run.skipped_units == 1


def test_run_job_stores_raw_payload(session, monkeypatch):
    artist = Artist(artist_name="Wizkid", chartmetric_artist_id=123456, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Payload Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-03"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    monkeypatch.setattr(ChartmetricClient, "extract_metric", _make_fake_extract())
    run_job(session, job.id)
    session.commit()

    from nmas.models import RawApiPayload
    payloads = list(session.exec(select(RawApiPayload).where(RawApiPayload.job_id == job.id)))
    assert len(payloads) >= 1
    assert payloads[0].provider == "chartmetric"


def test_run_job_handles_failures(session, monkeypatch):
    from nmas.services.chartmetric import ChartmetricRequestError

    artist = Artist(artist_name="Davido", chartmetric_artist_id=789, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Failing Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-03"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    def fail_extract(self, *args, **kwargs):
        raise ChartmetricRequestError("Rate limited", status_code=429, retryable=True)

    monkeypatch.setattr(ChartmetricClient, "extract_metric", fail_extract)
    run = run_job(session, job.id)
    session.commit()

    assert run.failed_units == 1
    assert run.status == "completed_with_errors"
    failures = list(session.exec(select(JobFailure).where(JobFailure.job_id == job.id)))
    assert len(failures) == 1
    assert failures[0].retryable is True


def test_run_job_skips_entities_without_chartmetric_id(session, monkeypatch):
    artist = Artist(artist_name="No CM ID", chartmetric_artist_id=None, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Skip Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-03"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    monkeypatch.setattr(ChartmetricClient, "extract_metric", _make_fake_extract())
    run = run_job(session, job.id)
    session.commit()

    assert run.total_units == 0  # no units generated for entity without CM ID


# ── Coverage Gap Detection ───────────────────────────────────


def test_coverage_gap_detection(session, monkeypatch):
    artist = Artist(artist_name="Rema", chartmetric_artist_id=555, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Gap Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-05"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    # Only return data for Oct 1 and Oct 3, missing Oct 2, 4, 5
    obs = [
        NormalizedObservation(
            variable_name="Spotify_monthly_listeners_daily",
            observation_date=date(2024, 10, 1),
            value=100,
            geo_scope="global",
            geo_label="",
            unit="listeners",
            source_field="listeners",
            aggregation_rule="net_change",
        ),
        NormalizedObservation(
            variable_name="Spotify_monthly_listeners_daily",
            observation_date=date(2024, 10, 3),
            value=120,
            geo_scope="global",
            geo_label="",
            unit="listeners",
            source_field="listeners",
            aggregation_rule="net_change",
        ),
    ]
    monkeypatch.setattr(ChartmetricClient, "extract_metric", _make_fake_extract(observations=obs))
    run_job(session, job.id)
    session.commit()

    gaps = list(session.exec(select(CoverageGap).where(CoverageGap.job_id == job.id)))
    assert len(gaps) >= 1  # at least one gap detected


# ── Quarterly Aggregation Tests ──────────────────────────────


def test_quarterly_aggregation(session):
    job = ExtractionJob(
        name="Agg Job",
        period_definitions=[
            {"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-12-31"},
            {"label": "Q4_2025", "start_date": "2025-10-01", "end_date": "2025-12-31"},
        ],
        variable_names=["YouTube_views_daily"],
    )
    run = JobRun(job_id=job.id, status="completed")
    session.add(job)
    session.add(run)
    session.flush()

    for obs_date, period, value in [
        (date(2024, 10, 1), "Q4_2024", 10),
        (date(2024, 10, 2), "Q4_2024", 20),
        (date(2025, 10, 1), "Q4_2025", 50),
    ]:
        session.add(NormalizedMetricObservation(
            job_id=job.id, job_run_id=run.id,
            entity_type="track", entity_name="Last Last",
            chartmetric_entity_id=58291034,
            observation_date=obs_date, period_label=period,
            platform="YouTube", geo_scope="global", geo_label="",
            variable_name="YouTube_views_daily", variable_value=value,
            unit="views", source_endpoint="/api/track/58291034/youtube/stats",
            source_field="views", aggregation_rule="sum",
        ))
    session.commit()

    rows = compute_quarterly_aggregates(session, job.id)
    assert len(rows) == 2
    q4_2024 = next(r for r in rows if r["period_label"] == "Q4_2024")
    q4_2025 = next(r for r in rows if r["period_label"] == "Q4_2025")
    assert q4_2024["aggregated_value"] == 30  # sum of 10 + 20
    assert q4_2025["aggregated_value"] == 50
    assert q4_2025["yoy_change"] == 20  # 50 - 30


def test_aggregation_net_change():
    items = [
        type("Obs", (), {"variable_value": 100, "observation_date": date(2024, 10, 1)})(),
        type("Obs", (), {"variable_value": 150, "observation_date": date(2024, 12, 31)})(),
    ]
    assert _apply_aggregation("net_change", items) == 50


def test_aggregation_last_value():
    items = [
        type("Obs", (), {"variable_value": 100, "observation_date": date(2024, 10, 1)})(),
        type("Obs", (), {"variable_value": 88, "observation_date": date(2024, 12, 31)})(),
    ]
    assert _apply_aggregation("last_value", items) == 88


def test_previous_quarter_label():
    assert _previous_quarter_label("Q3_2024") == "Q2_2024"
    assert _previous_quarter_label("Q1_2024") == "Q4_2023"


def test_previous_year_label():
    assert _previous_year_label("Q3_2024") == "Q3_2023"


# ── Export Tests ─────────────────────────────────────────────


def test_methodology_sync(session):
    sync_methodology_entries(session)
    session.commit()
    entries = list(session.exec(select(MethodologyEntry)))
    assert len(entries) >= len(METRICS)
    for metric_name in METRICS:
        assert any(e.variable_name == metric_name for e in entries)


def test_export_bundle_generation(session, tmp_path):
    settings = get_settings()
    original = settings.export_root
    settings.export_root = tmp_path.as_posix()

    try:
        sync_methodology_entries(session)
        artist = Artist(artist_name="Burna Boy", chartmetric_artist_id=441923, status="verified")
        job = ExtractionJob(
            name="Export Job",
            period_definitions=[{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-12-31"}],
            variable_names=["YouTube_views_daily"],
            status="completed",
        )
        run = JobRun(job_id=job.id, status="completed")
        session.add(artist)
        session.add(job)
        session.add(run)
        session.flush()

        session.add(NormalizedMetricObservation(
            job_id=job.id, job_run_id=run.id,
            entity_type="artist", entity_id=artist.id,
            entity_name=artist.artist_name,
            chartmetric_entity_id=artist.chartmetric_artist_id,
            observation_date=date(2024, 10, 1),
            period_label="Q4_2024", platform="YouTube",
            geo_scope="global", geo_label="",
            variable_name="YouTube_subscribers_daily",
            variable_value=120.0, unit="subscribers",
            source_endpoint="/api/artist/441923/stat/youtube_channel",
            source_field="subscribers", aggregation_rule="net_change",
        ))
        session.commit()

        artifacts = generate_export_bundle(session, job.id)
        session.commit()

        assert len(artifacts) >= 7
        types = {a.export_type for a in artifacts}
        assert "metrics" in types
        assert "artists" in types
        assert "tracks" in types
        assert "methodology" in types
        assert "extraction_notes" in types
        assert "coverage_report" in types
        assert "limitations_report" in types
        assert all(Path(a.file_path).exists() for a in artifacts)
    finally:
        settings.export_root = original


# ── Metric Definitions ───────────────────────────────────────


def test_all_metrics_have_required_fields():
    for name, metric in METRICS.items():
        assert metric.name == name
        assert metric.entity_type in ("artist", "track")
        assert metric.platform
        assert metric.endpoint_template
        assert metric.unit
        assert metric.aggregation_rule in ("sum", "net_change", "last_value")
        assert metric.source_field_candidates
        assert metric.date_field_candidates


def test_get_metric_definition_unknown():
    with pytest.raises(KeyError, match="Unsupported metric"):
        get_metric_definition("Totally_fake_metric")


# ── Duplicate Prevention ─────────────────────────────────────


def test_observation_upsert_prevents_duplicates(session, monkeypatch):
    """Running the same job twice should update existing observations, not create duplicates."""
    artist = Artist(artist_name="Tems", chartmetric_artist_id=999, status="verified")
    session.add(artist)
    session.commit()

    job = create_job(session, {
        "name": "Dedup Job",
        "periods": [{"label": "Q4_2024", "start_date": "2024-10-01", "end_date": "2024-10-01"}],
        "variable_names": ["Spotify_monthly_listeners_daily"],
        "entity_scope": {"include_tracks": False},
    })
    session.commit()

    monkeypatch.setattr(ChartmetricClient, "extract_metric", _make_fake_extract())

    run_job(session, job.id)
    session.commit()

    # Clear checkpoints to allow re-run
    session.exec(select(JobCheckpoint).where(JobCheckpoint.job_id == job.id))
    for cp in session.exec(select(JobCheckpoint).where(JobCheckpoint.job_id == job.id)):
        session.delete(cp)
    session.commit()

    run_job(session, job.id)
    session.commit()

    obs = list(session.exec(
        select(NormalizedMetricObservation).where(NormalizedMetricObservation.job_id == job.id)
    ))
    # Should still be 1 observation (upserted), not 2
    assert len(obs) == 1
