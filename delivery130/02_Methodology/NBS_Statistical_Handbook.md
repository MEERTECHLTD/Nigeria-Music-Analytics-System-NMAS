# NBS Statistical Handbook
## Nigeria Music Analytics System — Delivery 130

Generated 01 September 2026. Every figure below is read from `04_Datasets` when this document
is produced, so it cannot disagree with the data it describes.

This handbook contains no programming content. It is written for statisticians.
Its purpose is that any number in this submission can be traced: what it is, where
it came from, what was assumed, and why that decision was taken.

---

## 1. What this submission measures

The estimated revenue earned by Nigerian recording artists from digital music
streaming platforms, quarter by quarter, from Q1 2019 to Q3 2026.

| | |
|---|---:|
| Artists | 129 |
| Quarters | 31 |
| Artist-quarter records | 3,798 |
| Gross streaming revenue, all quarters | $469,833,610.14 |
| In naira, at each quarter's own rate | ₦502,390,063,070 |
| Of which Q3 2026 (INCOMPLETE quarter) | $28,424,707.67 |
| Gross streaming revenue, 30 COMPLETE quarters | $441,408,902.47 |

### What it does not measure

This is important, and it is stated first rather than last.

- **It is not what platforms paid.** No platform reports payouts to this system.
  Revenue is estimated from audience figures using published per-unit rates.
- **It is not a count of streams.** No track-level stream count is available from
  any provider used here. Stream volumes are derived from audience counts.
- **It is not the whole Nigerian music industry.** It covers 129 artists, digital
  streaming only. Live performance, physical sales, sync, publishing, radio
  royalties and merchandising are outside it entirely.
- **It is not value added until the deduction in section 9 is applied.** Revenue
  is output, not GDP.

---

## 2. The population, and why it is 129 artists

The artists are those of the first submission to NBS. That list contains **131 rows**
but describes **129 artists**, because 2 pairs of rows are the same person recorded
twice under two different provider identities:

| Kept | Merged into it | Why |
|---|---|---|
| Flavour | Flavour N'abania | One artist, two provider identities. Counting both inflates the artist count and charges the cost model for a person who does not exist. |
| Odunsi (The Engine) | Odunsi | One artist, two provider identities. Counting both inflates the artist count and charges the cost model for a person who does not exist. |

**Decision:** count people, not records. A duplicate identity is merged into one
artist, and the observations of the identity with the fuller record are used.
**Reason:** an artist count is a count of economic units. Publishing a row count
under the word "artists" would overstate the population and every per-artist
figure derived from it.

---

## 3. Residence, and the split between GDP and GNI

> **NBS asked:** *"Since the above-mentioned artists are living in those countries,
> their income will go to a different account which is not the production account.
> Kindly provide their revenue, cost of operation etc separate, it will be used to
> compile Gross National Income (GNI)."*

This has been done. The classification is by **economic residence, not nationality**.
An artist of Nigerian heritage who lives and works abroad is not part of Nigerian
domestic production.

| Classification | Artists | Gross revenue | Treatment |
|---|---:|---:|---|
| Resident in Nigeria | 116 | $433,530,175.75 | Domestic production account |
| Resident abroad, Nigerian heritage | 12 | $36,303,414.38 | Provided separately, for GNI compilation |
| Residence not established | 1 | $20.08 | **NBS adjudication required** |

**Files:** `Artist_Residency_Classification.csv` (one row per artist, with the
evidence for its classification), `Domestic_Production_Account.csv`,
`GNI_Diaspora_Account.csv`.

**A caution we place on the record.** The diaspora figures are supplied *for use in*
compiling GNI. They are not themselves GNI. What enters GNI is a specific income
flow under the national accounts residency rules; that determination is NBS's, and
this submission does not pre-empt it.

**Basis of the classification.** Residence is taken from the country the data
provider registers against the artist. That is a provider's administrative record,
not a residence determination. Every artist whose classification rests on it alone
is flagged `needs_nbs_adjudication = Y`. **13 of 129 artists carry that flag.**
NBS should treat those as candidates to confirm, not as settled.

