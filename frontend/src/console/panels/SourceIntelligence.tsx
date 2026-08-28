/**
 * PANEL 3 — Source Intelligence
 *
 * What it renders: the one source that is actually integrated (Chartmetric) —
 * its authentication flow, its configured throttle, the endpoints it served,
 * the endpoints it refused, and the single aggregate failure tally the one
 * recorded run left behind. Then the second source the delivery credits but
 * never built: SoundCharts.
 *
 * What it cannot render: plan tier, quota consumed, quota remaining, quota burn
 * rate, average or percentile latency, retry counts, individually attributed
 * rate-limit events, and measured archive depth. None of those was recorded by
 * any code path. No response header is read anywhere in the client, so nothing
 * quota-shaped can exist; both request and response timestamps are stored on
 * success but are never differenced, so no latency exists either.
 *
 * Two things on this panel are configuration, not measurement, and are marked
 * as such at the point of display: the request throttle and the request ceiling
 * implied by it. There is no observed request rate anywhere in this system.
 */

import { useMemo } from 'react';
import { useCoverage, useRevenue, useRun, useVariables } from '../data/client';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import {
  Callout,
  EpistemicChip,
  Figure,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import { CONSTANTS_BY_ID } from '../registry/constants';
import type { Coverage, DeniedEndpoint, Revenue, Run, Variables } from '../data/types';

/* ------------------------------------------------------------------ utils */

/** Pull the `- Key: value` header lines out of the job summary markdown. */
function parseRunReport(md: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!md) return out;
  const re = /^-\s*([A-Za-z][A-Za-z ]*?):\s*(.+)$/gm;
  let m: RegExpExecArray | null = re.exec(md);
  while (m !== null) {
    const key = m[1].trim().toLowerCase();
    if (!(key in out)) out[key] = m[2].trim();
    m = re.exec(md);
  }
  return out;
}

function reportNumber(report: Record<string, string>, key: string): number | null {
  const raw = report[key];
  if (raw === undefined) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface DepthRow {
  variable: string;
  endpoint: string | null;
  first: string | null;
  last: string | null;
  obs: number;
}

function dayCount(first: string | null, last: string | null): number | null {
  if (!first || !last) return null;
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/* --------------------------------------------------------------- fragments */

function SourceRefs({ refs }: { refs: string[] }) {
  return (
    <span
      style={{
        display: 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--t-micro)',
        color: 'var(--ink-4)',
        wordBreak: 'break-word',
      }}
    >
      {refs.join('  ·  ')}
    </span>
  );
}

/** A ruled source block. Not a card — a heading, a hairline, and a definition list. */
function SourceBlock({
  name,
  state,
  epi,
  detail,
  children,
}: {
  name: string;
  state: string;
  epi: 'observed' | 'unavailable';
  detail: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-epi={epi}
      style={{
        borderLeft: '3px solid var(--epi)',
        paddingLeft: 'var(--s4)',
        marginBottom: 'var(--s6)',
      }}
    >
      <div
        className="rule-heavy-b"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s3)',
          flexWrap: 'wrap',
          paddingBottom: 'var(--s2)',
        }}
      >
        <h3 className="h-title">{name}</h3>
        <EpistemicChip status={epi} title={state} />
      </div>
      <p className="lede" style={{ margin: '0.5rem 0 var(--s3)' }}>
        {detail}
      </p>
      <dl style={{ margin: 0 }}>{children}</dl>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

export default function SourceIntelligence() {
  const coverage = useCoverage();
  const variables = useVariables();
  const run = useRun();

  return (
    <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
      {(cov) => (
        <Resolved query={variables} artifact="variables.json" label="Reading metric register">
          {(vars) => (
            <Resolved query={run} artifact="run.json" label="Reading the recorded run">
              {(runData) => <Body coverage={cov} variables={vars} run={runData} />}
            </Resolved>
          )}
        </Resolved>
      )}
    </Resolved>
  );
}

