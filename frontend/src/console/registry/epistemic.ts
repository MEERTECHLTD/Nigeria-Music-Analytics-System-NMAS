/**
 * EPISTEMIC REGISTER
 *
 * The single place that decides how any displayed field came to exist. Every
 * component asks this module rather than deciding locally, so the observed /
 * estimated boundary is defined once and cannot drift between panels.
 *
 * Each entry records the derivation chain the code actually performs, so a
 * reader can walk from a figure back to the observed input and the coefficient
 * that transformed it.
 */

import type { Epistemic } from '../data/types';

export interface DerivationStep {
  /** what this step does, in the code's own terms */
  op: string;
  /** constant register id, when a coefficient is applied */
  constantId?: string;
  sourceRef?: string;
}

export interface FieldSpec {
  field: string;
  label: string;
  epistemic: Epistemic;
  /** metric class → decimal precision, so columns align across panels */
  precision: number;
  unit?: 'usd' | 'ngn' | 'count' | 'pct' | 'days' | 'ratio';
  /** the observed field(s) this ultimately rests on */
  restsOn?: string[];
  chain?: DerivationStep[];
  note?: string;
}

const SPOTIFY_ENDPOINT = '/api/artist/{chartmetric_id}/stat/spotify';
const YOUTUBE_ENDPOINT = '/api/artist/{chartmetric_id}/stat/youtube_channel';
const DEEZER_ENDPOINT = '/api/artist/{chartmetric_id}/stat/deezer';