---

## 4. Revenue by product

> **NBS asked:** *"Revenue generated and operating cost is broken-down according to
> product, example Spotify, Youtube, Deezer and others to enable us know the driver
> of digital music among them products."*

**File:** `Revenue_And_Cost_By_Platform.csv` — one row per platform, per quarter,
per account, with revenue, allocated cost and net result.

| Product | Gross revenue, all quarters | Share | What the figure rests on |
|---|---:|---:|---|
| Spotify | $238,655,190.81 | 50.8% | Observed monthly listeners |
| YouTube | $154,288,857.96 | 32.8% | Channel view volume |
| Deezer | $5,293,004.03 | 1.1% | Observed fan counts |
| Other digital platforms | $71,596,557.34 | 15.2% | **Nothing observed — an assumption** |

**The driver of digital music revenue in this dataset is Spotify**, followed by
YouTube. Deezer is small. The fourth line is not a measurement and must not be read
as one: it is a flat uplift applied to Spotify revenue to stand for platforms that
were never queried (Apple Music, Amazon, Boomplay, Audiomack, Tidal). No figure from
any of those platforms appears anywhere in this submission.

---

## 5. How each revenue figure is calculated

### 5.1 Spotify — and the question NBS raised

> **NBS asked:** *"Kindly give adequate explanation on what you mean by Spotify
> streams monthly listeners x 3.5 streams/listener/month x 3 months. Are you saying
> that the number of streams/listeners are constant?"*

**The question was correct, and the method has been changed.**

The first submission took ONE listener figure for a quarter and multiplied it by
three months. That does assume the listener count is constant across the quarter.
It is not: it moves every month.

The quarter is now built from **each month's own observed listener level**:

> Quarterly streams = (Month 1 listeners × 3.5) + (Month 2 listeners × 3.5) +
> (Month 3 listeners × 3.5)

Equivalently, the mean of the observed monthly levels carried across three months.
Where all three months are observed the two are arithmetically identical.

**Coverage of that change, across all 3,798 records:**

| Monthly levels observed in the quarter | Records | Share |
|---|---:|---:|
| 3 months | 3,397 | 89.4% |
| 2 months | 235 | 6.2% |
| 1 month | 15 | 0.4% |
| no monthly level | 151 | 4.0% |

Every record states its own basis in the column `spotify_listeners_basis`.

**What remains an assumption.** The figure of **3.5 streams per listener per month**
is not measured by this system and is not reported by Spotify. It is an industry
proxy. Revenue scales linearly with it: if the true figure is 7, Spotify revenue
doubles. It is the single most consequential assumption in this submission, and NBS
may substitute its own value — the effect is proportional and easy to restate.

**What is measured.** The monthly listener counts themselves are observed from the
provider. What is assumed is how many times each listener plays a track.

### 5.2 YouTube

Revenue = quarterly view volume × $0.004 per view.

View volume is a *cumulative counter*: the platform reports total views to date, so
the quarter's volume is the increase across the quarter, not the level.

| Basis of the view volume | Records | Share |
|---|---:|---:|
| Observed increase in the counter | 1,876 | 49.4% |
| Estimated (no usable observation) | 919 | 24.2% |
| No YouTube presence found | 1,003 | 26.4% |

**Two decisions worth stating.**

*Counter restatements are removed.* A cumulative counter is sometimes restated by
the provider — channels merge, history is back-filled — and it leaps in one day by
more than the channel earns in years. One artist gained 826 million views on a
single day against a normal day of 351,682. Those are bookkeeping events, not
Nigerians watching videos, and counting them as revenue would be wrong. Any day
moving more than 50 times the artist's own typical daily rate is repriced at that
typical rate.

*A quarter must be spanned to be measured.* If the observations cover only part of
the quarter, the increase across them is not the quarter's volume. Where coverage
falls below 90%% the observation is treated as inadequate and an estimate is used
instead — and the record says so. Q3 2021 was measured over 8 days of 92 and
published a fall of 11.6%% that never happened.

