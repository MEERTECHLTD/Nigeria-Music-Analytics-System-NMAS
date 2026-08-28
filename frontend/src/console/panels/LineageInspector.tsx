/**
 * PANEL 8 — Lineage Inspector
 *
 * WHAT IT RENDERS
 *   The seven links of the provenance chain that actually survive on disk, one
 *   cell at a time: source → endpoint template → source field → extraction
 *   timestamp → variable value → aggregation rule → aggregated value. Each link
 *   is verified against the artifact manifest's own column list rather than
 *   asserted, so the claim "this survives" is checked at render time.
 *
 *   It then shows the six links that do NOT survive, as an ordered list with the
 *   reason each one is missing, and the one place where a surviving link is
 *   demonstrably wrong: `sum` applied to cumulative counters.
 *
 * WHAT IT CANNOT RENDER
 *   Request parameters, HTTP status codes, response timestamps, raw returned
 *   values, response hashes and retry counts. None of them exists in any shipped
 *   artifact, and no database survives on disk from which they could be read
 *   (GAP-010, GAP-011). Per-observation values are also outside this projection:
 *   the 850,059-row observation CSV carries variable_value per row, but the
 *   console reads counts and aggregates of it, not the individual rows.
 *
 *   The observation summary is archive-wide and carries no period dimension. It
 *   comes from the parallel database export, which covers 65 of the 131 roster rows
 *   (GAP-032). It is therefore shown beside a selected quarter, never as that
 *   quarter's content.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  formatPeriod,
  formatTimestamp,
  humanizeVariable,
  useAggregates,
  useCoverage,
  useManifest,
  useObservationSummary,
  useVariables,
} from '../data/client';
import {
  Callout,
  EpistemicChip,
  Figure,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import type {
  AggregateRow,
  Coverage,
  CoverageCell,
  Manifest,
  MetricDefinition,
  ObservationSummaryRow,
  Variables,
} from '../data/types';

/* ------------------------------------------------------------------ chain */

/**
 * The seven links. `artifactRole` + `column` name the exact place the link is
 * claimed to survive; the manifest is consulted at render time to confirm it.
 */
interface ChainLink {
  n: number;
  name: string;
  what: string;
  artifactRole: string;
  column: string | null;
  /** set where the link survives but is degraded, and how */
  caveat?: string;
}

const CHAIN: ChainLink[] = [
  {
    n: 1,
    name: 'Source',
    what: 'The provider the value came from.',
    artifactRole: 'daily_observations',
    column: 'source_endpoint',
    caveat:
      'Not a column of its own. One HTTP client exists in the repository and it targets Chartmetric, so the source is implied by the endpoint rather than recorded. A row cannot state which of two sources it came from, because there is only one.',
  },
  {
    n: 2,
    name: 'Endpoint template',
    what: 'The route that was called.',
    artifactRole: 'daily_observations',
    column: 'source_endpoint',
    caveat:
      'Stored unresolved. The value on every row still contains the literal placeholder {chartmetric_id}, so the stored endpoint identifies the route but cannot be replayed as a request.',
  },
  {
    n: 3,
    name: 'Source field',
    what: 'The key read out of the response body.',
    artifactRole: 'daily_observations',
    column: 'source_field',
  },
  {
    n: 4,
    name: 'Extraction timestamp',
    what: 'When the extraction wrote the row.',
    artifactRole: 'daily_observations',
    column: 'extraction_timestamp',
    caveat:
      'One timestamp, written by the extractor. It is not the response timestamp and not the request timestamp, so no latency can be derived from it.',
  },
  {
    n: 5,
    name: 'Variable value',
    what: 'The daily scalar that was extracted.',
    artifactRole: 'daily_observations',
    column: 'variable_value',
    caveat:
      'Present per row in the daily observation CSV. This console reads counts and aggregates of that file, not its individual rows, so a single day’s value is not addressable here.',
  },
  {
    n: 6,
    name: 'Aggregation rule',
    what: 'The rule applied to collapse the daily series into a quarter.',
    artifactRole: 'quarterly_aggregates',
    column: 'aggregation_rule',
  },
  {
    n: 7,
    name: 'Aggregated value',
    what: 'The published quarterly figure.',
    artifactRole: 'quarterly_aggregates',
    column: 'aggregated_value',
  },
];