export const FIELDS: FieldSpec[] = [
  /* ---------------------------------------------------------- observed */
  {
    field: 'spotify_monthly_listeners',
    label: 'Spotify monthly listeners',
    epistemic: 'observed',
    precision: 0,
    unit: 'count',
    chain: [{ op: `GET ${SPOTIFY_ENDPOINT}`, sourceRef: 'backend/nmas/metrics.py:39' }],
  },
  {
    field: 'youtube_subscribers',
    label: 'YouTube subscribers',
    epistemic: 'observed',
    precision: 0,
    unit: 'count',
    chain: [{ op: `GET ${YOUTUBE_ENDPOINT}`, sourceRef: 'backend/nmas/metrics.py:39' }],
  },
  {
    field: 'deezer_fans',
    label: 'Deezer fans',
    epistemic: 'observed',
    precision: 0,
    unit: 'count',
    chain: [{ op: `GET ${DEEZER_ENDPOINT}` }],
  },

  /* -------------------------------------------------- conditional flag */
  {
    field: 'youtube_actual_views',
    label: 'YouTube views',
    // Resolved per row against youtube_views_source — see resolveEpistemic().
    epistemic: 'estimated',
    precision: 0,
    unit: 'count',
    restsOn: ['youtube_subscribers'],
    chain: [
      { op: 'if youtube_views_source = "actual": value as returned' },
      {
        op: 'if "estimated": subscribers × 15 views/sub/month × 3 months',
        constantId: 'views-per-subscriber',
        sourceRef: 'backend/scripts/nbs_extract_full.py:186',
      },
    ],
    note:
      'Column named “actual” but synthetic on 426 of 638 rows. Always read youtube_views_source before trusting this field.',
  },

  /* --------------------------------------------------------- estimated */
  {
    field: 'est_spotify_quarterly_streams',
    label: 'Estimated Spotify streams',
    epistemic: 'estimated',
    precision: 0,
    unit: 'count',
    restsOn: ['spotify_monthly_listeners'],
    chain: [
      { op: `GET ${SPOTIFY_ENDPOINT} → monthly listeners` },
      {
        op: '× 3.5 streams per listener per month',
        constantId: 'streams-per-listener',
        sourceRef: 'backend/scripts/nbs_extract_full.py:52',
      },
      { op: '× 3 months per quarter', sourceRef: 'backend/scripts/nbs_extract_full.py:184' },
    ],
    note:
      'No observed stream count exists anywhere in the system — all 20 track-level stream endpoints are confirmed 401.',
  },
  {
    field: 'spotify_revenue_usd',
    label: 'Spotify revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    restsOn: ['spotify_monthly_listeners'],
    chain: [
      { op: 'estimated Spotify streams', constantId: 'streams-per-listener' },
      {
        op: '× $0.004 per stream',
        constantId: 'rate-spotify',
        sourceRef: 'backend/scripts/nbs_extract_full.py:50',
      },
    ],
  },
  {
    field: 'youtube_revenue_usd',
    label: 'YouTube revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    restsOn: ['youtube_subscribers'],
    chain: [
      { op: 'YouTube views (observed or synthesised)', constantId: 'views-per-subscriber' },
      {
        op: '× $0.004 per view',
        constantId: 'rate-youtube',
        sourceRef: 'backend/scripts/nbs_extract_full.py:51',
      },
    ],
    note: 'Published rate card states $0.0071. No code path applies it.',
  },
  {
    field: 'deezer_revenue_usd',
    label: 'Deezer revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    restsOn: ['deezer_fans'],
    chain: [
      { op: 'fans × 2.0 streams/fan/month × 3', constantId: 'streams-per-deezer-fan' },
      { op: '× $0.004 per stream', constantId: 'rate-deezer' },
    ],
    note: 'The intermediate Deezer stream count is never written to any artifact.',
  },
  {
    field: 'other_platforms_revenue_usd',
    label: 'Other platforms revenue',
    epistemic: 'assumed',
    precision: 2,
    unit: 'usd',
    chain: [
      {
        op: 'Spotify revenue × 0.30',
        constantId: 'other-platforms',
        sourceRef: 'backend/scripts/nbs_extract_full.py:195',
      },
    ],
    note:
      'Revenue attributed to platforms that were never queried. Apple Music, Audiomack, Boomplay and Tidal are inside this figure and none was called.',
  },
  {
    field: 'gross_streaming_revenue_usd',
    label: 'Gross streaming revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    chain: [{ op: 'Spotify + YouTube + Deezer + other platforms' }],
    note: 'Sums estimated and assumed components; no observed component exists.',
  },
  {
    field: 'gross_streaming_revenue_ngn',
    label: 'Gross streaming revenue (NGN)',
    epistemic: 'estimated',
    precision: 0,
    unit: 'ngn',
    chain: [
      { op: 'gross streaming revenue USD' },
      { op: '× ₦1,500 per USD', constantId: 'fx-usd-ngn' },
    ],
  },

  /* ----------------------------------------------------------- assumed */
  {
    field: 'nigeria_domestic_share_pct',
    label: 'Nigeria domestic share',
    epistemic: 'assumed',
    precision: 0,
    unit: 'pct',
    chain: [{ op: 'constant 30%', constantId: 'domestic-share' }],
    note:
      'Not measured. The listener-geography endpoint that would support it was never called.',
  },
  {
    field: 'export_share_pct',
    label: 'Export share',
    epistemic: 'assumed',
    precision: 0,
    unit: 'pct',
    chain: [{ op: 'constant 70%', constantId: 'export-share' }],
  },
  {
    field: 'domestic_revenue_usd',
    label: 'Domestic revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    chain: [
      { op: 'total streaming revenue' },
      { op: '× 30% assumed domestic share', constantId: 'domestic-share' },
    ],
  },
  {
    field: 'gross_export_revenue_usd',
    label: 'Gross export revenue',
    epistemic: 'estimated',
    precision: 2,
    unit: 'usd',
    chain: [
      { op: 'total streaming revenue' },
      { op: '× 70% assumed export share', constantId: 'export-share' },
    ],
    note:
      'Because export revenue is defined as 70% of streaming revenue, any “export share” computed back from it is tautologically 70%.',
  },
  {
    field: 'top_export_markets',
    label: 'Top export markets',
    epistemic: 'assumed',
    precision: 0,
    chain: [{ op: 'constant string', constantId: 'export-markets-list' }],
    note: 'Identical on all 638 rows. Not derived from any listener-geography observation.',
  },

  /* --------------------------------------------------------- allocated */
  {
    field: 'total_cost_ngn',
    label: 'Operating cost',
    epistemic: 'allocated',
    precision: 0,
    unit: 'ngn',
    chain: [
      { op: 'artist count × 2 tracks × unit cost', constantId: 'tracks-per-artist' },
      { op: 'hosting: artist count × ₦50,000', constantId: 'cost-hosting' },
    ],
    note:
      'A flat model applied uniformly, not an allocation of an observed total. Identical in all five quarters.',
  },
  {
    field: 'total_employment',
    label: 'Employment',
    epistemic: 'allocated',
    precision: 0,
    unit: 'count',
    chain: [
      { op: 'baseline 1.3M', constantId: 'employment-direct' },
      { op: '× 1.02 per quarter', constantId: 'employment-growth' },
    ],
    note: 'A national baseline compounded by a constant. Not attributable to the 131 artists.',
  },
  {
    field: 'male',
    label: 'Male employment',
    epistemic: 'allocated',
    precision: 0,
    unit: 'count',
    chain: [{ op: 'total × 0.62', constantId: 'gender-split' }],
  },
  {
    field: 'female',
    label: 'Female employment',
    epistemic: 'allocated',
    precision: 0,
    unit: 'count',
    chain: [{ op: 'total × 0.38', constantId: 'gender-split' }],
  },

  /* ------------------------------------------------ observed structure */
  {
    field: 'obs_count',
    label: 'Observations',
    epistemic: 'observed',
    precision: 0,
    unit: 'count',
    note: 'A count of rows that exist. The nearest thing to a confidence denominator the system has.',
  },
  {
    field: 'gap_count',
    label: 'Coverage gaps',
    epistemic: 'observed',
    precision: 0,
    unit: 'count',
  },
  {
    field: 'last_minus_first',
    label: 'Last − first',
    epistemic: 'derived',
    precision: 0,
    unit: 'count',
    note:
      'Presentation-side correction for cumulative counters. Shown beside the published value, never in place of it.',
  },
];

