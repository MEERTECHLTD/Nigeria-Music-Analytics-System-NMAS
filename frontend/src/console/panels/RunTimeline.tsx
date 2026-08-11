/**
 * PANEL 13 — Run Timeline
 *
 * What it renders: the one extraction run this system has ever recorded, drawn
 * as a single bar against wall clock, with the unit accounting it left behind
 * (13,624 attempted, 13,410 completed, 214 failed, 0 skipped) and the 24 target
 * pipeline stages listed with their implementation status.
 *
 * What it cannot render: a Gantt chart. Not one of the 24 stages has a recorded
 * start time, end time or duration — there is no stage table, no stage name and
 * no stage timer anywhere in the codebase, so the run decomposes into nothing.
 * The bar below is the entire temporal record.
 *
 * It also cannot render parallelism. No concurrency primitive exists anywhere in
 * the extraction path: it is a serial loop behind a single shared throttle. A
 * swimlane view would be drawing lanes that never existed.
 *
 * Note that run.duration is null in the artifact. The duration shown is computed
 * here from the two timestamps and is labelled derived at the point of display.
 */

import { useMemo } from 'react';
import { useRun } from '../data/client';
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
import { STAGES, STAGE_COUNTS } from '../registry/stages';
import type { Stage, StageStatus } from '../registry/stages';
import { CONSTANTS_BY_ID } from '../registry/constants';
import type { Epistemic, FailureGroup, Run } from '../data/types';

/* ------------------------------------------------------------------ utils */

/** The run timestamps carry no offset. Both are read as UTC so the difference is exact. */
function toDate(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(ts) ? ts : `${ts}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function clockLabel(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(
    d.getUTCSeconds(),
  ).padStart(2, '0')}`;
}

function dateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
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

const STAGE_EPI: Record<StageStatus, Epistemic> = {
  IMPLEMENTED: 'observed',
  PARTIAL: 'estimated',
  SCRIPT_ONLY: 'assumed',
  ABSENT: 'unavailable',
};

const STAGE_STATUS_ORDER: StageStatus[] = ['IMPLEMENTED', 'PARTIAL', 'SCRIPT_ONLY', 'ABSENT'];

const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  IMPLEMENTED: 'Implemented',
  PARTIAL: 'Partial',
  SCRIPT_ONLY: 'Script only',
  ABSENT: 'Absent',
};

/* ------------------------------------------------------------------ panel */

export default function RunTimeline() {
  const run = useRun();
  return (
    <Resolved query={run} artifact="run.json" label="Reading the one recorded run">
      {(data) => <Body run={data} />}
    </Resolved>
  );
}

