/**
 * Types for the console's static API — a read-only projection of artifacts the
 * pipeline already produced (backend/scripts/generate_console_api.py).
 *
 * `null` is meaningful throughout: it means the source artifact could not fill
 * the field. It renders as NOT COLLECTED, never as zero.
 */

export type Epistemic =
  | 'observed'
  | 'estimated'
  | 'assumed'
  | 'allocated'
  | 'derived'
  | 'unavailable'
  | 'rejected';

export type Period = string; // "Q1_2024" … "Q1_2026"

/* -------------------------------------------------------------- manifest */

export interface ArtifactRecord {
  role: string;
  path: string;
  present: boolean;
  rows: number | null;
  columns?: string[];
  sha256: string | null;
  bytes?: number;
  modified_utc: string | null;
}

export interface Manifest {
  generated_utc: string;
  generator: string;
  note: string;
  archive_floor: string;
  periods_observed: Period[];
  periods_with_revenue: Period[];
  artifacts: ArtifactRecord[];
}

/* -------------------------------------------------------------- coverage */

export interface CoverageCell {
  variable: string;
  period: Period;
  obs_count: number;
  artist_count: number;
  first_date: string | null;
  last_date: string | null;
  endpoints: string[];
  platforms: string[];
  last_extraction: string | null;
  gap_count: number | null;
  gap_reasons: string | null;
  /** false = the gap report never covered this quarter (≠ "no gaps found") */
  gap_metadata_present: boolean;
}

export interface Coverage {
  periods_observed: Period[];
  periods_with_gap_metadata: Period[];
  archive_floor: string;
  variables: string[];
  /** defined in metrics.py, produced zero observations */
  variables_defined_never_observed: string[];
  total_observations: number;
  distinct_artists: number;
  endpoints_by_variable: Record<string, string[]>;
  cells: CoverageCell[];
}

/* --------------------------------------------------------------- revenue */

export interface RevenueRow {
  period: Period;
  artist_name: string;
  spotify_monthly_listeners: number | null;
  youtube_subscribers: number | null;
  deezer_fans: number | null;
  youtube_actual_views: number | null;
  /** "actual" | "estimated" — the only epistemic flag in the whole delivery */
  youtube_views_source: string | null;
  est_spotify_quarterly_streams: number | null;
  spotify_revenue_usd: number | null;
  youtube_revenue_usd: number | null;
  deezer_revenue_usd: number | null;
  other_platforms_revenue_usd: number | null;
  gross_streaming_revenue_usd: number | null;
  gross_streaming_revenue_ngn: number | null;
  streaming_source: string | null;
  total_streaming_revenue_usd: number | null;
  nigeria_domestic_share_pct: number | null;
  domestic_revenue_usd: number | null;
  export_share_pct: number | null;
  gross_export_revenue_usd: number | null;
  gross_export_revenue_ngn: number | null;
  top_export_markets: string | null;
  export_source: string | null;
}

export interface PeriodTotal {
  period: Period;
  [metric: string]: number | string | null;
}

export interface Revenue {
  periods: Period[];
  rows: RevenueRow[];
  streaming_totals: PeriodTotal[];
  export_totals: PeriodTotal[];
}

/* --------------------------------------------------------------- artists */

export interface ArtistRow {
  artist_name: string;
  chartmetric_artist_id: number | string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  label: string | null;
  genres: string | null;
  /** hardcoded default, identical on every row — NOT a residency classification */
  country_field_value: string | null;
  status: string | null;
  observation_count: number | null;
  variables_observed: number | null;
  first_observation: string | null;
  last_observation: string | null;
  revenue_periods: Period[];
  revenue_period_count: number;
  est_streams_total: number | null;
  gross_streaming_revenue_usd_total: number | null;
  youtube_estimated_period_count: number;
  /** all null — no artifact in the repository supports these */
  residency_classification: null;
  residency_basis: null;
  account_routing: null;
  confidence_score: null;
  resolution_match_score: null;
}

/* ------------------------------------------------------------ aggregates */

export interface AggregateRow {
  entity_name: string;
  variable: string;
  period: Period;
  aggregation_rule: string | null;
  aggregated_value: number | null;
  first_value: number | null;
  last_value: number | null;
  obs_count: number | null;
  is_cumulative_counter: boolean;
  /** presentation-side derivation, shown beside the published value */
  last_minus_first: number | null;
  overstatement_factor: number | null;
}

/* ------------------------------------------------------------- variables */