### 5.3 Deezer

Revenue = fans × 2.0 streams per fan per month × 3 months × $0.004. Fan counts are
observed; the 2.0 is an assumption of the same kind as the Spotify 3.5.

### 5.4 Other digital platforms

A flat **30%% uplift on Spotify revenue**, standing for platforms never queried.
It is an assumption end to end and is carried in its own column, outside the
platform breakdown, so it cannot be mistaken for a measured platform.

---

## 6. Costs, and how they are attributed to products

> **NBS said:** *"The break down is commendable."* — the four categories are kept
> unchanged.

| Category | Basis |
|---|---|
| Production | ₦750,000 per artist per quarter (ASM) |
| Distribution | ₦15,000 per artist per quarter (ASM) |
| Promotion | ₦250,000 per artist per quarter (ASM) |
| Hosting Cost Quarterly Ngn | ₦50,000 per artist per quarter (ASM) |

**On attributing cost to a product, we must be straightforward with NBS.**

NBS asked for operating cost broken down by product. It is provided, but with an
important qualification: **no cost in this dataset is directly attributable to a
platform.** The cost card is measured per artist per quarter — a studio session, a
distribution fee, a promotion budget — none of which arrives labelled with the
platform it served.

Every cost is therefore a **shared cost**, allocated to platforms **on each
platform's share of revenue in that quarter and account**. The allocation basis is
printed on every row of `Revenue_And_Cost_By_Platform.csv`, in the column
`cost_allocation_basis`, and the direct-cost column is zero throughout — because it
is genuinely zero, not because it was not computed.

**Why revenue share.** It is the conventional allocator where no usage measure
exists, and it is transparent. NBS may prefer another basis; the revenue shares are
published beside the allocation so any alternative can be applied.

**What the unit costs are.** They are assumptions drawn from secondary sources, not
observations of these artists' spending. Only the **artist counts** they are
multiplied by are measured.

---

## 7. Currency conversion

Every platform pays in US dollars. The naira figures are a **conversion**, not a
measurement, and the rate chosen decides the answer.

**A correction we must report.** The first submission applied a single flat rate of
₦1,500 per dollar to every quarter from 2019 to 2026. The naira did not sit still:
it moved from about ₦307 to about ₦1,530. Applying ₦1,500 to 2019 overstated the
2019 figure roughly fivefold.

**This matters more here than almost anywhere else**, because NBS is rebasing GDP
onto a **2019 base year**. A base-year figure inflated fivefold by a conversion rate
would carry through the whole rebased series.

| Year | Rate applied | 2019 comparison |
|---|---:|---|
| 2019 | 306.92 | **the base year** |
| 2020 | 358.81 |  |
| 2021 | 401.15 |  |
| 2022 | 425.98 |  |
| 2023 | 645.00 |  |
| 2024 | 1478.00 |  |
| 2025 | 1530.00 |  |
| 2026 | 1530.00 |  |

Rates are annual averages of the official rate, applied to each quarter of their
year. They are an **assumption**, held separately from the revenue logic precisely
so **NBS can replace them wholesale** with its own official series. Substituting a
different table changes only the naira columns; the dollar measurement is untouched.

Known simplifications: annual averages rather than quarterly, so within-year
movement is not captured; one rate for all flows, with no distinction between
official, NAFEM and parallel rates; and 2026 carries the 2025 rate because 2026 is
not a complete year. Each is a judgement NBS may wish to override.

---

## 8. The back-cast to 2019

> **NBS said:** *"before the digital music data will be incorporated to GDP series,
> it has to be back casted down to 2019 new base year for it to align with the
> series otherwise it will give very high."*

The series runs from **Q1 2019**, the new base year, to Q3 2026 — 31 quarters.

