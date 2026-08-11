/**
 * CONSTANTS REGISTER
 *
 * Every hardcoded economic coefficient that shapes a published NMAS figure,
 * transcribed from source with its location and the justification the code
 * actually carries. Where a concept has more than one value in the codebase, or
 * where the code and the published rate card disagree, that is recorded as a
 * divergence rather than silently reconciled.
 *
 * This is presentation metadata about the code. It computes nothing. Every
 * `sourceRef` was verified by direct read.
 */

export type Justification =
  | 'cited'          // a source with a locatable reference
  | 'title-only'     // a source named but not linkable
  | 'self-declared-unsourced'
  | 'absent';

export interface ConstantEntry {
  id: string;
  concept: string;
  value: string;
  unit?: string;
  usedFor: string;
  sourceRefs: string[];
  justification: Justification;
  justificationText: string | null;
  /** set when the same concept carries different values in different places */
  divergence?: string;
  /** set when the constant is attributed to data that was never collected */
  falseProvenance?: string;
  dead?: boolean;
}

export const CONSTANTS: ConstantEntry[] = [
  {
    id: 'fx-usd-ngn',
    concept: 'USD → NGN exchange rate',
    value: '1500',
    unit: 'NGN per USD',
    usedFor: 'Every NGN figure in every deliverable.',
    sourceRefs: [
      'backend/scripts/nbs_extract_full.py:49',
      'backend/scripts/nbs_extract_new_artists.py:30',
      'backend/scripts/nbs_deliverables.py:37',
      'backend/scripts/build_sample.py:52',
    ],
    justification: 'self-declared-unsourced',
    justificationText:
      'Fixed across all five quarters with no effective date and no variance. The delivery self-flags this as gap G4.',
    divergence:
      'Described as a Q1-2026 spot rate at nbs_final_delivery.py:208 but as a five-quarter CBN average at build_digital_export_excel.py:304. One value, two incompatible definitions.',
  },
  {
    id: 'rate-spotify',
    concept: 'Spotify per-stream payout',
    value: '0.004',
    unit: 'USD per stream',
    usedFor: 'Spotify revenue = estimated streams × rate.',
    sourceRefs: [
      'backend/scripts/nbs_deliverables.py:30',
      'backend/scripts/nbs_extract_full.py:50',
    ],
    justification: 'title-only',
    justificationText: 'Comment cites “Ditto Music 2026, Chartlex 2026”. No URL, no retrieval date.',
  },
  {
    id: 'rate-youtube',
    concept: 'YouTube per-view payout',
    value: '0.004 (code) / 0.0071 (published rate card)',
    unit: 'USD per view',
    usedFor: 'YouTube revenue = views × rate.',
    sourceRefs: [
      'backend/scripts/nbs_extract_full.py:51',
      'backend/scripts/build_digital_export_excel.py:301',
    ],
    justification: 'absent',
    justificationText: null,
    divergence:
      'The published rate card states $0.0071. No code path applies that value — every YouTube figure in the delivery used $0.004, a 44% understatement against the documented rate.',
  },
  {
    id: 'rate-deezer',
    concept: 'Deezer per-stream payout',
    value: '0.004 (code) / 0.0046 (published rate card)',
    unit: 'USD per stream',
    usedFor: 'Deezer revenue = estimated streams × rate.',
    sourceRefs: [
      'backend/scripts/nbs_extract_full.py:193',
      'backend/scripts/build_digital_export_excel.py:301',
    ],
    justification: 'absent',
    justificationText: 'No named constant exists; the value is inlined at the call site.',
    divergence: 'Published rate card states $0.0046. Applied by no code path.',
  },
  {
    id: 'rate-apple-tidal',
    concept: 'Apple Music / Tidal payout rates',
    value: '0.007–0.01 / 0.013',
    unit: 'USD per stream',
    usedFor: 'Nothing. Documented but never applied.',
    sourceRefs: [
      'backend/scripts/nbs_final_delivery.py:736',
      'backend/scripts/nbs_deliverables.py:354',
    ],
    justification: 'title-only',
    justificationText:
      'Apple Music and Tidal appear in the published rate card but are folded into the flat “other platforms” multiplier. Neither platform is separately estimated.',
    dead: true,
  },
  {
    id: 'streams-per-listener',
    concept: 'Streams per monthly listener per month',
    value: '3.5',
    usedFor:
      'The conversion that produces every Spotify stream figure: listeners × 3.5 × 3 months.',
    sourceRefs: [
      'backend/scripts/nbs_deliverables.py:32',
      'backend/scripts/nbs_extract_full.py:52',
    ],
    justification: 'self-declared-unsourced',
    justificationText:
      'Comment reads only “Industry proxy”. The delivery self-flags this as gap G5. This single coefficient determines the headline streaming revenue figure.',
  },
  {
    id: 'views-per-subscriber',
    concept: 'Views per subscriber per month',
    value: '15',
    usedFor: 'Synthesising YouTube views where the actual count was not retrieved.',
    sourceRefs: [
      'backend/scripts/nbs_deliverables.py:33',
      'backend/scripts/nbs_extract_full.py:186',
    ],
    justification: 'absent',
    justificationText:
      'Verified in the shipped data: of the 426 rows flagged “estimated”, 374 have views ÷ subscribers = exactly 45.0 (15 × 3). The remaining 52 have both subscribers and views at 0, so no multiplier was applied and they contribute no YouTube revenue. The synthetic result is written into a column named youtube_actual_views.',
  },
  {
    id: 'streams-per-deezer-fan',
    concept: 'Streams per Deezer fan per month',
    value: '2.0',
    usedFor: 'Deezer revenue. The intermediate stream count is never written to any file.',
    sourceRefs: ['backend/scripts/nbs_extract_full.py:192'],
    justification: 'self-declared-unsourced',
    justificationText: 'Comment reads “~2 streams/fan/month”. Delivery gap G5.',
  },
  {
    id: 'other-platforms',
    concept: '“Other platforms” revenue multiplier',
    value: '0.30 (shipped) — also 0.40 and 1.40 in code',
    usedFor: 'Revenue attributed to platforms that were never queried.',
    sourceRefs: [
      'backend/scripts/nbs_extract_full.py:195',
      'backend/scripts/nbs_deliverables.py:186',
      'backend/scripts/nbs_deliverables.py:34',
    ],
    justification: 'absent',
    justificationText: null,
    divergence:
      'Three values for one concept across four call sites. Verified against the shipped data: other_platforms ÷ spotify = 0.3000 on every row, so 0.30 is what shipped; 0.40 and 1.40 are stale. nbs_deliverables.py is additionally self-inconsistent — 0.40 × spotify in one CSV, 1.40 × (spotify + youtube) in another.',
  },
  {
    id: 'domestic-share',
    concept: 'Nigeria domestic consumption share',
    value: '30',
    unit: '%',
    usedFor:
      'Splitting all streaming revenue into domestic and export. Emitted as nigeria_domestic_share_pct on 643/643 rows.',
    sourceRefs: ['backend/scripts/nbs_extract_full.py:54'],
    justification: 'absent',
    justificationText: null,
    falseProvenance:
      'Eight documents attribute this to Where-People-Listen listener geography. That endpoint is explicitly never called — nbs_extract_full.py:128-130 reads “# Where People Listen — skip for now (already have domestic share = 30%)”. The constant justifies itself.',
  },
  {
    id: 'export-share',
    concept: 'Export share',
    value: '70',
    unit: '%',
    usedFor: 'Gross export revenue = total streaming revenue × 0.70.',
    sourceRefs: ['backend/scripts/nbs_extract_new_artists.py:244'],
    justification: 'title-only',
    justificationText:
      'Attributed to “WIPO 2025 methodology” by title only. The 70 itself is not attributed — only the method is. Written as a literal 0.70, not as 1 − domestic share.',
  },
  {
    id: 'employment-direct',
    concept: 'Direct employment baseline',
    value: '300,000',
    usedFor: 'Employment series, grown at 2% per quarter.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:40'],
    justification: 'cited',
    justificationText: 'US ITA Nigeria Commercial Guide 2024, with URL.',
  },
  {
    id: 'employment-indirect',
    concept: 'Indirect employment baseline',
    value: '1,000,000',
    usedFor: 'Employment series.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:40'],
    justification: 'cited',
    justificationText: 'US ITA Nigeria Commercial Guide 2024, with URL.',
  },
  {
    id: 'gender-split',
    concept: 'Male / female employment split',
    value: '0.62 / 0.38',
    usedFor: 'Splitting both direct and indirect employment uniformly.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:42'],
    justification: 'title-only',
    justificationText:
      'UNESCO 2023, title only, no URL. Applied identically to direct and indirect buckets with no differentiation.',
  },
  {
    id: 'employment-growth',
    concept: 'Employment quarter-on-quarter growth',
    value: '0.02',
    usedFor: 'Compounding the employment baseline across quarters.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:44'],
    justification: 'self-declared-unsourced',
    justificationText: 'Delivery gap G8. The entire employment series is this constant compounded.',
  },
  {
    id: 'cost-production',
    concept: 'Production cost per track',
    value: '750,000',
    unit: 'NGN',
    usedFor: 'Cost model = artists × 2 tracks × unit cost.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:47'],
    justification: 'cited',
    justificationText:
      'NigerianInformer 2025, quoted range ₦100K–₦2M. The point value is a choice within that range; the choice is not explained.',
  },
  {
    id: 'cost-hosting',
    concept: 'Hosting cost per artist per quarter',
    value: '50,000',
    unit: 'NGN',
    usedFor: 'Cost model.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:47'],
    justification: 'absent',
    justificationText:
      'Source string is literally “Industry estimate”. Note the multiplier asymmetry: hosting is × artists, while the other three cost lines are × artists × 2 tracks.',
  },
  {
    id: 'tracks-per-artist',
    concept: 'Tracks per artist per quarter',
    value: '2',
    usedFor: 'The multiplier behind every cost line except hosting.',
    sourceRefs: ['backend/scripts/nbs_deliverables.py:51'],
    justification: 'absent',
    justificationText: null,
  },
  {
    id: 'throttle',
    concept: 'Chartmetric request throttle',
    value: '1.0 (production) / 3.0 (local)',
    unit: 'seconds between calls',
    usedFor: 'Serial rate limiting. Implies a ceiling of 60 or 20 requests per minute respectively.',
    sourceRefs: [
      'deployment/digitalocean-app.yaml:36-37',
      'backend/.env:19',
      'backend/nmas/config.py:43',
    ],
    justification: 'absent',
    justificationText:
      'A configured value, not a measurement — no observed request rate exists anywhere. There is no single deployed throttle: production sets 1.0s (60 req/min) and the local environment sets 3.0s (20 req/min).',
    divergence:
      'Two deployment targets carry different values. Any single figure presented as “the” request ceiling would be wrong for one of them.',
  },
  {
    id: 'api-window',
    concept: 'Maximum API window',
    value: '365',
    unit: 'days',
    usedFor: 'Nothing — the branch is a no-op.',
    sourceRefs: ['backend/nmas/services/chartmetric.py:252'],
    justification: 'absent',
    justificationText:
      'Written as `365 if metric.name == "Where_People_Listen" else 365`. Both branches are identical, so no archive-depth differentiation occurs.',
    dead: true,
  },
  {
    id: 'gap-severity',
    concept: 'Coverage gap severity',
    value: '"medium"',
    usedFor: 'Assigned to every coverage gap.',
    sourceRefs: ['backend/nmas/services/jobs.py:532'],
    justification: 'absent',
    justificationText:
      'The only value ever written — 29,369 of 29,369 rows. The column carries zero information and must not be plotted as though it discriminated.',
  },
  {
    id: 'export-markets',
    concept: 'Top export market shares',
    value: '~30% / ~20% / ~15% / ~10% / ~8%',
    usedFor: 'The export-market table in the published workbook and the current dashboard.',
    sourceRefs: ['backend/scripts/build_digital_export_excel.py:256-262'],
    justification: 'absent',
    justificationText: null,
    falseProvenance:
      'Literal strings in a Python tuple. Surrounding prose claims they derive from Where-People-Listen country aggregation; no such aggregation exists in the codebase. They sum to 83% with no residual category.',
  },
  {
    id: 'export-markets-list',
    concept: 'Top export markets list',
    value: '"US, UK, France, Ghana, South Africa"',
    usedFor: 'Emitted identically on every artist row in every quarter.',
    sourceRefs: [
      'backend/scripts/nbs_extract_full.py:265',
      'backend/scripts/nbs_deliverables.py:261',
    ],
    justification: 'absent',
    justificationText: null,
    divergence:
      'Two different lists exist — one with five markets, one adding Germany. Neither is derived from data; the same string repeats on all 638 rows.',
  },
  {
    id: 'population-expansion',
    concept: 'Population expansion factor',
    value: '6.527× and 290.5×',
    usedFor: 'Nothing. Computed, written to an Excel sheet, applied to no published figure.',
    sourceRefs: ['backend/scripts/build_expanded_population_frame.py:1240-1294'],
    justification: 'absent',
    justificationText:
      'A 44× spread between the two “defensible” bounds. No grossing-up is applied to any published number.',
    dead: true,
  },
];

export const CONSTANTS_BY_ID = Object.fromEntries(
  CONSTANTS.map((c) => [c.id, c]),
) as Record<string, ConstantEntry>;

export const DIVERGENT_CONSTANTS = CONSTANTS.filter((c) => c.divergence);
export const FALSE_PROVENANCE_CONSTANTS = CONSTANTS.filter((c) => c.falseProvenance);
export const UNSOURCED_CONSTANTS = CONSTANTS.filter(
  (c) => c.justification === 'absent' || c.justification === 'self-declared-unsourced',
);
