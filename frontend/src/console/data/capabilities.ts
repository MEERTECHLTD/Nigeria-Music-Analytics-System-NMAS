/**
 * CAPABILITY DETECTION
 *
 * Panels must never hardcode what is missing. Chartmetric and SoundCharts
 * endpoints are being activated, so a panel that asserts "radio airplay does not
 * exist" would keep asserting it after airplay data starts arriving.
 *
 * Instead every panel asks this module, which answers from the data actually
 * loaded. A capability flips to present the moment its evidence appears — no
 * code change, no redeploy. Until then the gap register entry explains the
 * absence.
 *
 * The rule that does not change: a capability is present only when real records
 * back it. Detection never invents a value, it only observes whether one exists.
 */

import type { Coverage, ArtistRow, Revenue, Run, Variables } from './types';
import type { TransportState } from './transport';

export type CapabilityId =
  | 'listenerGeography'
  | 'radioAirplay'
  | 'trackStreams'
  | 'crossMarketCharts'
  | 'chartPositions'
  | 'residencyClassification'
  | 'accountRouting'
  | 'ncr'
  | 'dei'
  | 'platformIdentifiers'
  | 'matchConfidence'
  | 'perCallTelemetry'
  | 'rawPayloads'
  | 'auditTrail'
  | 'quotaTracking'
  | 'archiveDepthProbe'
  | 'stageTelemetry'
  | 'validationRules'
  | 'multiSource'
  | 'payoutRateTable'
  | 'allocatedCost'
  | 'confidenceScores';

export interface Capability {
  id: CapabilityId;
  label: string;
  present: boolean;
  /** what proved it present, or what was checked and found empty */
  evidence: string;
  /** rows/records backing it, when countable */
  count: number | null;
  gapId?: string;
  /** true when the check could not run because its artifact was unavailable */
  indeterminate?: boolean;
}

export interface CapabilityInputs {
  coverage?: Coverage | null;
  artists?: ArtistRow[] | null;
  revenue?: Revenue | null;
  run?: Run | null;
  variables?: Variables | null;
  transport?: TransportState | null;
  /** live-only artifacts, present when the API is up */
  rawPayloadCount?: number | null;
  auditLogCount?: number | null;
  providerHealth?: Record<string, unknown> | null;
}

const RX = {
  geography: /where[_ ]?people[_ ]?listen|listener[_ ]?geo|city|country_distribution/i,
  airplay: /airplay|radio|spins?_/i,
  trackStream: /track.*stream|stream.*track|spotify_streams|youtube_views_daily|pandora/i,
  chart: /chart/i,
  crossMarket: /cross[_ ]?market|foreign[_ ]?chart|chart.*country|market.*chart/i,
};

/** Variables with at least one observation, from the coverage projection. */
function observedVariables(coverage?: Coverage | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!coverage) return m;
  for (const c of coverage.cells) {
    if (c.obs_count > 0) m.set(c.variable, (m.get(c.variable) ?? 0) + c.obs_count);
  }
  return m;
}

function matchObserved(obs: Map<string, number>, rx: RegExp): { names: string[]; count: number } {
  const names: string[] = [];
  let count = 0;
  for (const [v, n] of obs) {
    if (rx.test(v)) {
      names.push(v);
      count += n;
    }
  }
  return { names, count };
}

