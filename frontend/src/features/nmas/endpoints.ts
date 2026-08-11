/**
 * ENDPOINT CATALOGUE
 *
 * Every route the FastAPI backend exposes, what it feeds, and whether the
 * interface can operate without it. This is the contract the Operations Console
 * activates against: when the backend answers, each row here flips to reachable
 * and the surface that depends on it starts working — no code change.
 *
 * `probe: true` marks routes that are safe to call unauthenticated with no
 * arguments, so the status board can test them live. Mutating routes and routes
 * needing an id are catalogued but never probed.
 */

export type EndpointMethod = 'GET' | 'POST' | 'PATCH';

export interface EndpointSpec {
  method: EndpointMethod;
  path: string;
  group: 'Health' | 'Admin' | 'Entities' | 'Jobs' | 'Evidence' | 'Reports' | 'Exports' | 'NBS';
  purpose: string;
  /** which surface consumes it */
  consumer: string;
  /** safe to probe with no arguments */
  probe?: boolean;
  /** what becomes available when this route starts answering */
  unlocks?: string;
}

export const ENDPOINTS: EndpointSpec[] = [
  {
    method: 'GET', path: '/health', group: 'Health', probe: true,
    purpose: 'Liveness probe. The single signal that promotes every surface to live.',
    consumer: 'Transport resolver',
    unlocks: 'Live mode and auto-polling across the console, dashboard and operations surfaces.',
  },
  {
    method: 'GET', path: '/api/v1/reference-periods/defaults', group: 'Admin', probe: true,
    purpose: 'Default quarter set offered when configuring a job.',
    consumer: 'Operations Console — job builder',
  },
  {
    method: 'GET', path: '/api/v1/admin/provider-health', group: 'Admin', probe: true,
    purpose: 'Provider name, base URL, auth mode, token presence, throttle, retry ceiling.',
    consumer: 'Source Intelligence (panel 3)',
    unlocks: 'Authentication state and configured limits, replacing NOT COLLECTED tiles.',
  },
  {
    method: 'GET', path: '/api/v1/admin/dashboard', group: 'Admin', probe: true,
    purpose: 'Entity, job and observation totals.',
    consumer: 'Operations Console — header metrics',
  },
  {
    method: 'GET', path: '/api/v1/admin/audit-logs', group: 'Admin', probe: true,
    purpose: 'Audit events: category, action, actor, details, timestamp.',
    consumer: 'Audit Trail (panel 15)',
    unlocks: 'The audit trail, which currently has a schema but zero reachable rows (GAP-026).',
  },
  {
    method: 'GET', path: '/api/v1/entities/artists', group: 'Entities', probe: true,
    purpose: 'Artist roster with platform identifiers and curation status.',
    consumer: 'Artist Universe (panel 4), Operations Console',
    unlocks: 'Live platform identifiers, if populated — currently empty on every row (GAP-027).',
  },
  {
    method: 'POST', path: '/api/v1/entities/artists/import', group: 'Entities',
    purpose: 'Bulk artist import from CSV.',
    consumer: 'Operations Console — entities tab',
  },
  {
    method: 'PATCH', path: '/api/v1/entities/artists/{artist_id}', group: 'Entities',
    purpose: 'Update an artist record.',
    consumer: 'Operations Console — entities tab',
  },
  {
    method: 'GET', path: '/api/v1/entities/artists/{artist_id}', group: 'Entities',
    purpose: 'Single artist record.',
    consumer: 'Artist Universe row expansion',
  },
  {
    method: 'GET', path: '/api/v1/entities/tracks', group: 'Entities', probe: true,
    purpose: 'Track roster.',
    consumer: 'Entity Graph (panel 9), Operations Console',
    unlocks: 'Track-level nodes. The system currently holds one track row.',
  },
  {
    method: 'POST', path: '/api/v1/entities/tracks/import', group: 'Entities',
    purpose: 'Bulk track import from CSV.',
    consumer: 'Operations Console — entities tab',
  },
  {
    method: 'PATCH', path: '/api/v1/entities/tracks/{track_id}', group: 'Entities',
    purpose: 'Update a track record.',
    consumer: 'Operations Console — entities tab',
  },
  {
    method: 'GET', path: '/api/v1/entities/tracks/{track_id}', group: 'Entities',
    purpose: 'Single track record.',
    consumer: 'Entity Graph drill-through',
  },
  {
    method: 'GET', path: '/api/v1/methodology', group: 'Reports', probe: true,
    purpose: 'Per-variable methodology: definition, aggregation rule, limitations, status.',
    consumer: 'Methodology Inspector (panel 11)',
    unlocks: 'Per-variable methodology status as recorded by the pipeline.',
  },
  {
    method: 'GET', path: '/api/v1/jobs', group: 'Jobs', probe: true,
    purpose: 'Extraction job list with cadence, periods, variables and scope.',
    consumer: 'Operations Console — jobs tab, Run Timeline (panel 13)',
  },
  {
    method: 'POST', path: '/api/v1/jobs', group: 'Jobs',
    purpose: 'Create an extraction job.',
    consumer: 'Operations Console — job builder',
  },
  {
    method: 'GET', path: '/api/v1/jobs/{job_id}', group: 'Jobs',
    purpose: 'Single job definition.',
    consumer: 'Operations Console',
  },
  {
    method: 'GET', path: '/api/v1/jobs/{job_id}/runs', group: 'Jobs',
    purpose: 'Run history with unit counts and status.',
    consumer: 'Run Timeline (panel 13)',
    unlocks: 'Multiple runs, replacing the single historical run the console reports today.',
  },
  {
    method: 'POST', path: '/api/v1/jobs/{job_id}/run', group: 'Jobs',
    purpose: 'Start an extraction run.',
    consumer: 'Operations Console — jobs tab',
  },
  {
    method: 'POST', path: '/api/v1/jobs/{job_id}/resume', group: 'Jobs',
    purpose: 'Resume from the last checkpoint.',
    consumer: 'Operations Console — jobs tab',
  },
  {
    method: 'POST', path: '/api/v1/jobs/{job_id}/retry-failed', group: 'Jobs',
    purpose: 'Retry only the units that failed.',
    consumer: 'Operations Console — jobs tab',
  },
  {
    method: 'POST', path: '/api/v1/jobs/{job_id}/pause', group: 'Jobs',
    purpose: 'Flip the job status flag.',
    consumer: 'Operations Console — jobs tab',
  },
  {
    method: 'GET', path: '/api/v1/jobs/{job_id}/failures', group: 'Jobs',
    purpose: 'Failed units with error classification.',
    consumer: 'Validation Centre (panel 12), System Monitoring (panel 14)',
    unlocks: 'Per-unit failure attribution. Only an aggregate tally exists today (GAP-028).',
  },
  {
    method: 'GET', path: '/api/v1/observations', group: 'Evidence', probe: true,
    purpose: 'Normalised observations with provider, endpoint, source field and aggregation rule.',
    consumer: 'Lineage Inspector (panel 8), Coverage Matrix (panel 2)',
    unlocks: 'Row-level observation lineage rather than cell aggregates.',
  },
  {
    method: 'GET', path: '/api/v1/coverage-gaps', group: 'Evidence', probe: true,
    purpose: 'Recorded coverage gaps per variable, period and scope.',
    consumer: 'Coverage Matrix (panel 2), Validation Centre (panel 12)',
    unlocks: 'Entity-attributed gaps, if the serializer carries the entity columns (GAP-016).',
  },
  {
    method: 'GET', path: '/api/v1/limitations', group: 'Evidence', probe: true,
    purpose: 'Limitation flags with code, description and fallback state.',
    consumer: 'Validation Centre (panel 12)',
  },
  {
    method: 'GET', path: '/api/v1/raw-payloads', group: 'Evidence', probe: true,
    purpose: 'Per-call records: status code, attempt count, request and response timestamps, response hash.',
    consumer: 'Lineage Inspector (panel 8), Source Intelligence (panel 3)',
    unlocks:
      'The single largest gain available. Closes GAP-011 and makes latency derivable from the two stored timestamps (GAP-010).',
  },
  {
    method: 'GET', path: '/api/v1/raw-payloads/{payload_id}', group: 'Evidence',
    purpose: 'A single raw provider response body.',
    consumer: 'Lineage Inspector drill-through',
    unlocks: 'Walking a headline figure all the way down to the response that produced it.',
  },
  {
    method: 'GET', path: '/api/v1/reports/quarterly', group: 'Reports', probe: true,
    purpose: 'Quarterly aggregates per entity and variable.',
    consumer: 'Lineage Inspector (panel 8), Coverage Matrix (panel 2)',
  },
  {
    method: 'GET', path: '/api/v1/exports', group: 'Exports', probe: true,
    purpose: 'Generated export artifacts with SHA-256, record count and path.',
    consumer: 'Artifact Manifest, Audit Trail (panel 15)',
    unlocks: 'Live artifact hashes — the only integrity evidence the system produces.',
  },
  {
    method: 'POST', path: '/api/v1/exports', group: 'Exports',
    purpose: 'Generate the export bundle for a job.',
    consumer: 'Operations Console — outputs tab',
  },
  {
    method: 'GET', path: '/api/v1/exports/{artifact_id}/download', group: 'Exports',
    purpose: 'Download a generated artifact.',
    consumer: 'Operations Console — outputs tab',
  },
  {
    method: 'GET', path: '/api/v1/nbs/summary', group: 'NBS', probe: true,
    purpose: 'Period totals for the four headline deliverables.',
    consumer: 'NBS Dashboard',
  },
  {
    method: 'GET', path: '/api/v1/nbs/streaming-revenue', group: 'NBS', probe: true,
    purpose: 'Per-artist streaming revenue, optionally filtered by period.',
    consumer: 'NBS Dashboard, Platform Revenue (panel 6)',
  },
  {
    method: 'GET', path: '/api/v1/nbs/export-revenue', group: 'NBS', probe: true,
    purpose: 'Per-artist export revenue with domestic and export share columns.',
    consumer: 'NBS Dashboard, Export Footprint (panel 10)',
  },
  {
    method: 'GET', path: '/api/v1/nbs/employment', group: 'NBS', probe: true,
    purpose: 'Employment series by period and gender split.',
    consumer: 'NBS Dashboard, Account Separation (panel 5)',
  },
  {
    method: 'GET', path: '/api/v1/nbs/costs', group: 'NBS', probe: true,
    purpose: 'Hosting and production cost lines by period.',
    consumer: 'NBS Dashboard, Platform Revenue (panel 6)',
  },
  {
    method: 'GET', path: '/api/v1/nbs/top-artists', group: 'NBS', probe: true,
    purpose: 'Ranked artists for a period.',
    consumer: 'NBS Dashboard',
  },
];

export const PROBEABLE = ENDPOINTS.filter((e) => e.probe);

export const ENDPOINT_GROUPS = [
  'Health', 'Admin', 'Entities', 'Jobs', 'Evidence', 'Reports', 'Exports', 'NBS',
] as const;
