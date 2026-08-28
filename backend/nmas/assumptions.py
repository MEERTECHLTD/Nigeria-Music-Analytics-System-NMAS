"""
ASSUMPTION REGISTER — the single source of every non-observed constant.

Every number here is an ASSUMPTION, not a measurement. Nothing in this module was
observed from a provider; each value is applied to measured quantities to produce
estimated output. Any code that needs one of these MUST import it from here.

Why this module exists
----------------------
Before it, the uplift rate was defined in eight places and disagreed with itself:
0.30 in the delivered files, the console methodology panel and
nbs_extract_new_artists.py; 0.40 in nbs_deliverables.py and, by inheritance, in
build_nbs_accounts.py. The delivered Gross_Streaming_Revenue.csv reproduces at
EXACTLY 0.30 across all 638 rows with $0.00 residual and fails at 0.40 by
$5,809,678. The audit that found this is _audit/reconciliation/old_vs_new_attribution.md.

A constant defined in eight places is a constant that will drift again.

FROZEN SCRIPTS — do not wire these to this module
-------------------------------------------------
These produced the delivered Chartmetric-era files, which are immutable evidence.
Editing them would break reproducibility of what was actually delivered:
    nbs_extract_full.py, nbs_deliverables.py, nbs_extract_new_artists.py,
    nbs_final_delivery.py, build_sample.py, build_digital_export_excel.py
They keep their own literals on purpose.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Assumption:
    """One assumed constant, with everything needed to defend or challenge it."""

    name: str
    value: float
    unit: str
    meaning: str
    source: str
    classification: str        # EST contribution or ASM
    limitation: str


# ---------------------------------------------------------------------------
# Streaming revenue rate card
# ---------------------------------------------------------------------------

STREAMS_PER_LISTENER_MONTH = 3.5
SPOTIFY_PER_STREAM = 0.004
YOUTUBE_PER_VIEW = 0.004
DEEZER_PER_STREAM = 0.004
DEEZER_STREAMS_PER_FAN_MONTH = 2.0
# The FIRST submission's documented fallback for YouTube volume when observed
# channel views are unavailable (426 of its 638 rows used it, marked
# youtube_views_source='estimated'). Dropping it in the rebuilt pipeline
# silently zeroed YouTube revenue for every quarter before Q3 2021, understating
# the back-cast series by ~$20M for the first-submission cohort alone.
VIEWS_PER_SUBSCRIBER_MONTH = 15.0

# 0.30, NOT 0.40. See module docstring: the delivered file reproduces at 0.30
# with zero residual, and the published methodology documents 0.30.
UNMEASURED_UPLIFT_RATE = 0.30

# ---------------------------------------------------------------------------
# Currency
# ---------------------------------------------------------------------------

NAIRA_PER_USD = 1500

# ---------------------------------------------------------------------------
# Operating cost card (NGN)
# ---------------------------------------------------------------------------

AVG_PRODUCTION_COST_NGN = 750_000
AVG_DISTRIBUTION_COST_NGN = 15_000
AVG_PROMOTION_COST_NGN = 250_000
AVG_HOSTING_COST_QUARTERLY_NGN = 50_000
TRACKS_PER_QUARTER = 2

COST_CARD = {
    "Studio Production": AVG_PRODUCTION_COST_NGN,
    "Digital Distribution": AVG_DISTRIBUTION_COST_NGN,
    "Web Hosting & CDN": AVG_HOSTING_COST_QUARTERLY_NGN,
    "Promotion & Marketing": AVG_PROMOTION_COST_NGN,
}
PER_TRACK_CATEGORIES = {"Studio Production", "Digital Distribution", "Promotion & Marketing"}


# ---------------------------------------------------------------------------
# The register itself — what gets published in assumptions.csv
# ---------------------------------------------------------------------------

REGISTER: tuple[Assumption, ...] = (
    Assumption("STREAMS_PER_LISTENER_MONTH", STREAMS_PER_LISTENER_MONTH,
               "plays per listener per month",
               "Converts Spotify monthly listeners (reach) into plays (volume).",
               "Industry proxy. Not derived from Nigerian data.",
               "EST",
               "Held constant for every artist, quarter and year. Revenue level scales "
               "linearly with it: at 5.0 revenue would be 43% higher, at 2.0 43% lower. "
               "Cannot be replaced without track-level stream counts, which both "
               "providers deny (HTTP 401)."),
    Assumption("SPOTIFY_PER_STREAM", SPOTIFY_PER_STREAM, "USD per stream",
               "Payout per Spotify stream.",
               "Industry average (Ditto Music 2026, Chartlex 2026).", "EST",
               "Flat across all 31 quarters. No Nigerian rate card obtained; actual "
               "payouts vary by territory, subscription tier and distributor."),
    Assumption("YOUTUBE_PER_VIEW", YOUTUBE_PER_VIEW, "USD per view",
               "Payout per YouTube view.", "Industry average (Hootsuite 2025).", "EST",
               "Flat across all quarters; real RPM varies by territory and format."),
    Assumption("DEEZER_PER_STREAM", DEEZER_PER_STREAM, "USD per stream",
               "Payout per Deezer stream.", "Industry average.", "EST",
               "Deezer is under 1% of total revenue, so sensitivity is negligible."),
    Assumption("DEEZER_STREAMS_PER_FAN_MONTH", DEEZER_STREAMS_PER_FAN_MONTH,
               "plays per fan per month",
               "Converts Deezer fans into plays.", "Industry proxy.", "EST",
               "Same structural weakness as the Spotify multiplier."),
    Assumption("VIEWS_PER_SUBSCRIBER_MONTH", VIEWS_PER_SUBSCRIBER_MONTH,
               "views per subscriber per month",
               "Estimates YouTube views where the provider holds no observed "
               "channel-view history (all quarters before Q3 2021, plus artists "
               "the views series never covers).",
               "First-submission methodology (nbs_deliverables.py); 426 of the "
               "delivered 638 rows used it, marked 'estimated'.", "EST",
               "Applied ONLY where observation is absent; every row carries "
               "youtube_views_source stating observed versus estimated, and the "
               "dashboard's tick mark renders only for observed views."),
    Assumption("UNMEASURED_UPLIFT_RATE", UNMEASURED_UPLIFT_RATE, "ratio of Spotify revenue",
               "Uplift for platforms never queried (Apple Music, Amazon, Boomplay, "
               "Audiomack and others).",
               "Assumed from Spotify's approximate market share. Verified against the "
               "delivered file, which reproduces at exactly this value.", "ASM",
               "NOT a platform and must never be presented as one. No Boomplay, "
               "Audiomack, Apple Music or Amazon revenue is measured anywhere in it."),
    Assumption("NAIRA_PER_USD", NAIRA_PER_USD, "NGN per USD",
               "Fixed conversion for all naira figures.", "Single assumed rate.", "ASM",
               "The real NGN/USD rate moved materially across 2019-2026. Every naira "
               "figure in the delivery is therefore a constant-rate conversion, not a "
               "market conversion, and cross-year naira comparisons are affected."),
    Assumption("TRACKS_PER_QUARTER", TRACKS_PER_QUARTER, "releases per artist per quarter",
               "Multiplier for per-track cost categories.", "Assumption.", "ASM",
               "REPLACEABLE: actual release dates for 100,019 songs are now held in "
               "Artist_Catalogue_Summary.csv and could replace this with a counted value."),
    Assumption("AVG_PRODUCTION_COST_NGN", AVG_PRODUCTION_COST_NGN, "NGN per track",
               "Studio production cost.", "NigerianInformer 2025 (secondary).", "ASM",
               "No measured cost input exists anywhere in the pipeline."),
    Assumption("AVG_DISTRIBUTION_COST_NGN", AVG_DISTRIBUTION_COST_NGN, "NGN per track",
               "Digital distribution cost.", "Blisshype 2026 (secondary).", "ASM",
               "No measured cost input."),
    Assumption("AVG_PROMOTION_COST_NGN", AVG_PROMOTION_COST_NGN, "NGN per track",
               "Promotion and marketing cost.", "TaGetMedia 2025 (secondary).", "ASM",
               "No measured cost input."),
    Assumption("AVG_HOSTING_COST_QUARTERLY_NGN", AVG_HOSTING_COST_QUARTERLY_NGN,
               "NGN per artist per quarter",
               "Web hosting and CDN cost.", "Industry estimate (secondary).", "ASM",
               "No measured cost input."),
)

BY_NAME = {a.name: a for a in REGISTER}
