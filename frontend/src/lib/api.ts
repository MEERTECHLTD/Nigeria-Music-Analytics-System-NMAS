export const API_BASE = import.meta.env.VITE_API_BASE || '';
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10);

export class APIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'APIError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const body = await response.json();
        message = body.detail || body.message || message;
      } catch {
        // Ignore body parsing failure.
      }
      throw new APIError(message, response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out');
    }
    throw new APIError(error instanceof Error ? error.message : 'Unexpected API error');
  } finally {
    clearTimeout(timeout);
  }
}

export interface ProviderHealth {
  provider: string;
  base_url: string;
  auth_mode: string;
  access_token_configured: boolean;
  refresh_token_configured: boolean;
  throttle_seconds: number;
  max_retries: number;
}

export interface ExportArtifact {
  id: string;
  job_id: string;
  job_run_id: string | null;
  export_type: string;
  format: string;
  file_path: string;
  sha256: string;
  record_count: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface DashboardData {
  provider: ProviderHealth;
  artists_total: number;
  tracks_total: number;
  jobs_total: number;
  active_job_runs: number;
  observations_total: number;
  coverage_gaps_total: number;
  limitations_total: number;
  last_exports: ExportArtifact[];
}

export interface Artist {
  id: string;
  chartmetric_artist_id: number | null;
  artist_name: string;
  country: string;
  genres: string | null;
  label: string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

export interface Track {
  id: string;
  chartmetric_track_id: number | null;
  track_name: string;
  primary_artist_name: string | null;
  isrc: string | null;
  spotify_id: string | null;
  youtube_id: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  linked: number;
  warnings: string[];
}

export interface PeriodDefinition {
  label: string;
  start_date: string;
  end_date: string;
}

export interface EntityScopeInput {
  artist_ids: string[];
  track_ids: string[];
  artist_statuses: string[];
  track_statuses: string[];
  include_tracks: boolean;
}

export interface Job {
  id: string;
  name: string;
  provider: string;
  status: string;
  cadence: string;
  period_definitions: PeriodDefinition[];
  variable_names: string[];
  platform_names: string[];
  entity_scope: EntityScopeInput;
  created_at: string;
  updated_at: string;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
}

export interface JobRun {
  id: string;
  job_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  total_units: number;
  completed_units: number;
  skipped_units: number;
  failed_units: number;
  summary: Record<string, number>;
}

export interface Observation {
  id: string;
  entity_type: string;
  entity_name: string;
  chartmetric_entity_id: number | null;
  observation_date: string;
  period_label: string;
  platform: string;
  geo_scope: string;
  geo_label: string;
  variable_name: string;
  variable_value: number;
  unit: string;
  source_endpoint: string;
  source_field: string;
  extraction_timestamp: string;
  is_fallback: boolean;
}

export interface MethodologyEntry {
  variable_name: string;
  source: string;
  endpoint: string;
  field_name: string;
  definition: string;
  unit: string;
  generation_method: string;
  coverage_limitations: string;
  geo_limitations: string;
  platform_scope: string;
  fallback_logic: string;
  missing_data_treatment: string;
  aggregation_rule: string;
  methodology_status: string;
}

export interface Limitation {
  variable_name: string;
  platform: string;
  period_label: string;
  geo_scope: string;
  limitation_code: string;
  description: string;
  fallback_applied: boolean;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CoverageGap {
  variable_name: string;
  platform: string;
  period_label: string;
  geo_scope: string;
  gap_start: string;
  gap_end: string;
  reason: string;
  severity: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface RawPayload {
  id: string;
  provider: string;
  endpoint: string;
  status_code: number | null;
  attempt_count: number;
  requested_at: string;
  received_at: string | null;
  entity_type: string | null;
  chartmetric_entity_id: number | null;
  error_classification: string | null;
}

export interface QuarterlyAggregate {
  entity_type: string;
  entity_name: string;
  chartmetric_entity_id: number | null;
  variable_name: string;
  platform: string;
  geo_scope: string;
  geo_label: string;
  period_label: string;
  aggregation_rule: string;
  aggregated_value: number;
  unit: string;
  qoq_change: number | null;
  yoy_change: number | null;
}

export const observedVariables = [
  'Spotify_streams_daily',
  'YouTube_views_daily',
  'Pandora_streams_daily',
  'Shazam_counts_daily',
  'Spotify_monthly_listeners_daily',
  'Spotify_followers_daily',
  'Where_People_Listen',
  'YouTube_subscribers_daily',
];

export function getDashboard() {
  return request<DashboardData>('/api/v1/admin/dashboard');
}

export function getDefaultPeriods() {
  return request<PeriodDefinition[]>('/api/v1/reference-periods/defaults');
}

export function getArtists() {
  return request<Artist[]>('/api/v1/entities/artists');
}

export function getTracks() {
  return request<Track[]>('/api/v1/entities/tracks');
}

export function importArtists(csvText: string) {
  return request<ImportResult>('/api/v1/entities/artists/import', {
    method: 'POST',
    body: JSON.stringify({ csv_text: csvText }),
  });
}

export function importTracks(csvText: string) {
  return request<ImportResult>('/api/v1/entities/tracks/import', {
    method: 'POST',
    body: JSON.stringify({ csv_text: csvText }),
  });
}

export function getJobs() {
  return request<Job[]>('/api/v1/jobs');
}

export function createJob(payload: {
  name: string;
  cadence: string;
  periods: PeriodDefinition[];
  variable_names: string[];
  platform_names: string[];
  entity_scope: EntityScopeInput;
  configuration: Record<string, unknown>;
}) {
  return request<Job>('/api/v1/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runJob(jobId: string) {
  return request<JobRun>(`/api/v1/jobs/${jobId}/run`, { method: 'POST' });
}

export function resumeJob(jobId: string) {
  return request<JobRun>(`/api/v1/jobs/${jobId}/resume`, { method: 'POST' });
}

export function retryFailedUnits(jobId: string) {
  return request<JobRun>(`/api/v1/jobs/${jobId}/retry-failed`, { method: 'POST' });
}

export function pauseJob(jobId: string) {
  return request<{ status: string }>(`/api/v1/jobs/${jobId}/pause`, { method: 'POST' });
}

export function downloadExport(artifactId: string) {
  window.open(`${API_BASE}/api/v1/exports/${artifactId}/download`, '_blank');
}

export function getJobRuns(jobId: string) {
  return request<JobRun[]>(`/api/v1/jobs/${jobId}/runs`);
}

export function getObservations(jobId?: string) {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  return request<Observation[]>(`/api/v1/observations${query}`);
}

export function getMethodology() {
  return request<MethodologyEntry[]>('/api/v1/methodology');
}

export function getLimitations(jobId?: string) {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  return request<Limitation[]>(`/api/v1/limitations${query}`);
}

export function getCoverageGaps(jobId?: string) {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  return request<CoverageGap[]>(`/api/v1/coverage-gaps${query}`);
}

export function getRawPayloads(jobId?: string) {
  const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : '';
  return request<RawPayload[]>(`/api/v1/raw-payloads${query}`);
}

export function getQuarterly(jobId: string) {
  return request<QuarterlyAggregate[]>(`/api/v1/reports/quarterly?job_id=${encodeURIComponent(jobId)}`);
}

export function getExports() {
  return request<ExportArtifact[]>('/api/v1/exports');
}

export function generateExports(jobId: string) {
  return request<ExportArtifact[]>('/api/v1/exports', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
}

