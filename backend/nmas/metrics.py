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
    date_field_candidates: tuple[str, ...] = ("timestp", "date", "timestamp", "day", "created_at")
    geo_scope_default: str = "global"
    platform_scope: str = ""
    coverage_limitations: str = ""
    geo_limitations: str = ""
    fallback_logic: str = "No fallback."
    missing_data_treatment: str = "Preserve gaps as-is. No interpolation."
    fallback_metric: str | None = None
    methodology_status: str = "observed"
    stat_data_key: str | None = None  # Key within obj for stat endpoints (e.g. "followers")
    endpoint_type: str = "stat"  # "stat" | "chart" | "meta" | "geo"


# =============================================================================
# ACCESSIBLE ENDPOINTS — verified against Chartmetric subscription 2026-04-04
# =============================================================================

METRICS: dict[str, MetricDefinition] = {

    # =========================================================================
    # 1. ARTIST STAT: SPOTIFY  (/api/artist/{id}/stat/spotify)
    #    obj keys: followers, listeners, popularity
    # =========================================================================
    "Spotify_monthly_listeners_daily": MetricDefinition(
        name="Spotify_monthly_listeners_daily",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/stat/spotify",
        unit="listeners",
        aggregation_rule="net_change",
        definition="Daily Spotify monthly listeners for an artist.",
        source_field_candidates=("value", "monthly_listeners", "listeners"),
        coverage_limitations="Monthly listeners are a reach proxy, not a volume metric.",
        geo_limitations="Global aggregate only.",
        stat_data_key="listeners",
    ),
    "Spotify_followers_daily": MetricDefinition(
        name="Spotify_followers_daily",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/stat/spotify",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Spotify followers for an artist.",
        source_field_candidates=("value", "followers", "spotify_followers"),
        coverage_limitations="Follower counts are reach proxies.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),
    "Spotify_popularity_daily": MetricDefinition(
        name="Spotify_popularity_daily",
        entity_type="artist",
        platform="Spotify",
        endpoint_template="/api/artist/{chartmetric_id}/stat/spotify",
        unit="popularity_index",
        aggregation_rule="last_value",
        definition="Spotify popularity index for an artist (0-100).",
        source_field_candidates=("value", "popularity"),
        coverage_limitations="Popularity is an opaque Spotify-computed index.",
        geo_limitations="Global aggregate only.",
        stat_data_key="popularity",
    ),

    # =========================================================================
    # 2. ARTIST STAT: YOUTUBE CHANNEL  (/api/artist/{id}/stat/youtube_channel)
    #    obj keys: subscribers, views, comments, videos
    # =========================================================================
    "YouTube_subscribers_daily": MetricDefinition(
        name="YouTube_subscribers_daily",
        entity_type="artist",
        platform="YouTube",
        endpoint_template="/api/artist/{chartmetric_id}/stat/youtube_channel",
        unit="subscribers",
        aggregation_rule="net_change",
        definition="Daily YouTube channel subscribers for an artist.",
        source_field_candidates=("value", "subscribers", "youtube_subscribers"),
        coverage_limitations="Subscriber counts are reach proxies.",
        geo_limitations="Global aggregate only.",
        stat_data_key="subscribers",
    ),
    "YouTube_channel_views_daily": MetricDefinition(
        name="YouTube_channel_views_daily",
        entity_type="artist",
        platform="YouTube",
        endpoint_template="/api/artist/{chartmetric_id}/stat/youtube_channel",
        unit="views",
        # net_change, NOT sum: this is a CUMULATIVE counter, so summing its daily
        # levels across a quarter multiplies the level by the observation count
        # (audited at 1,416x inflation on the reference cell — D-15). net_change is
        # defined as the LAST observation minus the FIRST observation inside the
        # quarter window; if the first observation falls mid-quarter the delta
        # covers only the observed span, stated by first/last_observed, with no
        # interpolation across quarter edges. A negative delta (counter reset or
        # provider backfill) and a single-observation quarter are not computable
        # and are classified UNK by the aggregator — never zero.
        aggregation_rule="net_change",
        definition="Cumulative YouTube channel views; quarterly figure is the net change within the quarter.",
        source_field_candidates=("value", "views"),
        coverage_limitations="Cumulative counter — quarterly volume is net change; resets and single-observation quarters are UNK.",
        geo_limitations="Global aggregate only.",
        stat_data_key="views",
    ),

    # =========================================================================
    # 3. ARTIST STAT: YOUTUBE ARTIST  (/api/artist/{id}/stat/youtube_artist)
    #    obj keys: daily_views, monthly_views
    #    *** KEY FOR REVENUE — actual YouTube daily view counts ***
    # =========================================================================
    "YouTube_artist_daily_views": MetricDefinition(
        name="YouTube_artist_daily_views",
        entity_type="artist",
        platform="YouTube",
        endpoint_template="/api/artist/{chartmetric_id}/stat/youtube_artist",
        unit="views",
        aggregation_rule="sum",
        definition="Daily YouTube artist views from YouTube Charts / YouTube Music.",
        source_field_candidates=("value", "daily_views", "views"),
        coverage_limitations="Available for artists tracked by YouTube Charts.",
        geo_limitations="Global aggregate only.",
        stat_data_key="daily_views",
    ),
    "YouTube_artist_monthly_views": MetricDefinition(
        name="YouTube_artist_monthly_views",
        entity_type="artist",
        platform="YouTube",
        endpoint_template="/api/artist/{chartmetric_id}/stat/youtube_artist",
        unit="views",
        aggregation_rule="last_value",
        definition="Monthly YouTube artist views (rolling 28-day) from YouTube Charts.",
        source_field_candidates=("value", "monthly_views", "views"),
        coverage_limitations="Rolling monthly window, not calendar month.",
        geo_limitations="Global aggregate only.",
        stat_data_key="monthly_views",
    ),

    # =========================================================================
    # 4. ARTIST STAT: INSTAGRAM  (/api/artist/{id}/stat/instagram)
    #    obj keys: followers
    # =========================================================================
    "Instagram_followers_daily": MetricDefinition(
        name="Instagram_followers_daily",
        entity_type="artist",
        platform="Instagram",
        endpoint_template="/api/artist/{chartmetric_id}/stat/instagram",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Instagram follower count for an artist.",
        source_field_candidates=("value", "followers", "instagram_followers"),
        coverage_limitations="Instagram metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),

    # =========================================================================
    # 5. ARTIST STAT: TIKTOK  (/api/artist/{id}/stat/tiktok)
    #    obj keys: followers, likes
    # =========================================================================
    "TikTok_followers_daily": MetricDefinition(
        name="TikTok_followers_daily",
        entity_type="artist",
        platform="TikTok",
        endpoint_template="/api/artist/{chartmetric_id}/stat/tiktok",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily TikTok follower count for an artist.",
        source_field_candidates=("value", "followers", "tiktok_followers"),
        coverage_limitations="TikTok metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),
    "TikTok_likes_daily": MetricDefinition(
        name="TikTok_likes_daily",
        entity_type="artist",
        platform="TikTok",
        endpoint_template="/api/artist/{chartmetric_id}/stat/tiktok",
        unit="likes",
        aggregation_rule="net_change",
        definition="Daily TikTok total likes for an artist.",
        source_field_candidates=("value", "likes", "tiktok_likes"),
        coverage_limitations="TikTok metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="likes",
    ),

    # =========================================================================
    # 6. ARTIST STAT: TWITTER/X  (/api/artist/{id}/stat/twitter)
    #    obj keys: followers
    # =========================================================================
    "Twitter_followers_daily": MetricDefinition(
        name="Twitter_followers_daily",
        entity_type="artist",
        platform="Twitter",
        endpoint_template="/api/artist/{chartmetric_id}/stat/twitter",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Twitter/X follower count for an artist.",
        source_field_candidates=("value", "followers", "twitter_followers"),
        coverage_limitations="Twitter metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),

    # =========================================================================
    # 7. ARTIST STAT: FACEBOOK  (/api/artist/{id}/stat/facebook)
    #    obj keys: likes, talks, followers
    # =========================================================================
    "Facebook_followers_daily": MetricDefinition(
        name="Facebook_followers_daily",
        entity_type="artist",
        platform="Facebook",
        endpoint_template="/api/artist/{chartmetric_id}/stat/facebook",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Facebook page followers for an artist.",
        source_field_candidates=("value", "followers", "facebook_followers"),
        coverage_limitations="Facebook metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),
    "Facebook_likes_daily": MetricDefinition(
        name="Facebook_likes_daily",
        entity_type="artist",
        platform="Facebook",
        endpoint_template="/api/artist/{chartmetric_id}/stat/facebook",
        unit="likes",
        aggregation_rule="net_change",
        definition="Daily Facebook page likes for an artist.",
        source_field_candidates=("value", "likes", "facebook_likes"),
        coverage_limitations="Facebook metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="likes",
    ),
    "Facebook_talks_daily": MetricDefinition(
        name="Facebook_talks_daily",
        entity_type="artist",
        platform="Facebook",
        endpoint_template="/api/artist/{chartmetric_id}/stat/facebook",
        unit="talks",
        aggregation_rule="sum",
        definition="Daily Facebook 'talking about' count for an artist.",
        source_field_candidates=("value", "talks"),
        coverage_limitations="Facebook metrics may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="talks",
    ),

    # =========================================================================
    # 8. ARTIST STAT: SOUNDCLOUD  (/api/artist/{id}/stat/soundcloud)
    #    obj keys: followers
    # =========================================================================
    "Soundcloud_followers_daily": MetricDefinition(
        name="Soundcloud_followers_daily",
        entity_type="artist",
        platform="Soundcloud",
        endpoint_template="/api/artist/{chartmetric_id}/stat/soundcloud",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Soundcloud follower count for an artist.",
        source_field_candidates=("value", "followers", "soundcloud_followers"),
        coverage_limitations="Soundcloud metrics may have limited coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),

    # =========================================================================
    # 9. ARTIST STAT: DEEZER  (/api/artist/{id}/stat/deezer)
    #    obj keys: fans
    # =========================================================================
    "Deezer_fans_daily": MetricDefinition(
        name="Deezer_fans_daily",
        entity_type="artist",
        platform="Deezer",
        endpoint_template="/api/artist/{chartmetric_id}/stat/deezer",
        unit="fans",
        aggregation_rule="net_change",
        definition="Daily Deezer fan count for an artist.",
        source_field_candidates=("value", "fans", "deezer_fans"),
        coverage_limitations="Deezer is more prevalent in Francophone Africa.",
        geo_limitations="Global aggregate only.",
        stat_data_key="fans",
    ),

    # =========================================================================
    # 10. ARTIST STAT: WIKIPEDIA  (/api/artist/{id}/stat/wikipedia)
    #     obj keys: views
    # =========================================================================
    "Wikipedia_views_daily": MetricDefinition(
        name="Wikipedia_views_daily",
        entity_type="artist",
        platform="Wikipedia",
        endpoint_template="/api/artist/{chartmetric_id}/stat/wikipedia",
        unit="views",
        aggregation_rule="sum",
        definition="Daily Wikipedia page views for an artist.",
        source_field_candidates=("value", "wikipedia_views", "views", "page_views"),
        coverage_limitations="Wikipedia view data may have intermittent coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="views",
    ),

    # =========================================================================
    # 11. ARTIST STAT: BANDSINTOWN  (/api/artist/{id}/stat/bandsintown)
    #     obj keys: followers
    # =========================================================================
    "Bandsintown_followers_daily": MetricDefinition(
        name="Bandsintown_followers_daily",
        entity_type="artist",
        platform="Bandsintown",
        endpoint_template="/api/artist/{chartmetric_id}/stat/bandsintown",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Bandsintown follower/tracker count for an artist.",
        source_field_candidates=("value", "followers", "bandsintown_followers", "trackers"),
        coverage_limitations="Bandsintown metrics may have limited coverage.",
        geo_limitations="Global aggregate only.",
        stat_data_key="followers",
    ),

    # =========================================================================
    # 12. ARTIST STAT: MELON  (/api/artist/{id}/stat/melon)
    #     obj keys: fans
    # =========================================================================
    "Melon_fans_daily": MetricDefinition(
        name="Melon_fans_daily",
        entity_type="artist",
        platform="Melon",
        endpoint_template="/api/artist/{chartmetric_id}/stat/melon",
        unit="fans",
        aggregation_rule="net_change",
        definition="Daily Melon fan count for an artist (Korean platform).",
        source_field_candidates=("value", "fans"),
        coverage_limitations="Melon is a Korean-market platform; limited relevance for most Nigerian artists.",
        geo_limitations="Global aggregate only.",
        stat_data_key="fans",
    ),

    # =========================================================================
    # 13. ARTIST STAT: TWITCH  (/api/artist/{id}/stat/twitch)
    #     obj keys: follower_count, monthly_viewer_hours, weekly_viewer_hours
    # =========================================================================
    "Twitch_followers_daily": MetricDefinition(
        name="Twitch_followers_daily",
        entity_type="artist",
        platform="Twitch",
        endpoint_template="/api/artist/{chartmetric_id}/stat/twitch",
        unit="followers",
        aggregation_rule="net_change",
        definition="Daily Twitch follower count for an artist.",
        source_field_candidates=("value", "follower_count", "followers"),
        coverage_limitations="Twitch data may be empty for artists without Twitch presence.",
        geo_limitations="Global aggregate only.",
        stat_data_key="follower_count",
    ),

    # =========================================================================
    # 14. ARTIST STAT: LINE MUSIC  (/api/artist/{id}/stat/line)
    #     obj keys: artist_likes
    # =========================================================================
    "Line_likes_daily": MetricDefinition(
        name="Line_likes_daily",
        entity_type="artist",
        platform="Line Music",
        endpoint_template="/api/artist/{chartmetric_id}/stat/line",
        unit="likes",
        aggregation_rule="net_change",
        definition="Daily Line Music artist likes (Japanese platform).",
        source_field_candidates=("value", "artist_likes", "likes"),
        coverage_limitations="Line Music is a Japanese-market platform; limited relevance for most Nigerian artists.",
        geo_limitations="Global aggregate only.",
        stat_data_key="artist_likes",
    ),

    # =========================================================================
    # 15. ARTIST: WHERE PEOPLE LISTEN  (/api/artist/{id}/where-people-listen)
    #     City-level listener share — Nigeria-specific proxy
    # =========================================================================
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
        geo_limitations="Acts as a Nigeria-specific proxy for audience distribution.",
        fallback_logic="No fallback. If city-level Nigerian data is absent, record a limitation.",
        endpoint_type="geo",
    ),

    # =========================================================================
    # 16. ARTIST: SHAZAM CHARTS  (/api/artist/{id}/charts?type=shazam)
    #     Chart appearances with position, country
    # =========================================================================
    "Shazam_chart_position_daily": MetricDefinition(
        name="Shazam_chart_position_daily",
        entity_type="artist",
        platform="Shazam",
        endpoint_template="/api/artist/{chartmetric_id}/charts",
        unit="chart_position",
        aggregation_rule="last_value",
        definition="Shazam chart position for an artist.",
        source_field_candidates=("position", "rank", "chart_position"),
        date_field_candidates=("timestp", "date", "timestamp", "chart_date"),
        geo_scope_default="global",
        coverage_limitations="Chart appearances are intermittent.",
        geo_limitations="May include country context from response payload.",
        endpoint_type="chart",
    ),

    # =========================================================================
    # 17-20. CHARTS: SPOTIFY, SHAZAM, DEEZER  (global chart endpoints)
    #     /api/charts/spotify, /api/charts/shazam, /api/charts/deezer
    #     These return chart snapshots — used for Nigeria chart tracking
    # =========================================================================
    # Note: Global chart endpoints are used differently — they pull a chart
    # snapshot for a date+country, not per-artist time series. Handled
    # separately in the extraction pipeline.
}

# Metrics that require higher-tier Chartmetric plans (confirmed 401)
DENIED_ENDPOINTS: dict[str, dict[str, str]] = {
    "Spotify_streams_daily": {
        "endpoint": "/api/track/{id}/spotify/stats",
        "status": "denied_401",
        "note": "Track-level Spotify stream counts require higher-tier plan.",
    },
    "YouTube_views_daily": {
        "endpoint": "/api/track/{id}/youtube/stats",
        "status": "denied_401",
        "note": "Track-level YouTube view counts require higher-tier plan. Use YouTube_artist_daily_views instead.",
    },
    "Pandora_streams_daily": {
        "endpoint": "/api/track/{id}/pandora/stats",
        "status": "denied_401",
        "note": "Track-level Pandora streams require higher-tier plan.",
    },
    "Apple_Music_stats": {
        "endpoint": "/api/track/{id}/apple-music/stats",
        "status": "denied_401",
        "note": "Track-level Apple Music stats require higher-tier plan.",
    },
    "Track_TikTok": {
        "endpoint": "/api/track/{id}/tiktok",
        "status": "denied_401",
        "note": "Track-level TikTok data requires higher-tier plan.",
    },
    "Track_Spotify_playlists": {
        "endpoint": "/api/track/{id}/spotify/playlists",
        "status": "denied_401",
        "note": "Track playlist appearances require higher-tier plan.",
    },
    "Artist_playlists_current": {
        "endpoint": "/api/artist/{id}/playlists/spotify/current",
        "status": "denied_401",
    },
    "Artist_fan_metrics": {
        "endpoint": "/api/artist/{id}/fan-metrics",
        "status": "denied_401",
    },
    "Artist_listening_demographics": {
        "endpoint": "/api/artist/{id}/listening",
        "status": "denied_401",
    },
    "Artist_related": {
        "endpoint": "/api/artist/{id}/related",
        "status": "denied_401",
    },
    "Artist_genres": {
        "endpoint": "/api/artist/{id}/genres",
        "status": "denied_401",
    },
    "Charts_Apple_Music": {
        "endpoint": "/api/charts/apple-music",
        "status": "denied_401",
    },
    "Charts_iTunes": {
        "endpoint": "/api/charts/itunes",
        "status": "denied_401",
    },
    "Charts_YouTube": {
        "endpoint": "/api/charts/youtube",
        "status": "denied_401",
    },
    "Charts_YouTube_Music": {
        "endpoint": "/api/charts/youtube-music",
        "status": "denied_401",
    },
    "Charts_TikTok": {
        "endpoint": "/api/charts/tiktok",
        "status": "denied_401",
    },
    "City_charts": {
        "endpoint": "/api/city/spotify/charts",
        "status": "denied_401",
    },
    "Playlist_metadata": {
        "endpoint": "/api/playlist/spotify/{id}",
        "status": "denied_401",
    },
    "Album_metadata": {
        "endpoint": "/api/album/{id}",
        "status": "denied_401",
    },
    "Curator_spotify": {
        "endpoint": "/api/curator/spotify",
        "status": "denied_401",
    },
}

# Pending derived methods — will use Soundcharts + external data
PENDING_DERIVED_METHODS: dict[str, dict[str, str]] = {
    "Gross_Streaming_Revenue_Quarterly": {
        "definition": "Quarterly gross revenue generated from online music streaming.",
        "status": "computed_from_observables",
        "coverage_limitations": "Derived from Chartmetric artist stats × industry per-stream rates.",
    },
    "Gross_Export_Revenue_Quarterly": {
        "definition": "Quarterly gross export revenue from Nigerian music consumed outside Nigeria.",
        "status": "computed_from_observables",
        "coverage_limitations": "Derived from Where_People_Listen domestic share + streaming revenue.",
    },
    "Employment_Quarterly": {
        "definition": "Quarterly employment generated by the music sector, split by male and female.",
        "status": "external_source",
        "coverage_limitations": "From US ITA, UNESCO, Nairametrics — not Chartmetric.",
    },
    "Hosting_And_Production_Costs_Quarterly": {
        "definition": "Quarterly hosting and production-related costs.",
        "status": "external_source",
        "coverage_limitations": "From NigerianInformer, EduQueries, TaGetMedia — not Chartmetric.",
    },
}


def get_metric_definition(name: str) -> MetricDefinition:
    if name not in METRICS:
        raise KeyError(f"Unsupported metric: {name}")
    return METRICS[name]


def observed_metrics() -> list[MetricDefinition]:
    return list(METRICS.values())


def stat_metrics() -> list[MetricDefinition]:
    """Return only stat-endpoint metrics (those with stat_data_key)."""
    return [m for m in METRICS.values() if m.stat_data_key]


def unique_stat_endpoints() -> list[tuple[str, list[MetricDefinition]]]:
    """Group metrics by their endpoint template to avoid duplicate API calls."""
    from collections import defaultdict
    groups: dict[str, list[MetricDefinition]] = defaultdict(list)
    for m in METRICS.values():
        if m.stat_data_key:
            groups[m.endpoint_template].append(m)
    return list(groups.items())
