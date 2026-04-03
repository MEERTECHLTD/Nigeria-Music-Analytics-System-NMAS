# NBS / ACET Latest Correspondence Context

## Why This Note Exists

This note captures the latest stakeholder correspondence so delivery decisions remain aligned with the actual discussion history, not only the prototype codebase.

## Confirmed Themes

- NMAS is being treated as an official NBS delivery platform, not a demo.
- Historical extraction and quarter-based comparison are core requirements.
- Chartmetric is the primary source for the minimum stack.
- Soundcharts is introduced later for export geography and broader international listener context.
- API licensing and delivery timing are operational constraints, not secondary details.

## Quarter Sets Mentioned In Correspondence

### Earlier minimum-stack discussion

The team asked whether the minimum stack should support:

- `Q4 2024`
- `Q3 2025`
- `Q4 2025`

for Year-on-Year and Quarter-on-Quarter analysis.

### Later revised reference periods

ACET later confirmed a revised set:

- `Q1 2025` (`January 1, 2025` to `March 31, 2025`)
- `Q4 2025` (`October 1, 2025` to `December 31, 2025`)
- `Q1 2026` (`January 1, 2026` to `March 31, 2026`)

## Delivery Interpretation

These quarter definitions conflict across the correspondence and attached documents.

### Implementation rule

The software must not hard-code a single quarter trio.

Instead it must:

- accept configurable period definitions per extraction job
- surface the exact period set used in extraction notes
- support both the earlier brief periods and the later revised periods without refactor

## Source and Licensing Context

### Minimum stack

- Chartmetric only
- Intended to answer whether required historical data can be extracted for the requested quarters

### Expanded stack

Soundcharts was later proposed for:

- international listener geography
- cross-market chart appearances
- Audiomack-linked coverage
- international radio airplay
- export-oriented measurement support

### Agreed payment structure in latest note

- Month 1: Chartmetric + DigitalOcean
- Month 2: Chartmetric + DigitalOcean
- Month 3: Chartmetric + SoundCharts + DigitalOcean

This means the engineering baseline for Month 1 remains:

- Chartmetric-first
- provider-extensible
- Soundcharts-ready, but not Soundcharts-dependent

## Practical Delivery Implications

- Quarter configuration must stay flexible.
- Export methodology must distinguish observed Chartmetric metrics from later export-index methodology.
- Month 1 should remain operational with Chartmetric alone.
- Soundcharts support should be an architecture extension point, not a Month 1 blocker.

## Open Decision Areas To Track

- Which quarter set is the final governing delivery set for the immediate run
- Whether Shazam should be stored as counts or chart positions if counts are unavailable
- Whether Spotify popularity is an approved fallback when stream counts are unavailable
- Whether Month 1 output is strictly minimum-stack or already expected to anticipate Month 3 export logic
