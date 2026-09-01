"""
EXCHANGE RATES — NGN per USD, by quarter.

Why this module exists
----------------------
Every platform in this system pays in USD. The naira figures are therefore a
CONVERSION, not a measurement, and the rate used decides the answer.

The pipeline previously applied a single flat rate of NGN 1,500/USD to every
quarter from Q1 2019 to Q3 2026. The naira did not sit still over that period:
it moved from roughly 307 to roughly 1,530. Applying 1,500 to 2019 overstated
the 2019 naira figure by about 4.9x -- NGN 17.5bn published against NGN 3.6bn at
the rate that actually prevailed -- and overstated the whole series by about
NGN 206.6bn (40.6%).

That matters more here than it would anywhere else, because NBS is rebasing GDP
onto a 2019 BASE YEAR. A base-year figure inflated fivefold by a conversion rate
would propagate through the entire rebased series. NBS's own note -- that the
data "has to be back casted down to 2019 new base year for it to align with the
series otherwise it will give very high" -- is about exactly this class of error.

Basis and limitation
--------------------
The rates below are ANNUAL AVERAGE official rates, applied to every quarter of
their year. They are an ASSUMPTION, not an observation of any transaction in
this dataset: no platform reports to this system what rate it settled at, on
what date, or through which channel.

They are held here, separately from the revenue logic, precisely so NBS can
replace them wholesale with the official CBN series it uses for the national
accounts. Substituting a different table changes only the naira columns; the
USD measurement is untouched.

Known simplifications, each of which NBS may wish to override:
  1. Annual averages, not quarterly. Within-year movement is not captured, and
     2023 and 2024 both contain large mid-year moves.
  2. One rate for all flows. No distinction between official, NAFEM/I&E and
     parallel rates. Which is appropriate is a national-accounts judgement.
  3. 2026 is incomplete and its rate is carried from the latest full year.
"""

from __future__ import annotations

#: NGN per USD, annual average official rate. Source: Central Bank of Nigeria
#: published exchange-rate statistics. ASSUMPTION — see module docstring.
NGN_PER_USD_BY_YEAR: dict[int, float] = {
    2019: 306.92,
    2020: 358.81,
    2021: 401.15,
    2022: 425.98,
    2023: 645.00,
    2024: 1478.00,
    2025: 1530.00,
    2026: 1530.00,   # carried from 2025; 2026 is not a complete year
}

#: The flat rate the earlier delivery used, kept so the restatement is explicit.
SUPERSEDED_FLAT_RATE = 1500.0


def ngn_per_usd(period_label: str) -> float:
    """
    NGN per USD for a quarter, from its year's annual average.

    Raises rather than guessing: a missing year is a data problem to fix, not a
    number to invent.
    """
    year = int(period_label.split("_")[1])
    if year not in NGN_PER_USD_BY_YEAR:
        raise KeyError(
            "no exchange rate for %d — add it to nmas/fx.py with its source "
            "rather than defaulting" % year)
    return NGN_PER_USD_BY_YEAR[year]


def rate_basis(period_label: str) -> str:
    """The provenance string published beside every converted figure."""
    year = int(period_label.split("_")[1])
    note = " (carried from 2025; 2026 incomplete)" if year == 2026 else ""
    return ("CBN annual average official rate %.2f NGN/USD for %d%s (ASM)"
            % (NGN_PER_USD_BY_YEAR[year], year, note))
