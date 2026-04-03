from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDefinition:
    name: str
    entity_type: str
    platform: str
    endpoint_template: str
    unit: str
    aggregation_rule: str
    definition: str
    source_field_candidates: tuple[str, ...]
    date_field_candidates: tuple[str, ...] = ("date", "timestamp", "day", "created_at")
    geo_scope_default: str = "global"
    platform_scope: str = ""
    coverage_limitations: str = ""
    geo_limitations: str = ""
    fallback_logic: str = "No fallback."
    missing_data_treatment: str = "Preserve gaps as-is. No interpolation."
    fallback_metric: str | None = None
    methodology_status: str = "observed"


METRICS: dict[str, MetricDefinition] = {
    "Spotify_streams_daily": MetricDefinition(
        name="Spotify_streams_daily",
        entity_type="track",
        platform="Spotify",
        endpoint_template="/api/track/{chartmetric_id}/spotify/stats",
        unit="streams",
        aggregation_rule="sum",
        definition="Daily Spotify stream count for a track when Chartmetric exposes stream coverage.",
        source_field_candidates=("spotify_streams", "streams", "stream_count"),
        coverage_limitations="Coverage is strongest for major artists' top tracks. Some tracks may expose popularity instead of stream counts.",
        geo_limitations="Track-level Spotify metrics are global-only in Chartmetric.",
        fallback_logic="If streams are unavailable but popularity is returned, record Spotify_popularity_daily and flag the fallback.",
        fallback_metric="Spotify_popularity_daily",
    ),
    "Spotify_popularity_daily": MetricDefinition(
        name="Spotify_popularity_daily",
        entity_type="track",
        platform="Spotify",
        endpoint_template="/api/track/{chartmetric_id}/spotify/stats",
        unit="popularity_index",
        aggregation_rule="last_value",
        definition="Spotify popularity index for a track when raw stream counts are unavailable.",
        source_field_candidates=("popularity", "spotify_popularity"),
        coverage_limitations="Fallback only. This is not equivalent to raw streams.",
        geo_limitations="Track-level Spotify metrics are global-only in Chartmetric.",
        fallback_logic="Used only when Spotify stream counts are unavailable in the same endpoint response.",
    ),
    "YouTube_views_daily": MetricDefinition(
        name="YouTube_views_daily",
        entity_type="track",
        platform="YouTube",
        endpoint_template="/api/track/{chartmetric_id}/youtube/stats",
        unit="views",
        aggregation_rule="sum",
        definition="Daily YouTube views for a track.",
        source_field_candidates=("youtube_views", "views", "view_count"),
        coverage_limitations="Missing dates must remain visible in coverage reporting.",
        geo_limitations="Track-level YouTube metrics are global-only in Chartmetric.",
    ),
    "Pandora_streams_daily": MetricDefinition(
        name="Pandora_streams_daily",
        entity_type="track",
        platform="Pandora",
        endpoint_template="/api/track/{chartmetric_id}/pandora/stats",
        unit="streams",
        aggregation_rule="sum",
        definition="Daily Pandora streams for a track.",
        source_field_candidates=("pandora_streams", "streams", "stream_count"),
        coverage_limitations="Pandora is a US-market platform and may have sparse relevance for some Nigerian artists.",
        geo_limitations="Track-level Pandora metrics are global-only in Chartmetric.",
    ),
    "Shazam_counts_daily": MetricDefinition(
        name="Shazam_counts_daily",
        entity_type="artist",
        platform="Shazam",
        endpoint_template="/api/artist/{chartmetric_id}/shazam/charts",
        unit="counts",
        aggregation_rule="sum",
        definition="Daily Shazam recognition counts if exposed by Chartmetric.",
        source_field_candidates=("shazam_counts", "count", "shazams"),
        coverage_limitations="Raw counts may not be exposed. Chart position may be the only returned metric.",
        geo_limitations="Country-level chart context may exist, but raw counts are not guaranteed.",
        fallback_logic="If counts are unavailable but chart positions are returned, record Shazam_chart_position_daily and flag the substitution.",
        fallback_metric="Shazam_chart_position_daily",
    ),
    "Shazam_chart_position_daily": MetricDefinition(
        name="Shazam_chart_position_daily",
        entity_type="artist",
        platform="Shazam",
        endpoint_template="/api/artist/{chartmetric_id}/shazam/charts",
        unit="chart_position",
        aggregation_rule="last_value",
        definition="Daily Shazam chart position when raw counts are unavailable.",
        source_field_candidates=("chart_position", "position", "rank"),
        geo_scope_default="nigeria",
        coverage_limitations="Fallback only. Position is directional and not equivalent to raw counts.",
        geo_limitations="Only use as Nigeria-specific when the response is explicitly Nigeria-scoped; otherwise label accurately from payload context.",
        fallback_logic="Used when Shazam counts are unavailable in the response.",
    ),
    "Spotify_monthly_listeners_daily": MetricDefinition(
        name="Spotify_monthly_listeners_daily",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/stat/spotify",
        unit="listeners",
        aggregation_rule="net_change",
        definition="Daily Spotify monthly listeners for an artist.",
        source_field_candidates=("monthly_listeners", "listeners"),
        coverage_limitations="Monthly listeners are a reach proxy, not a volume metric.",
        geo_limitations="Global aggregate only.",
    ),
    "Spotify_followers_daily": MetricDefinition(
        name="Spotify_followers_daily",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/stat/spotify",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Spotify followers for an artist.",
        source_field_candidates=("followers", "spotify_followers"),
        coverage_limitations="Follower counts are reach proxies and should not be summed across days.",
        geo_limitations="Global aggregate only.",
    ),
    "Where_People_Listen": MetricDefinition(
        name="Where_People_Listen",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/where-people-listen",
        unit="share_pct",
        aggregation_rule="last_value",
        definition="City-level listener share distribution for an artist.",
        source_field_candidates=("listeners_pct", "percentage", "share", "value"),
        geo_scope_default="nigeria",
        coverage_limitations="Only Nigerian cities observed in the provider response should be emitted.",
        geo_limitations="Acts as a Nigeria-specific proxy for audience distribution, not a direct stream count.",
        fallback_logic="No fallback. If city-level Nigerian data is absent, record a limitation and no observation.",
    ),
    "YouTube_subscribers_daily": MetricDefinition(
        name="YouTube_subscribers_daily",
        entity_type="artist",
        platform="YouTube",
        endpoint_template="/api/artist/{chartmetric_id}/stat/youtube_channel",
        unit="subscribers",
        aggregation_rule="net_change",
        definition="Daily YouTube subscribers for an artist.",
        source_field_candidates=("subscribers", "youtube_subscribers"),
        coverage_limitations="Subscriber counts are reach proxies and should be evaluated as net change over a period.",
        geo_limitations="Global aggregate only.",
    ),
}


