/**
 * PANEL 2 — Quarter Coverage Matrix
 *
 * The signature panel. It renders the full 24-quarter frame the study was
 * conceived against, and shows that 15 of those quarters lie before the
 * earliest observation the archive contains. The truncation is not hidden
 * behind a shorter axis — it is the finding, drawn to scale.
 *
 * Three absences are deliberately distinguished, because conflating them is how
 * a coverage limitation becomes invisible:
 *
 *   before archive floor  no run could have collected it
 *   never attempted       defined, or asked for, and never called
 *   attempted, empty      called and returned nothing
 */

import { useMemo, useState } from 'react';
import { useCoverage, useCapabilities } from '../data/client';
import { formatPeriod, humanizeVariable, formatTimestamp } from '../data/client';
import {
  Callout,
  EpistemicLegend,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import type { Coverage, CoverageCell } from '../data/types';

/** The study frame: 24 quarters, extended if the archive ever reaches further back. */
const FRAME_LENGTH = 24;

function stepBack(period: string, n: number): string {
  const m = /^Q(\d)_(\d{4})$/.exec(period);
  if (!m) return period;
  let q = Number(m[1]);
  let y = Number(m[2]);
  for (let i = 0; i < n; i += 1) {
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return `Q${q}_${y}`;
}

function buildFrame(observed: string[]): string[] {
  if (observed.length === 0) return [];
  const last = observed[observed.length - 1];
  const earliestObserved = observed[0];
  // Anchor the frame at the newest observed quarter and run back 24, but never
  // clip an observed quarter — if the archive deepens, the frame grows with it.
  let start = stepBack(last, FRAME_LENGTH - 1);
  if (periodKey(earliestObserved) < periodKey(start)) start = earliestObserved;

  const out: string[] = [];
  const m = /^Q(\d)_(\d{4})$/.exec(start);
  if (!m) return observed;
  let q = Number(m[1]);
  let y = Number(m[2]);
  while (true) {
    const p = `Q${q}_${y}`;
    out.push(p);
    if (periodKey(p) >= periodKey(last)) break;
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Metrics the brief names as matrix rows. Those the pipeline never produced are
 * listed explicitly rather than omitted — an absent row reads as an oversight,
 * a NOT COLLECTED row reads as a finding.
 */
const REQUESTED_ROWS: Array<{
  label: string;
  capability: import('../data/capabilities').CapabilityId;
  absent?: 'never-attempted' | 'attempted-empty';
  note: string;
  gapId?: string;
}> = [
  {
    label: 'Chart positions',
    capability: 'chartPositions',
    absent: 'attempted-empty',
    note:
      'Shazam chart position is defined and produced zero observations across every quarter. All other chart endpoints are confirmed 401.',
    gapId: 'GAP-009',
  },
  {
    label: 'Track streams',
    capability: 'trackStreams',
    absent: 'never-attempted',
    note:
      'All track-level stream endpoints are confirmed 401. The system holds one track row and no track-level observations.',
    gapId: 'GAP-006',
  },
  {
    label: 'Listener geography',
    capability: 'listenerGeography',
    absent: 'attempted-empty',
    note:
      'Defined and implemented, then explicitly skipped by the extraction on the grounds that the 30% domestic share was already assumed.',
    gapId: 'GAP-008',
  },
  {
    label: 'Cross-market appearances',
    capability: 'crossMarketCharts',
    absent: 'never-attempted',
    note: 'No code compares chart appearances across markets.',
    gapId: 'GAP-009',
  },
  {
    label: 'Radio airplay',
    capability: 'radioAirplay',
    absent: 'never-attempted',
    note:
      'Scoped against a proposed SoundCharts integration and deferred with it. No endpoint, metric or column exists.',
    gapId: 'GAP-007',
  },
];

type CellState =
  | 'before-floor'
  | 'full'
  | 'partial'
  | 'sparse'
  | 'never-attempted'
  | 'attempted-empty'
  | 'no-metadata';

function classify(
  cell: CoverageCell | undefined,
  period: string,
  floorPeriod: string,
  universe: number,
): CellState {
  if (periodKey(period) < periodKey(floorPeriod)) return 'before-floor';
  if (!cell || cell.obs_count === 0) return 'attempted-empty';
  const ratio = universe > 0 ? cell.artist_count / universe : 0;
  if (ratio >= 0.9) return 'full';
  if (ratio >= 0.45) return 'partial';
  return 'sparse';
}

function periodKey(p: string): number {
  const m = /^Q(\d)_(\d{4})$/.exec(p);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

const STATE_EPI: Record<CellState, string> = {
  'before-floor': 'unavailable',
  full: 'observed',
  partial: 'estimated',
  sparse: 'assumed',
  'never-attempted': 'unavailable',
  'attempted-empty': 'unavailable',
  'no-metadata': 'unavailable',
};

const STATE_LABEL: Record<CellState, string> = {
  'before-floor': 'Before archive floor',
  full: 'Observed — full roster',
  partial: 'Observed — partial roster',
  sparse: 'Observed — sparse roster',
  'never-attempted': 'Never attempted',
  'attempted-empty': 'Attempted, empty',
  'no-metadata': 'No quality metadata',
};

export default function CoverageMatrix() {
  const query = useCoverage();
  return (
    <Resolved query={query} artifact="coverage.json" label="Reading 850,059 observations">
      {(data) => <Matrix data={data} />}
    </Resolved>
  );
}

function Matrix({ data }: { data: Coverage }) {
  const [selected, setSelected] = useState<{ variable: string; period: string } | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, CoverageCell>();
    for (const c of data.cells) m.set(`${c.variable}|${c.period}`, c);
    return m;
  }, [data.cells]);

  const floorPeriod = data.periods_observed[0] ?? '';
  const frame = useMemo(() => buildFrame(data.periods_observed), [data.periods_observed]);
  const preFloor = frame.filter((p) => periodKey(p) < periodKey(floorPeriod));
  // The roster size is whatever the archive actually contains, not a fixed number,
  // so the shading stays correct as artists are added to the universe.
  const universe = data.distinct_artists || 1;
  const variables = useMemo(
    () => [...data.variables].sort((a, b) => a.localeCompare(b)),
    [data.variables],
  );

  const selectedCell = selected ? byKey.get(`${selected.variable}|${selected.period}`) : undefined;

  // Only list a requested metric as absent while it genuinely is. As the
  // Chartmetric and SoundCharts endpoints are activated these rows drop out on
  // their own and the variable appears in the matrix above instead.
  const { capabilities } = useCapabilities();
  const stillAbsent = REQUESTED_ROWS.filter((r) => !capabilities[r.capability]?.present);

  // Quarters that carry observations but no coverage-gap metadata: their cells
  // cannot be checked for gaps, which is different from having none.
  const withMetadata = new Set(data.periods_with_gap_metadata);
  const unmeasuredPeriods = data.periods_observed.filter((p) => !withMetadata.has(p));
  const lastWithMetadata =
    data.periods_with_gap_metadata[data.periods_with_gap_metadata.length - 1] ?? null;

  const totals = useMemo(() => {
    let full = 0;
    let partial = 0;
    let sparse = 0;
    let empty = 0;
    for (const v of variables) {
      for (const p of data.periods_observed) {
        const s = classify(byKey.get(`${v}|${p}`), p, floorPeriod, universe);
        if (s === 'full') full += 1;
        else if (s === 'partial') partial += 1;
        else if (s === 'sparse') sparse += 1;
        else empty += 1;
      }
    }
    return { full, partial, sparse, empty, cells: variables.length * data.periods_observed.length };
  }, [variables, data.periods_observed, byKey, floorPeriod, universe]);

  return (
    <>
      <Section
        title="Archive depth"
        subtitle={
          <>
            The study frame is 24 quarters. The earliest observation in the archive is{' '}
            <strong className="fig">{data.archive_floor}</strong>, so{' '}
            <strong className="fig">{preFloor.length}</strong> of those quarters could not have been
            collected by any run. The remaining{' '}
            <strong className="fig">{data.periods_observed.length}</strong> carry{' '}
            <strong className="fig">{data.total_observations.toLocaleString('en-US')}</strong>{' '}
            observations across <strong className="fig">{data.distinct_artists}</strong> artists.
          </>
        }
      >
        <Callout status="unavailable" title="15 of 24 quarters precede the archive" gapId="GAP-001">
          No quarter before {formatPeriod(floorPeriod)} is recoverable from the integrated source at
          the current plan tier. These are drawn to scale below rather than omitted, because a
          shorter axis would make a hard limitation look like a design choice.
        </Callout>

        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap', paddingTop: 'var(--s3)' }}>
          <Tally label="Full roster" value={totals.full} of={totals.cells} epi="observed" />
          <Tally label="Partial roster" value={totals.partial} of={totals.cells} epi="estimated" />
          <Tally label="Sparse" value={totals.sparse} of={totals.cells} epi="assumed" />
          <Tally label="Empty" value={totals.empty} of={totals.cells} epi="unavailable" />
        </div>
      </Section>

      <Section
        title="Coverage matrix"
        subtitle="Cell shade carries the share of the 131-row roster (129 distinct artists) observed in that quarter. Select any cell for its source, endpoint, call timestamp and record count."
        actions={<EpistemicLegend only={['observed', 'estimated', 'assumed', 'unavailable']} />}
      >
        <div className="scroll-x">
          <table className="tbl tbl--dense" style={{ minWidth: '58rem' }}>
            <caption>
              Rows are the 18 variables the pipeline produced, followed by the metrics the brief
              names that produced nothing.
            </caption>
            <thead>
              <tr>
                <th style={{ minWidth: '14rem', position: 'sticky', left: 0, zIndex: 3 }}>
                  Variable
                </th>
                {preFloor.map((p) => (
                  <th
                    key={p}
                    className="num-col"
                    title={`${formatPeriod(p)} — before the archive floor`}
                    style={{ color: 'var(--ink-4)', fontWeight: 400, minWidth: '2.1rem' }}
                  >
                    <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {formatPeriod(p)}
                    </span>
                  </th>
                ))}
                {data.periods_observed.map((p) => (
                  <th
                    key={p}
                    className="num-col"
                    style={{ minWidth: '2.6rem', color: 'var(--ink)' }}
                  >
                    <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {formatPeriod(p)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <tr key={v}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      background: 'var(--paper)',
                      zIndex: 1,
                      whiteSpace: 'nowrap',
                    }}
                    title={v}
                  >
                    {humanizeVariable(v)}
                  </td>
                  {preFloor.map((p) => (
                    <Cell key={p} state="before-floor" />
                  ))}
                  {data.periods_observed.map((p) => {
                    const cell = byKey.get(`${v}|${p}`);
                    const state = classify(cell, p, floorPeriod, universe);
                    const isSel = selected?.variable === v && selected?.period === p;
                    return (
                      <Cell
                        key={p}
                        state={state}
                        cell={cell}
                        selected={isSel}
                        universe={universe}
                        onClick={() => setSelected({ variable: v, period: p })}
                        label={`${humanizeVariable(v)}, ${formatPeriod(p)}`}
                      />
                    );
                  })}
                </tr>
              ))}

              {stillAbsent.length > 0 && (
                <tr>
                  <td
                    colSpan={1 + preFloor.length + data.periods_observed.length}
                    style={{
                      background: 'var(--paper-sunk)',
                      borderTop: '1.5px solid var(--rule-strong)',
                      fontWeight: 650,
                    }}
                  >
                    Metrics requested by the brief that produced no observations
                  </td>
                </tr>
              )}

              {stillAbsent.map((r) => (
                <tr key={r.label}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      background: 'var(--paper)',
                      zIndex: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.label}
                  </td>
                  {[...preFloor, ...data.periods_observed].map((p) => (
                    <Cell
                      key={p}
                      state={
                        periodKey(p) < periodKey(floorPeriod)
                          ? 'before-floor'
                          : (r.absent ?? 'never-attempted')
                      }
                      title={r.note}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ paddingTop: 'var(--s3)' }}>
          <MatrixKey />
        </div>
      </Section>

      <Section title="Cell detail">
        {selected && selectedCell ? (
          <CellDetail cell={selectedCell} universe={universe} />
        ) : selected ? (
          <Callout status="unavailable" title="No observations in this cell">
            {humanizeVariable(selected.variable)} produced no rows in {formatPeriod(selected.period)}.
          </Callout>
        ) : (
          <p style={{ color: 'var(--ink-3)' }}>Select a cell in the matrix.</p>
        )}
      </Section>

      <Section
        title="Defined but never observed"
        subtitle="Metrics with a full definition in the metric register that produced zero rows."
      >
        {data.variables_defined_never_observed.length === 0 ? (
          <p style={{ color: 'var(--ink-3)' }}>None.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {data.variables_defined_never_observed.map((v) => (
              <li key={v} style={{ padding: '0.15rem 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>{v}</span>
                <span style={{ marginLeft: '0.6rem' }}>
                  <NotCollected short />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quality metadata coverage">
        {unmeasuredPeriods.length > 0 ? (
          <Callout
            status="unavailable"
            title={
              unmeasuredPeriods.length === 1
                ? 'The newest quarter has no quality metadata'
                : `${unmeasuredPeriods.length} quarters have no quality metadata`
            }
            gapId="GAP-031"
          >
            Coverage-gap and limitation reporting stops at{' '}
            <strong>{formatPeriod(lastWithMetadata ?? '—')}</strong>.{' '}
            {unmeasuredPeriods.map(formatPeriod).join(', ')} carr
            {unmeasuredPeriods.length === 1 ? 'ies' : 'y'} none, so those cells cannot be checked for
            gaps at all. An unmarked cell there means unmeasured, not clean.
          </Callout>
        ) : (
          <p style={{ color: 'var(--ink-2)' }}>
            Every observed quarter carries coverage-gap metadata.
          </p>
        )}
      </Section>
    </>
  );
}

function Tally({
  label,
  value,
  of,
  epi,
}: {
  label: string;
  value: number;
  of: number;
  epi: string;
}) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.125rem', color: 'var(--ink)' }}>
        {value}
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}> / {of} · {pct}%</span>
      </div>
    </div>
  );
}

function Cell({
  state,
  cell,
  selected,
  onClick,
  label,
  title,
  universe,
}: {
  state: CellState;
  cell?: CoverageCell;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
  title?: string;
  universe?: number;
}) {
  const epi = STATE_EPI[state];
  const hatched = state === 'before-floor' || state === 'never-attempted';
  const ratio = cell && universe ? Math.min(1, cell.artist_count / universe) : 0;

  const tip =
    title ??
    [
      label,
      STATE_LABEL[state],
      cell ? `${cell.obs_count.toLocaleString('en-US')} observations` : null,
      cell ? `${cell.artist_count} of ${universe ?? '?'} artists` : null,
      cell?.endpoints[0] ?? null,
      cell?.last_extraction ? `extracted ${formatTimestamp(cell.last_extraction)}` : null,
      cell && cell.gap_count !== null ? `${cell.gap_count.toLocaleString('en-US')} gaps` : null,
      cell && !cell.gap_metadata_present ? 'no quality metadata for this quarter' : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const body = (
    <span
      className={hatched ? 'hatch' : undefined}
      style={{
        display: 'block',
        width: '100%',
        height: '1rem',
        background: hatched
          ? undefined
          : state === 'attempted-empty'
            ? 'var(--una-bg)'
            : `color-mix(in srgb, var(--epi) ${Math.round(18 + ratio * 72)}%, var(--paper))`,
        border: selected ? '2px solid var(--ink)' : '1px solid var(--rule-hair)',
      }}
    />
  );

  return (
    <td
      data-epi={epi}
      title={tip}
      style={{ padding: '1px', height: 'auto' }}
      aria-label={tip}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </td>
  );
}

function MatrixKey() {
  const items: Array<[CellState, string]> = [
    ['full', 'Observed — 90%+ of roster'],
    ['partial', 'Observed — 45–90%'],
    ['sparse', 'Observed — under 45%'],
    ['attempted-empty', 'Attempted, empty'],
    ['never-attempted', 'Never attempted'],
    ['before-floor', 'Before archive floor'],
  ];
  return (
    <ul
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--s4)',
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {items.map(([state, label]) => {
        const hatched = state === 'before-floor' || state === 'never-attempted';
        const fill =
          state === 'full' ? 85 : state === 'partial' ? 55 : state === 'sparse' ? 28 : 0;
        return (
          <li
            key={state}
            data-epi={STATE_EPI[state]}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <span
              className={hatched ? 'hatch' : undefined}
              style={{
                width: '1.5rem',
                height: '0.75rem',
                border: '1px solid var(--rule)',
                background: hatched
                  ? undefined
                  : fill === 0
                    ? 'var(--una-bg)'
                    : `color-mix(in srgb, var(--epi) ${fill}%, var(--paper))`,
              }}
            />
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CellDetail({ cell, universe }: { cell: CoverageCell; universe: number }) {
  return (
    <dl style={{ margin: 0, maxWidth: '52rem' }}>
      <Row k="Variable" v={cell.variable} mono />
      <Row k="Quarter" v={formatPeriod(cell.period)} />
      <Row k="Observations" v={cell.obs_count.toLocaleString('en-US')} mono />
      <Row
        k="Artists observed"
        v={`${cell.artist_count} of ${universe} (${Math.round(
          (cell.artist_count / universe) * 100,
        )}%)`}
        mono
      />
      <Row k="Platform" v={cell.platforms.join(', ') || '—'} />
      <Row k="Endpoint" v={cell.endpoints.join(', ') || '—'} mono />
      <Row
        k="Observation span"
        v={cell.first_date && cell.last_date ? `${cell.first_date} → ${cell.last_date}` : '—'}
        mono
      />
      <Row
        k="Last extraction"
        v={
          formatTimestamp(cell.last_extraction) ?? (
            <NotCollected reason="No extraction timestamp on these observations." />
          )
        }
        mono
      />
      <Row
        k="Recorded gaps"
        v={
          cell.gap_metadata_present ? (
            <>
              <span className="fig">{(cell.gap_count ?? 0).toLocaleString('en-US')}</span>
              {cell.gap_reasons ? (
                <span style={{ color: 'var(--ink-3)' }}> · {cell.gap_reasons}</span>
              ) : null}
            </>
          ) : (
            <NotCollected reason="The gap report does not cover this quarter." gapId="GAP-031" />
          )
        }
      />
    </dl>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div
      className="rule-bh"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(9rem, 12rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.3rem 0',
      }}
    >
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? 'var(--t-small)' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {v}
      </dd>
    </div>
  );
}