export function deriveCapabilities(input: CapabilityInputs): Record<CapabilityId, Capability> {
  const { coverage, artists, revenue, run, variables, transport } = input;
  const obs = observedVariables(coverage);
  const haveCoverage = Boolean(coverage);

  const cap = (
    id: CapabilityId,
    label: string,
    present: boolean,
    evidence: string,
    count: number | null,
    gapId?: string,
    indeterminate = false,
  ): Capability => ({ id, label, present, evidence, count, gapId, indeterminate });

  /* ---- ingestion capabilities, detected from observed variables ---- */

  const geo = matchObserved(obs, RX.geography);
  const air = matchObserved(obs, RX.airplay);
  const trk = matchObserved(obs, RX.trackStream);
  const cht = matchObserved(obs, RX.chart);
  const xmk = matchObserved(obs, RX.crossMarket);

  /* ---- entity-level capabilities ---- */

  const countries = new Set(
    (artists ?? []).map((a) => a.country_field_value).filter(Boolean) as string[],
  );
  const residencyValues = (artists ?? []).filter((a) => a.residency_classification !== null).length;
  const routingValues = (artists ?? []).filter((a) => a.account_routing !== null).length;
  const withPlatformIds = (artists ?? []).filter((a) => a.spotify_id || a.youtube_id).length;
  const withScore = (artists ?? []).filter((a) => a.resolution_match_score !== null).length;
  const withConfidence = (artists ?? []).filter((a) => a.confidence_score !== null).length;

  /* ---- source plurality ---- */

  const platforms = new Set<string>();
  for (const c of coverage?.cells ?? []) for (const p of c.platforms) platforms.add(p);
  const endpointHosts = new Set<string>();
  for (const list of Object.values(coverage?.endpoints_by_variable ?? {})) {
    for (const e of list) endpointHosts.add(e.split('/')[1] ?? e);
  }

  /* ---- revenue-side capabilities ---- */

  const payoutRates = new Set<number>();
  for (const r of revenue?.rows ?? []) {
    if (r.spotify_revenue_usd && r.est_spotify_quarterly_streams) {
      payoutRates.add(
        Number((r.spotify_revenue_usd / r.est_spotify_quarterly_streams).toFixed(6)),
      );
    }
  }

  const isLive = transport?.mode === 'live';

  return {
    listenerGeography: cap(
      'listenerGeography',
      'Listener geography',
      geo.count > 0,
      geo.count > 0
        ? `${geo.count.toLocaleString('en-US')} observations across ${geo.names.length} variable(s).`
        : haveCoverage
          ? 'The metric is defined and produced no observations. The extraction skipped the call.'
          : 'Coverage artifact unavailable.',
      geo.count || null,
      'GAP-008',
      !haveCoverage,
    ),
    radioAirplay: cap(
      'radioAirplay',
      'Radio airplay',
      air.count > 0,
      air.count > 0
        ? `${air.count.toLocaleString('en-US')} observations across ${air.names.length} variable(s).`
        : 'No airplay variable has produced any observation. Scoped against a proposed integration and deferred.',
      air.count || null,
      'GAP-007',
      !haveCoverage,
    ),
    trackStreams: cap(
      'trackStreams',
      'Track-level stream counts',
      trk.count > 0,
      trk.count > 0
        ? `${trk.count.toLocaleString('en-US')} track-level stream observations.`
        : `No track-level stream observations. ${
            variables?.denied_endpoints?.length ?? 0
          } endpoints are recorded as confirmed 401.`,
      trk.count || null,
      'GAP-006',
      !haveCoverage,
    ),
    chartPositions: cap(
      'chartPositions',
      'Chart positions',
      cht.count > 0,
      cht.count > 0
        ? `${cht.count.toLocaleString('en-US')} chart observations.`
        : 'Chart metrics are defined and produced no observations.',
      cht.count || null,
      'GAP-009',
      !haveCoverage,
    ),
    crossMarketCharts: cap(
      'crossMarketCharts',
      'Cross-market chart detection',
      xmk.count > 0,
      xmk.count > 0
        ? `${xmk.count.toLocaleString('en-US')} cross-market observations.`
        : 'No variable records a chart appearance outside the domestic market.',
      xmk.count || null,
      'GAP-009',
      !haveCoverage,
    ),

    residencyClassification: cap(
      'residencyClassification',
      'Residency classification',
      residencyValues > 0,
      residencyValues > 0
        ? `${residencyValues} artists carry a residency classification.`
        : `No artist carries a residency classification. The country field holds ${
            countries.size
          } distinct value(s)${
            countries.size === 1 ? ` — "${[...countries][0]}" on every row` : ''
          }, so it is a constant passthrough, not a classification.`,
      residencyValues || null,
      'GAP-004',
      !artists,
    ),
    accountRouting: cap(
      'accountRouting',
      'GDP / GNI account routing',
      routingValues > 0,
      routingValues > 0
        ? `${routingValues} artists routed to an account.`
        : 'No artist is routed to a production or income account.',
      routingValues || null,
      'GAP-005',
      !artists,
    ),
    platformIdentifiers: cap(
      'platformIdentifiers',
      'Cross-platform identifiers',
      withPlatformIds > 0,
      withPlatformIds > 0
        ? `${withPlatformIds} of ${artists?.length ?? 0} artists carry a non-Chartmetric identifier.`
        : `No artist carries a Spotify or YouTube identifier; the columns are empty on all ${
            artists?.length ?? 0
          } rows.`,
      withPlatformIds || null,
      'GAP-027',
      !artists,
    ),
    matchConfidence: cap(
      'matchConfidence',
      'Entity match score',
      withScore > 0,
      withScore > 0
        ? `${withScore} of ${artists?.length ?? 0} artists carry a resolution score.`
        : 'No artist carries a resolution match score.',
      withScore || null,
      'GAP-024',
      !artists,
    ),
    confidenceScores: cap(
      'confidenceScores',
      'Confidence scores',
      withConfidence > 0,
      withConfidence > 0
        ? `${withConfidence} figures carry a confidence score.`
        : 'No confidence, standard error or interval field exists on any figure.',
      withConfidence || null,
      'GAP-023',
      !artists,
    ),

    ncr: cap(
      'ncr',
      'Nigeria Consumption Ratio',
      false,
      'No NCR field appears in any artifact the console reads.',
      null,
      'GAP-002',
    ),
    dei: cap(
      'dei',
      'Digital Export Index',
      false,
      'No DEI field appears in any artifact the console reads.',
      null,
      'GAP-003',
    ),

    perCallTelemetry: cap(
      'perCallTelemetry',
      'Per-call telemetry',
      isLive && (input.rawPayloadCount ?? 0) > 0,
      isLive
        ? (input.rawPayloadCount ?? 0) > 0
          ? `${input.rawPayloadCount?.toLocaleString('en-US')} payload records carry status code and request/response timestamps.`
          : 'The live API is up but returned no payload records.'
        : 'Static transport. Per-call status, latency and retry counts do not survive in the flat-file projection.',
      input.rawPayloadCount ?? null,
      'GAP-010',
    ),
    rawPayloads: cap(
      'rawPayloads',
      'Raw payload store',
      (input.rawPayloadCount ?? 0) > 0,
      (input.rawPayloadCount ?? 0) > 0
        ? `${input.rawPayloadCount?.toLocaleString('en-US')} raw payloads retrievable.`
        : 'No raw payload store is reachable. Response bodies behind the shipped figures are unavailable.',
      input.rawPayloadCount ?? null,
      'GAP-011',
    ),
    auditTrail: cap(
      'auditTrail',
      'Audit trail rows',
      (input.auditLogCount ?? 0) > 0,
      (input.auditLogCount ?? 0) > 0
        ? `${input.auditLogCount?.toLocaleString('en-US')} audit rows.`
        : 'The audit schema exists; no rows are reachable.',
      input.auditLogCount ?? null,
      'GAP-026',
    ),
    quotaTracking: cap(
      'quotaTracking',
      'Quota and rate limit',
      Boolean(
        input.providerHealth &&
          ('quota_remaining' in input.providerHealth || 'quota' in input.providerHealth),
      ),
      input.providerHealth
        ? 'Provider health responded; quota fields checked.'
        : 'No response header is read, so no quota counter or plan tier exists.',
      null,
      'GAP-014',
    ),
    archiveDepthProbe: cap(
      'archiveDepthProbe',
      'Measured archive depth',
      false,
      'No probe records how far back each source reaches. Observed first and last observation dates are shown as a derived proxy.',
      null,
      'GAP-015',
    ),
    stageTelemetry: cap(
      'stageTelemetry',
      'Per-stage telemetry',
      false,
      `No stage decomposition is recorded. The run carries a single unit triple${
        run?.total_units
          ? `: ${run.total_units.toLocaleString('en-US')} attempted, ${run.completed_units?.toLocaleString('en-US')} completed, ${run.failed_units?.toLocaleString('en-US')} failed`
          : ''
      }.`,
      run?.total_units ?? null,
      'GAP-013',
    ),
    validationRules: cap(
      'validationRules',
      'Validation rule registry',
      false,
      'No rule registry and no persisted rule results. Five markdown quality checks exist, three of which cannot fail by construction.',
      null,
      'GAP-012',
    ),

    multiSource: cap(
      'multiSource',
      'Multiple integrated sources',
      endpointHosts.size > 1,
      endpointHosts.size > 1
        ? `${endpointHosts.size} distinct endpoint namespaces observed.`
        : `One source is integrated. Observed platforms (${
            [...platforms].join(', ') || 'none'
          }) are all reached through a single provider API.`,
      endpointHosts.size || null,
      'GAP-036',
      !haveCoverage,
    ),
    payoutRateTable: cap(
      'payoutRateTable',
      'Per-platform payout rate table',
      payoutRates.size > 1,
      payoutRates.size > 1
        ? `${payoutRates.size} distinct implied per-stream rates.`
        : `A single implied per-stream rate${
            payoutRates.size === 1 ? ` of $${[...payoutRates][0]}` : ''
          } is applied across platforms. No rate table with effective dates exists.`,
      payoutRates.size || null,
      'GAP-021',
      !revenue,
    ),
    allocatedCost: cap(
      'allocatedCost',
      'Operating cost allocation',
      false,
      'Cost is a flat artist-count model, identical across quarters. Nothing is apportioned to a platform or an artist, so no net figure can exist.',
      null,
      'GAP-022',
    ),
  };
}

/** Capabilities that, once activated, unlock a panel that is currently thin. */
export const CAPABILITY_UNLOCKS: Partial<Record<CapabilityId, string[]>> = {
  listenerGeography: ['footprint', 'accounts', 'executive'],
  radioAirplay: ['footprint', 'graph', 'coverage'],
  trackStreams: ['executive', 'revenue', 'estimation'],
  crossMarketCharts: ['footprint', 'graph'],
  chartPositions: ['coverage', 'graph'],
  rawPayloads: ['lineage', 'audit'],
  perCallTelemetry: ['sources', 'monitoring', 'timeline'],
  auditTrail: ['audit'],
  quotaTracking: ['sources', 'monitoring'],
  residencyClassification: ['accounts', 'artists', 'executive'],
  multiSource: ['sources'],
};
