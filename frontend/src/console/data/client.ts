/**
 * Console data client.
 *
 * Reads the static projection under /api/v1/console/. This is the only
 * transport that works in production: the live API serves different routes and
 * no single base URL satisfies both (GAP-037).
 *
 * Every loader records whether its artifact was present. A failed fetch is a
 * reported absence, never an empty dataset — panels must be able to tell
 * "nothing was collected" apart from "nothing came back".
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  Accounts,
  AggregateRow,
  ArtistRow,
  Coverage,
  Manifest,
  ObservationSummaryRow,
  PopulationFrame,
  Quality,
  ResolutionRow,
  Revenue,
  Variables,
} from './types';

import {
  fetchArtifact,
  liveGet,
  resolveTransport,
  LIVE_POLL_MS,
  LIVE_ROUTES,
  type TransportState,
} from './transport';
import { deriveCapabilities, type Capability, type CapabilityId } from './capabilities';

export { ArtifactMissingError } from './transport';

/**
 * Which transport answered. Panels use this to say whether they are reading a
 * live backend or the generated projection, and the shell shows it in the
 * masthead so a reader always knows what they are looking at.
 */
export function useTransport() {
  return useQuery<TransportState>({
    queryKey: ['console', 'transport'],
    queryFn: resolveTransport,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Static artifacts are immutable between deploys, so they are cached for the
 * session. Live reads poll, so newly ingested data appears without a reload —
 * this is what lets the console pick up the Chartmetric and SoundCharts
 * endpoints as they are activated, with no code change.
 */
function artifact<T>(key: string, file: string, live?: (base: string) => Promise<T>) {
  return () => {
    const transport = useTransport();
    const isLive = transport.data?.mode === 'live' && Boolean(live);
    return useQuery<T>({
      queryKey: ['console', key, transport.data?.mode ?? 'pending'],
      queryFn: async () => (await fetchArtifact<T>(file, live)).data,
      enabled: transport.isSuccess,
      staleTime: isLive ? LIVE_POLL_MS : Infinity,
      gcTime: Infinity,
      refetchInterval: isLive ? LIVE_POLL_MS : false,
      refetchOnWindowFocus: isLive,
      retry: 1,
    });
  };
}

export const useManifest = artifact<Manifest>('manifest', 'manifest.json');

export const useCoverage = artifact<Coverage>('coverage', 'coverage.json');

export const useRevenue = artifact<Revenue>('revenue', 'revenue.json');

export const useArtists = artifact<ArtistRow[]>('artists', 'artists.json');

export const useAggregates = artifact<AggregateRow[]>('aggregates', 'aggregates.json', (base) =>
  liveGet<AggregateRow[]>(base, LIVE_ROUTES.quarterly),
);

export const useVariables = artifact<Variables>('variables', 'variables.json');

export const useQuality = artifact<Quality>('quality', 'quality.json');

export const useRun = artifact<import('./types').Run>('run', 'run.json');

export const usePopulationFrame = artifact<PopulationFrame>('population', 'population-frame.json');

export const useAccounts = artifact<Accounts>('accounts', 'accounts.json');

export const useResolutionAudit = artifact<ResolutionRow[]>('resolution', 'resolution-audit.json');

export const useObservationSummary = artifact<ObservationSummaryRow[]>(
  'observation-summary',
  'observation-summary.json',
);

export const useDelivery = artifact<import('./types').Delivery>('delivery', 'delivery.json');

/* ------------------------------------------------------- live-only probes */

/**
 * Live-only artifacts. These stay empty on static transport and populate the
 * moment the API is up — which is what closes the lineage and audit gaps.
 */
function liveProbe<T>(key: string, path: string) {
  return () => {
    const transport = useTransport();
    const isLive = transport.data?.mode === 'live';
    return useQuery<T[]>({
      queryKey: ['console', 'live', key],
      queryFn: async () => {
        const base = transport.data?.liveBase;
        if (!base) return [];
        try {
          const rows = await liveGet<T[]>(base, path, { limit: 200 });
          return Array.isArray(rows) ? rows : [];
        } catch {
          // route not activated yet — absence, not failure
          return [];
        }
      },
      enabled: isLive,
      staleTime: LIVE_POLL_MS,
      refetchInterval: isLive ? LIVE_POLL_MS : false,
      retry: 0,
    });
  };
}

export const useRawPayloads = liveProbe<Record<string, unknown>>('raw-payloads', LIVE_ROUTES.rawPayloads);
export const useAuditLogs = liveProbe<Record<string, unknown>>('audit-logs', LIVE_ROUTES.auditLogs);
export const useJobs = liveProbe<Record<string, unknown>>('jobs', LIVE_ROUTES.jobs);

export function useProviderHealth() {
  const transport = useTransport();
  const isLive = transport.data?.mode === 'live';
  return useQuery<Record<string, unknown> | null>({
    queryKey: ['console', 'live', 'provider-health'],
    queryFn: async () => {
      const base = transport.data?.liveBase;
      if (!base) return null;
      try {
        return await liveGet<Record<string, unknown>>(base, LIVE_ROUTES.providerHealth);
      } catch {
        return null;
      }
    },
    enabled: isLive,
    staleTime: LIVE_POLL_MS,
    refetchInterval: isLive ? LIVE_POLL_MS : false,
    retry: 0,
  });
}

/* ------------------------------------------------------------ capabilities */

/**
 * What the system can currently evidence. Panels ask this instead of asserting
 * absence, so a capability flips to present as soon as records back it.
 */
export function useCapabilities(): {
  capabilities: Record<CapabilityId, Capability>;
  isLoading: boolean;
} {
  const coverage = useCoverage();
  const artists = useArtists();
  const revenue = useRevenue();
  const run = useRun();
  const variables = useVariables();
  const transport = useTransport();
  const rawPayloads = useRawPayloads();
  const auditLogs = useAuditLogs();
  const providerHealth = useProviderHealth();

  const capabilities = deriveCapabilities({
    coverage: coverage.data ?? null,
    artists: artists.data ?? null,
    revenue: revenue.data ?? null,
    run: run.data ?? null,
    variables: variables.data ?? null,
    transport: transport.data ?? null,
    rawPayloadCount: rawPayloads.data?.length ?? null,
    auditLogCount: auditLogs.data?.length ?? null,
    providerHealth: providerHealth.data ?? null,
  });

  return {
    capabilities,
    isLoading:
      coverage.isLoading || artists.isLoading || revenue.isLoading || transport.isLoading,
  };
}

export function useCapability(id: CapabilityId): Capability {
  return useCapabilities().capabilities[id];
}

/* ------------------------------------------------------------ formatting */

const NBSP = ' ';

export interface FormatOptions {
  precision?: number;
  unit?: 'usd' | 'ngn' | 'count' | 'pct' | 'days' | 'ratio';
  /** compact large counts (1.2M) — never used for currency in tables */
  compact?: boolean;
}

/**
 * Format a figure. `null` and `undefined` return null so the caller renders
 * NOT COLLECTED rather than a zero or a dash that could be read as a value.
 */
export function formatFigure(
  value: number | null | undefined,
  { precision = 0, unit, compact = false }: FormatOptions = {},
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  if (compact && Math.abs(value) >= 1000) {
    const units: Array<[number, string]> = [
      [1e12, 'T'],
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'k'],
    ];
    for (const [div, suffix] of units) {
      if (Math.abs(value) >= div) {
        const scaled = value / div;
        return `${scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0)}${suffix}`;
      }
    }
  }

  const body = value.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  switch (unit) {
    case 'usd':
      return `$${body}`;
    case 'ngn':
      return `₦${body}`;
    case 'pct':
      return `${body}%`;
    case 'days':
      return `${body}${NBSP}d`;
    default:
      return body;
  }
}

/** "Q1_2024" → "Q1 2024" */
export function formatPeriod(p: string): string {
  return p.replace('_', String.fromCharCode(160));
}

export function periodSortKey(p: string): number {
  const m = /^Q(\d)_(\d{4})$/.exec(p);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

export function comparePeriods(a: string, b: string): number {
  return periodSortKey(a) - periodSortKey(b);
}

/** "Spotify_monthly_listeners_daily" → "Spotify monthly listeners" */
export function humanizeVariable(v: string): string {
  return v.replace(/_daily$/, '').replace(/_/g, ' ');
}

export function formatTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16);
}

/* ------------------------------------------------------------ CSV export */

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: string[],
): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type { UseQueryResult };
