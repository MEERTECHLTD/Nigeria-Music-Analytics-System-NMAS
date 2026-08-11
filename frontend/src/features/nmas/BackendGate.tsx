/**
 * BACKEND GATE
 *
 * The Operations Console drives the live API — jobs, entities, raw payloads,
 * exports. None of that exists in the static projection, so mounting it against
 * a down backend would render empty panels that look like findings rather than
 * like an absent service.
 *
 * So it is gated. While the backend is unreachable this renders a status board:
 * every endpoint the system exposes, what it feeds, and what it unlocks. The
 * gate keeps probing, and the moment `/health` answers it mounts the console
 * itself — no reload, no redeploy, no code change.
 */

import {
  Component,
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resetTransport, resolveTransport } from '../../console/data/transport';
import { ENDPOINTS, ENDPOINT_GROUPS, PROBEABLE, type EndpointSpec } from './endpoints';

const NbsConsole = lazy(() =>
  import('./NbsConsole').then((m) => ({ default: m.NbsConsole })),
);

/** Fast while waiting for the backend, slow once it is up. */
const DOWN_POLL_MS = 8000;
const UP_POLL_MS = 60_000;
const PROBE_TIMEOUT_MS = 5000;

type Reach = 'unknown' | 'ok' | 'empty' | 'auth' | 'missing' | 'error';

interface ProbeResult {
  reach: Reach;
  status: number | null;
  ms: number | null;
  rows: number | null;
  note: string | null;
}

const REACH_LABEL: Record<Reach, string> = {
  unknown: 'Not probed',
  ok: 'Answering',
  empty: 'Answering, empty',
  auth: 'Auth required',
  missing: 'Not found',
  error: 'Unreachable',
};

const REACH_EPI: Record<Reach, string> = {
  unknown: 'unavailable',
  ok: 'observed',
  empty: 'estimated',
  auth: 'assumed',
  missing: 'unavailable',
  error: 'rejected',
};

