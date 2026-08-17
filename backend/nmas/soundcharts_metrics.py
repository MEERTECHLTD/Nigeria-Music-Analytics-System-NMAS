"""
SOUNDCHARTS METRIC CATALOGUE

Companion to nmas/metrics.py (Chartmetric). Every entry below was probed
against the live account; `earliest_year` records the first year the provider
actually returned observations, not what the docs promise.

CAUTION ON `earliest_year`. These floors were first established by probing 2019
onward, which made 2019 look like the archive floor when it was only the floor of
the probe. A later sweep from 2014 found Spotify followers to 2016-04-25 and
YouTube subscribers to 2015-08-13. The floors below are corrected, but the
lesson stands: a floor discovered by a bounded probe is a property of the probe,
not of the archive. The extractors accept SC_IGNORE_EARLIEST=1 to disable these
guards when sweeping a deeper window, because a guard built from a shallow probe
will otherwise suppress exactly the history being sought.

Variable names deliberately REUSE the Chartmetric names wherever the two
providers measure the same thing. That is what lets a single series run
2019-01-01 → present after the merge: Soundcharts supplies 2019-2023, which
Chartmetric cannot reach (its archive floor is 2024-01-01), and both supply
2024+ where the merge prefers the incumbent and fills gaps from Soundcharts.

Names marked NEW have no Chartmetric equivalent on this subscription —
Boomplay and Audiomack (the two DSPs that matter most for Nigerian domestic
consumption) and radio airplay were all denied 401 by Chartmetric.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SoundchartsMetric:
    """One extractable daily series."""

    variable_name: str
    platform: str
    endpoint_template: str
    response_field: str
    unit: str
    aggregation_rule: str
    definition: str
    earliest_year: int
    geo_scope: str = "global"
    endpoint_family: str = "audience"
    continues_chartmetric: bool = False
    coverage_limitations: str = ""


# ---------------------------------------------------------------------------
# 1. SOCIAL / PLATFORM AUDIENCE  — /api/v2/artist/{uuid}/audience/{platform}
#    Payload fields: followerCount, likeCount, viewCount, postCount
# ---------------------------------------------------------------------------

_AUDIENCE = "/api/v2/artist/{uuid}/audience/{platform}"

AUDIENCE_METRICS: tuple[SoundchartsMetric, ...] = (
    SoundchartsMetric(
        variable_name="Spotify_followers_daily", platform="Spotify",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Spotify followers for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="YouTube_subscribers_daily", platform="YouTube",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="subscribers", aggregation_rule="net_change",
        definition="Daily YouTube channel subscribers for an artist.",
        earliest_year=2015, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="YouTube_channel_views_daily", platform="YouTube",
        endpoint_template=_AUDIENCE, response_field="viewCount",
        # net_change, NOT sum — cumulative counter; see the matching entry in
        # nmas/metrics.py for the full definition (D-15). The same rule/limitation
        # contradiction existed in BOTH catalogues simultaneously, i.e. the entry
        # was copied from a common source carrying the error.
        unit="views", aggregation_rule="net_change",
        definition="Cumulative YouTube channel views; quarterly figure is the net change within the quarter.",
        earliest_year=2015, continues_chartmetric=True,
        coverage_limitations="Cumulative counter — quarterly volume is net change; resets and single-observation quarters are UNK.",
    ),
    SoundchartsMetric(
        variable_name="Instagram_followers_daily", platform="Instagram",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Instagram followers for an artist.",
        earliest_year=2019, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="TikTok_followers_daily", platform="TikTok",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily TikTok followers for an artist.",
        earliest_year=2023, continues_chartmetric=True,
        coverage_limitations="Provider carries no TikTok history before 2023.",
    ),
    SoundchartsMetric(
        variable_name="TikTok_likes_daily", platform="TikTok",
        endpoint_template=_AUDIENCE, response_field="likeCount",
        unit="likes", aggregation_rule="net_change",
        definition="Daily TikTok cumulative likes for an artist.",
        earliest_year=2023, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Twitter_followers_daily", platform="Twitter",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Twitter/X followers for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Facebook_followers_daily", platform="Facebook",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Facebook page followers for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Facebook_likes_daily", platform="Facebook",
        endpoint_template=_AUDIENCE, response_field="likeCount",
        unit="likes", aggregation_rule="net_change",
        definition="Daily Facebook page likes for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Soundcloud_followers_daily", platform="Soundcloud",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily SoundCloud followers for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Deezer_fans_daily", platform="Deezer",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="fans", aggregation_rule="net_change",
        definition="Daily Deezer fans for an artist.",
        earliest_year=2016, continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Bandsintown_followers_daily", platform="Bandsintown",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Bandsintown trackers for an artist.",
        earliest_year=2024, continues_chartmetric=True,
    ),
    # ---- NEW: denied by the Chartmetric subscription, answered here --------
    SoundchartsMetric(
        variable_name="Boomplay_followers_daily", platform="Boomplay",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Boomplay followers. Boomplay is a primary Nigerian DSP.",
        earliest_year=2023,
        coverage_limitations="No Chartmetric equivalent; provider history starts 2023.",
    ),
    SoundchartsMetric(
        variable_name="Audiomack_followers_daily", platform="Audiomack",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Audiomack followers. Audiomack is a primary Nigerian DSP.",
        earliest_year=2024,
        coverage_limitations="No Chartmetric equivalent; provider history starts 2024.",
    ),
    SoundchartsMetric(
        variable_name="Amazon_Music_followers_daily", platform="Amazon Music",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Amazon Music followers for an artist.",
        earliest_year=2024,
    ),
    SoundchartsMetric(
        variable_name="Tidal_followers_daily", platform="Tidal",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Tidal followers for an artist.",
        earliest_year=2026,
    ),
    SoundchartsMetric(
        variable_name="Genius_followers_daily", platform="Genius",
        endpoint_template=_AUDIENCE, response_field="followerCount",
        unit="followers", aggregation_rule="net_change",
        definition="Daily Genius followers for an artist.",
        earliest_year=2023,
    ),
)

# ---------------------------------------------------------------------------
# 2. STREAMING VOLUME AND GEOGRAPHY
# ---------------------------------------------------------------------------

STREAMING_METRICS: tuple[SoundchartsMetric, ...] = (
    SoundchartsMetric(
        variable_name="Spotify_monthly_listeners_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/streaming/{platform}/listening",
        response_field="value", unit="listeners", aggregation_rule="net_change",
        definition="Spotify monthly listeners, daily observation.",
        earliest_year=2019, endpoint_family="streaming_listening",
        continues_chartmetric=True,
    ),
    SoundchartsMetric(
        variable_name="Spotify_total_listeners_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/streaming/{platform}",
        response_field="value", unit="listeners", aggregation_rule="last_value",
        definition="Total Spotify listeners reported alongside the city breakdown.",
        earliest_year=2019, endpoint_family="streaming_local",
    ),
    SoundchartsMetric(
        variable_name="Spotify_city_listeners_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/streaming/{platform}",
        response_field="cityPlots", unit="listeners", aggregation_rule="last_value",
        definition="City-level Spotify listeners. Nigerian cities carry the domestic share.",
        earliest_year=2019, geo_scope="city", endpoint_family="streaming_local",
        coverage_limitations="Only cities the provider reports are emitted; gaps preserved.",
    ),
    SoundchartsMetric(
        variable_name="Spotify_domestic_listeners_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/streaming/{platform}",
        response_field="_nigeria_sum", unit="listeners", aggregation_rule="last_value",
        definition="Sum of Nigerian city listeners — the domestic base for the export split.",
        earliest_year=2019, geo_scope="nigeria", endpoint_family="streaming_local",
        coverage_limitations="Lower bound: only cities large enough for the provider to report.",
    ),
    SoundchartsMetric(
        variable_name="Spotify_popularity_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/popularity/{platform}",
        response_field="value", unit="popularity_index", aggregation_rule="last_value",
        definition="Spotify popularity index (0-100).",
        earliest_year=2020, endpoint_family="popularity",
        continues_chartmetric=True,
    ),
)

# ---------------------------------------------------------------------------
# 3. PLAYLIST REACH  — /api/v2/artist/{uuid}/playlist/reach/{platform}
# ---------------------------------------------------------------------------

PLAYLIST_METRICS: tuple[SoundchartsMetric, ...] = (
    SoundchartsMetric(
        variable_name="Playlist_count_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/playlist/reach/{platform}",
        response_field="playlistCount", unit="playlists", aggregation_rule="last_value",
        definition="Number of playlists carrying the artist.",
        earliest_year=2019, endpoint_family="playlist_reach",
    ),
    SoundchartsMetric(
        variable_name="Playlist_reach_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/playlist/reach/{platform}",
        response_field="playlistReach", unit="followers", aggregation_rule="last_value",
        definition="Combined follower reach of playlists carrying the artist.",
        earliest_year=2019, endpoint_family="playlist_reach",
    ),
    SoundchartsMetric(
        variable_name="Playlist_editorial_count_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/playlist/reach/{platform}",
        response_field="playlistEditorialCount", unit="playlists", aggregation_rule="last_value",
        definition="Editorial playlists carrying the artist.",
        earliest_year=2019, endpoint_family="playlist_reach",
    ),
    SoundchartsMetric(
        variable_name="Playlist_editorial_reach_daily", platform="Spotify",
        endpoint_template="/api/v2/artist/{uuid}/playlist/reach/{platform}",
        response_field="playlistEditorialReach", unit="followers", aggregation_rule="last_value",
        definition="Follower reach of editorial playlists carrying the artist.",
        earliest_year=2019, endpoint_family="playlist_reach",
    ),
)

# ---------------------------------------------------------------------------
# 4. RADIO AIRPLAY  — /api/v2/artist/{uuid}/broadcasts
#    NBS asked for airplay explicitly; Chartmetric denied it on this tier.
# ---------------------------------------------------------------------------

RADIO_METRICS: tuple[SoundchartsMetric, ...] = (
    SoundchartsMetric(
        variable_name="Radio_spins_daily_NG", platform="Radio",
        endpoint_template="/api/v2/artist/{uuid}/broadcasts",
        response_field="_spin_count", unit="spins", aggregation_rule="sum",
        definition="Daily count of songs aired on Nigerian radio stations.",
        earliest_year=2019, geo_scope="nigeria", endpoint_family="radio",
        coverage_limitations="Limited to stations Soundcharts monitors in Nigeria.",
    ),
    SoundchartsMetric(
        variable_name="Radio_spins_daily_global", platform="Radio",
        endpoint_template="/api/v2/artist/{uuid}/broadcasts",
        response_field="_spin_count", unit="spins", aggregation_rule="sum",
        definition="Daily count of songs aired on monitored radio worldwide — export airplay signal.",
        earliest_year=2019, endpoint_family="radio",
        coverage_limitations="Limited to the provider's monitored station panel.",
    ),
)

ALL_METRICS: tuple[SoundchartsMetric, ...] = (
    AUDIENCE_METRICS + STREAMING_METRICS + PLAYLIST_METRICS + RADIO_METRICS
)

# Platform slug the API expects, keyed by our display platform name.
PLATFORM_SLUGS: dict[str, str] = {
    "Spotify": "spotify",
    "YouTube": "youtube",
    "Instagram": "instagram",
    "TikTok": "tiktok",
    "Twitter": "twitter",
    "Facebook": "facebook",
    "Soundcloud": "soundcloud",
    "Deezer": "deezer",
    "Bandsintown": "bandsintown",
    "Boomplay": "boomplay",
    "Audiomack": "audiomack",
    "Amazon Music": "amazon",
    "Tidal": "tidal",
    "Genius": "genius",
    "Radio": "radio",
}


def metrics_for_year(year: int) -> list[SoundchartsMetric]:
    """Only the metrics the provider can actually answer for that year."""
    return [m for m in ALL_METRICS if m.earliest_year <= year]


def audience_requests_for_year(year: int) -> list[tuple[str, list[SoundchartsMetric]]]:
    """Group audience metrics by platform slug so one call fills several series."""
    groups: dict[str, list[SoundchartsMetric]] = {}
    for metric in AUDIENCE_METRICS:
        if metric.earliest_year > year:
            continue
        slug = PLATFORM_SLUGS[metric.platform]
        groups.setdefault(slug, []).append(metric)
    return sorted(groups.items())
