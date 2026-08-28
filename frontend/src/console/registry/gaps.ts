/**
 * GAP REGISTER
 *
 * Every requirement of the statistical production console that the pipeline
 * does not currently satisfy. A panel that cannot be backed renders NOT
 * COLLECTED and points here; nothing is quietly filled in.
 *
 * Status meanings:
 *   NOT_COLLECTED        the artifact does not exist anywhere
 *   PARTIAL              some of it exists, not enough for the requirement
 *   PRESENT_BUT_UNEXPOSED the pipeline produces it; nothing serves it
 *   INCONSISTENT         it exists more than once with conflicting values
 */

export type GapStatus =
  | 'NOT_COLLECTED'
  | 'PARTIAL'
  | 'PRESENT_BUT_UNEXPOSED'
  | 'INCONSISTENT';

export type GapSeverity = 'blocking' | 'major' | 'minor';

export interface Gap {
  id: string;
  requirement: string;
  panels: number[];
  status: GapStatus;
  severity: GapSeverity;
  evidence: string;
  remedy: string;
}

export const GAPS: Gap[] = [
  {
    id: 'GAP-001',
    requirement: '24 quarters of coverage',
    panels: [1, 2, 4, 7],
    status: 'PARTIAL',
    severity: 'blocking',
    evidence:
      'Revenue artifacts carry 5 quarters; daily observations carry 9 (Q1 2024 – Q1 2026, earliest date 2024-01-01); the system’s own DB export carries 8. A 24-quarter grid would be 83% empty.',
    remedy:
      'Render the matrix at 9 quarters with the archive floor stated. Quarters before Q1 2024 are shown as structurally unavailable, not as empty cells.',
  },
  {
    id: 'GAP-002',
    requirement: 'NCR (Nigeria Consumption Ratio) computation',
    panels: [1, 11],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence: 'Zero occurrences of the term or any equivalent computation in code or documentation.',
    remedy:
      'Panel 11 renders NOT IMPLEMENTED for NCR. The 30% domestic-share constant is shown separately and labelled assumed — never as an NCR.',
  },
  {
    id: 'GAP-003',
    requirement: 'DEI (Digital Export Index) computation',
    panels: [1, 11],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'Zero occurrences. The nearest artifact, Export Share %, is tautologically 70.0 because export revenue is itself defined as streaming × 0.70.',
    remedy: 'Render NOT IMPLEMENTED and show the tautology explicitly as a methodology warning.',
  },
  {
    id: 'GAP-004',
    requirement: 'Residency classification and its basis',
    panels: [1, 4, 5],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'artists.country is a free string defaulting to "NG" — the value on 131/131 artist rows and 855/855 population-frame rows. Zero variance, and no classification logic anywhere.',
    remedy:
      'The residency column states that country is a constant passthrough, not a classification. No resident/diaspora split is displayed.',
  },
  {
    id: 'GAP-005',
    requirement: 'GDP / GNI account routing',
    panels: [1, 4, 5],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence: 'No GDP or GNI field on any model; no routing logic; the concept appears only in prose.',
    remedy: 'Panel 5 renders in full as an unbuilt capability, with what would be required to build it.',
  },
  {
    id: 'GAP-006',
    requirement: 'Observed stream counts',
    panels: [1, 4, 6, 7],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'All 20 denied endpoints are confirmed 401, covering every track-level stream and chart route. The system contains exactly one track row. Every stream figure is monthly listeners × 3.5 × 3.',
    remedy:
      'Total observed streams renders 0 with the denied-endpoint register as the reason. Every stream figure carries an ESTIMATED chip.',
  },
  {
    id: 'GAP-007',
    requirement: 'Radio airplay ingestion',
    panels: [2, 9, 10],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'No endpoint, metric or column exists. It was, however, scoped: the correspondence context lists “international radio airplay” among the five capabilities SoundCharts was proposed to supply. It was deferred with that proposal, not overlooked.',
    remedy:
      'Matrix row and graph node render NOT COLLECTED — scoped and deferred, which is a different claim from never considered.',
  },
  {
    id: 'GAP-008',
    requirement: 'Listener geography (Where People Listen)',
    panels: [1, 2, 4, 10],
    status: 'PARTIAL',
    severity: 'blocking',
    evidence:
      'The metric is fully defined and the client can call it, but the extraction explicitly skips it: “skip for now (already have domestic share = 30%)”. 1,047 gap rows record the absence.',
    remedy:
      'Render as “defined, attempted, 100% empty” — a state distinct from never attempted — with the skip comment quoted as evidence.',
  },
  {
    id: 'GAP-009',
    requirement: 'Cross-market chart appearances',
    panels: [2, 9, 10],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'No code compares chart appearances across markets. Shazam chart position is 100% missing across all 8 quarters; every other chart endpoint is 401.',
    remedy: 'NOT COLLECTED, shown beside the denied-endpoint register.',
  },
  {
    id: 'GAP-010',
    requirement: 'Per-call telemetry (status, latency, retries)',
    panels: [3, 8, 13, 14],
    status: 'PARTIAL',
    severity: 'blocking',
    evidence:
      'The database path already exposes status code, attempt count, request and response timestamps and a response hash — but the payload record is constructed only inside the success branch, so no row exists for any failed call, and latency is never derived from the two stored timestamps. The scripts that produced the shipped data discard the response envelope entirely, and no database survives.',
    remedy:
      'Renders NOT COLLECTED for the shipped data. Only endpoint, source field and extraction timestamp survive per observation. Latency would be derivable client-side from the stored timestamps if a database were restored.',
  },
  {
    id: 'GAP-011',
    requirement: 'Raw payload store',
    panels: [8, 15],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'No database file exists on disk; the delivery database directory is empty. Every raw payload, audit log and checkpoint row ever written is unavailable.',
    remedy:
      'The lineage inspector renders the CSV-level chain only and states that raw payloads are unavailable.',
  },
  {
    id: 'GAP-012',
    requirement: 'Validation rule registry and results',
    panels: [12],
    status: 'PARTIAL',
    severity: 'blocking',
    evidence:
      'No rule registry and no failing-record list. Five markdown quality checks exist; three cannot fail by construction and none states a threshold. A genuine tested/passed/failed triple does exist at extraction-unit granularity: 13,624 units attempted (131 master-list rows × 13 variables × 8 quarters), 13,410 completed, 214 failed.',
    remedy:
      'Render the five checks verbatim, each annotated TAUTOLOGICAL / NO THRESHOLD / REAL, and show the unit triple as the one real denominator the system has. Never present the five checks as “validation passed”.',
  },
  {
    id: 'GAP-013',
    requirement: 'Pipeline stage identity and timings',
    panels: [13, 15],
    status: 'NOT_COLLECTED',
    severity: 'blocking',
    evidence:
      'No stage table, no stage name, no stage timing. Extraction is a serial loop with no concurrency primitives anywhere.',
    remedy:
      'The run timeline renders a single bar for the one recorded run and states that no stage decomposition was recorded.',
  },
  {
    id: 'GAP-014',
    requirement: 'Quota, rate limit and plan tier',
    panels: [3, 14],
    status: 'PARTIAL',
    severity: 'blocking',
    evidence:
      'No response headers are read, so no quota counter, Retry-After honouring or plan tier exists. Rate limiting itself is handled: HTTP 429 and 5xx are classified retryable and retried with linear backoff, and the shipped failure taxonomy records 429s. What is absent is header-driven awareness, not retry logic.',
    remedy:
      'Quota and plan tier render NOT COLLECTED. The configured throttle is shown as configuration, explicitly not as a measurement, and with both deployment values since they differ.',
  },
  {
    id: 'GAP-015',
    requirement: 'Archive depth probe',
    panels: [2, 3],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence:
      'The window branch is a no-op — both sides of the conditional return 365. The probe script tests endpoint existence only, not depth.',
    remedy:
      'Measured archive depth renders NOT PROBED. Observed first and last observation dates per variable are shown as a derived proxy, labelled as such.',
  },
  {
    id: 'GAP-016',
    requirement: 'Artist attribution on gaps and limitations',
    panels: [2, 4, 12],
    status: 'PRESENT_BUT_UNEXPOSED',
    severity: 'major',
    evidence:
      'Entity identifiers exist on the coverage-gap model but are dropped by both the exporter and the response schema.',
    remedy:
      'Serializer-only addition of the entity columns. Until then the matrix is variable × quarter, not artist-level.',
  },
  {
    id: 'GAP-017',
    requirement: 'Observation → raw payload provenance edge',
    panels: [4, 7, 8],
    status: 'PRESENT_BUT_UNEXPOSED',
    severity: 'major',
    evidence:
      'The payload foreign key and the fallback/provenance fields are written on every observation and appear in no response schema or export.',
    remedy: 'Serializer-only addition of the provenance fields to the observation response.',
  },
  {
    id: 'GAP-018',
    requirement: 'Observation count per aggregate',
    panels: [2, 4, 7, 12],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'obs_count, first_value and last_value are present in the full aggregates artifact but absent from the served aggregate response. 181 aggregate rows are built from a single observation.',
    remedy:
      'Serve the full aggregates artifact. obs_count becomes the coverage denominator the system otherwise lacks.',
  },
  {
    id: 'GAP-019',
    requirement: 'Epistemic flag on export, employment and cost figures',
    panels: [1, 6, 7],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'Only one epistemic flag exists in the entire delivery, on YouTube views. No other artifact distinguishes observation from estimate.',
    remedy:
      'Apply the epistemic classification as presentation metadata from the constants register. Never written back into the data.',
  },
  {
    id: 'GAP-020',
    requirement: 'Allocation shares behind the export split',
    panels: [1, 6, 7, 10],
    status: 'PRESENT_BUT_UNEXPOSED',
    severity: 'major',
    evidence:
      'Domestic share, export share, market list and source are present on every row of the export artifact and dropped by both the API projection and the static generator.',
    remedy: 'Pass all four columns through. Read-only field additions.',
  },
  {
    id: 'GAP-021',
    requirement: 'Per-platform payout rate table with effective dates',
    panels: [6, 7, 11],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence:
      'No rate table exists on any model. One rate of $0.004 is inlined for Spotify, YouTube and Deezer, while the published rate card claims differentiated rates that no code path applies.',
    remedy:
      'Render the constants register with the code/documentation divergence stated. Effective date renders NOT COLLECTED.',
  },
  {
    id: 'GAP-022',
    requirement: 'Operating cost allocation',
    panels: [6],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence:
      'Cost is a flat artist-count model, identical in all five quarters. Nothing is apportioned to a platform or an artist.',
    remedy: 'Allocated cost and net render NOT COLLECTED. The flat model is shown separately with its zero temporal variance stated.',
  },
  {
    id: 'GAP-023',
    requirement: 'Confidence or uncertainty on any figure',
    panels: [1, 4, 7],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence: 'No confidence, standard error or interval field exists anywhere.',
    remedy: 'No confidence column. Observation count is used as an explicitly-labelled coverage proxy only.',
  },
  {
    id: 'GAP-024',
    requirement: 'Entity-resolution audit (match basis and score)',
    panels: [4, 8, 9],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'A provider match score exists for 65 of the 131 roster rows and is carried into the artist extract’s metadata. The remaining 66 carry no score at all, and the override table is referenced nowhere outside its definition. No score is attached to the artists whose binding is most in doubt.',
    remedy:
      'Show the match score where one exists and NOT COLLECTED where it does not — the absence is the finding. A low observation range against a high-profile name is a resolution smell the console should surface, but no score in this artifact would have caught it.',
  },
  {
    id: 'GAP-025',
    requirement: 'Job progress and checkpoint visibility',
    panels: [13, 14, 15],
    status: 'PRESENT_BUT_UNEXPOSED',
    severity: 'major',
    evidence:
      'Checkpoints are fully populated and served by no endpoint. Progress is in any case unobservable mid-run because the run holds the request open and counter flushes are transaction-local.',
    remedy: 'A read-only checkpoint endpoint would surface them. Live progress remains structurally impossible.',
  },
  {
    id: 'GAP-026',
    requirement: 'Audit trail completeness',
    panels: [15],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'The audit model carries category, action, actor and details only — no service, stage, duration or status, and no hash chain. The actor is unauthenticated self-assertion. No rows survive.',
    remedy:
      'Render the missing columns as NOT COLLECTED and state that the actor field is self-asserted and unverified.',
  },
  {
    id: 'GAP-027',
    requirement: 'Platform identifiers across sources',
    panels: [4, 9],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'Spotify id, YouTube id, label and genres are empty on 131/131 rows in every artist artifact. The platform-account table is referenced nowhere.',
    remedy: 'Show the Chartmetric identifier only; render the others NOT COLLECTED rather than as blank cells.',
  },
  {
    id: 'GAP-028',
    requirement: 'HTTP status codes of failed calls',
    panels: [3, 8, 12, 14],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'A single aggregate failure row exists: 214 failures spanning HTTP 429, HTTP 401 and a TCP connection reset. No per-call attribution exists.',
    remedy: 'Render the three failure classes and the aggregate rate, and state that per-call attribution is unavailable.',
  },
  {
    id: 'GAP-029',
    requirement: 'Records rejected during normalisation',
    panels: [3, 12],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence: 'Six silent skip branches in the normaliser increment no counter of any kind.',
    remedy: 'Records rejected renders NOT COLLECTED for every stage.',
  },
  {
    id: 'GAP-030',
    requirement: 'The one epistemic flag rendered anywhere',
    panels: [1, 4, 6, 7],
    status: 'PARTIAL',
    severity: 'major',
    evidence:
      'The flag is rendered, but asymmetrically: the current dashboard shows a tick only when the value is “actual”, so the 426 estimated rows appear as unadorned numbers under a column headed “YouTube views”. Absence of a marker reads as an ordinary value rather than as an estimate. The flag is also dropped entirely from two of the three served projections.',
    remedy:
      'Mark both states explicitly and carry the flag into every projection. An estimate must be labelled positively, never by the absence of a badge.',
  },
  {
    id: 'GAP-031',
    requirement: 'Coverage and limitation metadata for the newest quarter',
    panels: [2, 12],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence:
      'Both quality reports stop at Q4 2025. Q1 2026 — the newest and largest quarter — carries no quality metadata at all.',
    remedy: 'The matrix marks that column as having no quality metadata, distinct from having no gaps.',
  },
  {
    id: 'GAP-032',
    requirement: 'Reconciliation of the two parallel pipelines',
    panels: [1, 2, 4],
    status: 'INCONSISTENT',
    severity: 'major',
    evidence:
      'The database export holds 265,538 observations over 65 artists and 8 quarters. The script artifact holds 850,059 over 131 roster rows and 9 quarters. The documentation states a third figure.',
    remedy: 'Display the script artifact as the source and show all three counts side by side with their paths. Never present one as “the” count.',
  },
  {
    id: 'GAP-033',
    requirement: 'Artist-count consistency',
    panels: [1, 4],
    status: 'INCONSISTENT',
    severity: 'minor',
    evidence:
      'The master list holds 131 ROWS but 130 distinct artists — "Flavour" and "Flavour N\'abania" are one person under provider ids 56982 and 372062, each producing revenue in all five quarters. The summary reports 127; the cost model bills 131; per-period revenue counts are 128/128/128/127/127; the database export holds 65.',
    remedy: 'State every count under its own name — rows versus distinct artists — name the duplicate identity, and show the per-period count against the roster as a denominator. Counts are derived in generated/cohortFacts.ts so they cannot drift from the delivered files.',
  },
  {
    id: 'GAP-034',
    requirement: 'Uncorrupted citation column in the delivered export dataset',
    panels: [7, 8],
    status: 'INCONSISTENT',
    severity: 'minor',
    evidence:
      'The delivery copy of the export dataset has 643 distinct source values, incrementing a citation year across rows. The backend original has two.',
    remedy: 'Read from the backend original. The corrupted copy is flagged in the artifact register.',
  },
  {
    id: 'GAP-035',
    requirement: 'Correct aggregation rule for cumulative counters',
    panels: [2, 7, 11],
    status: 'INCONSISTENT',
    severity: 'major',
    evidence:
      'Cumulative view counters are aggregated with sum, overstating quarterly figures by up to five orders of magnitude. One artist-quarter reads 142 million against a true delta of 460.',
    remedy:
      'Display last − first beside the published value, labelled a presentation-side correction. Never silently replace the published figure.',
  },
  {
    id: 'GAP-036',
    requirement: 'SoundCharts as a credited source',
    panels: [1, 3, 7, 8],
    status: 'NOT_COLLECTED',
    severity: 'major',
    evidence:
      'No SoundCharts client, URL or credential exists anywhere. The only HTTP client in the repository targets Chartmetric. The name nonetheless appears in the shipped source column and in the current dashboard.',
    remedy: 'Drop the claim. Source Intelligence lists exactly one source.',
  },
  {
    id: 'GAP-037',
    requirement: 'A single working data transport',
    panels: [],
    status: 'INCONSISTENT',
    severity: 'minor',
    evidence:
      'The frontend fetches static JSON paths while the live API serves different routes. No single base URL makes both existing views work.',
    remedy: 'The console commits to the static projection, which is the only transport that works in production.',
  },
  {
    id: 'GAP-038',
    requirement: 'Denied-endpoint register surfaced',
    panels: [3, 7, 11],
    status: 'PRESENT_BUT_UNEXPOSED',
    severity: 'minor',
    evidence:
      'Twenty confirmed 401 endpoints are recorded in code and referenced nowhere. This register is the entire reason the estimation layer exists.',
    remedy: 'Serve it read-only and show it on Source Intelligence, Estimation Transparency and Methodology.',
  },
  {
    id: 'GAP-039',
    requirement: 'Honest provenance for the domestic share',
    panels: [5, 7, 10],
    status: 'INCONSISTENT',
    severity: 'major',
    evidence:
      'The 30% domestic share is attributed to listener-geography data, which the extraction explicitly skipped calling on the grounds that the 30% figure was already held.',
    remedy: 'Label ASSUMED CONSTANT — NOT MEASURED, with the skip comment quoted as evidence.',
  },
  {
    id: 'GAP-040',
    requirement: 'A single economic model',
    panels: [7, 11],
    status: 'INCONSISTENT',
    severity: 'minor',
    evidence:
      'The repository README declares an employment and GDP-multiplier model that the delivery does not use and that the architecture audit explicitly disowns.',
    remedy: 'Show only the implemented model; list the superseded one as not implemented.',
  },
];

export const GAPS_BY_ID = Object.fromEntries(GAPS.map((g) => [g.id, g])) as Record<string, Gap>;

export function gapsForPanel(panel: number): Gap[] {
  return GAPS.filter((g) => g.panels.includes(panel));
}

export const GAP_COUNTS = {
  total: GAPS.length,
  blocking: GAPS.filter((g) => g.severity === 'blocking').length,
  major: GAPS.filter((g) => g.severity === 'major').length,
  minor: GAPS.filter((g) => g.severity === 'minor').length,
  notCollected: GAPS.filter((g) => g.status === 'NOT_COLLECTED').length,
  unexposed: GAPS.filter((g) => g.status === 'PRESENT_BUT_UNEXPOSED').length,
  inconsistent: GAPS.filter((g) => g.status === 'INCONSISTENT').length,
};
