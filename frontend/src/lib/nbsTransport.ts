/**
 * NBS dashboard transport.
 *
 * The dashboard reads whichever source actually has data, and keeps polling so
 * newly ingested quarters appear without a reload.
 *
 *   live    GET /api/v1/nbs/<resource>?period=…   (FastAPI)
 *   static  GET /api/v1/nbs/<resource>/<period>.json  (generated projection)
 *
 * Falling back on an EMPTY live response is deliberate, not defensive. The live
 * NBS routes read a CSV directory derived from EXPORT_ROOT; under the production
 * environment that resolves to a path that is never populated, so the endpoints
 * answer 200 with an empty list. An empty 200 is indistinguishable from "no data
 * yet" and must not blank a dashboard that has real data in the projection.
 */

import { resolveTransport } from '../console/data/transport';

export const NBS_POLL_MS = Number(import.meta.env?.VITE_NBS_POLL_MS ?? 60_000);

export type NbsResource =
  | 'summary'
  | 'streaming-revenue'
  | 'export-revenue'
  | 'top-artists'
  | 'employment'
  | 'costs';

/** Resources that are period-scoped in the static projection. */
const PERIOD_SCOPED: NbsResource[] = ['streaming-revenue', 'export-revenue', 'top-artists'];

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API error ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export interface NbsResult<T> {
  data: T;
  mode: 'live' | 'static';
  /** live answered but was empty, so the projection was used instead */
  fellBack: boolean;
}

export async function nbsFetch<T>(
  resource: NbsResource,
  period?: string,
): Promise<NbsResult<T>> {
  const t = await resolveTransport();

  if (t.mode === 'live' && t.liveBase) {
    try {
      const qs = period ? `?period=${encodeURIComponent(period)}` : '';
      const data = await getJson<T>(`${t.liveBase}/api/v1/nbs/${resource}${qs}`);
      if (!isEmpty(data)) return { data, mode: 'live', fellBack: false };
    } catch {
      // route not activated, or backend down — fall through
    }
  }

  const path = PERIOD_SCOPED.includes(resource) && period
    ? `/api/v1/nbs/${resource}/${period}.json`
    : `/api/v1/nbs/${resource}.json`;

  const data = await getJson<T>(path);
  return { data, mode: 'static', fellBack: t.mode === 'live' };
}

/** Unwrapped convenience for call sites that only want the payload. */
export async function nbsJson<T>(resource: NbsResource, period?: string): Promise<T> {
  return (await nbsFetch<T>(resource, period)).data;
}