export const FIELD_SPECS = Object.fromEntries(FIELDS.map((f) => [f.field, f])) as Record<
  string,
  FieldSpec
>;

/**
 * Resolve a field's epistemic status, honouring per-row flags where the data
 * carries one. Today exactly one such flag exists in the entire delivery.
 */
export function resolveEpistemic(
  field: string,
  row?: Record<string, unknown> | null,
): Epistemic {
  if (field === 'youtube_actual_views' && row) {
    const flag = row['youtube_views_source'];
    if (flag === 'actual') return 'observed';
    if (flag === 'estimated') return 'estimated';
    return 'unavailable';
  }
  return FIELD_SPECS[field]?.epistemic ?? 'derived';
}

export const EPISTEMIC_LABEL: Record<Epistemic, string> = {
  observed: 'Observed',
  estimated: 'Estimated',
  assumed: 'Assumed',
  allocated: 'Allocated',
  derived: 'Derived',
  unavailable: 'Not collected',
  rejected: 'Rejected',
};

export const EPISTEMIC_DEFINITION: Record<Epistemic, string> = {
  observed: 'A value a data source returned.',
  estimated: 'A conversion coefficient applied to an observed input.',
  assumed: 'A constant imposed from outside the data, not measured.',
  allocated: 'A total apportioned across units rather than measured per unit.',
  derived: 'Arithmetic over other values on this page, computed for display.',
  unavailable: 'Never collected, or collected and empty.',
  rejected: 'A call or record that failed.',
};

/** Ordering used by every legend and stacked bar, so the reading is consistent. */
export const EPISTEMIC_ORDER: Epistemic[] = [
  'observed',
  'estimated',
  'assumed',
  'allocated',
  'derived',
  'unavailable',
  'rejected',
];
