/**
 * Panel registry. Feasibility is stated up front and shown in the navigation,
 * so a reader knows before opening a panel how much of it the data can support.
 */

export type Feasibility = 'FULL' | 'SUBSTANTIAL' | 'PARTIAL' | 'THIN' | 'NOT_COLLECTED';

export interface PanelMeta {
  id: string;
  n: number | null;
  title: string;
  group: 'Overview' | 'Coverage' | 'Method' | 'Operations' | 'Register';
  /** proportion of the panel specification the artifacts can support */
  backed: number;
  feasibility: Feasibility;
  summary: string;
}

export const PANELS: PanelMeta[] = [
  {
    id: 'executive',
    n: 1,
    title: 'Executive Console',
    group: 'Overview',
    backed: 35,
    feasibility: 'PARTIAL',
    summary:
      'Headline figures with their lineage. Observed streams, residency split, NCR and DEI are structurally unavailable and say so.',
  },
  {
    id: 'coverage',
    n: 2,
    title: 'Quarter Coverage Matrix',
    group: 'Coverage',
    backed: 40,
    feasibility: 'PARTIAL',
    summary:
      'Thirty-one quarters against fifty-nine variables across two providers. The 2024 archive floor was broken by the Soundcharts integration; see Provider Expansion for what changed.',
  },
  {
    id: 'sources',
    n: 3,
    title: 'Source Intelligence',
    group: 'Operations',
    backed: 20,
    feasibility: 'THIN',
    summary:
      'Two providers are integrated, with quota, rate limit and archive depth recorded — and a plausibility guard that diagnoses defective records on both sides. Historical panel content below describes the first delivery.',
  },
  {
    id: 'artists',
    n: 4,
    title: 'Artist Universe',
    group: 'Coverage',
    backed: 35,
    feasibility: 'PARTIAL',
    summary:
      '131 master-list rows — 129 distinct artists — with real coverage and estimated totals. Platform identifiers, residency and confidence are empty on every row.',
  },
  {
    id: 'accounts',
    n: 5,
    title: 'Account Separation',
    group: 'Method',
    backed: 0,
    feasibility: 'NOT_COLLECTED',
    summary: 'No residency field, no GNI concept, no classification rule exists anywhere.',
  },
  {
    id: 'revenue',
    n: 6,
    title: 'Platform Revenue',
    group: 'Method',
    backed: 40,
    feasibility: 'PARTIAL',
    summary:
      'Real per-platform revenue against one undifferentiated payout rate. Cost is never allocated, so net cannot exist.',
  },
  {
    id: 'estimation',
    n: 7,
    title: 'Estimation Transparency',
    group: 'Method',
    backed: 65,
    feasibility: 'SUBSTANTIAL',
    summary:
      'The best-backed panel. Every conversion coefficient is known and every input is on disk.',
  },
  {
    id: 'lineage',
    n: 8,
    title: 'Lineage Inspector',
    group: 'Method',
    backed: 15,
    feasibility: 'THIN',
    summary:
      'Endpoint, source field and extraction timestamp survive per observation. Raw payloads do not.',
  },
  {
    id: 'graph',
    n: 9,
    title: 'Entity Graph',
    group: 'Coverage',
    backed: 10,
    feasibility: 'THIN',
    summary: '131 rows describing 129 artists, one track, zero releases, labels, charts, stations or markets.',
  },
  {
    id: 'footprint',
    n: 10,
    title: 'Export Footprint',
    group: 'Coverage',
    backed: 5,
    feasibility: 'NOT_COLLECTED',
    summary:
      'Historical record of the first delivery, where listener geography was never collected. SUPERSEDED: city and country geography has since been observed across 217 countries — see Provider Expansion and Export_Markets_Quarterly.csv.',
  },
  {
    id: 'methodology',
    n: 11,
    title: 'Methodology Inspector',
    group: 'Method',
    backed: 0,
    feasibility: 'NOT_COLLECTED',
    summary:
      'Neither NCR nor DEI exists. The four indicators that do exist are shown with substituted values instead.',
  },
  {
    id: 'validation',
    n: 12,
    title: 'Validation Centre',
    group: 'Operations',
    backed: 20,
    feasibility: 'THIN',
    summary:
      'No rule registry. Five quality checks, three of which cannot fail, against one real unit denominator.',
  },
  {
    id: 'timeline',
    n: 13,
    title: 'Run Timeline',
    group: 'Operations',
    backed: 10,
    feasibility: 'THIN',
    summary: 'One run, two timestamps, no stage decomposition and no concurrency.',
  },
  {
    id: 'monitoring',
    n: 14,
    title: 'System Monitoring',
    group: 'Operations',
    backed: 12,
    feasibility: 'THIN',
    summary: 'No request log, queue, worker pool, cache or quota counter exists.',
  },
  {
    id: 'audit',
    n: 15,
    title: 'Audit Trail',
    group: 'Operations',
    backed: 15,
    feasibility: 'THIN',
    summary: 'The schema exists; no rows survive, because the database does not exist on disk.',
  },
  {
    id: 'gaps',
    n: null,
    title: 'Gap Register',
    group: 'Register',
    backed: 100,
    feasibility: 'FULL',
    summary: 'Every requirement the pipeline does not satisfy, with evidence and remedy.',
  },
  {
    id: 'constants',
    n: null,
    title: 'Constants Register',
    group: 'Register',
    backed: 100,
    feasibility: 'FULL',
    summary:
      'Every coefficient that shapes a published figure, with its justification and its divergences.',
  },
  {
    id: 'delivery',
    n: null,
    title: 'Delivery Register',
    group: 'Register',
    backed: 100,
    feasibility: 'FULL',
    summary:
      'The submitted NBS package and the in-repository delivery, file by file, with modification dates and hashes intact.',
  },
  {
    id: 'artifacts',
    n: null,
    title: 'Artifact Manifest',
    group: 'Register',
    backed: 100,
    feasibility: 'FULL',
    summary: 'Every file this console reads, with its hash, row count and modification time.',
  },
  {
    id: 'expansion',
    n: 20,
    title: 'Provider Expansion',
    group: 'Coverage',
    backed: 85,
    feasibility: 'SUBSTANTIAL',
    summary:
      'The second provider moves the archive floor from Q1_2024 back to Q1_2019 and collects Boomplay, Audiomack, radio airplay and Nigerian city geography — three findings this console publishes are superseded here.',
  },
];

export const PANELS_BY_ID = Object.fromEntries(PANELS.map((p) => [p.id, p])) as Record<
  string,
  PanelMeta
>;

export const PANEL_GROUPS = ['Overview', 'Coverage', 'Method', 'Operations', 'Register'] as const;

export const FEASIBILITY_EPISTEMIC: Record<Feasibility, string> = {
  FULL: 'observed',
  SUBSTANTIAL: 'observed',
  PARTIAL: 'estimated',
  THIN: 'assumed',
  NOT_COLLECTED: 'unavailable',
};