export interface MetricDefinition {
  name?: string;
  entity_type?: string;
  platform?: string;
  endpoint_template?: string;
  unit?: string;
  aggregation_rule?: string;
  definition?: string;
  source_field_candidates?: string[];
  geo_scope_default?: string;
  coverage_limitations?: string;
  geo_limitations?: string;
  fallback_logic?: string;
  endpoint_type?: string;
  source_ref: string;
}

export interface DeniedEndpoint {
  metric: string;
  endpoint: string | null;
  status: string | null;
  note: string | null;
  source_ref: string;
}

export interface Variables {
  definitions: MetricDefinition[];
  denied_endpoints: DeniedEndpoint[];
}

/* --------------------------------------------------------------- quality */

export interface LimitationGroup {
  variable: string | null;
  period: Period | null;
  limitation_code: string | null;
  count: number;
  descriptions: string[];
  fallback_applied: string[];
}

export interface Quality {
  limitations: LimitationGroup[];
  limitation_total: number;
  gap_total: number;
  gap_reasons: Record<string, number>;
  gap_severities: Record<string, number>;
  gap_by_period: Record<string, number>;
  periods_with_quality_metadata: Period[];
}

/* ------------------------------------------------------------------- run */

export interface FailureGroup {
  error_type: string | null;
  count: number | null;
  messages: string[];
}

export interface Run {
  job_name: string | null;
  provider: string | null;
  status: string | null;
  started: string | null;
  finished: string | null;
  /** not recorded — the difference of the two stored timestamps, derived for display */
  duration_seconds_derived: number | null;
  /**
   * The only records-in / records-out / records-rejected accounting in the
   * pipeline, and it is per-run rather than per-stage.
   * 13,624 = 131 master-list rows × 13 variables × 8 quarters.
   */
  total_units: number | null;
  completed_units: number | null;
  skipped_units: number | null;
  failed_units: number | null;
  report_markdown: string | null;
  failures: FailureGroup[];
  /** all null — no stage, telemetry, queue, worker or quota data was ever recorded */
  stages: null;
  per_call_telemetry: null;
  queue_depth: null;
  active_workers: null;
  cache_hit_rate: null;
  quota_consumed: null;
  quota_remaining: null;
  rate_limit_events: null;
}

/* -------------------------------------------------------------- the rest */

export interface PopulationRow {
  artist_name: string;
  country: string | null;
  region: string | null;
  state_area: string | null;
  genre_category: string | null;
  representative_song: string | null;
  in_sample: boolean;
  chartmetric_artist_id: string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  label: string | null;
  source: string | null;
}

export interface PopulationFrame {
  total: number;
  in_sample: number;
  by_region: Record<string, number>;
  by_genre: Record<string, number>;
  rows: PopulationRow[];
}

export interface EmploymentRow {
  period: Period;
  category: string | null;
  total_employment: number | null;
  male: number | null;
  female: number | null;
  source: string | null;
}

export interface CostRow {
  period: Period;
  cost_category: string | null;
  num_artists: number | null;
  total_cost_ngn: number | null;
  total_cost_usd: number | null;
  source: string | null;
}

export interface Accounts {
  employment: EmploymentRow[];
  costs: CostRow[];
}

export interface ResolutionRow {
  search_name: string | null;
  matched_name: string | null;
  chartmetric_artist_id: number | string | null;
  match_score: number | null;
  raw: Record<string, unknown>;
}

export interface ObservationSummaryRow {
  entity_name: string;
  variable: string;
  obs_count: number | null;
  first_date: string | null;
  last_date: string | null;
  min_val: number | null;
  max_val: number | null;
  avg_val: number | null;
}

/* -------------------------------------------------------------- delivery */

export interface DeliveryFile {
  path: string;
  name: string;
  section: string;
  extension: string | null;
  bytes: number;
  /** preserved exactly as recorded on disk — the only evidence of when it was produced */
  modified_utc: string;
  sha256: string | null;
  sha256_skipped: boolean;
}

export interface DeliverySection {
  section: string;
  files: number;
  bytes: number;
}

export interface DeliveryPackage {
  id: string;
  label: string;
  root: string;
  file_count: number;
  total_bytes: number;
  first_modified: string | null;
  last_modified: string | null;
  sections: DeliverySection[];
  readme_markdown: string | null;
  files: DeliveryFile[];
}

export interface HeadlineIndicators {
  present: boolean;
  source?: string | null;
  modified_utc?: string;
  sha256?: string;
  rows: string[][];
  error?: string;
}

export interface Delivery {
  deliveries: DeliveryPackage[];
  only_in_submitted: string[];
  only_in_project: string[];
  in_both: number;
  promised_sections: string[];
  /** sections the delivery README advertises that were never shipped */
  missing_sections: string[];
  headline_indicators: HeadlineIndicators;
}