PENDING_DERIVED_METHODS: dict[str, dict[str, str]] = {
    "Gross_Streaming_Revenue_Quarterly": {
        "definition": "Quarterly gross revenue generated from online music streaming.",
        "status": "pending_external_methodology",
        "coverage_limitations": "Not directly observed from Chartmetric. Requires explicit revenue formula and approved payout assumptions.",
    },
    "Gross_Export_Revenue_Quarterly": {
        "definition": "Quarterly gross export revenue generated from Nigerian music consumed outside Nigeria.",
        "status": "pending_external_methodology",
        "coverage_limitations": "Not directly observed from Chartmetric. Requires approved export methodology and possibly external revenue data.",
    },
    "Employment_Quarterly": {
        "definition": "Quarterly employment generated by the music sector, ideally split by male and female.",
        "status": "pending_external_methodology",
        "coverage_limitations": "Not available from Chartmetric and must remain outside the observed dataset until an approved method exists.",
    },
    "Hosting_And_Production_Costs_Quarterly": {
        "definition": "Quarterly hosting and production-related costs.",
        "status": "pending_external_methodology",
        "coverage_limitations": "Not available from Chartmetric. Requires external collection or approved scraping methodology.",
    },
}


def get_metric_definition(name: str) -> MetricDefinition:
    if name not in METRICS:
        raise KeyError(f"Unsupported metric: {name}")
    return METRICS[name]


def observed_metrics() -> list[MetricDefinition]:
    return list(METRICS.values())