/** The links the brief asks for that exist nowhere. Order is the request order. */
const BROKEN: Array<{ n: number; name: string; why: ReactNode; gapId: string }> = [
  {
    n: 1,
    name: 'Request parameters',
    gapId: 'GAP-010',
    why: (
      <>
        No artifact carries a query string, a date window, a geo scope or a resolved
        artist identifier. The only route information stored is the endpoint
        template with its placeholder still in it, so the request that produced a
        row cannot be reconstructed from the row.
      </>
    ),
  },
  {
    n: 2,
    name: 'HTTP status code',
    gapId: 'GAP-010',
    why: (
      <>
        The database schema defines a status-code column. The payload record that
        would fill it is constructed only inside the success branch, so a failed
        call never produces a row to hold its status. The 214 failures the one
        recorded run reports are known only as a single aggregate count across
        three error classes, with no attribution to any call (GAP-028).
      </>
    ),
  },
  {
    n: 3,
    name: 'Response timestamp',
    gapId: 'GAP-010',
    why: (
      <>
        The schema stores a request timestamp and a response timestamp; latency is
        never derived from the pair, and neither timestamp is carried into any
        export. What survives is one extraction timestamp written by the writer,
        which measures the writer, not the provider.
      </>
    ),
  },
  {
    n: 4,
    name: 'Raw returned value',
    gapId: 'GAP-011',
    why: (
      <>
        The scripts that produced the shipped CSVs discard the response envelope
        entirely and keep only the extracted scalar. There is no stored body to
        re-parse, so a source field cannot be re-read against a different key and
        an extraction cannot be re-derived without calling the provider again.
      </>
    ),
  },
  {
    n: 5,
    name: 'Response hash',
    gapId: 'GAP-011',
    why: (
      <>
        A response hash is written on the observation model and appears in no
        response schema and no export (GAP-017). No database file exists on disk,
        so no row that ever held one survives. Nothing on disk can be shown to be
        unmodified since extraction.
      </>
    ),
  },
  {
    n: 6,
    name: 'Retry count',
    gapId: 'GAP-010',
    why: (
      <>
        Retry logic exists — 429 and 5xx are classified retryable and retried with
        linear backoff — but the attempt counter is written only on the success
        record, and no success record survives. A row that took four attempts and a
        row that took one are indistinguishable.
      </>
    ),
  },
];

/* --------------------------------------------------------------- helpers */