function Body({
  coverage,
  variables,
  run,
}: {
  coverage: Coverage;
  variables: Variables;
  run: Run;
}) {
  const report = useMemo(() => parseRunReport(run.report_markdown), [run.report_markdown]);

  const unitsAttempted = reportNumber(report, 'total units');
  const unitsFailed = reportNumber(report, 'failed units');
  const unitsCompleted = reportNumber(report, 'completed units');
  const failureRatePct =
    unitsAttempted !== null && unitsFailed !== null && unitsAttempted > 0
      ? (unitsFailed / unitsAttempted) * 100
      : null;

  /* Distinct endpoints that actually returned data, from the coverage artifact. */
  const servedEndpoints = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(coverage.endpoints_by_variable)) {
      for (const e of list) set.add(e);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [coverage.endpoints_by_variable]);

  /* Observed observation-date envelope — the derived proxy for archive depth. */
  const depth = useMemo(() => {
    const byVariable = new Map<string, DepthRow>();
    let globalFirst: string | null = null;
    let globalLast: string | null = null;

    for (const cell of coverage.cells) {
      let cur: DepthRow | undefined = byVariable.get(cell.variable);
      if (!cur) {
        cur = {
          variable: cell.variable,
          endpoint: cell.endpoints[0] ?? null,
          first: null,
          last: null,
          obs: 0,
        };
        byVariable.set(cell.variable, cur);
      }
      if (cell.first_date && (cur.first === null || cell.first_date < cur.first)) {
        cur.first = cell.first_date;
      }
      if (cell.last_date && (cur.last === null || cell.last_date > cur.last)) {
        cur.last = cell.last_date;
      }
      if (cur.endpoint === null && cell.endpoints.length > 0) cur.endpoint = cell.endpoints[0];
      cur.obs += cell.obs_count;

      if (cell.first_date && (globalFirst === null || cell.first_date < globalFirst)) {
        globalFirst = cell.first_date;
      }
      if (cell.last_date && (globalLast === null || cell.last_date > globalLast)) {
        globalLast = cell.last_date;
      }
    }
    return {
      rows: [...byVariable.values()].sort((a, b) => a.variable.localeCompare(b.variable)),
      globalFirst: globalFirst as string | null,
      globalLast: globalLast as string | null,
      spanDays: dayCount(globalFirst, globalLast),
    };
  }, [coverage.cells]);

  const throttle = CONSTANTS_BY_ID['throttle'];
  const apiWindow = CONSTANTS_BY_ID['api-window'];

  const failureMessages = run.failures.flatMap((f) => f.messages);
  const sawRateLimit = failureMessages.some((m) => /\b429\b/.test(m));
  const sawAuthDenial = failureMessages.some((m) => /\b401\b/.test(m));

  return (
    <>
      {/* ---------------------------------------------------------- overview */}
      <Section
        title="Sources"
        subtitle={
          <>
            The delivery credits two data providers on every shipped revenue row. One of them has a
            client, a base URL, a credential and{' '}
            <strong className="fig">{coverage.total_observations.toLocaleString('en-US')}</strong>{' '}
            observations behind it. The other has none of those things.
          </>
        }
      >
        <Callout status="unavailable" title="One source is integrated, not two" gapId="GAP-036">
          The only HTTP client in the repository targets Chartmetric. No SoundCharts client, base
          URL, credential or endpoint constant exists anywhere in the codebase. The name appears in
          the shipped source column and in the current dashboard regardless.
        </Callout>

        <div
          style={{
            display: 'flex',
            gap: 'var(--s5)',
            flexWrap: 'wrap',
            paddingTop: 'var(--s3)',
          }}
        >
          <Tally label="Sources credited" value={2} epi="assumed" note="in shipped source strings" />
          <Tally label="Sources integrated" value={1} epi="observed" note="Chartmetric only" />
          <Tally
            label="Endpoints served"
            value={servedEndpoints.length}
            epi="observed"
            note="all /api/artist/{id}/stat/*"
          />
          <Tally
            label="Endpoints denied 401"
            value={variables.denied_endpoints.length}
            epi="rejected"
            note="confirmed, recorded in code"
          />
        </div>
      </Section>

      {/* -------------------------------------------------------- chartmetric */}
      <Section
        title="Chartmetric"
        subtitle="The integrated source. Everything below is either read from an artifact, read from a configuration file, or absent — and each row says which."
      >
        <SourceBlock
          name="Chartmetric"
          state="Integrated — one recorded run"
          epi="observed"
          detail={
            <>
              A single provider, reached over one HTTP client, throttled serially. Every observation
              in the system came through it, and every one of the {servedEndpoints.length} endpoints
              it served is an artist-level statistics route.
            </>
          }
        >
          <KeyValue k="Base URL" v="https://api.chartmetric.com" mono />
          <KeyValue
            k="Authentication"
            v={
              <>
                Refresh-token flow. The refresh token is exchanged for an access token at{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>/api/token</code>; production sets
                the mode to <code style={{ fontFamily: 'var(--font-mono)' }}>refresh</code>, the code
                default is <code style={{ fontFamily: 'var(--font-mono)' }}>static</code>.
                <SourceRefs
                  refs={[
                    'backend/nmas/services/chartmetric.py:146-170',
                    'backend/nmas/config.py:37',
                    'deployment/digitalocean-app.yaml:31-32',
                  ]}
                />
              </>
            }
          />
          <KeyValue
            k="Token lifetime"
            v={
              <>
                <Figure value={45} status="assumed" unit="count" label="Token lifetime (minutes)" />{' '}
                minutes — a client-side constant, refreshed when the locally recorded token age
                exceeds it.{' '}
                <strong>
                  The provider&rsquo;s own <code style={{ fontFamily: 'var(--font-mono)' }}>expires_in</code>{' '}
                  is never read.
                </strong>{' '}
                Only <code style={{ fontFamily: 'var(--font-mono)' }}>access_token</code> is taken
                from the refresh response, so the true remaining validity of a token is unknown to
                this system at all times.
                <SourceRefs
                  refs={[
                    'backend/nmas/services/chartmetric.py:141-143',
                    'backend/nmas/services/chartmetric.py:165',
                  ]}
                />
              </>
            }
          />
          <KeyValue
            k="Plan tier"
            v={
              <>
                <NotCollected
                  reason="No plan, tier or entitlement field exists on any model, and no response header is ever read."
                  gapId="GAP-014"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  The tier is nonetheless inferable in one direction only: {variables.denied_endpoints.length}{' '}
                  endpoints return 401, and the recorded note on the track-stream routes reads
                  &ldquo;requires higher-tier plan&rdquo;. That is evidence of a ceiling, not a
                  reading of the tier.
                </span>
              </>
            }
          />
          <KeyValue
            k="Quota consumed"
            v={
              <NotCollected
                reason="run.quota_consumed is null. No response header is parsed, so no quota counter exists."
                gapId="GAP-014"
              />
            }
          />
          <KeyValue
            k="Quota remaining"
            v={
              <NotCollected
                reason="run.quota_remaining is null. Nothing in the client inspects rate-limit or quota headers."
                gapId="GAP-014"
              />
            }
          />
          <KeyValue
            k="Extraction units attempted"
            v={
              unitsAttempted === null ? (
                <NotCollected reason="The job summary report did not carry a unit total." gapId="GAP-010" />
              ) : (
                <>
                  <Figure
                    value={unitsAttempted}
                    status="observed"
                    unit="count"
                    label="Extraction units attempted"
                    provenance={{
                      artifact: 'run.json → report_markdown',
                      note:
                        'Recorded once, for the whole run: 131 master-list rows × 13 variables × 8 quarters.',
                    }}
                  />{' '}
                  <strong style={{ color: 'var(--est)' }}>units attempted — not HTTP calls.</strong>
                </>
              )
            }
          />
          <KeyValue
            k="HTTP calls issued"
            v={
              <>
                <NotCollected
                  reason="No request counter exists. The unit total is not a substitute in either direction."
                  gapId="GAP-010"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  The unit count bounds the call count from neither side. One call can satisfy
                  several units — the Spotify route returns followers, monthly listeners and
                  popularity from a single response — while one unit can issue several calls,
                  because every request is split into 365-day windows and every retry repeats the
                  request.
                </span>
                <SourceRefs
                  refs={[
                    'backend/nmas/services/chartmetric.py:286-300 (one call, many metrics)',
                    'backend/nmas/services/chartmetric.py:252-253, 323 (window splitting)',
                  ]}
                />
              </>
            }
          />
          <KeyValue
            k="Average latency"
            v={
              <>
                <NotCollected
                  reason="Never computed anywhere, despite both timestamps being stored on success."
                  gapId="GAP-010"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  The response record carries{' '}
                  <code style={{ fontFamily: 'var(--font-mono)' }}>requested_at</code> and{' '}
                  <code style={{ fontFamily: 'var(--font-mono)' }}>received_at</code>. Their
                  difference is never taken, and the record is constructed only inside the success
                  branch, so no failed call has timestamps at all. In any case no database survives
                  on disk to recompute it from.
                </span>
                <SourceRefs refs={['backend/nmas/services/chartmetric.py:172-237']} />
              </>
            }
          />
          <KeyValue
            k="p95 latency"
            v={
              <NotCollected
                reason="No latency distribution can exist without per-call latency."
                gapId="GAP-010"
              />
            }
          />
          <KeyValue
            k="Error rate"
            v={
              failureRatePct === null ? (
                <NotCollected reason="No unit denominator survives." gapId="GAP-010" />
              ) : (
                <>
                  <Figure
                    value={failureRatePct}
                    status="derived"
                    unit="pct"
                    precision={2}
                    label="Unit failure rate"
                    provenance={{
                      artifact: 'run.json',
                      note: `${(unitsFailed ?? 0).toLocaleString('en-US')} failed units ÷ ${(
                        unitsAttempted ?? 0
                      ).toLocaleString('en-US')} attempted. A unit failure rate, not an HTTP error rate.`,
                    }}
                  />
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' '}
                    · <span className="fig">{(unitsFailed ?? 0).toLocaleString('en-US')}</span> of{' '}
                    <span className="fig">{(unitsAttempted ?? 0).toLocaleString('en-US')}</span> units
                    {unitsCompleted !== null ? (
                      <>
                        , <span className="fig">{unitsCompleted.toLocaleString('en-US')}</span>{' '}
                        completed
                      </>
                    ) : null}
                  </span>
                </>
              )
            }
          />
          <KeyValue
            k="Retries performed"
            v={
              <>
                <NotCollected
                  reason="Retry logic exists and runs; no retry counter is incremented or persisted."
                  gapId="GAP-010"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  Configured behaviour: HTTP 429 and any 5xx are classified retryable, up to 3
                  attempts, with linear backoff of 2.0 s × attempt number. The attempt index is
                  written onto the success record only, so a call that succeeded on its first try and
                  a call that succeeded on its third are distinguishable in the database that no
                  longer exists — and nowhere else.
                </span>
                <SourceRefs
                  refs={[
                    'backend/nmas/services/chartmetric.py:194-197',
                    'backend/nmas/config.py:44-45',
                  ]}
                />
              </>
            }
          />
          <KeyValue
            k="Rate-limit events"
            v={
              <>
                <NotCollected
                  reason="run.rate_limit_events is null. 429s appear in the failure taxonomy but are not individually attributed."
                  gapId="GAP-028"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  {sawRateLimit
                    ? 'HTTP 429 does appear among the three recorded failure messages, so at least one rate-limit rejection occurred. How many of the 214 failed units it accounts for is not recorded — the taxonomy is one aggregate row with a message list, not a count per class.'
                    : 'No 429 appears in the recorded failure messages.'}
                  {sawAuthDenial
                    ? ' HTTP 401 appears in the same list, which is the denied-endpoint ceiling surfacing inside the run.'
                    : ''}
                </span>
              </>
            }
          />
          <KeyValue
            k="Measured archive depth"
            v={
              <>
                <NotCollected
                  reason="The window branch is a no-op: both sides of the conditional return 365. The probe script tests endpoint existence, not depth."
                  gapId="GAP-015"
                />
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  {apiWindow?.justificationText}
                </span>
                <SourceRefs refs={apiWindow?.sourceRefs ?? []} />
              </>
            }
          />
          <KeyValue
            k="Archive depth — derived proxy"
            v={
              depth.globalFirst && depth.globalLast ? (
                <>
                  <span className="fig" data-epi="derived">
                    {depth.globalFirst} → {depth.globalLast}
                  </span>{' '}
                  <span style={{ color: 'var(--ink-3)' }}>
                    ·{' '}
                    <Figure
                      value={depth.spanDays}
                      status="derived"
                      unit="count"
                      label="Observed span (days)"
                    />{' '}
                    days observed
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      color: 'var(--est)',
                      fontSize: 'var(--t-micro)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginTop: '0.2rem',
                    }}
                  >
                    Derived proxy — the range that was requested and returned, not the range the
                    source can reach
                  </strong>
                  <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                    The extraction asked for these dates. Nothing asked how much further back the
                    provider would have gone, so this figure is bounded by the request, not by the
                    archive. It is a floor on depth and says nothing about the ceiling.
                  </span>
                </>
              ) : (
                <NotCollected reason="No observation dates in the coverage artifact." gapId="GAP-015" />
              )
            }
          />
          <KeyValue
            k="Metrics requested vs produced"
            v={
              <>
                <Figure
                  value={variables.definitions.length}
                  status="observed"
                  unit="count"
                  label="Metrics defined"
                />{' '}
                defined ·{' '}
                <Figure
                  value={coverage.variables.length}
                  status="observed"
                  unit="count"
                  label="Metrics produced"
                />{' '}
                produced ·{' '}
                <Figure
                  value={coverage.variables_defined_never_observed.length}
                  status="unavailable"
                  unit="count"
                  label="Defined, never observed"
                />{' '}
                defined and never observed ·{' '}
                <Figure
                  value={variables.denied_endpoints.length}
                  status="rejected"
                  unit="count"
                  label="Denied endpoints"
                />{' '}
                endpoints denied 401
              </>
            }
          />
        </SourceBlock>
      </Section>

      {/* -------------------------------------------------------- soundcharts */}
      <Section
        title="SoundCharts"
        subtitle="Credited on every shipped revenue row and in the current dashboard. Not integrated, at any point, in any form."
      >
        <SourceBlock
          name="SoundCharts"
          state="Not integrated"
          epi="unavailable"
          detail={
            <>
              This is not a source that failed, or a source whose data was thin. It is a source that
              was never called, because nothing exists to call it with. Its appearance in the
              provenance strings of shipped statistical output is a false attribution.
            </>
          }
        >
          <KeyValue
            k="Client"
            v={<NotCollected reason="No SoundCharts HTTP client exists in the repository." gapId="GAP-036" />}
          />
          <KeyValue
            k="Base URL"
            v={<NotCollected reason="No SoundCharts URL constant exists anywhere." gapId="GAP-036" />}
          />
          <KeyValue
            k="Credential"
            v={
              <NotCollected
                reason="No SoundCharts key, token or environment variable exists in config, .env or the deployment manifest."
                gapId="GAP-036"
              />
            }
          />
          <KeyValue
            k="Endpoints"
            v={<NotCollected reason="No SoundCharts endpoint is defined in the metric register." gapId="GAP-036" />}
          />
          <KeyValue
            k="Observations contributed"
            v={
              <NotCollected
                reason="Zero. Every observation in the system carries a Chartmetric artist-stat endpoint."
                gapId="GAP-036"
              />
            }
          />
          <KeyValue
            k="Where the name does appear"
            v={<SoundChartsCredits />}
          />
          <KeyValue
            k="What it was proposed for"
            v={
              <>
                International radio airplay is one of five capabilities listed against a proposed
                SoundCharts integration in the correspondence context. The capability was scoped and
                deferred with the proposal — which is a different claim from never considered, and a
                different claim again from delivered.
                <SourceRefs refs={['docs/architecture/NBS-LATEST-CORRESPONDENCE-CONTEXT.md']} />
              </>
            }
          />
        </SourceBlock>
      </Section>

      {/* ----------------------------------------------------------- throttle */}
      <Section
        title="Request throttle"
        subtitle="Configuration, not measurement. No observed request rate exists anywhere in this system, so nothing on this page can be read as a measured throughput."
      >
        <Callout status="assumed" title="Two deployment targets carry different throttles">
          {throttle?.divergence}{' '}
          Any single figure presented as &ldquo;the&rdquo; request ceiling would be wrong for one of
          the two, so both are shown and neither is preferred. The run recorded in{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>run.json</code> carries no configuration
          snapshot, so which of these two values governed it is not recoverable.
        </Callout>

        <DataTable<ThrottleRow>
          rows={THROTTLE_ROWS}
          rowKey={(r) => r.env}
          filename="nmas-configured-throttle"
          dense
          pageSize={null}
          caption="Configured serial throttle and the request ceiling it implies. The ceiling is arithmetic over a configured constant — it was never observed."
          columns={THROTTLE_COLUMNS}
        />

        <p style={{ color: 'var(--ink-3)', marginTop: 'var(--s3)', maxWidth: '78ch' }}>
          {throttle?.justificationText}
        </p>
      </Section>

      {/* ---------------------------------------------------------- endpoints */}
      <Section
        title="Endpoints served"
        subtitle={`Every endpoint that returned data. All ${servedEndpoints.length} are artist-level statistics routes on the one integrated provider; there is no track, chart, playlist or geography route among them.`}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {servedEndpoints.map((e) => (
            <li
              key={e}
              className="rule-bh"
              style={{ padding: '0.25rem 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}
            >
              <span data-epi="observed" style={{ borderLeft: '2px solid var(--epi)', paddingLeft: '0.5rem' }}>
                {e}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Endpoints denied"
        subtitle="Twenty confirmed 401 responses, recorded in the metric register and surfaced by nothing else in the system. This register is the entire reason the estimation layer exists."
        actions={<EpistemicChip status="rejected" />}
      >
        <Callout status="rejected" title="No observed stream count exists anywhere" gapId="GAP-038">
          Every track-level stream route and every chart route is on this list. That is why every
          stream figure the delivery publishes is monthly listeners × 3.5 × 3 rather than a count.
        </Callout>
        <DataTable<DeniedEndpoint>
          rows={variables.denied_endpoints}
          rowKey={(r) => `${r.metric}|${r.endpoint ?? ''}`}
          filename="nmas-denied-endpoints"
          dense
          pageSize={null}
          caption="Denied endpoint register, transcribed from backend/nmas/metrics.py."
          columns={DENIED_COLUMNS}
        />
      </Section>

      {/* ------------------------------------------------------ depth proxy */}
      <Section
        title="Observation envelope by variable"
        subtitle="The derived archive-depth proxy, per variable. First and last observation dates are observed; the span is arithmetic over them. Measured depth is a separate column and is empty on every row, because the probe that would fill it is a no-op."
      >
        <DataTable
          rows={depth.rows}
          rowKey={(r) => r.variable}
          filename="nmas-observation-envelope"
          dense
          pageSize={null}
          initialSort={{ key: 'variable', dir: 'asc' }}
          caption="Derived from coverage.json. A floor on what the source holds, not a measurement of it."
          columns={[
            {
              key: 'variable',
              header: 'Variable',
              value: (r) => r.variable,
              width: '18rem',
            },
            {
              key: 'endpoint',
              header: 'Endpoint',
              value: (r) => r.endpoint,
              render: (r) =>
                r.endpoint ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {r.endpoint}
                  </span>
                ) : (
                  <NotCollected short />
                ),
            },
            {
              key: 'first',
              header: 'First observation',
              value: (r) => r.first,
              numeric: true,
              render: (r) =>
                r.first ? (
                  <span className="fig" data-epi="observed">
                    {r.first}
                  </span>
                ) : (
                  <NotCollected short />
                ),
            },
            {
              key: 'last',
              header: 'Last observation',
              value: (r) => r.last,
              numeric: true,
              render: (r) =>
                r.last ? (
                  <span className="fig" data-epi="observed">
                    {r.last}
                  </span>
                ) : (
                  <NotCollected short />
                ),
            },
            {
              key: 'span',
              header: 'Span (days)',
              value: (r) => dayCount(r.first, r.last),
              numeric: true,
              note: 'Derived — last minus first, inclusive.',
              render: (r) => (
                <Figure
                  value={dayCount(r.first, r.last)}
                  status="derived"
                  unit="count"
                  label={`${r.variable} span`}
                />
              ),
            },
            {
              key: 'obs',
              header: 'Observations',
              value: (r) => r.obs,
              numeric: true,
              render: (r) => (
                <Figure value={r.obs} field="obs_count" label={`${r.variable} observations`} />
              ),
            },
            {
              key: 'depth',
              header: 'Measured archive depth',
              value: () => null,
              note: 'Never probed — the window conditional returns the same value on both branches.',
              render: () => <NotCollected gapId="GAP-015" short />,
            },
          ]}
        />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- helpers */

interface ThrottleRow {
  env: string;
  seconds: number;
  ref: string;
}

/** Transcribed from configuration. Not one of these values was measured. */
const THROTTLE_ROWS: ThrottleRow[] = [
  { env: 'Production', seconds: 1.0, ref: 'deployment/digitalocean-app.yaml:36-37' },
  { env: 'Local', seconds: 3.0, ref: 'backend/.env:19' },
  { env: 'Code default', seconds: 1.0, ref: 'backend/nmas/config.py:43' },
];

const THROTTLE_COLUMNS: Column<ThrottleRow>[] = [
  { key: 'env', header: 'Deployment', value: (r) => r.env, width: '12rem' },
  {
    key: 'seconds',
    header: 'Seconds between requests',
    value: (r) => r.seconds,
    numeric: true,
    note: 'A configured constant, not a measured interval.',
    render: (r) => (
      <Figure value={r.seconds} status="assumed" precision={1} label={`${r.env} throttle`} />
    ),
  },
  {
    key: 'ceiling',
    header: 'Implied ceiling (req/min)',
    value: (r) => 60 / r.seconds,
    numeric: true,
    note: 'Arithmetic over the configured throttle. A ceiling the code will not exceed, not a rate it achieved.',
    render: (r) => (
      <Figure value={60 / r.seconds} status="derived" unit="count" label={`${r.env} implied ceiling`} />
    ),
  },
  {
    key: 'observed',
    header: 'Observed rate',
    value: () => null,
    note: 'No request was ever counted or timed.',
    render: () => <NotCollected reason="No request rate was ever measured." gapId="GAP-010" short />,
  },
  {
    key: 'ref',
    header: 'Configured at',
    value: (r) => r.ref,
    render: (r) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{r.ref}</span>
    ),
  },
];

const DENIED_COLUMNS: Column<DeniedEndpoint>[] = [
  { key: 'metric', header: 'Metric', value: (r) => r.metric, width: '16rem' },
  {
    key: 'endpoint',
    header: 'Endpoint',
    value: (r) => r.endpoint,
    render: (r) =>
      r.endpoint ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{r.endpoint}</span>
      ) : (
        <NotCollected short />
      ),
  },
  {
    key: 'status',
    header: 'Status',
    value: (r) => r.status,
    groupable: true,
    render: (r) =>
      r.status ? <EpistemicChip status="rejected" title={r.status} /> : <NotCollected short />,
  },
  { key: 'note', header: 'Recorded note', value: (r) => r.note },
  {
    key: 'source_ref',
    header: 'Source',
    value: (r) => r.source_ref,
    optional: true,
    note: 'Location in the codebase where the denial is recorded.',
    render: (r) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{r.source_ref}</span>
    ),
  },
];

/**
 * The SoundCharts credit is quantifiable: it is stamped on the source column of
 * every shipped revenue row. Loaded separately so a failure to read the revenue
 * artifact does not take the rest of the panel down with it.
 */
function SoundChartsCredits() {
  const revenue = useRevenue();
  return (
    <Resolved query={revenue} artifact="revenue.json" label="Counting shipped source strings">
      {(data: Revenue) => {
        const streaming = data.rows.filter((r) => /soundchart/i.test(r.streaming_source ?? '')).length;
        const exportRows = data.rows.filter((r) => /soundchart/i.test(r.export_source ?? '')).length;
        const total = data.rows.length;
        return (
          <>
            <Figure
              value={streaming}
              status="observed"
              unit="count"
              label="Streaming rows crediting SoundCharts"
            />{' '}
            of <span className="fig">{total.toLocaleString('en-US')}</span> streaming-revenue rows and{' '}
            <Figure
              value={exportRows}
              status="observed"
              unit="count"
              label="Export rows crediting SoundCharts"
            />{' '}
            export-revenue rows name SoundCharts in their source string.
            <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
              The strings read &ldquo;Chartmetric + SoundCharts API + per-stream rates&rdquo; and
              &ldquo;Chartmetric + SoundCharts + WIPO 2025 methodology&rdquo;. They are literals
              written by the extraction scripts, not provenance assembled from what was called.
            </span>
          </>
        );
      }}
    </Resolved>
  );
}

function Tally({
  label,
  value,
  epi,
  note,
}: {
  label: string;
  value: number;
  epi: 'observed' | 'estimated' | 'assumed' | 'unavailable' | 'rejected';
  note: string;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.125rem', color: 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>{note}</div>
    </div>
  );
}
