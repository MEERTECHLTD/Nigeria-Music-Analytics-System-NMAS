/**
 * PANEL 14 — System Monitoring
 *
 * What it renders: an honest inventory of the operational telemetry this system
 * does not have, each entry naming the field that would carry it and the gap
 * that records its absence. Two figures can be stated and are: the unit failure
 * rate of the one recorded run, and the request ceiling implied by the
 * configured throttle — the second being configuration, not measurement.
 *
 * What it cannot render: monitoring. There is no request log, no queue, no
 * worker pool, no cache, no quota counter and no metrics endpoint anywhere in
 * this system. Nothing on this page is live, and nothing on this page can be
 * made live by refreshing it. The subject is a single historical run that
 * finished on 2026-04-04 and has never been repeated.
 *
 * A monitoring panel that animated, polled, or showed a "last 5 minutes" window
 * would be the single most dishonest surface in this console. So it does none of
 * those things.
 */

import { useMemo } from 'react';
import { useRun } from '../data/client';
import {
  Callout,
  EpistemicChip,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import { CONSTANTS_BY_ID } from '../registry/constants';
import type { Run } from '../data/types';

/* ------------------------------------------------------------------ utils */

function toDate(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(ts) ? ts : `${ts}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

/* ---------------------------------------------------- the requested metrics */

interface RequestedMetric {
  label: string;
  /** the field in run.json that would carry it, where one exists at all */
  field: string | null;
  gapId: string;
  reason: string;
}

const REQUESTED: RequestedMetric[] = [
  {
    label: 'Requests per minute',
    field: null,
    gapId: 'GAP-010',
    reason:
      'No request counter and no request log exist. run.json has no field for it because nothing was ever counted to put in one.',
  },
  {
    label: 'Queue depth',
    field: 'queue_depth',
    gapId: 'GAP-025',
    reason:
      'There is no queue. Extraction is a serial loop that holds the request open for its whole duration, so there is no backlog to measure and no way to observe progress mid-run.',
  },
  {
    label: 'Active workers',
    field: 'active_workers',
    gapId: 'GAP-013',
    reason:
      'There is no worker pool. No concurrency primitive of any kind exists in the extraction path, so the count would be one by construction — but it is not recorded, and stating one would be asserting a measurement that was never taken.',
  },
  {
    label: 'Cache hit rate',
    field: 'cache_hit_rate',
    gapId: 'GAP-010',
    reason:
      'There is no cache layer. Every call goes to the provider. A hit rate of zero would be a claim about a component that does not exist.',
  },
  {
    label: 'Average response time',
    field: null,
    gapId: 'GAP-010',
    reason:
      'Both requested_at and received_at are written onto the response record on success, and their difference is never taken anywhere in the codebase. No database survives on disk to recompute it from.',
  },
  {
    label: 'p95 response time',
    field: null,
    gapId: 'GAP-010',
    reason:
      'A percentile requires a distribution. No per-call latency was ever derived, so there is no distribution to take a percentile of.',
  },
  {
    label: 'Records per minute',
    field: null,
    gapId: 'GAP-029',
    reason:
      'No throughput counter exists at any stage. Six silent skip branches in the normaliser increment no counter, so even records-in versus records-out is unavailable below run granularity.',
  },
  {
    label: 'Quota consumed',
    field: 'quota_consumed',
    gapId: 'GAP-014',
    reason:
      'No response header is read anywhere in the client. Nothing quota-shaped can exist without that.',
  },
  {
    label: 'Quota remaining',
    field: 'quota_remaining',
    gapId: 'GAP-014',
    reason: 'Same cause: no header parsing, no Retry-After honouring, no entitlement read.',
  },
  {
    label: 'Quota burn rate',
    field: null,
    gapId: 'GAP-014',
    reason:
      'A rate requires a consumed counter and a clock. Neither the counter nor the plan tier exists.',
  },
  {
    label: 'Projected quota exhaustion',
    field: null,
    gapId: 'GAP-014',
    reason:
      'Would require quota remaining and a burn rate. Both are absent, so any projected date would be invented twice over.',
  },
  {
    label: 'Rate-limit events',
    field: 'rate_limit_events',
    gapId: 'GAP-028',
    reason:
      'HTTP 429 appears among the three recorded failure messages, so rate limiting did occur. It is not counted and not attributed to any call, artist, variable or quarter.',
  },
];

/* ------------------------------------------------------------------ panel */

export default function SystemMonitoring() {
  const run = useRun();
  return (
    <Resolved query={run} artifact="run.json" label="Reading the one recorded run">
      {(data) => <Body run={data} />}
    </Resolved>
  );
}

function Body({ run }: { run: Run }) {
  const report = useMemo(() => parseRunReport(run.report_markdown), [run.report_markdown]);

  const unitsTotal = reportNumber(report, 'total units');
  const unitsFailed = reportNumber(report, 'failed units');
  const failureRatePct =
    unitsTotal !== null && unitsFailed !== null && unitsTotal > 0
      ? (unitsFailed / unitsTotal) * 100
      : null;

  const finished = toDate(run.finished);
  const daysSince =
    finished !== null ? Math.floor((Date.now() - finished.getTime()) / 86_400_000) : null;

  const throttle = CONSTANTS_BY_ID['throttle'];

  /** Confirm from the artifact itself that each named field really is null. */
  const runRecord = run as unknown as Record<string, unknown>;
  const isNull = (field: string | null): boolean =>
    field === null || runRecord[field] === null || runRecord[field] === undefined;

  return (
    <>
      {/* ------------------------------------------------------- the warning */}
      <Section
        title="This is not a monitor"
        subtitle="Read the next paragraph before reading anything else on this page."
      >
        <Callout status="rejected" title="This system has no live telemetry of any kind" gapId="GAP-010">
          There is no metrics endpoint, no request log, no queue, no worker pool, no cache and no
          quota counter anywhere in this codebase. Nothing here polls, nothing here streams, and
          refreshing this page will not change a single figure on it.
          <br />
          <br />
          What this panel reports on is <strong>one extraction run</strong>, which started and
          finished on 2026-04-04 and has never been repeated. Every number below is either a property
          of that historical run or a value read out of a configuration file. Treating this page as
          an operational dashboard — as a statement about a service that is running now — would be a
          category error, and an expensive one for anyone making a decision on it.
        </Callout>

        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap', paddingTop: 'var(--s3)' }}>
          <StatFigure
            label="Runs on record"
            value={1}
            status="observed"
            unit="count"
            footnote="One. There is no second run to compare against, and no run history table."
          />
          <StatFigure
            label="Days since that run finished"
            value={daysSince}
            status="derived"
            unit="count"
            gapId="GAP-013"
            reason="run.finished is null, so elapsed time cannot be computed."
            footnote="Computed at page load from the browser clock against the recorded finish timestamp. It grows every day and nothing in the system reduces it."
          />
          <StatFigure
            label="Live metrics available"
            value={0}
            status="observed"
            unit="count"
            footnote="Zero, and this is a counted zero: no endpoint in the repository serves operational metrics."
          />
          <StatFigure
            label="Requested metrics not collected"
            value={REQUESTED.length}
            status="observed"
            unit="count"
            footnote="Every tile in the inventory below."
          />
        </div>
      </Section>

      {/* --------------------------------------------------- what can be said */}
      <Section
        title="What can be stated"
        subtitle="Two figures survive. Both are labelled with what they actually are, because one of them is not a measurement at all."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
            gap: 'var(--s5)',
            paddingBottom: 'var(--s4)',
          }}
        >
          <div data-epi="derived" style={{ borderLeft: '3px solid var(--epi)', paddingLeft: 'var(--s4)' }}>
            <div className="h-section" style={{ marginBottom: '0.3rem' }}>
              Unit failure rate — derived
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              {failureRatePct === null ? (
                <NotCollected reason="No unit tally in the job summary report." gapId="GAP-012" />
              ) : (
                <span className="fig" data-epi="derived" style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                  {failureRatePct.toFixed(2)}%
                </span>
              )}
            </div>
            <p style={{ color: 'var(--ink-2)', margin: '0.4rem 0 0', maxWidth: '40ch' }}>
              <span className="fig">{(unitsFailed ?? 0).toLocaleString('en-US')}</span> failed of{' '}
              <span className="fig">{(unitsTotal ?? 0).toLocaleString('en-US')}</span> extraction
              units attempted. This is a <strong>unit</strong> failure rate over the whole run, not
              an HTTP error rate and not a rate over time. No per-call, per-minute or per-class
              breakdown exists.
            </p>
          </div>

          <div data-epi="assumed" style={{ borderLeft: '3px solid var(--epi)', paddingLeft: 'var(--s4)' }}>
            <div className="h-section" style={{ marginBottom: '0.3rem' }}>
              Throughput ceiling — configuration, not measurement
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="fig" data-epi="assumed" style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                60
              </span>
              <span style={{ color: 'var(--ink-3)' }}>req/min at 1.0 s — production</span>
              <span className="fig" data-epi="assumed" style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                20
              </span>
              <span style={{ color: 'var(--ink-3)' }}>req/min at 3.0 s — local</span>
            </div>
            <p style={{ color: 'var(--ink-2)', margin: '0.4rem 0 0', maxWidth: '44ch' }}>
              Arithmetic over a configured constant. <strong>No request rate was ever observed</strong>,
              so this is a ceiling the code would not exceed, not a throughput the system achieved.
              The two deployments differ and the run carries no configuration snapshot, so which of
              the two governed it is not recoverable.
            </p>
          </div>
        </div>

        <dl style={{ margin: 0, maxWidth: '62rem' }}>
          <KeyValue
            k="Observed request rate"
            v={<NotCollected reason="No request was ever timed or counted." gapId="GAP-010" />}
          />
          <KeyValue
            k="Throttle divergence"
            v={
              <>
                {throttle?.divergence}
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--t-micro)',
                    color: 'var(--ink-4)',
                    marginTop: '0.2rem',
                  }}
                >
                  {(throttle?.sourceRefs ?? []).join('  ·  ')}
                </span>
              </>
            }
          />
        </dl>
      </Section>

      {/* ----------------------------------------------------- the inventory */}
      <Section
        title="Requested metrics"
        subtitle="Each tile names a metric the brief asks a monitoring panel to show, the field in the run artifact that would carry it, and the register entry that records why it is empty. Not one of them is available."
        actions={<EpistemicChip status="unavailable" title="Never collected, or collected and empty" />}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))',
            gap: '1px',
            background: 'var(--rule-hair)',
            border: '1px solid var(--rule)',
          }}
        >
          {REQUESTED.map((m) => (
            <AbsentTile key={m.label} metric={m} confirmedNull={isNull(m.field)} />
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------- what it would take */}
      <Section
        title="What building this panel would require"
        subtitle="An empty panel is only useful if it says what would fill it. None of the following is a research problem; all of it is instrumentation that was not written."
      >
        <ol style={{ margin: 0, paddingLeft: '1.2rem', maxWidth: '78ch' }}>
          <Requirement
            title="Persist the response envelope on failure as well as success"
            body="The provider response record already carries status code, attempt number, requested_at and received_at — but it is constructed only inside the success branch, so no failed call leaves a row. Moving the construction above the status check would give per-call status codes and a failure-attribution key in one change."
            gapId="GAP-010"
          />
          <Requirement
            title="Difference the two timestamps that are already stored"
            body="Latency is not a new measurement. requested_at and received_at are both written; nothing subtracts one from the other. Average and p95 response time both become available the moment that subtraction is stored or the rows are served."
            gapId="GAP-010"
          />
          <Requirement
            title="Read the provider's rate-limit and quota response headers"
            body="No header is parsed anywhere in the client, and the token refresh discards expires_in. Reading headers is what converts quota consumed, quota remaining, burn rate, projected exhaustion and Retry-After honouring from impossible into trivial. It is also what would let plan tier be reported rather than inferred from 401s."
            gapId="GAP-014"
          />
          <Requirement
            title="Count retries, 429s and normaliser skips"
            body="The retry loop runs and the skip branches execute; neither increments anything. Three counters would turn the aggregate failure row into a taxonomy with real per-class counts."
            gapId="GAP-028"
          />
          <Requirement
            title="Give stages an identity and a timer"
            body="No stage table, name or timing exists, so no per-stage throughput, records-in or records-out can be reported and no Gantt can be drawn. This is the single largest missing structure in the pipeline."
            gapId="GAP-013"
          />
          <Requirement
            title="Serve the checkpoints that are already written"
            body="Checkpoint rows are fully populated and served by no endpoint. A read-only endpoint would surface run progress after the fact. Live progress would still be impossible while the run holds the request open and counter flushes stay transaction-local — that needs the run to be moved off the request path."
            gapId="GAP-025"
          />
          <Requirement
            title="Restore a database"
            body="No database file exists on disk. Even the telemetry the schema does support — payload rows, audit rows, checkpoints — is unrecoverable for the run that produced this delivery. Everything above only helps future runs."
            gapId="GAP-011"
          />
        </ol>
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- fragments */

function AbsentTile({ metric, confirmedNull }: { metric: RequestedMetric; confirmedNull: boolean }) {
  return (
    <div
      data-epi="unavailable"
      style={{ background: 'var(--paper)', padding: 'var(--s3) var(--s4)' }}
    >
      <div className="h-section" style={{ marginBottom: '0.3rem' }}>
        {metric.label}
      </div>
      <div
        className="hatch"
        style={{
          height: '1.75rem',
          border: '1px solid var(--una-edge)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '0.4rem',
        }}
      >
        <span
          className="not-collected"
          style={{ background: 'var(--paper)', padding: '0 0.4rem' }}
        >
          Not collected {metric.gapId}
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 'var(--t-small)' }}>{metric.reason}</p>
      <p style={{ margin: '0.3rem 0 0', fontSize: 'var(--t-micro)', color: 'var(--ink-4)' }}>
        {metric.field ? (
          <>
            <code style={{ fontFamily: 'var(--font-mono)' }}>run.{metric.field}</code>
            {confirmedNull ? ' is null in the artifact.' : ' carries no usable value.'}
          </>
        ) : (
          'No field for this metric exists in the run artifact.'
        )}
      </p>
    </div>
  );
}

function Requirement({ title, body, gapId }: { title: string; body: string; gapId: string }) {
  return (
    <li className="rule-bh" style={{ padding: '0.5rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s3)' }}>
        <strong style={{ color: 'var(--ink)' }}>{title}</strong>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
          {gapId}
        </code>
      </div>
      <p style={{ margin: '0.2rem 0 0', color: 'var(--ink-2)' }}>{body}</p>
    </li>
  );
}