async function probeOne(base: string, ep: EndpointSpec): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(`${base}${ep.path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const ms = Math.round(performance.now() - started);

    if (res.status === 401 || res.status === 403) {
      return { reach: 'auth', status: res.status, ms, rows: null, note: null };
    }
    if (res.status === 404) {
      return { reach: 'missing', status: res.status, ms, rows: null, note: null };
    }
    if (!res.ok) {
      return { reach: 'error', status: res.status, ms, rows: null, note: res.statusText || null };
    }

    const body = await res.json().catch(() => null);
    const rows = Array.isArray(body) ? body.length : null;
    const empty =
      body === null ||
      (Array.isArray(body) && body.length === 0) ||
      (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);

    return {
      reach: empty ? 'empty' : 'ok',
      status: res.status,
      ms,
      rows,
      note: empty ? 'Answered 200 with no records.' : null,
    };
  } catch (err) {
    return {
      reach: 'error',
      status: null,
      ms: null,
      rows: null,
      note: err instanceof Error && err.name === 'AbortError' ? 'Timed out' : 'No response',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function BackendGate() {
  const [live, setLive] = useState<boolean | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  // The register stays reachable once the service is up, so endpoint status can
  // be inspected without taking the console down.
  const [showRegister, setShowRegister] = useState(false);
  const mounted = useRef(true);

  const runProbes = useCallback(async (liveBase: string) => {
    setProbing(true);
    // Sequential, not parallel: a status board must not be the thing that
    // rate-limits the service it is reporting on.
    for (const ep of PROBEABLE) {
      const result = await probeOne(liveBase, ep);
      if (!mounted.current) return;
      setProbes((prev) => ({ ...prev, [ep.path]: result }));
    }
    if (mounted.current) setProbing(false);
  }, []);

  const check = useCallback(async () => {
    resetTransport();
    const t = await resolveTransport();
    if (!mounted.current) return;
    setBase(t.liveBase);
    setReason(t.reason);
    setCheckedAt(new Date());
    setLive(t.mode === 'live');
    // Probe regardless of health, so the register reports per-endpoint status in
    // both states: which routes are unreachable while the service is down, and
    // which are answering, empty or auth-gated once it is up.
    if (t.liveBase) void runProbes(t.liveBase);
  }, [runProbes]);

  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
    };
  }, [check]);

  // Keep watching. Fast while down so activation is picked up promptly.
  useEffect(() => {
    const ms = live ? UP_POLL_MS : DOWN_POLL_MS;
    const timer = window.setInterval(() => void check(), ms);
    return () => window.clearInterval(timer);
  }, [live, check]);

  if (live === null) {
    return <div className="nmas-loading">Checking for the extraction backend…</div>;
  }

  if (live && !showRegister) {
    return (
      <ConsoleBoundary base={base}>
        <Suspense fallback={<div className="nmas-loading">Loading operations console…</div>}>
          <NbsConsole />
        </Suspense>
        <button
          type="button"
          className="btn no-print"
          onClick={() => setShowRegister(true)}
          style={{ position: 'fixed', bottom: '1rem', right: '15rem', zIndex: 60 }}
        >
          Endpoint register
        </button>
      </ConsoleBoundary>
    );
  }

  return (
    <StandbyBoard
      live={live}
      base={base}
      reason={reason}
      probes={probes}
      probing={probing}
      checkedAt={checkedAt}
      onRetry={() => void check()}
      onBack={live ? () => setShowRegister(false) : undefined}
    />
  );
}

/**
 * The operations console renders whatever the backend returns. If a response
 * carries a shape it does not expect, that must surface as a diagnostic naming
 * the endpoint — not as a blank page that reads like the service is down when
 * it is actually up and answering.
 */
class ConsoleBoundary extends Component<
  { children: ReactNode; base: string | null },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="nmas-console" style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: '68rem', margin: '0 auto', padding: 'var(--s6) var(--s5)' }}>
          <div className="h-section">Operations Console</div>
          <h1 className="h-display" style={{ margin: '0.15rem 0 var(--s4)' }}>
            The backend answered with an unexpected shape
          </h1>
          <div
            data-epi="rejected"
            style={{
              borderLeft: '3px solid var(--epi)',
              background: 'var(--epi-bg)',
              padding: 'var(--s4)',
            }}
          >
            <p style={{ margin: 0, color: 'var(--ink-2)', maxWidth: '78ch' }}>
              The service at{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>{this.props.base ?? 'the API'}</code>{' '}
              is reachable, so this is not an outage. A response carried a field this view expected
              to be present. The console and the NBS dashboard are unaffected — both read the
              generated projection.
            </p>
            <pre
              style={{
                marginTop: 'var(--s3)',
                padding: 'var(--s3)',
                background: 'var(--paper-sunk)',
                border: '1px solid var(--rule)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--t-micro)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {error.message}
            </pre>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 'var(--s3)' }}
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function StandbyBoard({
  live,
  base,
  reason,
  probes,
  probing,
  checkedAt,
  onRetry,
  onBack,
}: {
  live: boolean;
  base: string | null;
  reason: string | null;
  probes: Record<string, ProbeResult>;
  probing: boolean;
  checkedAt: Date | null;
  onRetry: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="nmas-console" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 'var(--shell-max)', margin: '0 auto', padding: 'var(--s5)' }}>
        <header className="rule-heavy-b" style={{ paddingBottom: 'var(--s3)' }}>
          <div className="h-section">Nigeria Music Analytics Study</div>
          <h1 className="h-display" style={{ marginTop: '0.15rem' }}>
            Operations Console
          </h1>
          <p className="lede" style={{ margin: '0.4rem 0 0' }}>
            Drives the extraction backend directly: entities, job configuration and runs, raw
            provider payloads, and export generation. None of this exists in the static projection,
            so the console stays gated until the service answers.
          </p>
        </header>

        <div
          data-epi={live ? 'observed' : 'unavailable'}
          style={{
            borderLeft: '3px solid var(--epi)',
            background: 'var(--epi-bg)',
            padding: 'var(--s4)',
            margin: 'var(--s5) 0',
          }}
        >
          <strong style={{ color: 'var(--epi)' }}>
            {live
              ? 'The backend is answering'
              : 'Standing by — the backend is not answering'}
          </strong>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--ink-2)', maxWidth: '78ch' }}>
            {live ? (
              <>
                The operations console is live. Each route below was probed directly; a route
                answering 200 with no records is reported separately from one that is unreachable,
                because an empty answer is a data state and an unreachable one is an outage.
              </>
            ) : (
              <>
                This surface activates on its own. It re-checks every{' '}
                <span className="fig">{DOWN_POLL_MS / 1000}</span> seconds and mounts the moment{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>/health</code> responds — no reload
                and no redeploy. The console and the NBS dashboard are unaffected; both are reading
                the generated projection and continue to work.
              </>
            )}
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.2rem 0.75rem',
              margin: 'var(--s3) 0 0',
              fontSize: 'var(--t-small)',
            }}
          >
            <dt style={{ color: 'var(--ink-3)' }}>Target</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
              {base ?? 'not configured — set VITE_API_BASE'}
            </dd>
            <dt style={{ color: 'var(--ink-3)' }}>Reason</dt>
            <dd style={{ margin: 0 }}>{reason ?? 'unknown'}</dd>
            <dt style={{ color: 'var(--ink-3)' }}>Last checked</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
              {checkedAt ? checkedAt.toLocaleTimeString('en-GB') : '—'}
            </dd>
          </dl>
          <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
            <button type="button" className="btn" onClick={onRetry}>
              Check now
            </button>
            {onBack ? (
              <button type="button" className="btn" onClick={onBack}>
                Back to console
              </button>
            ) : null}
          </div>
        </div>

        <section style={{ paddingTop: 'var(--s3)' }}>
          <div className="section-head">
            <div>
              <h2 className="h-title">Endpoint register</h2>
              <p className="lede" style={{ margin: '0.35rem 0 0' }}>
                Every route the backend exposes, what consumes it, and what it unlocks when it starts
                answering. Probed routes are re-tested on each check.
              </p>
            </div>
            {probing ? (
              <span className="epi-chip" data-epi="estimated">
                Probing
              </span>
            ) : null}
          </div>

          <div className="scroll-x">
            <table className="tbl tbl--dense">
              <thead>
                <tr>
                  <th style={{ width: '3.5rem' }}>Method</th>
                  <th style={{ minWidth: '18rem' }}>Path</th>
                  <th style={{ width: '9rem' }}>Status</th>
                  <th className="num-col" style={{ width: '4rem' }}>ms</th>
                  <th className="num-col" style={{ width: '4rem' }}>Rows</th>
                  <th style={{ minWidth: '20rem' }}>Purpose</th>
                  <th style={{ minWidth: '14rem' }}>Consumer</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINT_GROUPS.map((group) => {
                  const rows = ENDPOINTS.filter((e) => e.group === group);
                  if (rows.length === 0) return null;
                  return (
                    <Fragment key={group}>
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            background: 'var(--paper-sunk)',
                            borderTop: '1.5px solid var(--rule-strong)',
                            fontWeight: 650,
                          }}
                        >
                          {group}
                        </td>
                      </tr>
                      {rows.map((ep) => {
                        const p = probes[ep.path];
                        const reach: Reach = ep.probe ? (p?.reach ?? 'unknown') : 'unknown';
                        return (
                          <tr key={`${ep.method}-${ep.path}`}>
                            <td>
                              <span
                                className="epi-chip epi-chip--bare"
                                data-epi={ep.method === 'GET' ? 'observed' : 'assumed'}
                              >
                                {ep.method}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                              {base ? (
                                <a
                                  href={`${base}${ep.path}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'inherit' }}
                                  title={`${base}${ep.path}`}
                                >
                                  {ep.path}
                                </a>
                              ) : (
                                ep.path
                              )}
                            </td>
                            <td>
                              <span className="epi-chip" data-epi={REACH_EPI[reach]}>
                                {ep.probe ? REACH_LABEL[reach] : 'Not probed'}
                              </span>
                              {p?.status ? (
                                <span
                                  className="fig"
                                  style={{ marginLeft: '0.35rem', color: 'var(--ink-3)' }}
                                >
                                  {p.status}
                                </span>
                              ) : null}
                            </td>
                            <td className="num-col fig">{p?.ms ?? ''}</td>
                            <td className="num-col fig">{p?.rows ?? ''}</td>
                            <td>
                              {ep.purpose}
                              {ep.unlocks ? (
                                <span
                                  style={{
                                    display: 'block',
                                    color: 'var(--ink-3)',
                                    fontSize: 'var(--t-micro)',
                                    marginTop: '0.15rem',
                                  }}
                                >
                                  Unlocks: {ep.unlocks}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ color: 'var(--ink-2)' }}>{ep.consumer}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ paddingTop: 'var(--s6)' }}>
          <div className="section-head">
            <h2 className="h-title">Bringing the backend up</h2>
          </div>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', maxWidth: '78ch', lineHeight: 1.7 }}>
            <li>
              Start the API:{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>python backend/run_nmas.py</code>
            </li>
            <li>
              Point the frontend at it:{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>
                VITE_API_BASE={base ?? 'http://127.0.0.1:8000'}
              </code>
            </li>
            <li>
              Ensure <code style={{ fontFamily: 'var(--font-mono)' }}>DATABASE_URL</code> points at a
              database that exists. Without one, the evidence routes answer with no records and the
              lineage and audit gaps stay open.
            </li>
            <li>
              Confirm <code style={{ fontFamily: 'var(--font-mono)' }}>EXPORT_ROOT</code> resolves to
              a populated directory. The NBS routes read a path derived from it and answer 200 with
              an empty list when it is absent, which reads as “no data” rather than as an error.
            </li>
            <li>
              Set <code style={{ fontFamily: 'var(--font-mono)' }}>CORS_ORIGINS</code> to include the
              origin this page is served from.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

export default BackendGate;