| Year | Gross revenue (USD) | Gross revenue (NGN, period rate) |
|---|---:|---:|
| 2019 | $11,358,001.91 | ₦3,485,997,946 |
| 2020 | $19,022,130.49 | ₦6,825,330,641 |
| 2021 | $32,540,082.70 | ₦13,053,454,175 |
| 2022 | $58,603,839.77 | ₦24,964,063,665 |
| 2023 | $83,815,499.76 | ₦54,060,997,345 |
| 2024 | $89,917,031.40 | ₦132,897,372,409 |
| 2025 | $93,887,636.69 | ₦143,648,084,136 |
| 2026 | $80,689,387.42 | ₦123,454,762,753 |

**How the early years were built.** The providers' own history does not reach back
uniformly to 2019. Where a series begins later than 2019, the earlier quarters are
estimated by a stated rule and every such record is labelled:

- **Spotify listeners** begin 2019-05-16. Q1 2019 levels are carried back from each
  artist's own first observed quarter, deflated by the growth the data itself shows
  between the first two observed quarters. Records carry
  `spotify_listeners_source = estimated`.
- **YouTube view history** begins 2021-09-23. For quarters before that, view volume
  is estimated from subscriber counts at a rate calibrated on the observed period
  and extrapolated backwards. Records carry `youtube_views_source = estimated`.

**This is the weakest part of the submission and we say so plainly.** No YouTube
view observation exists anywhere before September 2021, so YouTube revenue for
2019 to mid-2021 rests entirely on a model. It is labelled on every record, and a
reader can remove it by filtering on that column.

---

## 9. National accounts treatment

**Revenue is not value added, and this submission does not present it as such.**

**File:** `National_Accounts_Aggregates.csv`

| Concept | Treatment here |
|---|---|
| Output | Gross streaming revenue |
| Intermediate consumption | The four cost categories, all purchased services |
| Gross value added | Output less intermediate consumption |
| Compensation of employees | **NOT MEASURED.** The cost card has no labour component |
| Operating surplus / mixed income | The whole of value added, by consequence |

**This treatment requires NBS confirmation.** Whether each cost category is
intermediate consumption under SNA, and whether any part of the artists' own return
is compensation of employees rather than mixed income, are national-accounts
judgements. We have set out the components so NBS can classify them; we have not
assumed the answer, and compensation of employees is left blank rather than zero
because it is unmeasured, not nil.

---

## 10. Every assumption, in one table

Nothing below is measured. Each is a number chosen for a stated reason, and each
can be replaced.

