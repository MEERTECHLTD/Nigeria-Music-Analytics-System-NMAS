/**
 * Transport resolution.
 *
 * The console reads from whichever source is actually available, and switches
 * automatically when the live API comes up. Two modes:
 *
 *   live    the FastAPI backend answers /health. Rich: raw payloads, audit
 *           logs, per-run failures, provider health, entity-attributed coverage
 *           gaps. Polled on an interval so newly ingested data appears without
 *           a reload.
 *   static  the generated projection under /api/v1/console/. Always present,
 *           built from artifacts already on disk.
 *
 * The probe runs once and is cached for the session; a failed probe is not an
 * error, it just means static. Nothing about the epistemic rules changes with
 * transport — a value is observed or estimated because of how it was produced,
 * not because of where the console read it.
 */

export type TransportMode = 'live' | 'static';

export interface TransportState {
  mode: TransportMode;
  liveBase: string | null;
  staticBase: string;
  probedAt: string | null;
  health: unknown | null;
  /** why live was rejected, when it was */
  reason: string | null;
}

const LIVE_BASE =
  (import.meta.env?.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || null;

const STATIC_BASE =
  (import.meta.env?.VITE_CONSOLE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  '/api/v1/console';

/** How often live mode refetches. Static mode never polls — the files are fixed. */
export const LIVE_POLL_MS = Number(import.meta.env?.VITE_LIVE_POLL_MS ?? 60_000);

const PROBE_TIMEOUT_MS = 4000;

let probe: Promise<TransportState> | null = null;

async function probeLive(): Promise<TransportState> {
  const base: TransportState = {
    mode: 'static',
    liveBase: LIVE_BASE,
    staticBase: STATIC_BASE,
    probedAt: new Date().toISOString(),
    health: null,
    reason: null,
  };

  if (!LIVE_BASE) {
    return { ...base, reason: 'VITE_API_BASE is not configured.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${LIVE_BASE}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { ...base, reason: `Health check returned HTTP ${res.status}.` };
    }
    const health = await res.json().catch(() => null);
    return { ...base, mode: 'live', health, reason: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...base, reason: `Health check failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveTransport(): Promise<TransportState> {
  probe ??= probeLive();
  return probe;
}

/** Force a re-probe, e.g. after the operator brings the API up. */
export function resetTransport(): void {
  probe = null;
}

export class ArtifactMissingError extends Error {
  constructor(
    public readonly artifact: string,
    public readonly status: number,
    public readonly mode: TransportMode,
  ) {
    super(`Artifact not available: ${artifact} (HTTP ${status}, ${mode} transport)`);
    this.name = 'ArtifactMissingError';
  }
}

async function getJson<T>(url: string, artifact: string, mode: TransportMode): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ArtifactMissingError(artifact, res.status, mode);
  return (await res.json()) as T;
}

/**
 * Fetch a console artifact.
 *
 * `live` is optional: when the API is up and a live loader is supplied, it is
 * used and the result carries fresher data. Otherwise the static projection is
 * read. A live loader that throws falls back to static rather than failing the
 * panel — a partially-activated backend must not black out the console.
 */
export async function fetchArtifact<T>(
  staticFile: string,
  live?: (base: string) => Promise<T>,
): Promise<{ data: T; mode: TransportMode; degraded: boolean }> {
  const t = await resolveTransport();

  if (t.mode === 'live' && t.liveBase && live) {
    try {
      return { data: await live(t.liveBase), mode: 'live', degraded: false };
    } catch {
      // fall through to static; the live route may not be activated yet
    }
  }

  const data = await getJson<T>(`${t.staticBase}/${staticFile}`, staticFile, 'static');
  return { data, mode: 'static', degraded: t.mode === 'live' && Boolean(live) };
}

/** Convenience for live loaders. */
export function liveGet<T>(base: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const qs = params
    ? `?${Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')}`
    : '';
  return getJson<T>(`${base}${path}${qs}`, path, 'live');
}

/** Live route map, so the endpoints the console will use are declared in one place. */
export const LIVE_ROUTES = {
  health: '/health',
  providerHealth: '/api/v1/admin/provider-health',
  dashboard: '/api/v1/admin/dashboard',
  auditLogs: '/api/v1/admin/audit-logs',
  artists: '/api/v1/entities/artists',
  tracks: '/api/v1/entities/tracks',
  methodology: '/api/v1/methodology',
  jobs: '/api/v1/jobs',
  jobRuns: (id: string | number) => `/api/v1/jobs/${id}/runs`,
  jobFailures: (id: string | number) => `/api/v1/jobs/${id}/failures`,
  observations: '/api/v1/observations',
  coverageGaps: '/api/v1/coverage-gaps',
  limitations: '/api/v1/limitations',
  rawPayloads: '/api/v1/raw-payloads',
  rawPayload: (id: string | number) => `/api/v1/raw-payloads/${id}`,
  quarterly: '/api/v1/reports/quarterly',
  exports: '/api/v1/exports',
  referencePeriods: '/api/v1/reference-periods/defaults',
  nbsSummary: '/api/v1/nbs/summary',
  nbsStreamingRevenue: '/api/v1/nbs/streaming-revenue',
  nbsExportRevenue: '/api/v1/nbs/export-revenue',
  nbsEmployment: '/api/v1/nbs/employment',
  nbsCosts: '/api/v1/nbs/costs',
  nbsTopArtists: '/api/v1/nbs/top-artists',
} as const;
