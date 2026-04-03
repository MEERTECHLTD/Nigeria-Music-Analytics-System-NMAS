"""nmas initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("chartmetric_artist_id", sa.Integer(), nullable=True),
        sa.Column("artist_name", sa.String(), nullable=False),
        sa.Column("country", sa.String(), nullable=False, server_default="NG"),
        sa.Column("genres", sa.String(), nullable=True),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("spotify_id", sa.String(), nullable=True),
        sa.Column("youtube_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("chartmetric_artist_id", name="uq_artist_chartmetric_id"),
    )
    op.create_index("ix_artists_chartmetric_artist_id", "artists", ["chartmetric_artist_id"])
    op.create_index("ix_artists_artist_name", "artists", ["artist_name"])
    op.create_index("ix_artists_status", "artists", ["status"])
    op.create_index("ix_artists_country", "artists", ["country"])

    op.create_table(
        "tracks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("chartmetric_track_id", sa.Integer(), nullable=True),
        sa.Column("track_name", sa.String(), nullable=False),
        sa.Column("primary_artist_name", sa.String(), nullable=True),
        sa.Column("isrc", sa.String(), nullable=True),
        sa.Column("spotify_id", sa.String(), nullable=True),
        sa.Column("youtube_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("chartmetric_track_id", name="uq_track_chartmetric_id"),
    )
    op.create_index("ix_tracks_chartmetric_track_id", "tracks", ["chartmetric_track_id"])
    op.create_index("ix_tracks_track_name", "tracks", ["track_name"])
    op.create_index("ix_tracks_status", "tracks", ["status"])

    op.create_table(
        "artist_track_links",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("artist_id", sa.String(), sa.ForeignKey("artists.id"), nullable=False),
        sa.Column("track_id", sa.String(), sa.ForeignKey("tracks.id"), nullable=False),
        sa.Column("link_type", sa.String(), nullable=False, server_default="primary"),
        sa.Column("is_top_track", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="verified"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("artist_id", "track_id", "link_type", name="uq_artist_track_link"),
    )

    op.create_table(
        "platform_accounts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("external_id", sa.String(), nullable=False),
        sa.Column("handle", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("entity_type", "entity_id", "platform", "external_id", name="uq_platform_account"),
    )

    op.create_table(
        "entity_resolution_overrides",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("field_name", sa.String(), nullable=False),
        sa.Column("override_value", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "extraction_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="chartmetric"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("cadence", sa.String(), nullable=False, server_default="daily"),
        sa.Column("period_definitions", sa.JSON(), nullable=True),
        sa.Column("entity_scope", sa.JSON(), nullable=True),
        sa.Column("variable_names", sa.JSON(), nullable=True),
        sa.Column("platform_names", sa.JSON(), nullable=True),
        sa.Column("configuration", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_run_started_at", sa.DateTime(), nullable=True),
        sa.Column("last_run_finished_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "job_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("total_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("resumed_from_run_id", sa.String(), nullable=True),
    )

    op.create_table(
        "job_checkpoints",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=False),
        sa.Column("unit_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="completed"),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("chartmetric_entity_id", sa.Integer(), nullable=True),
        sa.Column("variable_name", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("period_label", sa.String(), nullable=False),
        sa.Column("checkpoint_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("job_id", "unit_key", name="uq_job_checkpoint_unit"),
    )

    op.create_table(
        "job_failures",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=False),
        sa.Column("unit_key", sa.String(), nullable=False),
        sa.Column("error_type", sa.String(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=False),
        sa.Column("retryable", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("raw_payload_id", sa.String(), sa.ForeignKey("raw_api_payloads.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "raw_api_payloads",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("request_method", sa.String(), nullable=False, server_default="GET"),
        sa.Column("request_params", sa.JSON(), nullable=True),
        sa.Column("request_context", sa.JSON(), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=True),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("chartmetric_entity_id", sa.Integer(), nullable=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=True),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=True),
        sa.Column("response_json", sa.JSON(), nullable=True),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("response_hash", sa.String(), nullable=True),
        sa.Column("error_classification", sa.String(), nullable=True),
        sa.Column("normalized_note", sa.String(), nullable=True),
    )

    op.create_table(
        "normalized_metric_observations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False, server_default="chartmetric"),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=True),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=True),
        sa.Column("raw_payload_id", sa.String(), sa.ForeignKey("raw_api_payloads.id"), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("chartmetric_entity_id", sa.Integer(), nullable=True),
        sa.Column("entity_name", sa.String(), nullable=False),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("period_label", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("geo_scope", sa.String(), nullable=False),
        sa.Column("geo_label", sa.String(), nullable=False, server_default=""),
        sa.Column("variable_name", sa.String(), nullable=False),
        sa.Column("variable_value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("source_endpoint", sa.String(), nullable=False),
        sa.Column("source_field", sa.String(), nullable=False),
        sa.Column("extraction_timestamp", sa.DateTime(), nullable=False),
        sa.Column("aggregation_rule", sa.String(), nullable=False),
        sa.Column("is_fallback", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("fallback_source", sa.String(), nullable=True),
        sa.Column("provenance_note", sa.String(), nullable=True),
        sa.UniqueConstraint(
            "provider", "entity_type", "chartmetric_entity_id", "observation_date",
            "platform", "geo_scope", "geo_label", "variable_name",
            "source_endpoint", "source_field",
            name="uq_normalized_observation",
        ),
    )

    op.create_table(
        "coverage_gaps",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("chartmetric_entity_id", sa.Integer(), nullable=True),
        sa.Column("variable_name", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("period_label", sa.String(), nullable=False),
        sa.Column("geo_scope", sa.String(), nullable=False),
        sa.Column("gap_start", sa.Date(), nullable=False),
        sa.Column("gap_end", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False, server_default="medium"),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "limitation_flags",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("chartmetric_entity_id", sa.Integer(), nullable=True),
        sa.Column("variable_name", sa.String(), nullable=False),
        sa.Column("platform", sa.String(), nullable=False),
        sa.Column("period_label", sa.String(), nullable=False),
        sa.Column("geo_scope", sa.String(), nullable=False, server_default="global"),
        sa.Column("limitation_code", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("fallback_applied", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "methodology_entries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("variable_name", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("field_name", sa.String(), nullable=False),
        sa.Column("definition", sa.String(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("generation_method", sa.String(), nullable=False),
        sa.Column("coverage_limitations", sa.String(), nullable=False),
        sa.Column("geo_limitations", sa.String(), nullable=False),
        sa.Column("platform_scope", sa.String(), nullable=False),
        sa.Column("fallback_logic", sa.String(), nullable=False),
        sa.Column("missing_data_treatment", sa.String(), nullable=False),
        sa.Column("aggregation_rule", sa.String(), nullable=False),
        sa.Column("methodology_status", sa.String(), nullable=False, server_default="observed"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("variable_name", name="uq_methodology_variable_name"),
    )

    op.create_table(
        "export_artifacts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=False),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=True),
        sa.Column("export_type", sa.String(), nullable=False),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("actor", sa.String(), nullable=False, server_default="system"),
        sa.Column("entity_type", sa.String(), nullable=True),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("extraction_jobs.id"), nullable=True),
        sa.Column("job_run_id", sa.String(), sa.ForeignKey("job_runs.id"), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("export_artifacts")
    op.drop_table("methodology_entries")
    op.drop_table("limitation_flags")
    op.drop_table("coverage_gaps")
    op.drop_table("normalized_metric_observations")
    op.drop_table("raw_api_payloads")
    op.drop_table("job_failures")
    op.drop_table("job_checkpoints")
    op.drop_table("job_runs")
    op.drop_table("extraction_jobs")
    op.drop_table("entity_resolution_overrides")
    op.drop_table("platform_accounts")
    op.drop_table("artist_track_links")
    op.drop_table("tracks")
    op.drop_table("artists")
