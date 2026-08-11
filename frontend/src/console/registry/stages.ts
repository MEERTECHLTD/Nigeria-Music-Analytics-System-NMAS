/**
 * PIPELINE STAGE REGISTER
 *
 * The 24 stages a national statistical production pipeline would expose, each
 * assessed against what this codebase actually implements.
 *
 *   IMPLEMENTED  the stage runs and leaves an artifact behind
 *   PARTIAL      the stage exists but produces little or no usable output
 *   SCRIPT_ONLY  it happens in a standalone script, outside the job pipeline,
 *                with no state, no telemetry and no audit record
 *   ABSENT       no code performs this stage
 *
 * Telemetry is recorded separately because a stage running is not the same as a
 * stage being observable. Of the six telemetry facets the brief asks for —
 * state, duration, records in, records out, records rejected, artifacts — this
 * pipeline records the last one and nothing else.
 */

export type StageStatus = 'IMPLEMENTED' | 'PARTIAL' | 'SCRIPT_ONLY' | 'ABSENT';

export interface Stage {
  n: number;
  name: string;
  subtitle?: string;
  status: StageStatus;
  evidence: string;
  /** which of state/duration/in/out/rejected/artifacts actually exist */
  telemetry: string;
  gapIds?: string[];
}

export const STAGES: Stage[] = [
  {
    n: 1,
    name: 'Source Registration',
    subtitle: 'Credential and quota handshake',
    status: 'PARTIAL',
    evidence:
      'A provider name and a configuration echo exist. There is no source registry table, no plan tier and no quota handshake — no response header is ever read. Retry behaviour does exist: 429 and 5xx are classified retryable and retried with linear backoff.',
    telemetry: 'Provider name, configured throttle and retry ceiling. No quota, no plan tier, no observed rate.',
    gapIds: ['GAP-014', 'GAP-036'],
  },
  {
    n: 2,
    name: 'Archive Depth Probe',
    subtitle: 'How far back each source reaches',
    status: 'ABSENT',
    evidence:
      'The window conditional returns the same value on both branches, so no depth differentiation occurs. The probe script tests endpoint existence, not depth.',
    telemetry: 'None.',
    gapIds: ['GAP-015'],
  },
  {
    n: 3,
    name: 'Entity Universe Resolution',
    subtitle: 'Nigerian artist roster assembly',
    status: 'PARTIAL',
    evidence:
      'A genuine unit triple is recorded per run — 13,624 attempted, 13,410 completed, 214 failed — which is the only records-in / records-out / records-rejected accounting in the pipeline. Entities skipped for a missing identifier are passed over without being counted.',
    telemetry: 'Total, completed and failed units per run. Skipped entities are uncounted.',
    gapIds: ['GAP-033'],
  },
  {
    n: 4,
    name: 'Cross Platform Identity Resolution',
    subtitle: 'Chartmetric / Spotify / Apple / ISNI reconciliation',
    status: 'PARTIAL',
    evidence:
      'The schema supports it; nothing populates it. Spotify and YouTube identifiers are empty on every artist row, and the override table is referenced nowhere.',
    telemetry: 'None. No match score is persisted.',
    gapIds: ['GAP-024', 'GAP-027'],
  },
  {
    n: 5,
    name: 'Residency Classification',
    subtitle: 'Resident vs diaspora, GDP vs GNI routing',
    status: 'ABSENT',
    evidence:
      'The country field is a constant on every row and no classification logic exists. The question is explicitly deferred to NBS in a spreadsheet note.',
    telemetry: 'None.',
    gapIds: ['GAP-004', 'GAP-005'],
  },
  {
    n: 6,
    name: 'Chart Ingestion',
    subtitle: 'Spotify NG, Apple Music NG, Shazam NG, iTunes, Deezer, YouTube',
    status: 'PARTIAL',
    evidence:
      'Chart metrics are defined but produced nothing. Shazam chart position is 100% missing across every quarter; the remaining chart endpoints are confirmed 401.',
    telemetry: 'Gap rows only.',
    gapIds: ['GAP-009'],
  },
  {
    n: 7,
    name: 'Track Level Stream Retrieval',
    subtitle: 'Observed stream counts',
    status: 'ABSENT',
    evidence:
      'Every track-level stream endpoint is among the 20 confirmed 401s. The system holds exactly one track row and no track-level observations.',
    telemetry: 'None.',
    gapIds: ['GAP-006'],
  },
  {
    n: 8,
    name: 'Monthly Listener Retrieval',
    subtitle: 'Audience size where streams are not exposed',
    status: 'IMPLEMENTED',
    evidence:
      'The only fully working ingestion stage. Roughly 99,000 monthly-listener observations, each carrying its endpoint, source field and extraction timestamp.',
    telemetry: 'Per-observation endpoint, source field, extraction timestamp and per-quarter counts.',
  },
  {
    n: 9,
    name: 'Stream Estimation Layer',
    subtitle: 'Conversion applied to the uncovered remainder',
    status: 'SCRIPT_ONLY',
    evidence:
      'Applied in a standalone script, not the job pipeline. Because no stream count is ever observed, the conversion is applied to the whole population rather than to a remainder.',
    telemetry: 'The Spotify estimate is written; the Deezer intermediate is discarded.',
    gapIds: ['GAP-006'],
  },
  {
    n: 10,
    name: 'Listener Geography Retrieval',
    subtitle: 'City and country distribution',
    status: 'PARTIAL',
    evidence:
      'Fully defined and implemented in the client, then explicitly skipped by the extraction on the grounds that the domestic share was already assumed.',
    telemetry: '1,047 gap rows and an equal number of limitation rows. Zero observations.',
    gapIds: ['GAP-008', 'GAP-039'],
  },
  {
    n: 11,
    name: 'Cross Market Chart Detection',
    subtitle: 'Nigerian artists on foreign charts',
    status: 'ABSENT',
    evidence: 'No code compares chart appearances across markets.',
    telemetry: 'None.',
    gapIds: ['GAP-009'],
  },
  {
    n: 12,
    name: 'Radio Airplay Ingestion',
    subtitle: 'International station spins',
    status: 'ABSENT',
    evidence:
      'No endpoint, metric or column exists. The capability was scoped — international radio airplay is one of five listed against a proposed SoundCharts integration — and deferred with that proposal.',
    telemetry: 'None.',
    gapIds: ['GAP-007'],
  },
  {
    n: 13,
    name: 'Deduplication and Cross Source Reconciliation',
    status: 'PARTIAL',
    evidence:
      'Deduplication happens via a compound unique key. Cross-source reconciliation cannot occur because only one source is integrated.',
    telemetry: 'The insert-versus-update split is never counted.',
    gapIds: ['GAP-029', 'GAP-036'],
  },
  {
    n: 14,
    name: 'Payout Rate Application',
    subtitle: 'Per platform per stream rates',
    status: 'SCRIPT_ONLY',
    evidence:
      'A single rate is inlined at the call site for three different platforms. No rate table and no effective date exist.',
    telemetry: 'The rate value appears only inside a source string.',
    gapIds: ['GAP-021'],
  },
  {
    n: 15,
    name: 'Revenue Estimation by Platform',
    status: 'SCRIPT_ONLY',
    evidence:
      'Four platform revenue columns per artist-quarter. No epistemic tag is attached to any of them.',
    telemetry: 'Output columns only.',
    gapIds: ['GAP-019'],
  },
  {
    n: 16,
    name: 'Operating Cost Allocation',
    subtitle: 'Proportional allocation',
    status: 'SCRIPT_ONLY',
    evidence:
      'Not an allocation. A flat artist-count model producing four cost lines that are byte-identical in all five quarters.',
    telemetry: 'Output columns only.',
    gapIds: ['GAP-022'],
  },
  {
    n: 17,
    name: 'NCR Computation',
    subtitle: 'Nigeria Consumption Ratio',
    status: 'ABSENT',
    evidence: 'The index does not exist in any form, under this or any other name.',
    telemetry: 'None.',
    gapIds: ['GAP-002'],
  },
  {
    n: 18,
    name: 'DEI Computation',
    subtitle: 'Digital Export Index',
    status: 'ABSENT',
    evidence:
      'The index does not exist. The nearest artifact is tautologically constant because export revenue is defined as a fixed share of streaming revenue.',
    telemetry: 'None.',
    gapIds: ['GAP-003'],
  },
  {
    n: 19,
    name: 'Confidence and Provenance Scoring',
    status: 'PARTIAL',
    evidence:
      'Provenance fields are written on every observation — endpoint, source field, aggregation rule, fallback flag, response hash. No numeric confidence score exists anywhere.',
    telemetry: 'Provenance persisted but served by no endpoint.',
    gapIds: ['GAP-017', 'GAP-023'],
  },
  {
    n: 20,
    name: 'Validation Rules',
    status: 'PARTIAL',
    evidence:
      'No rule registry and no failing-record list. Five markdown quality checks exist, of which three cannot fail by construction and none declares a threshold.',
    telemetry:
      'Limitation and gap rows, plus a real records-tested denominator: 13,624 units attempted, 13,410 completed, 214 failed.',
    gapIds: ['GAP-012'],
  },
  {
    n: 21,
    name: 'Quarter Coverage Attestation',
    status: 'PARTIAL',
    evidence:
      'Gap rows are produced but there is no completeness ratio, no attester and no attested-at. Gaps are destructively recomputed on each run, so no history survives.',
    telemetry: 'Gap counts only, all carrying an identical severity.',
    gapIds: ['GAP-031'],
  },
  {
    n: 22,
    name: 'Account Aggregation',
    subtitle: 'GDP production account and GNI account, separately',
    status: 'ABSENT',
    evidence: 'No GDP or GNI field exists on any model. The accounts are never separated.',
    telemetry: 'None.',
    gapIds: ['GAP-005'],
  },
  {
    n: 23,
    name: 'Output Generation and Export',
    status: 'IMPLEMENTED',
    evidence:
      'Nine artifacts produced, each with a SHA-256 hash, a record count, a file path and a creation timestamp. The best-instrumented stage in the pipeline.',
    telemetry: 'Artifact hash, record count, path and timestamp.',
  },
  {
    n: 24,
    name: 'Audit Commit',
    status: 'PARTIAL',
    evidence:
      'Nine action types across three categories, with a free-text actor and a JSON detail blob. No hash chain, no signature, no immutability guarantee — and no rows survive, because the database does not exist on disk.',
    telemetry: 'Schema only. Zero surviving rows.',
    gapIds: ['GAP-011', 'GAP-026'],
  },
];

export const STAGE_COUNTS = {
  implemented: STAGES.filter((s) => s.status === 'IMPLEMENTED').length,
  partial: STAGES.filter((s) => s.status === 'PARTIAL').length,
  scriptOnly: STAGES.filter((s) => s.status === 'SCRIPT_ONLY').length,
  absent: STAGES.filter((s) => s.status === 'ABSENT').length,
  total: STAGES.length,
};

export const STAGE_EPISTEMIC: Record<StageStatus, string> = {
  IMPLEMENTED: 'observed',
  PARTIAL: 'estimated',
  SCRIPT_ONLY: 'assumed',
  ABSENT: 'unavailable',
};
