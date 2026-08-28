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
# YouTube views per subscriber per month — the fallback used where no observed
# quarter volume exists (every quarter before Q3 2021, plus artists the views
# series never covers). Dropping it entirely silently zeroed YouTube revenue for
# the whole back-cast; carrying it as a FLAT 15.0 was the first submission's
# unsourced figure and does not survive measurement.
#
# CALIBRATION. Across the 19 fully-observed quarters (Q4 2021 - Q2 2026) the
# AGGREGATE ratio -- total quarter view volume over total subscriber level, which
# is what revenue depends on, not the per-artist median -- falls steadily as
# channels accumulate subscribers faster than views:
#     Q4 2021  11.39   Q1 2023  9.24   Q1 2025  6.83   Q2 2026  6.42
# OLS on those 19 points: rate = 13.527 - 0.2602 * quarters_since_Q1_2019,
# R^2 = 0.782. The fallback era is BEFORE the observed window, so the rate there
# is this line extrapolated backwards: 13.53 (Q1 2019) down to 10.93 (Q3 2021).
# A flat 15.0 exceeds even the first observed quarter, which the trend makes
# implausible, so the modelled rate replaces it.
VIEWS_PER_SUB_MONTH_BASE = 13.527
VIEWS_PER_SUB_MONTH_TREND = -0.2602

#: Kept for the register and for any consumer wanting a single headline figure:
#: the modelled rate at the START of the back-cast.
VIEWS_PER_SUBSCRIBER_MONTH = VIEWS_PER_SUB_MONTH_BASE

# A cumulative counter's quarter volume is (last - first) observation. Where the
# observations do not SPAN the quarter, that delta measures a shorter window and
# understates the quarter -- it is not a valid quarterly volume. Q3 2021 spanned
# 8 of 92 days and published a YouTube figure a third of the surrounding
# quarters, which read as an 11.6% industry decline that never happened.
# Below this coverage the observation is not adequate and the modelled fallback
# is used instead, labelled as an estimate.
MIN_OBSERVED_SPAN_COVERAGE = 0.90

# A cumulative counter sometimes RESTATES: the provider merges channels or
# backfills history, and the counter leaps in a single day by more than the
# channel earns in years. Tekno Q1 2022 gains 826,001,508 views on one day
# against a median day of 351,682 (2,349x); Fireboy DML Q3 2024 gains
# 758,061,109. Those are bookkeeping events, not Nigerians watching videos, and
# (last - first) counts them as revenue. 44 of 2,168 artist-quarters carry one,
# worth $9.6M of overstated YouTube revenue.
#
# Any interval whose PER-DAY rate exceeds this multiple of the artist's own
# median per-day rate for the quarter is treated as a restatement and repriced
# at that median rate. Set at 50x: high enough that a genuine viral quarter
# survives untouched, low enough to catch every leap of the size above.
COUNTER_RESTATEMENT_FACTOR = 50.0

# YouTube views per LISTENER per month. Distinct from the subscriber rate: a
# listener is a monthly-audience figure, a subscriber is a standing follower.
# Calibrated on the 1,703 artist-quarters carrying BOTH an observed quarter view
# volume and a YouTube listener level: sum(views)/sum(listeners)/3 = 12.48.
# Used only where an artist has a YouTube listener level but neither an observed
# view volume nor a subscriber level - 177 rows that were publishing $0 YouTube
# revenue while holding direct evidence of a YouTube audience.
VIEWS_PER_LISTENER_MONTH = 12.48


def views_per_subscriber_month(period_label: str) -> float:
    """
    The calibrated rate for a quarter, from the fitted trend above.

    Floored at the lowest observed aggregate ratio so a long backward
    extrapolation can never fall below what has actually been measured.
    """
    quarter, year = period_label.split("_")
    since = (int(year) - 2019) * 4 + (int(quarter[1:]) - 1)
    return max(VIEWS_PER_SUB_MONTH_BASE + VIEWS_PER_SUB_MONTH_TREND * since, 5.99)

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
               "views per subscriber per month (at Q1 2019; declines 0.2602/quarter)",
               "Estimates YouTube views where no observed quarter volume exists "
               "(all quarters before Q3 2021, quarters whose observations do not "
               "span the period, and artists the views series never covers).",
               "Calibrated: OLS on the AGGREGATE observed ratio across the 19 "
               "fully-observed quarters Q4 2021 - Q2 2026, R^2 = 0.782. Replaces "
               "the first submission's unsourced flat 15.0.", "EST",
               "The fallback era lies BEFORE the observed window, so the rate "
               "there is an extrapolation, not a measurement; it is floored at "
               "the lowest observed ratio (5.99). Applied ONLY where observation "
               "is absent or inadequate; every row carries youtube_views_source."),
    Assumption("COUNTER_RESTATEMENT_FACTOR", COUNTER_RESTATEMENT_FACTOR,
               "multiple of the artist's own median per-day rate",
               "Above this, a one-interval jump in a cumulative counter is a "
               "provider restatement (channel merge or backfill), not "
               "consumption, and is repriced at the median rate.",
               "Set from the observed distribution: 44 of 2,168 artist-quarters "
               "exceed 50x, headed by a single day of 826,001,508 views against "
               "a 351,682 median day. No genuine quarter approaches it.", "ASM",
               "A judgement threshold. It cannot distinguish a restatement from "
               "a genuine viral event of the same size; it is set far above any "
               "observed organic day so that trade-off never binds in practice."),
    Assumption("VIEWS_PER_LISTENER_MONTH", VIEWS_PER_LISTENER_MONTH,
               "views per YouTube listener per month",
               "Estimates YouTube views for artists holding a YouTube listener "
               "level but no observed view volume and no subscriber level.",
               "Calibrated: aggregate sum(views)/sum(listeners)/3 over the 1,703 "
               "artist-quarters carrying both series.", "EST",
               "A listener is a monthly-audience figure, not a follower; the "
               "ratio is measured on artists who have both series and may not "
               "transfer to those who have only one. Labelled per row."),
    Assumption("MIN_OBSERVED_SPAN_COVERAGE", MIN_OBSERVED_SPAN_COVERAGE,
               "fraction of the quarter the observations must span",
               "Below this, a cumulative counter's (last - first) delta measures "
               "a shorter window than the quarter and is not a valid quarterly "
               "volume, so the modelled fallback is used instead.",
               "Set from observed coverage: 19 quarters span 97.8-100%, Q3 2021 "
               "spans 8.7% and Q3 2026 (unfinished) 42.4%. The threshold "
               "separates those two from every adequately observed quarter.",
               "ASM",
               "A judgement threshold, not a measurement. Quarters it rejects "
               "are labelled estimated rather than silently published low."),
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