function Body({ run }: { run: Run }) {
  const report = useMemo(() => parseRunReport(run.report_markdown), [run.report_markdown]);

  const started = toDate(run.started);
  const finished = toDate(run.finished);
  const durationSeconds =
    started && finished ? (finished.getTime() - started.getTime()) / 1000 : null;

  const unitsTotal = reportNumber(report, 'total units');
  const unitsCompleted = reportNumber(report, 'completed units');
  const unitsFailed = reportNumber(report, 'failed units');
  const unitsSkipped = reportNumber(report, 'skipped units');

  const throttle = CONSTANTS_BY_ID['throttle'];

  /* Serial throttle floors, under a stated assumption. Neither is a measurement. */
  const floors: FloorRow[] =
    unitsTotal !== null
      ? [
          { env: 'Production', seconds: 1.0, ref: 'deployment/digitalocean-app.yaml:36-37' },
          { env: 'Local', seconds: 3.0, ref: 'backend/.env:19' },
        ].map((t) => {
          const floorSeconds = unitsTotal * t.seconds;
          return {
            ...t,
            floorSeconds,
            share: durationSeconds && durationSeconds > 0 ? (floorSeconds / durationSeconds) * 100 : null,
          };
        })
      : [];

  return (
    <>
      {/* ------------------------------------------------------- the one run */}
      <Section
        title="The recorded run"
        subtitle={
          <>
            One extraction run exists in the artifact record. It has a start, a finish and a unit
            tally. It has no stages, no checkpoints that survived, no per-call log and no second run
            to compare against.
          </>
        }
      >
        <Callout status="unavailable" title="No stage decomposition was ever recorded" gapId="GAP-013">
          There is no stage table, no stage name and no stage timing anywhere in the codebase. The
          bar below is therefore drawn as one continuous block: not because the run had one phase,
          but because the boundaries between its phases were never written down. A Gantt chart here
          would be an invention.
        </Callout>

        <dl style={{ margin: 'var(--s4) 0 0', maxWidth: '62rem' }}>
          <KeyValue k="Job" v={report['job'] ?? <NotCollected reason="Not present in the job summary." />} />
          <KeyValue
            k="Provider"
            v={report['provider'] ?? <NotCollected reason="Not present in the job summary." />}
          />
          <KeyValue
            k="Outcome"
            v={
              report['status'] ? (
                <span data-epi={report['status'].includes('error') ? 'rejected' : 'observed'}>
                  <EpistemicChip
                    status={report['status'].includes('error') ? 'rejected' : 'observed'}
                    title={report['status']}
                  />{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {report['status']}
                  </span>
                </span>
              ) : (
                <NotCollected reason="No status recorded." />
              )
            }
          />
          <KeyValue
            k="Started"
            v={
              started ? (
                <span className="fig" data-epi="observed">
                  {dateLabel(started)} {clockLabel(started)} UTC
                </span>
              ) : (
                <NotCollected reason="run.started is null." gapId="GAP-013" />
              )
            }
          />
          <KeyValue
            k="Finished"
            v={
              finished ? (
                <span className="fig" data-epi="observed">
                  {dateLabel(finished)} {clockLabel(finished)} UTC
                </span>
              ) : (
                <NotCollected reason="run.finished is null." gapId="GAP-013" />
              )
            }
          />
          <KeyValue
            k="Duration"
            v={
              durationSeconds === null ? (
                <NotCollected reason="Neither recorded nor derivable — a timestamp is missing." gapId="GAP-013" />
              ) : (
                <>
                  <span className="fig" data-epi="derived" style={{ fontSize: '1rem' }}>
                    {formatDuration(durationSeconds)}
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      color: 'var(--ink-3)',
                      fontSize: 'var(--t-micro)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginTop: '0.15rem',
                    }}
                  >
                    Derived — the artifact&rsquo;s own duration field is null
                  </strong>
                  <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                    Computed here as finish minus start (
                    <span className="fig">{Math.round(durationSeconds).toLocaleString('en-US')}</span>{' '}
                    seconds). The run never wrote its own elapsed time.
                  </span>
                </>
              )
            }
          />
        </dl>
      </Section>

      {/* -------------------------------------------------------- wall clock */}
      <Section
        title="Wall clock"
        subtitle="The complete temporal record of this system, drawn to scale against the day it ran. One bar, because one bar is all that was recorded."
        actions={<EpistemicChip status="observed" title="Both endpoints are recorded values" />}
      >
        {started && finished && durationSeconds !== null ? (
          <WallClock start={started} finish={finished} durationSeconds={durationSeconds} />
        ) : (
          <Callout status="unavailable" title="The run cannot be placed on a clock" gapId="GAP-013">
            One or both timestamps are absent from the artifact.
          </Callout>
        )}
      </Section>

      {/* ---------------------------------------------------- unit accounting */}
      <Section
        title="Unit accounting"
        subtitle="The one genuine tested / passed / failed triple this pipeline produces. A unit is one artist × one variable × one quarter — not one HTTP call."
      >
        {unitsTotal === null ? (
          <Callout status="unavailable" title="No unit tally recorded" gapId="GAP-012">
            The job summary report carries no unit total.
          </Callout>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap', paddingBottom: 'var(--s4)' }}>
              <UnitTally label="Attempted" value={unitsTotal} epi="observed" total={unitsTotal} />
              <UnitTally label="Completed" value={unitsCompleted} epi="observed" total={unitsTotal} />
              <UnitTally label="Failed" value={unitsFailed} epi="rejected" total={unitsTotal} />
              <UnitTally label="Skipped" value={unitsSkipped} epi="observed" total={unitsTotal} />
            </div>

            <ProportionBar
              segments={[
                {
                  label: 'Completed',
                  value: unitsCompleted ?? 0,
                  epi: 'observed',
                },
                { label: 'Failed', value: unitsFailed ?? 0, epi: 'rejected' },
              ]}
              total={unitsTotal}
              caption="13,624 units = 131 artists × 13 variables × 8 quarters. Entities skipped for a missing identifier are passed over without being counted, so the denominator is the planned grid, not the attempted population."
            />

            <Callout status="unavailable" title="No per-unit attribution survives" gapId="GAP-028">
              The 214 failures are recorded as a single aggregate row spanning HTTP 429, HTTP 401 and
              a TCP connection reset. Which artist, which variable, which quarter and which class —
              none of that is recorded. The rate is knowable; the incidence is not.
            </Callout>

            <DataTable<FailureGroup>
              rows={run.failures}
              rowKey={(f) => f.error_type ?? 'unknown'}
              filename="nmas-run-failure-taxonomy"
              dense
              pageSize={null}
              caption="Failure taxonomy as shipped, verbatim. One row, three message classes, no split between them."
              emptyMessage="The run artifact records no failure groups."
              columns={FAILURE_COLUMNS}
            />
          </>
        )}
      </Section>

      {/* -------------------------------------------------------- concurrency */}
      <Section
        title="Concurrency and the throttle floor"
        subtitle="Nothing in this run was parallel. The extraction is a serial loop behind a single shared throttle object, and no concurrency primitive — no thread pool, no task group, no async gather, no worker queue — exists anywhere in the extraction path."
      >
        <Callout status="unavailable" title="No parallelism can be shown, because none existed" gapId="GAP-013">
          A swimlane or worker-lane view of this run would be fabricating lanes. Every request waited
          for the shared throttle, issued, and returned before the next one began.
        </Callout>

        <Callout status="assumed" title="The throttle floor is a scenario, not a measurement">
          The figures below assume <strong>exactly one HTTP call per extraction unit</strong>. That
          assumption is known to be wrong in both directions — one call can satisfy several units,
          and one unit can issue several calls through window splitting and retries — and no call
          counter exists to correct it. The deployment that produced this run is not recorded either,
          so both configured throttles are shown and neither is preferred.
        </Callout>

        <DataTable<FloorRow>
          rows={floors}
          rowKey={(f) => f.env}
          filename="nmas-throttle-floor-scenario"
          dense
          pageSize={null}
          caption="Serial throttle floor under the stated assumption, against the derived wall-clock duration. A scenario, not a decomposition of the run."
          emptyMessage="No unit total was recorded, so no floor can be computed."
          columns={FLOOR_COLUMNS}
        />

        <p style={{ color: 'var(--ink-3)', marginTop: 'var(--s3)', maxWidth: '78ch' }}>
          {throttle?.justificationText}
        </p>
      </Section>

      {/* ------------------------------------------------------ stage register */}
      <Section
        title="Pipeline stages"
        subtitle={`The 24 stages a national statistical production pipeline would expose, assessed against what this codebase implements. ${STAGE_COUNTS.implemented} of ${STAGE_COUNTS.total} run and leave an artifact behind.`}
      >
        <Callout
          status="unavailable"
          title="None of the 24 stages has a start time, an end time or a duration"
          gapId="GAP-013"
        >
          The status column below describes whether the stage exists in code. It says nothing about
          when it ran, because no stage timing was ever recorded — not for the stages that are fully
          implemented, and not for the run above. That is why the three timing columns are empty on
          every one of the 24 rows, and why no Gantt is possible from this data.
        </Callout>

        <StageDistribution />

        <DataTable<Stage>
          rows={STAGES}
          rowKey={(s) => String(s.n)}
          filename="nmas-pipeline-stages"
          dense
          pageSize={null}
          initialSort={{ key: 'n', dir: 'asc' }}
          caption="Stage register. Timing columns are structurally empty, not incidentally empty."
          expand={(s) => (
            <dl style={{ margin: 0, maxWidth: '60rem' }}>
              <KeyValue k="Evidence" v={s.evidence} />
              <KeyValue k="Telemetry recorded" v={s.telemetry} />
              <KeyValue
                k="Gap register"
                v={
                  s.gapIds && s.gapIds.length > 0 ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                      {s.gapIds.join(', ')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ink-3)' }}>No open gap against this stage.</span>
                  )
                }
              />
            </dl>
          )}
          columns={[
            { key: 'n', header: '#', value: (s) => s.n, numeric: true, width: '2.5rem' },
            {
              key: 'name',
              header: 'Stage',
              value: (s) => s.name,
              width: '20rem',
              render: (s) => (
                <span>
                  {s.name}
                  {s.subtitle ? (
                    <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                      {s.subtitle}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              value: (s) => s.status,
              groupable: true,
              render: (s) => (
                <EpistemicChip status={STAGE_EPI[s.status]} title={`${s.status} — ${s.evidence}`} />
              ),
            },
            {
              key: 'statusText',
              header: 'Status (text)',
              value: (s) => s.status,
              optional: true,
              note: 'The raw status token, for export.',
            },
            {
              key: 'start',
              header: 'Recorded start',
              value: () => null,
              note: 'No stage timer exists anywhere in the codebase.',
              render: () => <NotCollected gapId="GAP-013" short />,
            },
            {
              key: 'end',
              header: 'Recorded end',
              value: () => null,
              note: 'No stage timer exists anywhere in the codebase.',
              render: () => <NotCollected gapId="GAP-013" short />,
            },
            {
              key: 'duration',
              header: 'Duration',
              value: () => null,
              note: 'Not derivable — there are no stage endpoints to difference.',
              render: () => <NotCollected gapId="GAP-013" short />,
            },
            {
              key: 'telemetry',
              header: 'Telemetry recorded',
              value: (s) => s.telemetry,
            },
            {
              key: 'gaps',
              header: 'Gaps',
              value: (s) => (s.gapIds ?? []).join(' '),
              optional: true,
              render: (s) =>
                s.gapIds && s.gapIds.length > 0 ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {s.gapIds.join(' ')}
                  </span>
                ) : (
                  <span style={{ color: 'var(--ink-4)' }}>—</span>
                ),
            },
          ]}
        />
      </Section>
    </>
  );
}

