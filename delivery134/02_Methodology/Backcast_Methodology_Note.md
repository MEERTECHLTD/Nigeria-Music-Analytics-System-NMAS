# Back-cast Methodology Note

This package is a FILTER of the canonical two-provider delivery (see
`NBS FINAL delivery/02_Methodology/Data_and_Methodology_Handbook.md` for the full
methodology): same merge, same plausibility guard, same aggregation rules, same
classifications. Nothing is computed differently for this cohort.

One assumption matters more here than anywhere else, because the back-cast years
are exactly where observation is thinnest:

**VIEWS_PER_SUBSCRIBER_MONTH = 13.527** — Estimates YouTube views where no observed quarter volume exists (all quarters before Q3 2021, quarters whose observations do not span the period, and artists the views series never covers).
Source: Calibrated: OLS on the AGGREGATE observed ratio across the 19 fully-observed quarters Q4 2021 - Q2 2026, R^2 = 0.782. Replaces the first submission's unsourced flat 15.0.
Limitation: The fallback era lies BEFORE the observed window, so the rate there is an extrapolation, not a measurement; it is floored at the lowest observed ratio (5.99). Applied ONLY where observation is absent or inadequate; every row carries youtube_views_source.

The 2019–2020 domestic/export split remains UNK (the provider's geography begins
2021-02-26); those quarters carry revenue with no split, blank and never zero.
Q1 2019 additionally lacks Spotify monthly listeners before 2019-05-16, so its
figure rests almost entirely on the YouTube estimate and is the weakest cell in
the package.