| Constant | Value | Class | What it does | Source | Limitation |
|---|---:|---|---|---|---|
| STREAMS_PER_LISTENER_MONTH | 3.5 | EST | Converts Spotify monthly listeners (reach) into plays (volume). | Industry proxy. Not derived from Nigerian data. | Held constant for every artist, quarter and year. Revenue level scales linearly with it: at 5.0 revenue would be 43% higher, at 2.0 43% lower. Cannot be replaced without track-level stream counts, which both providers deny (HTTP 401). |
| SPOTIFY_PER_STREAM | 0.004 | EST | Payout per Spotify stream. | Industry average (Ditto Music 2026, Chartlex 2026). | Flat across all 31 quarters. No Nigerian rate card obtained; actual payouts vary by territory, subscription tier and distributor. |
| YOUTUBE_PER_VIEW | 0.004 | EST | Payout per YouTube view. | Industry average (Hootsuite 2025). | Flat across all quarters; real RPM varies by territory and format. |
| DEEZER_PER_STREAM | 0.004 | EST | Payout per Deezer stream. | Industry average. | Deezer is under 1% of total revenue, so sensitivity is negligible. |
| DEEZER_STREAMS_PER_FAN_MONTH | 2.0 | EST | Converts Deezer fans into plays. | Industry proxy. | Same structural weakness as the Spotify multiplier. |
| VIEWS_PER_SUBSCRIBER_MONTH | 13.527 | EST | Estimates YouTube views where no observed quarter volume exists (all quarters before Q3 2021, quarters whose observations do not span the period, and artists the views series never covers). | Calibrated: OLS on the AGGREGATE observed ratio across the 19 fully-observed quarters Q4 2021 - Q2 2026, R^2 = 0.782. Replaces the first submission's unsourced flat 15.0. | The fallback era lies BEFORE the observed window, so the rate there is an extrapolation, not a measurement; it is floored at the lowest observed ratio (5.99). Applied ONLY where observation is absent or inadequate; every row carries youtube_views_source. |
| COUNTER_RESTATEMENT_FACTOR | 50.0 | ASM | Above this, a one-interval jump in a cumulative counter is a provider restatement (channel merge or backfill), not consumption, and is repriced at the median rate. | Set from the observed distribution: 44 of 2,168 artist-quarters exceed 50x, headed by a single day of 826,001,508 views against a 351,682 median day. No genuine quarter approaches it. | A judgement threshold. It cannot distinguish a restatement from a genuine viral event of the same size; it is set far above any observed organic day so that trade-off never binds in practice. |
| VIEWS_PER_LISTENER_MONTH | 12.48 | EST | Estimates YouTube views for artists holding a YouTube listener level but no observed view volume and no subscriber level. | Calibrated: aggregate sum(views)/sum(listeners)/3 over the 1,703 artist-quarters carrying both series. | A listener is a monthly-audience figure, not a follower; the ratio is measured on artists who have both series and may not transfer to those who have only one. Labelled per row. |
| MIN_OBSERVED_SPAN_COVERAGE | 0.9 | ASM | Below this, a cumulative counter's (last - first) delta measures a shorter window than the quarter and is not a valid quarterly volume, so the modelled fallback is used instead. | Set from observed coverage: 19 quarters span 97.8-100%, Q3 2021 spans 8.7% and Q3 2026 (unfinished) 42.4%. The threshold separates those two from every adequately observed quarter. | A judgement threshold, not a measurement. Quarters it rejects are labelled estimated rather than silently published low. |
| UNMEASURED_UPLIFT_RATE | 0.3 | ASM | Uplift for platforms never queried (Apple Music, Amazon, Boomplay, Audiomack and others). | Assumed from Spotify's approximate market share. Verified against the delivered file, which reproduces at exactly this value. | NOT a platform and must never be presented as one. No Boomplay, Audiomack, Apple Music or Amazon revenue is measured anywhere in it. |
| NAIRA_PER_USD | 1500 | ASM | Fixed conversion for all naira figures. | Single assumed rate. | The real NGN/USD rate moved materially across 2019-2026. Every naira figure in the delivery is therefore a constant-rate conversion, not a market conversion, and cross-year naira comparisons are affected. |
| TRACKS_PER_QUARTER | 2 | ASM | Multiplier for per-track cost categories. | Assumption. | REPLACEABLE: actual release dates for 100,019 songs are now held in Artist_Catalogue_Summary.csv and could replace this with a counted value. |
| AVG_PRODUCTION_COST_NGN | 750000 | ASM | Studio production cost. | NigerianInformer 2025 (secondary). | No measured cost input exists anywhere in the pipeline. |
| AVG_DISTRIBUTION_COST_NGN | 15000 | ASM | Digital distribution cost. | Blisshype 2026 (secondary). | No measured cost input. |
| AVG_PROMOTION_COST_NGN | 250000 | ASM | Promotion and marketing cost. | TaGetMedia 2025 (secondary). | No measured cost input. |
| AVG_HOSTING_COST_QUARTERLY_NGN | 50000 | ASM | Web hosting and CDN cost. | Industry estimate (secondary). | No measured cost input. |

`EST` — estimated from observed data by a stated rule. `ASM` — assumed from a
source outside this system. Neither is an observation and neither is presented as
one.

---

## 11. How to read a value's status

Every value in this submission carries one of these:

| Code | Meaning |
|---|---|
| OBS | Observed directly from a provider |
| CNT | Counted from observed records |
| AGG | Aggregated from observations |
| EST | Estimated from observed data by a stated rule |
| ASM | Assumed from a source outside this system |
| UNK | **Not measured.** Never rendered as zero |