/* ---------------------------------------------------------- table columns */

const FAILURE_COLUMNS: Column<FailureGroup>[] = [
  {
    key: 'error_type',
    header: 'Error type',
    value: (f) => f.error_type,
    width: '16rem',
    render: (f) =>
      f.error_type ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
          {f.error_type}
        </span>
      ) : (
        <NotCollected short />
      ),
  },
  {
    key: 'count',
    header: 'Failed units',
    value: (f) => f.count,
    numeric: true,
    render: (f) => (
      <Figure value={f.count} status="observed" unit="count" label="Failed units" gapId="GAP-028" />
    ),
  },
  {
    key: 'messages',
    header: 'Recorded messages',
    value: (f) => f.messages.join(' | '),
    render: (f) => (
      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
        {f.messages.map((m) => (
          <li key={m} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
            {m}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: 'perClass',
    header: 'Per-class count',
    value: () => null,
    note: 'The message classes share one aggregate count. No split exists.',
    render: () => (
      <NotCollected
        reason="The three message classes share one aggregate count. No split exists."
        gapId="GAP-028"
        short
      />
    ),
  },
  {
    key: 'attribution',
    header: 'Attributed to',
    value: () => null,
    note: 'No artist, variable, quarter or call is recorded against any failure.',
    render: () => <NotCollected gapId="GAP-028" short />,
  },
];

interface FloorRow {
  env: string;
  seconds: number;
  ref: string;
  floorSeconds: number;
  share: number | null;
}

const FLOOR_COLUMNS: Column<FloorRow>[] = [
  { key: 'env', header: 'Deployment', value: (f) => f.env, width: '11rem' },
  {
    key: 'seconds',
    header: 'Throttle (s)',
    value: (f) => f.seconds,
    numeric: true,
    render: (f) => (
      <Figure value={f.seconds} status="assumed" precision={1} label={`${f.env} throttle`} />
    ),
  },
  {
    key: 'floor',
    header: 'Implied floor',
    value: (f) => Math.round(f.floorSeconds),
    numeric: true,
    note: 'Units × throttle, assuming exactly one HTTP call per unit. That assumption is known to be wrong and uncorrectable.',
    render: (f) => (
      <span className="fig" data-epi="assumed">
        {formatDuration(f.floorSeconds)}
      </span>
    ),
  },
  {
    key: 'share',
    header: 'Share of wall clock',
    value: (f) => f.share,
    numeric: true,
    render: (f) => (
      <Figure
        value={f.share}
        status="assumed"
        unit="pct"
        precision={1}
        label={`${f.env} throttle share`}
      />
    ),
  },
  {
    key: 'ref',
    header: 'Configured at',
    value: (f) => f.ref,
    render: (f) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{f.ref}</span>
    ),
  },
];

/* --------------------------------------------------------------- wall clock */

function WallClock({
  start,
  finish,
  durationSeconds,
}: {
  start: Date;
  finish: Date;
  durationSeconds: number;
}) {
  const dayStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const days = Math.max(1, Math.ceil((finish.getTime() - dayStart) / 86_400_000));
  const axisMs = days * 86_400_000;
  const left = ((start.getTime() - dayStart) / axisMs) * 100;
  const width = ((finish.getTime() - start.getTime()) / axisMs) * 100;

  const tickStepHours = days === 1 ? 3 : 12;
  const ticks: number[] = [];
  for (let h = 0; h <= days * 24; h += tickStepHours) ticks.push(h);

  const idleBefore = (start.getTime() - dayStart) / 1000;
  const idleAfter = (dayStart + axisMs - finish.getTime()) / 1000;

  return (
    <div>
      <div style={{ position: 'relative', paddingBottom: 'var(--s5)' }}>
        {/* the track */}
        <div
          style={{
            position: 'relative',
            height: '2.75rem',
            border: '1px solid var(--rule)',
            background: 'var(--paper-sunk)',
          }}
        >
          {/* hour gridlines */}
          {ticks.map((h) => (
            <span
              key={h}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${(h / (days * 24)) * 100}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                background: h % 24 === 0 ? 'var(--rule-strong)' : 'var(--rule-hair)',
              }}
            />
          ))}

          {/* the run */}
          <div
            data-epi="observed"
            title={`Run — ${dateLabel(start)} ${clockLabel(start)} → ${clockLabel(finish)} UTC · ${formatDuration(
              durationSeconds,
            )}`}
            style={{
              position: 'absolute',
              left: `${left}%`,
              width: `${width}%`,
              top: '0.5rem',
              bottom: '0.5rem',
              background: 'var(--epi)',
              border: '1px solid var(--epi)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '0.5rem',
              overflow: 'hidden',
            }}
          >
            <span
              className="fig"
              style={{ color: 'var(--paper)', fontSize: 'var(--t-micro)', whiteSpace: 'nowrap' }}
            >
              Extraction run · {formatDuration(durationSeconds)}
            </span>
          </div>
        </div>

        {/* axis */}
        <div style={{ position: 'relative', height: '1.25rem' }}>
          {ticks.map((h) => (
            <span
              key={h}
              className="fig"
              style={{
                position: 'absolute',
                left: `${(h / (days * 24)) * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: 'var(--t-micro)',
                color: 'var(--ink-3)',
                whiteSpace: 'nowrap',
              }}
            >
              {String(h % 24).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap' }}>
        <Meta k="Day drawn" v={`${dateLabel(start)} UTC${days > 1 ? ` +${days - 1} d` : ''}`} />
        <Meta k="Start" v={`${clockLabel(start)} UTC`} />
        <Meta k="Finish" v={`${clockLabel(finish)} UTC`} />
        <Meta k="Elapsed" v={formatDuration(durationSeconds)} />
        <Meta k="Clock before start" v={formatDuration(idleBefore)} />
        <Meta k="Clock after finish" v={formatDuration(idleAfter)} />
      </div>

      <p style={{ color: 'var(--ink-3)', marginTop: 'var(--s3)', maxWidth: '78ch' }}>
        The bar is undifferentiated because the record is undifferentiated. Within it sit source
        registration, entity resolution, every retrieval call, every retry, normalisation,
        aggregation and export — with no boundary recorded between any of them.
      </p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ borderLeft: '2px solid var(--rule)', padding: '0 var(--s3)' }}>
      <div className="h-section">{k}</div>
      <div className="fig" style={{ color: 'var(--ink)' }}>
        {v}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ distribution */

function StageDistribution() {
  const counts: Array<{ status: StageStatus; count: number }> = STAGE_STATUS_ORDER.map((status) => ({
    status,
    count: STAGES.filter((s) => s.status === status).length,
  }));
  const total = STAGE_COUNTS.total;

  return (
    <div style={{ paddingBottom: 'var(--s4)' }}>
      <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
        Stage status distribution — {total} stages
      </div>
      <div
        style={{ display: 'flex', height: '1.5rem', border: '1px solid var(--rule)', overflow: 'hidden' }}
        role="img"
        aria-label={counts.map((c) => `${STAGE_STATUS_LABEL[c.status]} ${c.count}`).join(', ')}
      >
        {counts.map((c) => (
          <div
            key={c.status}
            data-epi={STAGE_EPI[c.status]}
            className={c.status === 'ABSENT' ? 'hatch' : undefined}
            title={`${STAGE_STATUS_LABEL[c.status]} — ${c.count} of ${total}`}
            style={{
              width: `${(c.count / total) * 100}%`,
              background: c.status === 'ABSENT' ? undefined : 'var(--epi)',
              borderRight: '1px solid var(--paper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="fig"
              style={{
                fontSize: 'var(--t-micro)',
                color: c.status === 'ABSENT' ? 'var(--ink-2)' : 'var(--paper)',
              }}
            >
              {c.count}
            </span>
          </div>
        ))}
      </div>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s4)',
          listStyle: 'none',
          margin: 'var(--s2) 0 0',
          padding: 0,
        }}
      >
        {counts.map((c) => (
          <li key={c.status} data-epi={STAGE_EPI[c.status]} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span
              className={c.status === 'ABSENT' ? 'hatch' : undefined}
              style={{
                width: '1.25rem',
                height: '0.6rem',
                background: c.status === 'ABSENT' ? undefined : 'var(--epi)',
                border: '1px solid var(--rule)',
              }}
            />
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>
              {STAGE_STATUS_LABEL[c.status]} <span className="fig">{c.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ tallies */

function UnitTally({
  label,
  value,
  epi,
  total,
}: {
  label: string;
  value: number | null;
  epi: Epistemic;
  total: number;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        {value === null ? (
          <NotCollected reason="Not present in the job summary report." gapId="GAP-012" />
        ) : (
          <>
            <span className="fig" style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>
              {value.toLocaleString('en-US')}
            </span>
            <span className="fig" style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
              {total > 0 ? `${((value / total) * 100).toFixed(2)}%` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ProportionBar({
  segments,
  total,
  caption,
}: {
  segments: Array<{ label: string; value: number; epi: Epistemic }>;
  total: number;
  caption: string;
}) {
  return (
    <div style={{ paddingBottom: 'var(--s4)' }}>
      <div
        style={{ display: 'flex', height: '1.25rem', border: '1px solid var(--rule)' }}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            data-epi={s.epi}
            title={`${s.label} — ${s.value.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: 'var(--epi)',
              minWidth: s.value > 0 ? '2px' : 0,
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)', margin: '0.35rem 0 0', maxWidth: '78ch' }}>
        {caption}
      </p>
    </div>
  );
}
