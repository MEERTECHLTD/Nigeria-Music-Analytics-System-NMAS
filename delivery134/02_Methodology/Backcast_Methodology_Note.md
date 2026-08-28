# Back-cast Methodology Note

This package is a FILTER of the canonical two-provider delivery (see
`NBS FINAL delivery/02_Methodology/Data_and_Methodology_Handbook.md` for the full
methodology): same merge, same plausibility guard, same aggregation rules, same
classifications. Nothing is computed differently for this cohort.

One assumption matters more here than anywhere else, because the back-cast years
are exactly where observation is thinnest:

**VIEWS_PER_SUBSCRIBER_MONTH = 15.0** — Estimates YouTube views where the provider holds no observed channel-view history (all quarters before Q3 2021, plus artists the views series never covers).
Source: First-submission methodology (nbs_deliverables.py); 426 of the delivered 638 rows used it, marked 'estimated'.
Limitation: Applied ONLY where observation is absent; every row carries youtube_views_source stating observed versus estimated, and the dashboard's tick mark renders only for observed views.

The 2019–2020 domestic/export split remains UNK (the provider's geography begins
2021-02-26); those quarters carry revenue with no split, blank and never zero.
Q1 2019 additionally lacks Spotify monthly listeners before 2019-05-16, so its
figure rests almost entirely on the YouTube estimate and is the weakest cell in
the package.