/** variables.json carries the resolved response key under a field the type does not declare. */
function statDataKey(def: MetricDefinition | undefined): string | null {
  if (!def) return null;
  const raw = (def as unknown as Record<string, unknown>)['stat_data_key'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function periodKey(p: string): number {
  const m = /^Q(\d)_(\d{4})$/.exec(p);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

/* ==================================================================== panel */

export default function LineageInspector() {
  const [variable, setVariable] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>(null);

  return (
    <>
      <Section
        title="What survives per observation"
        subtitle={
          <>
            Seven links of the chain are on disk. Each one below names the artifact
            and the column it lives in, and the presence claim is checked against
            the artifact manifest rather than asserted.
          </>
        }
      >
        <Callout status="unavailable" title="Lineage stops at the CSV boundary" gapId="GAP-011">
          This panel can walk a figure back to the endpoint that produced it and no
          further. Nothing below the extraction — the request, the response, its
          status, its body — was retained by the scripts that produced the shipped
          data, and no database exists on disk from which it could be recovered.
          The chain is genuine as far as it goes; it does not go as far as an
          audit would require.
        </Callout>
        <SurvivingChain />
      </Section>

      <CellSelector
        variable={variable}
        period={period}
        onVariable={setVariable}
        onPeriod={setPeriod}
      />

      <ObservationDetail variable={variable} />

      <Section
        title="What does not survive"
        subtitle="Six links the brief asks for, in request order, with the reason each is absent. None of these renders a value anywhere in this console, and none is recoverable from the shipped delivery."
      >
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {BROKEN.map((b) => (
            <li
              key={b.n}
              className="rule-bh"
              data-epi="unavailable"
              style={{
                display: 'grid',
                gridTemplateColumns: '2rem minmax(10rem, 14rem) 1fr auto',
                gap: 'var(--s3)',
                padding: 'var(--s3) 0',
                alignItems: 'baseline',
              }}
            >
              <span className="fig" style={{ color: 'var(--ink-4)' }}>
                {b.n}.
              </span>
              <span style={{ fontWeight: 600 }}>
                {b.name}
                <span style={{ display: 'block', marginTop: '0.2rem' }}>
                  <NotCollected short />
                </span>
              </span>
              <span style={{ color: 'var(--ink-2)', maxWidth: '72ch' }}>{b.why}</span>
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                }}
              >
                {b.gapId}
              </code>
            </li>
          ))}
        </ol>

        <div style={{ paddingTop: 'var(--s5)' }}>
          <h3 className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Why, precisely
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', maxWidth: '76ch', color: 'var(--ink-2)' }}>
            <li style={{ padding: '0.25rem 0' }}>
              <strong style={{ color: 'var(--ink)' }}>
                The payload record is written only inside the success branch.
              </strong>{' '}
              A call that fails leaves no row at all — not a row marked failed, no
              row. Every telemetry field the schema defines is therefore populated
              only for calls that did not need it. This is why a 1.57% failure rate
              can be reported in aggregate and attributed to nothing in particular.
            </li>
            <li style={{ padding: '0.25rem 0' }}>
              <strong style={{ color: 'var(--ink)' }}>
                The scripts that produced the shipped data discard the response
                envelope entirely.
              </strong>{' '}
              The delivery was built by standalone extraction scripts, not by the
              job pipeline that owns the payload table. Those scripts read the
              scalar out of the response and write it to a CSV row; the envelope —
              status, headers, body, timing — is never held anywhere it could be
              persisted from.
            </li>
            <li style={{ padding: '0.25rem 0' }}>
              <strong style={{ color: 'var(--ink)' }}>No database exists on disk.</strong>{' '}
              Even for the fields the schema does define — status code, attempt
              count, request and response timestamps, response hash — zero rows
              survive. The delivery database directory is empty, so this is not a
              serialisation gap that a new endpoint would close. The data is gone.
            </li>
          </ol>
        </div>
      </Section>

      <AggregationDefect />
    </>
  );
}

/* ---------------------------------------------------- 1. surviving chain */

function SurvivingChain() {
  const query = useManifest();
  return (
    <Resolved query={query} artifact="manifest.json" label="Reading artifact manifest">
      {(manifest) => <ChainList manifest={manifest} />}
    </Resolved>
  );
}

function ChainList({ manifest }: { manifest: Manifest }) {
  const columnsByRole = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of manifest.artifacts) m.set(a.role, a.columns ?? []);
    return m;
  }, [manifest.artifacts]);

  return (
    <ol style={{ margin: 'var(--s4) 0 0', padding: 0, listStyle: 'none' }}>
      {CHAIN.map((link) => {
        const cols = columnsByRole.get(link.artifactRole);
        const present = !!link.column && !!cols && cols.includes(link.column);
        return (
          <li
            key={link.n}
            className="rule-bh"
            data-epi={present ? 'observed' : 'unavailable'}
            style={{
              display: 'grid',
              gridTemplateColumns: '2rem minmax(9rem, 12rem) minmax(0, 1fr) auto',
              gap: 'var(--s3)',
              padding: 'var(--s3) 0',
              alignItems: 'baseline',
              borderLeft: '2px solid var(--epi)',
              paddingLeft: 'var(--s3)',
            }}
          >
            <span className="fig" style={{ color: 'var(--ink-4)' }}>
              {link.n}.
            </span>
            <span style={{ fontWeight: 600 }}>{link.name}</span>
            <span>
              <span style={{ color: 'var(--ink-2)' }}>{link.what}</span>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                  marginTop: '0.2rem',
                  wordBreak: 'break-all',
                }}
              >
                {link.artifactRole}
                {link.column ? ` · ${link.column}` : ''}
              </span>
              {link.caveat ? (
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--t-small)',
                    color: 'var(--ink-3)',
                    marginTop: '0.25rem',
                    maxWidth: '70ch',
                  }}
                >
                  {link.caveat}
                </span>
              ) : null}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {present ? (
                <EpistemicChip
                  status="observed"
                  title="This column is listed in the artifact manifest for that file."
                />
              ) : (
                <NotCollected reason="The manifest does not list this column." />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------- 2. cell selector */

function CellSelector({
  variable,
  period,
  onVariable,
  onPeriod,
}: {
  variable: string | null;
  period: string | null;
  onVariable: (v: string) => void;
  onPeriod: (p: string) => void;
}) {
  const coverage = useCoverage();
  const variables = useVariables();

  return (
    <Section
      title="Trace a cell"
      subtitle="Pick a variable and a quarter. Everything shown below is read from the cell's own row in the coverage projection, the metric register, and the quarterly aggregate artifact — nothing is inferred."
    >
      <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
        {(cov) => (
          <Resolved query={variables} artifact="variables.json" label="Reading metric register">
            {(vars) => (
              <CellTrace
                cov={cov}
                vars={vars}
                variable={variable}
                period={period}
                onVariable={onVariable}
                onPeriod={onPeriod}
              />
            )}
          </Resolved>
        )}
      </Resolved>
    </Section>
  );
}

function CellTrace({
  cov,
  vars,
  variable,
  period,
  onVariable,
  onPeriod,
}: {
  cov: Coverage;
  vars: Variables;
  variable: string | null;
  period: string | null;
  onVariable: (v: string) => void;
  onPeriod: (p: string) => void;
}) {
  const activeVar = variable ?? cov.variables[0] ?? '';
  const activePeriod =
    period ?? cov.periods_observed[cov.periods_observed.length - 1] ?? '';
  // Roster size comes from the archive, never a fixed number.
  const universe = cov.distinct_artists || null;

  const cell: CoverageCell | undefined = useMemo(
    () => cov.cells.find((c) => c.variable === activeVar && c.period === activePeriod),
    [cov.cells, activeVar, activePeriod],
  );

  const def = useMemo(
    () => vars.definitions.find((d) => d.name === activeVar),
    [vars.definitions, activeVar],
  );

  const sourceField = statDataKey(def);

  return (
    <>
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: 'var(--s4)',
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingBottom: 'var(--s4)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span className="h-section">Variable</span>
          <select
            className="inp"
            value={activeVar}
            onChange={(e) => onVariable(e.target.value)}
            style={{ minWidth: '18rem' }}
          >
            {cov.variables.map((v) => (
              <option key={v} value={v}>
                {humanizeVariable(v)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span className="h-section">Quarter</span>
          <select className="inp" value={activePeriod} onChange={(e) => onPeriod(e.target.value)}>
            {cov.periods_observed.map((p) => (
              <option key={p} value={p}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!cell ? (
        <Callout status="unavailable" title="This variable produced no rows in this quarter">
          <span style={{ fontFamily: 'var(--font-mono)' }}>{activeVar}</span> has no
          coverage cell for {formatPeriod(activePeriod)}. There is no chain to walk,
          because no observation was written.
        </Callout>
      ) : (
        <dl style={{ margin: 0, maxWidth: '64rem' }}>
          <TraceRow
            n={1}
            k="Source"
            v="Chartmetric"
            status="observed"
            note="The only integrated source. SoundCharts appears in shipped source strings and has no client anywhere in the repository (GAP-036)."
          />
          <TraceRow
            n={2}
            k="Endpoint template"
            v={cell.endpoints.length > 0 ? cell.endpoints.join(', ') : null}
            mono
            status="observed"
            note="Stored with the {chartmetric_id} placeholder unresolved, so the route is identified but the call is not reproducible."
            gapId="GAP-010"
          />
          <TraceRow
            n={3}
            k="Source field"
            v={sourceField}
            mono
            status="observed"
            note={
              def?.source_field_candidates
                ? `Probe order in the metric register: ${def.source_field_candidates.join(' → ')}. Which candidate actually matched on a given row is not recorded.`
                : undefined
            }
            gapId={sourceField ? undefined : 'GAP-011'}
          />
          <TraceRow
            n={4}
            k="Extraction timestamp"
            v={formatTimestamp(cell.last_extraction)}
            mono
            status="observed"
            note="The most recent extraction writing into this cell. Per-observation timestamps exist in the daily observation CSV; this projection carries the cell maximum only."
          />
          <TraceRow
            n={5}
            k="Variable value"
            v={
              <>
                <Figure
                  value={cell.obs_count}
                  field="obs_count"
                  label="Observations in this cell"
                />
                <span style={{ color: 'var(--ink-3)' }}>
                  {' '}
                  daily values across{' '}
                  <span className="fig">{cell.artist_count}</span> of{' '}
                  <span className="fig">{universe ?? '?'}</span> artists
                  {cell.first_date && cell.last_date ? (
                    <>
                      , {cell.first_date} → {cell.last_date}
                    </>
                  ) : null}
                </span>
              </>
            }
            status="observed"
            note="Individual daily values are not addressable in this projection. The count and the span are what the console reads."
          />
          <TraceRow
            n={6}
            k="Aggregation rule"
            v={def?.aggregation_rule ?? null}
            mono
            status="observed"
            note={
              def?.aggregation_rule
                ? `Declared in the metric register at ${def.source_ref}. The rule actually applied in the shipped aggregate artifact is shown per row in the table below — the two do not always agree.`
                : undefined
            }
            gapId={def?.aggregation_rule ? undefined : 'GAP-011'}
          />
          <TraceRow
            n={7}
            k="Aggregated value"
            v={<CellAggregates variable={activeVar} period={activePeriod} />}
            status="observed"
          />
        </dl>
      )}
    </>
  );
}

function TraceRow({
  n,
  k,
  v,
  mono,
  note,
  gapId,
  status,
}: {
  n: number;
  k: string;
  v: ReactNode;
  mono?: boolean;
  note?: string;
  gapId?: string;
  status: 'observed' | 'unavailable';
}) {
  const absent = v === null || v === undefined || v === '';
  return (
    <div
      className="rule-bh"
      data-epi={absent ? 'unavailable' : status}
      style={{
        display: 'grid',
        gridTemplateColumns: '2rem minmax(9rem, 12rem) minmax(0, 1fr)',
        gap: 'var(--s3)',
        padding: 'var(--s3) 0',
        alignItems: 'baseline',
        borderLeft: '2px solid var(--epi)',
        paddingLeft: 'var(--s3)',
      }}
    >
      <span className="fig" style={{ color: 'var(--ink-4)' }}>
        {n}.
      </span>
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{k}</dt>
      <dd style={{ margin: 0, minWidth: 0 }}>
        <span
          style={{
            fontFamily: mono ? 'var(--font-mono)' : undefined,
            fontSize: mono ? 'var(--t-small)' : undefined,
            wordBreak: 'break-word',
          }}
        >
          {absent ? <NotCollected gapId={gapId} /> : v}
        </span>
        {note ? (
          <span
            style={{
              display: 'block',
              fontSize: 'var(--t-small)',
              color: 'var(--ink-3)',
              marginTop: '0.25rem',
              maxWidth: '72ch',
            }}
          >
            {note}
            {gapId && !absent ? (
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  marginLeft: '0.4rem',
                }}
              >
                {gapId}
              </code>
            ) : null}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/* ------------------------------------------ 2b. aggregates for that cell */

function CellAggregates({ variable, period }: { variable: string; period: string }) {
  const query = useAggregates();
  return (
    <Resolved query={query} artifact="aggregates.json" label="Reading quarterly aggregates">
      {(rows) => <CellAggregateTable rows={rows} variable={variable} period={period} />}
    </Resolved>
  );
}

function CellAggregateTable({
  rows,
  variable,
  period,
}: {
  rows: AggregateRow[];
  variable: string;
  period: string;
}) {
  const periodsInArtifact = useMemo(
    () => [...new Set(rows.map((r) => r.period))].sort((a, b) => periodKey(a) - periodKey(b)),
    [rows],
  );

  const subset = useMemo(
    () => rows.filter((r) => r.variable === variable && r.period === period),
    [rows, variable, period],
  );

  if (subset.length === 0) {
    return (
      <>
        <NotCollected
          reason="No row for this variable and quarter in the quarterly aggregate artifact."
          gapId="GAP-032"
        />
        <span
          style={{
            display: 'block',
            fontSize: 'var(--t-small)',
            color: 'var(--ink-3)',
            marginTop: '0.25rem',
            maxWidth: '72ch',
          }}
        >
          The shipped aggregate artifact covers only these quarters:{' '}
          {periodsInArtifact.map(formatPeriod).join(', ')} —{' '}
          <span className="fig">{periodsInArtifact.length}</span> in total, against
          the nine quarters the observation archive holds. The one recorded run's
          own summary lists aggregates for Q1 2024 through Q4 2025, so the aggregate
          set that survives on disk is not the set that run produced. The chain
          therefore terminates at link 6 for every 2024 quarter.
        </span>
      </>
    );
  }

  const columns: Column<AggregateRow>[] = [
    {
      key: 'entity',
      header: 'Artist',
      value: (r) => r.entity_name,
      width: '14rem',
      groupable: true,
    },
    {
      key: 'rule',
      header: 'Rule applied',
      value: (r) => r.aggregation_rule,
      render: (r) =>
        r.aggregation_rule ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
            {r.aggregation_rule}
            {r.is_cumulative_counter && r.aggregation_rule === 'sum' ? (
              <span style={{ marginLeft: '0.4rem' }}>
                <EpistemicChip
                  status="rejected"
                  title="sum applied to a cumulative counter — the published figure overstates the quarter"
                />
              </span>
            ) : null}
          </span>
        ) : (
          <NotCollected short />
        ),
      groupable: true,
    },
    {
      key: 'aggregated',
      header: 'Aggregated value',
      numeric: true,
      value: (r) => r.aggregated_value,
      render: (r) => (
        <Figure
          value={r.aggregated_value}
          status={r.is_cumulative_counter && r.aggregation_rule === 'sum' ? 'rejected' : 'derived'}
          keyline
        />
      ),
      note: 'The published quarterly figure, passed through untouched.',
    },
    {
      key: 'obs',
      header: 'Obs',
      numeric: true,
      value: (r) => r.obs_count,
      render: (r) => <Figure value={r.obs_count} field="obs_count" />,
    },
    {
      key: 'first',
      header: 'First value',
      numeric: true,
      optional: true,
      value: (r) => r.first_value,
      render: (r) => <Figure value={r.first_value} status="observed" />,
    },
    {
      key: 'last',
      header: 'Last value',
      numeric: true,
      optional: true,
      value: (r) => r.last_value,
      render: (r) => <Figure value={r.last_value} status="observed" />,
    },
  ];

  return (
    <div style={{ marginTop: 'var(--s2)' }}>
      <DataTable
        rows={subset}
        columns={columns}
        rowKey={(r) => `${r.entity_name}|${r.variable}|${r.period}`}
        filename={`aggregates_${variable}_${period}`}
        dense
        pageSize={25}
        initialSort={{ key: 'aggregated', dir: 'desc' }}
        caption={
          <>
            Per-artist quarterly aggregates for {humanizeVariable(variable)},{' '}
            {formatPeriod(period)}. This is link 7 of the chain, one row per artist.
          </>
        }
      />
    </div>
  );
}

/* ------------------------------------------------- 3. observation summary */

function ObservationDetail({ variable }: { variable: string | null }) {
  const query = useObservationSummary();
  return (
    <Section
      title="Observation summary by artist"
      subtitle="The one per-artist, per-variable summary that survives: how many observations exist, over what span, and the range of values inside it."
    >
      <Resolved query={query} artifact="observation-summary.json" label="Reading observation summary">
        {(rows) => <ObservationTable rows={rows} variable={variable} />}
      </Resolved>
    </Section>
  );
}

function ObservationTable({
  rows,
  variable,
}: {
  rows: ObservationSummaryRow[];
  variable: string | null;
}) {
  // Compared against the coverage projection so the contrast between the two
  // pipelines stays accurate as either one grows.
  const coverage = useCoverage();
  const universe = coverage.data?.distinct_artists ?? null;
  const variableCount = coverage.data?.variables.length ?? null;
  const totalObservations = coverage.data?.total_observations ?? null;

  const varsPresent = useMemo(() => [...new Set(rows.map((r) => r.variable))].sort(), [rows]);
  const artists = useMemo(() => new Set(rows.map((r) => r.entity_name)).size, [rows]);
  const subset = useMemo(
    () => (variable && varsPresent.includes(variable) ? rows.filter((r) => r.variable === variable) : rows),
    [rows, variable, varsPresent],
  );

  const columns: Column<ObservationSummaryRow>[] = [
    { key: 'entity', header: 'Artist', value: (r) => r.entity_name, width: '14rem' },
    {
      key: 'variable',
      header: 'Variable',
      value: (r) => r.variable,
      render: (r) => (
        <span title={r.variable} style={{ whiteSpace: 'nowrap' }}>
          {humanizeVariable(r.variable)}
        </span>
      ),
      groupable: true,
    },
    {
      key: 'obs',
      header: 'Obs count',
      numeric: true,
      value: (r) => r.obs_count,
      render: (r) => <Figure value={r.obs_count} field="obs_count" keyline />,
      note: 'Rows that exist for this artist and variable across the whole archive.',
    },
    {
      key: 'first',
      header: 'First date',
      value: (r) => r.first_date,
      render: (r) =>
        r.first_date ? (
          <span className="fig">{r.first_date}</span>
        ) : (
          <NotCollected short />
        ),
    },
    {
      key: 'last',
      header: 'Last date',
      value: (r) => r.last_date,
      render: (r) =>
        r.last_date ? <span className="fig">{r.last_date}</span> : <NotCollected short />,
    },
    {
      key: 'min',
      header: 'Min',
      numeric: true,
      value: (r) => r.min_val,
      render: (r) => <Figure value={r.min_val} status="observed" />,
    },
    {
      key: 'max',
      header: 'Max',
      numeric: true,
      value: (r) => r.max_val,
      render: (r) => <Figure value={r.max_val} status="observed" />,
    },
    {
      key: 'avg',
      header: 'Mean',
      numeric: true,
      value: (r) => r.avg_val,
      render: (r) => <Figure value={r.avg_val} status="derived" precision={1} />,
      note: 'Arithmetic mean over the whole archive span, not per quarter.',
    },
  ];

  return (
    <>
      <Callout status="estimated" title="This artifact has no period dimension" gapId="GAP-032">
        Every row spans the artist's entire observation history, so it cannot be
        cut to a selected quarter. It also comes from the parallel database export,
        which covers <span className="fig">{artists}</span> of the{' '}
        <span className="fig">{universe ?? '?'}</span> artists and{' '}
        <span className="fig">{varsPresent.length}</span> of the{' '}
        <span className="fig">{variableCount ?? '?'}</span> variables — a different
        pipeline from the{' '}
        <span className="fig">{totalObservations?.toLocaleString('en-US') ?? '?'}</span>-row
        script artifact the coverage matrix reads. The two are shown side by side and
        never merged.
        {variable && !varsPresent.includes(variable) ? (
          <>
            {' '}
            The variable selected above,{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{variable}</span>, does
            not appear in this export at all, so every row is shown instead.
          </>
        ) : null}
      </Callout>

      <DataTable
        rows={subset}
        columns={columns}
        rowKey={(r) => `${r.entity_name}|${r.variable}`}
        filename="observation_summary"
        dense
        pageSize={40}
        initialSort={{ key: 'obs', dir: 'desc' }}
        caption={
          <>
            Archive-wide observation summary,{' '}
            <span className="fig">{subset.length}</span> of{' '}
            <span className="fig">{rows.length}</span> rows shown.
          </>
        }
      />
    </>
  );
}

/* ---------------------------------------------- 4. aggregation-rule defect */

function AggregationDefect() {
  const query = useAggregates();
  return (
    <Section
      title="Aggregation rule defect — sum applied to cumulative counters"
      subtitle="The single most concrete integrity finding in the delivery. Four variables are cumulative running totals. Summing a running total across a quarter adds the whole lifetime count once per day."
    >
      <Resolved query={query} artifact="aggregates.json" label="Reading quarterly aggregates">
        {(rows) => <DefectView rows={rows} />}
      </Resolved>
    </Section>
  );
}

function DefectView({ rows }: { rows: AggregateRow[] }) {
  const affected = useMemo(
    () => rows.filter((r) => r.is_cumulative_counter && r.aggregation_rule === 'sum'),
    [rows],
  );

  const stats = useMemo(() => {
    const withFactor = affected.filter((r) => r.overstatement_factor !== null);
    const factors = withFactor
      .map((r) => r.overstatement_factor as number)
      .sort((a, b) => a - b);
    const median =
      factors.length > 0
        ? factors.length % 2 === 1
          ? factors[(factors.length - 1) / 2]
          : (factors[factors.length / 2 - 1] + factors[factors.length / 2]) / 2
        : null;
    return {
      rows: affected.length,
      artists: new Set(affected.map((r) => r.entity_name)).size,
      variables: new Set(affected.map((r) => r.variable)).size,
      withFactor: withFactor.length,
      noFactor: affected.length - withFactor.length,
      max: factors.length > 0 ? factors[factors.length - 1] : null,
      median,
    };
  }, [affected]);

  const sorted = useMemo(
    () =>
      [...affected].sort(
        (a, b) => (b.overstatement_factor ?? -1) - (a.overstatement_factor ?? -1),
      ),
    [affected],
  );

  const columns: Column<AggregateRow>[] = [
    { key: 'entity', header: 'Artist', value: (r) => r.entity_name, width: '11rem' },
    {
      key: 'variable',
      header: 'Variable',
      value: (r) => r.variable,
      render: (r) => (
        <span title={r.variable} style={{ whiteSpace: 'nowrap' }}>
          {humanizeVariable(r.variable)}
        </span>
      ),
      groupable: true,
    },
    {
      key: 'period',
      header: 'Quarter',
      value: (r) => r.period,
      render: (r) => <span className="fig">{formatPeriod(r.period)}</span>,
      groupable: true,
    },
    {
      key: 'obs',
      header: 'Obs',
      numeric: true,
      value: (r) => r.obs_count,
      render: (r) => <Figure value={r.obs_count} field="obs_count" />,
    },
    {
      key: 'aggregated',
      header: 'Published value (rule = sum)',
      numeric: true,
      value: (r) => r.aggregated_value,
      render: (r) => <Figure value={r.aggregated_value} status="rejected" keyline />,
      note: 'The figure as shipped. Shown in the rejected colour because the rule applied to it is confirmed wrong for this variable, not because the underlying observations are.',
    },
    {
      key: 'first',
      header: 'First value',
      numeric: true,
      optional: true,
      value: (r) => r.first_value,
      render: (r) => <Figure value={r.first_value} status="observed" />,
    },
    {
      key: 'last',
      header: 'Last value',
      numeric: true,
      optional: true,
      value: (r) => r.last_value,
      render: (r) => <Figure value={r.last_value} status="observed" />,
    },
    {
      key: 'delta',
      header: 'Last − first · presentation-side correction',
      numeric: true,
      value: (r) => r.last_minus_first,
      render: (r) =>
        r.last_minus_first === null ? (
          <NotCollected
            reason="No correction is defined for this row."
            gapId="GAP-035"
            short
          />
        ) : (
          <Figure value={r.last_minus_first} field="last_minus_first" keyline />
        ),
      note: 'Computed for display only. It is never written back and never replaces the published value.',
    },
    {
      key: 'factor',
      header: 'Overstatement ×',
      numeric: true,
      value: (r) => r.overstatement_factor,
      render: (r) =>
        r.overstatement_factor === null ? (
          <NotCollected
            reason="Last − first is zero or negative, so no ratio is defined."
            gapId="GAP-035"
            short
          />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.1em' }}>
            <Figure value={r.overstatement_factor} status="derived" precision={1} />
            <span style={{ color: 'var(--ink-3)' }}>×</span>
          </span>
        ),
      note: 'Published value ÷ (last − first). Undefined where the counter did not rise.',
    },
  ];

  const worst = sorted.length > 0 ? sorted[0] : null;

  return (
    <>
      <Callout
        status="rejected"
        title={`${stats.rows.toLocaleString('en-US')} published quarterly figures were produced by summing a running total`}
        gapId="GAP-035"
      >
        A cumulative counter reports a lifetime total on every day. Adding ninety
        such daily readings together does not measure a quarter — it counts the
        artist's entire history roughly ninety times.
        {worst ? (
          <>
            {' '}
            The largest case in the delivery is {worst.entity_name},{' '}
            {humanizeVariable(worst.variable)}, {formatPeriod(worst.period)}: the
            published figure reads{' '}
            <Figure value={worst.aggregated_value} status="rejected" /> against a
            quarterly movement of{' '}
            <Figure value={worst.last_minus_first} field="last_minus_first" />, an
            overstatement of{' '}
            <Figure value={worst.overstatement_factor} status="derived" precision={1} />×.
          </>
        ) : null}
      </Callout>

      <Callout status="derived" title="Last − first is a presentation-side correction">
        It is computed in this console for display and shown{' '}
        <strong>beside</strong> the published figure, never in place of it. Nothing
        here rewrites a delivered number: the published value remains the published
        value, and the correction is a second column a methodologist can act on.
        The correction is also not universally valid —{' '}
        <span className="fig">{stats.noFactor}</span> of{' '}
        <span className="fig">{stats.rows}</span> affected rows have a last value at
        or below their first, which a genuine monotone counter cannot do. Where that
        happens the ratio renders NOT COLLECTED rather than a number, because either
        the series is not cumulative or the counter was reset.
      </Callout>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
          gap: 'var(--s4)',
          padding: 'var(--s4) 0',
        }}
      >
        <DefectStat label="Rows affected" value={stats.rows} epi="rejected" />
        <DefectStat label="Artists affected" value={stats.artists} epi="rejected" />
        <DefectStat label="Variables affected" value={stats.variables} epi="rejected" />
        <DefectStat label="Correction defined" value={stats.withFactor} epi="derived" />
        <DefectStat
          label="Median overstatement"
          value={stats.median}
          epi="derived"
          precision={1}
          suffix="×"
        />
        <DefectStat
          label="Maximum overstatement"
          value={stats.max}
          epi="derived"
          precision={1}
          suffix="×"
        />
      </div>

      <DataTable
        rows={sorted}
        columns={columns}
        rowKey={(r) => `${r.entity_name}|${r.variable}|${r.period}`}
        filename="cumulative_counter_overstatement"
        dense
        pageSize={50}
        caption={
          <>
            Every quarterly aggregate where <code>aggregation_rule = "sum"</code> was
            applied to a cumulative counter, ordered by overstatement. Rows with no
            defined ratio sort last.
          </>
        }
      />

      <div style={{ paddingTop: 'var(--s5)' }}>
        <Callout status="estimated" title="The rule register and the shipped artifact disagree">
          The metric register declares{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>last_value</code> for
          YouTube artist monthly views. All{' '}
          <span className="fig">
            {rows.filter((r) => r.variable === 'YouTube_artist_monthly_views').length}
          </span>{' '}
          of its rows in the shipped aggregate artifact carry{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>sum</code>. Link 6 of the
          chain — the aggregation rule — is therefore not reliably readable from the
          register; it must be read from the artifact row itself, which is why the
          rule is shown per row above rather than per variable.
        </Callout>
      </div>
    </>
  );
}

function DefectStat({
  label,
  value,
  epi,
  precision = 0,
  suffix,
}: {
  label: string;
  value: number | null;
  epi: string;
  precision?: number;
  suffix?: string;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem' }}>
        {value === null ? (
          <NotCollected gapId="GAP-035" />
        ) : (
          <>
            <span
              className="fig"
              data-epi={epi}
              style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}
            >
              {value.toLocaleString('en-US', {
                minimumFractionDigits: precision,
                maximumFractionDigits: precision,
              })}
            </span>
            {suffix ? <span style={{ color: 'var(--ink-3)' }}>{suffix}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
