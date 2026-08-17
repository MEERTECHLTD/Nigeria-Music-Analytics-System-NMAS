# Response to NBS Correspondence

Each NBS point below is answered with what was built, what it changed, and where
the figures are still assumptions rather than measurements.

---

## 1. Diaspora artists and the GNI account

> *"Since the above-mentioned artists are living in those countries, their income
> will go to different account which is not production account. Kindly provide
> their revenue, cost of operation etc separate, it will be used to compile
> another account known as Gross National Income (GNI)."*

**Done.** Two separate books are now produced in `04_Datasets/NBS_Accounts_Quarterly.csv`,
per quarter, each with its own revenue, platform breakdown and operating cost:

| Account | Artists (Q2 2025) | Gross streaming revenue, all quarters |
| --- | ---: | ---: |
| `domestic_production` | 116 | $425,326,397 |
| `gni_diaspora` | 12 | $37,508,247 |
| `unclassified` | 2 | negligible |

NBS's three named artists are all classified as diaspora candidates on provider
evidence: **Sade Adu (GB), Obongjayar (GB), Afrikan Boy (GB)**.

**One caution NBS must rule on.** The classification signal is the country the
data provider registers for each artist. That signal is not residency, and it is
demonstrably wrong in both directions for some artists — the provider registers
**Crayon as France** and **Rude Boy (Paul Okoye, P-Square) as the United States**,
both of whom work from Lagos. A further **104 artists carry no country at all**.

Residency is a statistical determination for NBS, not one a music data provider
can make. `04_Datasets/Artist_Residency_Classification.csv` therefore lists every
artist with its provider country, the proposed classification, the evidence, and
a `needs_nbs_adjudication` flag, sorted so the highest-revenue cases can be
settled first. Please confirm or overturn each flagged artist; the accounts
regenerate from that file.

---

## 2. Revenue and operating cost broken down by product

> *"NBS would appreciate if the Revenue generated and operating cost is
> broken-down according to product, example Spotify, Youtube, Deezer and others
> to enable us know the driver of digital music among them products."*

**Done for revenue**, per artist per quarter, in
`04_Datasets/Revenue_By_Platform_Quarterly.csv`. Q2 2025 across all 128 artists:

| Product | Revenue (USD) | Share |
| --- | ---: | ---: |
| Spotify | 11,546,464 | 49.5% |
| YouTube | 8,156,741 | 35.0% |
| Deezer | 166,560 | 0.7% |
| *Unmeasured platform uplift* | 3,463,939 | 14.8% |

**The fourth line is not a product, and this matters.** In the delivered model it
was labelled "other platforms" and shown in the platform chart as though it were
one. It is `Spotify revenue x 0.40` — a flat uplift justified by Spotify holding
roughly 31% of the market, so other services are assumed to add ~40% more. No
Boomplay, Audiomack, Apple Music or Amazon revenue is measured anywhere in it. It
is renamed `unmeasured_platform_uplift_usd` and reported outside the product
breakdown so it can no longer be read as a driver.

**Cost by product is not possible and should not be fabricated.** Studio
production, distribution, hosting and promotion are incurred per artist and per
release, not per streaming service; there is no source that attributes a
producer's studio time to Spotify rather than YouTube. Cost is therefore broken
down by the four categories NBS approved, per account, in
`04_Datasets/Cost_By_Category_Quarterly.csv`.

---

## 3. The 3.5 streams per listener per month assumption

> *"Kindly give adequate explanation on what you mean by Spotify streams monthly
> listeners x 3.5 streams/listener/month x3 months. Are you saying that the
> number of streams/listeners are constant?"*

**Yes — and NBS is right to challenge it.** The formula is:

```text
estimated quarterly streams = monthly listeners x 3.5 x 3 months
estimated revenue           = estimated streams x $0.004 per stream
```

`3.5` is a fixed industry proxy for how many times an average listener plays an
artist in a month. It is **held constant across every artist, every quarter and
every year**. It does not vary by artist popularity, genre, release activity or
season, and it is not derived from Nigerian data.

It exists because **neither provider sells track-level stream counts on the
current subscriptions** — both return HTTP 401 for stream endpoints. Monthly
listeners is a *reach* measure (how many distinct people listened), not a
*volume* measure (how many plays occurred), and converting reach to volume
requires exactly this kind of multiplier.

What this means for the figures:

- The **shape** of the series over time is driven by real observed data —
  listener counts move quarter to quarter and are measured.
- The **level** is proportional to an assumed constant. If the true ratio is 5.0
  rather than 3.5, every revenue figure is understated by 43%; if it is 2.0, they
  are overstated by 75%.
