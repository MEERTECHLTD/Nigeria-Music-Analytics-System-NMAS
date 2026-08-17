"""
PROVIDER PLAUSIBILITY GUARD — diagnose defective records, never prefer a provider.

Both providers hold defective records in different places, so any blanket
preference is wrong somewhere. This module decides by DIAGNOSIS, not by size and
not by source.

TRIGGER THRESHOLD — 10x, justified empirically
    Sweeping all 1,321 comparable (artist, metric) series, the count of triggers
    by threshold is: 2x->103, 3x->86, 5x->73, 10x->63, 20x->59, 100x->46.
    The curve flattens between 10x and 20x (63 -> 59), so 10x captures nearly all
    genuine order-of-magnitude breaks while staying clear of the 2-5x band where
    real provider methodology differences live.

FLOOR THRESHOLD — 5th percentile of the metric's own distribution, justified empirically
    "At or near floor" cannot be one absolute number. Across all artist-medians
    from both providers the 5th percentile is:
        Deezer_fans_daily                 13
        TikTok_followers_daily         2,135
        YouTube_subscribers_daily      2,950
        Spotify_followers_daily        7,500
        Spotify_monthly_listeners     14,775
        Instagram_followers_daily     56,947
    A fixed floor of, say, 100 would never fire on Instagram (1st percentile is
    9,023) and would fire constantly on Deezer, where values under 100 are
    ordinary. Each metric therefore carries its own floor at its own p5: a value
    in the bottom 5% of everything ever observed for that metric, on a profile
    that is simultaneously substantial elsewhere, is not a small artist.

TWO SIGNATURES

  A. Stub or duplicate profile
     Three or more of the artist's core metrics sit at or below their own floors
     simultaneously. Burna Boy's Chartmetric ID 441923 is the reference case:
     Deezer 1, followers 53, listeners 161, popularity 1. Popularity is a 0-100
     index with no units to mis-scale and Davido scores 76, so near-1 popularity
     beside near-floor everything else is a stub page, not a small artist.

  B. Single-metric ingestion failure
     One metric sits at or below its floor while (i) the other provider reports
     10x or more for that same metric on the same dates, and (ii) the artist is
     substantial on at least one OTHER metric from the SAME provider, above that
     metric's median. Condition (i) excludes "genuinely small on that platform",
     because the other provider observed a large value for that exact metric on
     those exact dates. This is the Deezer cluster: 21 of 22 low-Deezer artists
     have healthy Spotify followers, which signature A cannot see because only
     one metric is at floor.

Both signatures are applied to BOTH providers. The excluded provider is logged on
every series so any directional skew is visible rather than assumed.

RESOLUTION ORDER
  1 both sides tested
  2 exactly one defective  -> exclude it, use the other, log
  3 neither defective      -> precedence stands, log UNRESOLVED, report sensitivity
  4 both defective         -> UNK, exclude from aggregates, register the limitation
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field

TRIGGER_RATIO = 10.0
FLOOR_PERCENTILE = 5
SUBSTANTIAL_PERCENTILE = 50

CORE_METRICS = (
    "Spotify_followers_daily",
    "Spotify_monthly_listeners_daily",
    "Deezer_fans_daily",
    "Spotify_popularity_daily",
)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    idx = min(int(len(xs) * pct / 100.0), len(xs) - 1)
    return xs[idx]


@dataclass
class Thresholds:
    """Per-metric floor and 'substantial' levels, derived from observed data."""

    floor: dict[str, float] = field(default_factory=dict)
    substantial: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_population(cls, medians_by_metric: dict[str, list[float]]) -> "Thresholds":
        t = cls()
        for metric, values in medians_by_metric.items():
            positive = [v for v in values if v > 0]
            if len(positive) < 20:
                continue
            t.floor[metric] = percentile(positive, FLOOR_PERCENTILE)
            t.substantial[metric] = percentile(positive, SUBSTANTIAL_PERCENTILE)
        return t


@dataclass
class Verdict:
    defective: bool
    signature: str      # "A", "B" or ""
    reason: str


def diagnose(profile: dict[str, float], metric: str, other_value: float | None,
             thresholds: Thresholds) -> Verdict:
    """Test ONE provider's record for this metric. profile = that provider's medians."""
    value = profile.get(metric)
    if value is None:
        return Verdict(False, "", "metric absent for this provider")

    # --- signature A: stub or duplicate profile ---------------------------
    present = [m for m in CORE_METRICS if m in profile and m in thresholds.floor]
    if len(present) >= 3:
        at_floor = [m for m in present if profile[m] <= thresholds.floor[m]]
        if len(at_floor) >= 3:
            return Verdict(True, "A",
                           "stub profile: %d of %d core metrics at or below floor (%s)"
                           % (len(at_floor), len(present), ", ".join(at_floor)))

    # --- signature B: single-metric ingestion failure ---------------------
    floor = thresholds.floor.get(metric)
    if floor is not None and value <= floor:
        if other_value is not None and other_value >= value * TRIGGER_RATIO:
            others = [m for m in profile
                      if m != metric and m in thresholds.substantial
                      and profile[m] >= thresholds.substantial[m]]
            if others:
                return Verdict(True, "B",
                               "metric at floor (%.0f <= p5 %.0f) while other provider reports "
                               "%.0f and this profile is substantial on %s"
                               % (value, floor, other_value, ", ".join(sorted(others)[:2])))
            return Verdict(False, "",
                           "at floor but profile not substantial elsewhere - may be a genuinely small artist")
    return Verdict(False, "", "within plausible range")


def resolve(metric: str, cm_profile: dict[str, float], sc_profile: dict[str, float],
            thresholds: Thresholds) -> tuple[str, str, str]:
    """Return (category, provider_excluded, reason)."""
    cm_value = cm_profile.get(metric)
    sc_value = sc_profile.get(metric)
    cm = diagnose(cm_profile, metric, sc_value, thresholds)
    sc = diagnose(sc_profile, metric, cm_value, thresholds)
    if cm.defective and not sc.defective:
        return "2", "chartmetric", "signature %s: %s" % (cm.signature, cm.reason)
    if sc.defective and not cm.defective:
        return "2", "soundcharts", "signature %s: %s" % (sc.signature, sc.reason)
    if cm.defective and sc.defective:
        return "4", "both", "both defective: cm[%s] sc[%s]" % (cm.reason, sc.reason)
    return "3", "none", "neither defective: cm[%s] sc[%s]" % (cm.reason, sc.reason)