**The distinction between UNK and zero is the most important convention in this
submission.** A blank means the quantity was not measured. A zero means it was
measured and found to be nil. They are never interchangeable. Where the
domestic/export split could not be measured — every quarter before Q1 2021 — the
cells are blank, not zero, because publishing zero would assert that Nigerian
artists earned nothing abroad in those years.

| Measure | Quarters measured | Quarters blank |
|---|---:|---:|
| Domestic / export split | 23 | 8 |

---

## 12. Checks NBS can run

Every published figure can be recomputed from other published columns. These hold
on all 3,798 records and can be tested in a spreadsheet:

| Check | Identity |
|---|---|
| Spotify revenue | listeners × 3.5 × 3 × 0.004 |
| YouTube revenue | views × 0.004 |
| Deezer revenue | fans × 2.0 × 3 × 0.004 |
| Other platforms | Spotify revenue × 0.30 |
| Gross revenue | the four above, summed |
| Naira | gross revenue × that quarter's rate |
| Quarter total | the sum of that quarter's artist records |
| Account split | domestic + diaspora + unclassified = total |

**One warning.** `Gross_Streaming_Revenue.csv` and `Gross_Export_Revenue.csv` each
contain a `=== PERIOD TOTAL ===` row per quarter, reproduced because the first
submission carried them. **Exclude those rows when summing.** Including them
doubles every total exactly.

---

## 13. What changed since the first submission, and why

| Change | Reason |
|---|---|
| Series extended to 31 quarters from Q1 2019 | NBS requires the 2019 base year |
| Naira converted at each year's own rate | A flat ₦1,500 overstated 2019 by ~5× |
| Spotify built from each month's own level | NBS asked whether listeners were constant. They were being treated as constant |
| Diaspora artists separated | NBS requires them outside the production account |
| Revenue and cost broken down by platform | NBS asked, to identify the driver |
| Output, intermediate consumption and GVA separated | Revenue is not value added |
| Two duplicate artists merged | One person counted twice inflates the population and the cost model |
| Export markets computed per artist | The first submission wrote one identical market list on every row; it was not a detection |
| Provider counter restatements removed | A single day of 826 million views is a bookkeeping event, not consumption |
| Every record states its own basis | So an estimate can never be read as an observation |

---

## 14. Limitations, stated plainly

1. **No platform payout is observed.** All revenue is estimated from audience.
2. **No track-level stream count exists** in any source used here.
3. **The 3.5 and 2.0 multipliers are proxies.** Revenue scales linearly with them.
4. **The 30%% other-platform uplift measures nothing.** No such platform was queried.
5. **YouTube before September 2021 is entirely modelled.** No view observation exists.
6. **Residence rests on a provider's administrative country field** for most artists.
7. **Exchange rates are annual averages** of one rate, not quarterly and not
   differentiated by market.
8. **Q3 2026 is incomplete** — observations end 11 August 2026, 42 of 92 days — yet
   its level-based components bill three full months. It is 6.05% of the headline.
   The 30-complete-quarter total is published beside it for this reason.
9. **Employment is national**, from secondary sources. It is not these artists'
   employees and is not scaled to them.

---

## 15. Authorship

**Authorship and attribution remain subject to NBS review and approval, following
completion of the full back-cast dataset and presentation to the Statistician
General of the Federation.** Nothing in this submission should be read as claiming
that authorship has been settled.

---

## 16. Glossary

| Term | Meaning in this submission |
|---|---|
| Monthly listeners | Distinct accounts that played an artist in the preceding 30 days, as reported by the platform. A *level*, not a count of plays |
| Stream | One play of a track. Not observed here; derived from listeners |
| Channel views | Cumulative total views of an artist's YouTube channel. The quarter's volume is the increase across the quarter |
| Subscribers / fans | Standing followers of a channel or profile. A level |
| Gross streaming revenue | Estimated artist-side revenue before any cost |
| Domestic / export split | The share of listening inside and outside Nigeria, from observed listener geography |
| Back-cast | A figure for a period earlier than the provider's own history, produced by a stated rule |
| Economic residence | Where an artist lives and works. Distinct from nationality |
| Period total row | A summary row inside the data file. Exclude when summing |