- Because the constant is uniform, it **cannot** distort growth rates or the
  domestic/export split — only the absolute naira value.

Three options, for NBS to choose:
1. Keep 3.5 and publish it as a stated assumption with a sensitivity range.
2. Commission a track-level data subscription and measure streams directly.
3. Calibrate the multiplier against a known Nigerian label's reported streams.

Until one is chosen, the revenue level should be presented as an **estimate with
a declared elasticity**, not as a measurement.

---

## 4. Cost distribution categories

> *"The break down is commendable."*

Retained unchanged: Studio Production, Digital Distribution, Web Hosting & CDN,
Promotion & Marketing.

One correction NBS's own reviewer spotted independently: the delivered cost table
repeated **identical totals in every quarter**. That was not a display glitch —
the model multiplied fixed unit costs by a fixed artist count, so no quarter could
ever differ. Costs now scale with the number of artists actually observed in each
quarter and are reported per account, so the domestic and diaspora books carry
their own operating cost. The unit costs themselves remain assumptions from
secondary sources, and each row states its own basis.

---

## 5. Back-casting to the 2019 base year

> *"Before the digital music data will be incorporated to GDP series, it has to be
> back casted down to 2019 new base year for it to align with the series
> otherwise it will give very high."*

**Done — this was the largest piece of work.** The series now runs **Q1 2019 to
Q3 2026, 31 consecutive quarters**, against the 9 quarters previously delivered.

This required a second data provider. Chartmetric's archive floor is 2024-01-01
and no configuration reaches earlier; Soundcharts holds history to 2019 and was
integrated for followers, monthly listeners, playlist reach, radio airplay and
city-level listener geography. Every figure from 2024 onward remains the
Chartmetric value NBS has already seen — the merge does not restate delivered
numbers.

The 2019 and 2020 quarters carry revenue and platform detail. They do **not**
carry a domestic/export split, because the provider's city breakdown does not
begin until 2021-02-26. Those eight quarters are blank in the split columns
rather than filled with an assumed share.

---

## 6. Authorship

Noted, no action required from us: authorship to be settled by the Statistician
General of the Federation once the full back-cast data set is available for
review. The data set described above is that back-cast.

---

## 7. Corrections found during this work

Four defects were found and fixed. Three were ours.

**Fixed export share replaced with observed geography.** The delivered model split
revenue 30% domestic / 70% export using a hardcoded constant, described in the
documentation as deriving from listener geography that had in fact never been
collected. It is now the observed Nigerian city share, per quarter. The fixed
figure was wrong in almost every quarter:

| Quarter | Export at fixed 70% | Export observed | Fixed figure |
| --- | ---: | ---: | --- |
| Q1 2021 | $2,472,229 | $3,416,064 | understates by 27.6% |
| Q1 2023 | $14,488,850 | $19,149,164 | understates by 24.3% |
| Q1 2025 | $14,628,162 | $14,670,968 | accurate, by coincidence |
| Q3 2026 | $18,845,282 | $17,355,894 | overstates by 8.6% |

The true export share falls steadily from 97% (2021) to 60% (2026) as domestic
Nigerian listening grows. A fixed 70% crosses the real value exactly once, in
early 2025, and is wrong on either side of it.

**Duplicate artist double-counted.** "Flavour" and "Flavour N'abania" are one
artist, held twice in the population frame and resolved to two different provider
records. This overstated Q2 2025 by **$666,219 (2.86%)**. Now aliased to a single
entity.

**Summary rows embedded in microdata.** `1_gross_streaming_revenue.csv` contains
`=== PERIOD TOTAL` rows inside the artist rows. Any consumer summing the file
double counts the quarter. The new outputs contain data rows only.

**130,663 duplicate observations** were already present in the delivered daily
dataset — 15.4% of it. Removed, and each itemised in
`07_Quality_Checks/Duplicates_Removed_Report.csv`.

---

## 8. The console figure NBS queried

> *"The streaming rev page shows 50 artists, the total comes to $20.35M, and the
> overview shows $23.33M... does this mean the numbers are only for 50 artists?"*

**No. The data covers 128 artists; the page displays the top 50.**

| | Q2 2025 |
| --- | ---: |
| All 128 artists (the overview figure) | $23,333,705 |
| Top 50 shown on the page | $20,355,494 |
| The 78 artists not displayed | $2,978,211 (12.8%) |

The $2.98M gap is the artists the table does not render, **not** the "other
platforms" line as was assumed — that line is a separate $3.46M and is already
inside both totals. The page is being changed to state the displayed subset and
the full total explicitly.
