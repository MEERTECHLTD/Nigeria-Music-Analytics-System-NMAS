/**
 * REGISTER — Gap Register (no panel number; it sits behind all fifteen)
 *
 * Renders: every entry in registry/gaps.ts — 40 requirements the pipeline does
 * not satisfy — with its status, severity, the panels it degrades, the evidence
 * that establishes it and the remedy the console adopted. Plus a status ×
 * severity cross-tabulation and a per-panel gap load.
 *
 * Cannot render: any measurement of a gap. This register is an assessment of
 * the codebase, transcribed by direct read; it is not produced by the pipeline
 * and carries no observation count, no date of discovery and no closure state.
 * Nothing here is fetched — if an entry is wrong, it is wrong in the register.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { Callout, Figure, Section } from '../components/primitives';
import {
  GAPS,
  GAP_COUNTS,
  gapsForPanel,
  type Gap,
  type GapSeverity,
  type GapStatus,
} from '../registry/gaps';
import { PANELS, FEASIBILITY_EPISTEMIC, type PanelMeta } from './registry';

/* ------------------------------------------------------------ vocabularies */

const STATUS_ORDER: GapStatus[] = [
  'NOT_COLLECTED',
  'PARTIAL',
  'PRESENT_BUT_UNEXPOSED',
  'INCONSISTENT',
];

const STATUS_LABEL: Record<GapStatus, string> = {
  NOT_COLLECTED: 'Not collected',
  PARTIAL: 'Partial',
  PRESENT_BUT_UNEXPOSED: 'Present, unexposed',
  INCONSISTENT: 'Inconsistent',
};

/** Definitions transcribed from the register's own header. */
const STATUS_DEF: Record<GapStatus, string> = {
  NOT_COLLECTED: 'The artifact does not exist anywhere.',
  PARTIAL: 'Some of it exists, not enough for the requirement.',
  PRESENT_BUT_UNEXPOSED: 'The pipeline produces it; nothing serves it.',
  INCONSISTENT: 'It exists more than once, with conflicting values.',
};

/**
 * Colour on this interface only ever makes an epistemic claim, so gap statuses
 * borrow the nearest honest one: unexposed data was observed, a partial is an
 * estimate of a requirement, a conflict is a rejected reading.
 */
const STATUS_EPI: Record<GapStatus, string> = {
  NOT_COLLECTED: 'unavailable',
  PARTIAL: 'estimated',
  PRESENT_BUT_UNEXPOSED: 'observed',
  INCONSISTENT: 'rejected',
};

const SEVERITY_EPI: Record<GapSeverity, string> = {
  blocking: 'rejected',
  major: 'estimated',
  minor: 'derived',
};

const SEVERITY_DEF: Record<GapSeverity, string> = {
  blocking: 'A named requirement of the brief that cannot be built at all.',
  major: 'The panel can be built, but a substantive column or claim is missing.',
  minor: 'A correctness or consistency defect that does not remove a capability.',
};

const SEVERITY_RANK: Record<GapSeverity, number> = { blocking: 0, major: 1, minor: 2 };

/** Blocking first, then id — the order the table is handed to DataTable, and
 *  the order it returns to when a column sort is cleared. */
const ROWS: Gap[] = [...GAPS].sort(
  (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
);

const PANEL_BY_N: Map<number, PanelMeta> = new Map(
  PANELS.filter((p): p is PanelMeta & { n: number } => p.n !== null).map((p) => [p.n, p]),
);

function goToPanel(id: string): void {
  window.location.hash = `/${id}`;
}

/* ------------------------------------------------------------------ chips */

function Chip({ label, epi, title }: { label: string; epi: string; title?: string }) {
  return (
    <span className="epi-chip" data-epi={epi} title={title}>
      {label}
    </span>
  );
}

function PanelLinks({ gap }: { gap: Gap }) {
  if (gap.panels.length === 0) {
    return (
      <span
        style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}
        title="This gap is a property of the console's transport, not of any single panel."
      >
        no panel
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {gap.panels.map((n) => {
        const meta = PANEL_BY_N.get(n);
        return (
          <button
            key={n}
            type="button"
            className="fig"
            onClick={() => meta && goToPanel(meta.id)}
            disabled={!meta}
            title={meta ? `${meta.title} — ${meta.summary}` : `Panel ${n}`}
            style={{
              font: 'inherit',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--t-micro)',
              background: 'none',
              border: '1px solid var(--rule)',
              borderRadius: '2px',
              padding: '0 0.3rem',
              color: 'var(--ink-2)',
              cursor: meta ? 'pointer' : 'default',
            }}
          >
            {String(n).padStart(2, '0')}
          </button>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------ the columns */

const LONG: CSSProperties = {
  display: 'block',
  whiteSpace: 'normal',
  maxWidth: '30rem',
  fontSize: 'var(--t-small)',
  lineHeight: 1.45,
  padding: '0.2rem 0',
};

const GAP_COLUMNS: Column<Gap>[] = [
  {
    key: 'id',
    header: 'ID',
    width: '5.5rem',
    value: (g) => g.id,
    render: (g) => (
      <span className="fig" style={{ fontSize: 'var(--t-small)' }} id={g.id}>
        {g.id}
      </span>
    ),
  },
  {
    key: 'requirement',
    header: 'Requirement',
    width: '17rem',
    value: (g) => g.requirement,
    render: (g) => (
      <span style={{ display: 'block', whiteSpace: 'normal', maxWidth: '17rem' }}>
        {g.requirement}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '9rem',
    groupable: true,
    note: 'What kind of absence this is. Grouping the register by status is the fastest read of it.',
    value: (g) => STATUS_LABEL[g.status],
    render: (g) => (
      <Chip
        label={STATUS_LABEL[g.status]}
        epi={STATUS_EPI[g.status]}
        title={STATUS_DEF[g.status]}
      />
    ),
  },
  {
    key: 'severity',
    header: 'Severity',
    width: '6.5rem',
    groupable: true,
    note: 'Alphabetical order is also severity order: blocking, major, minor.',
    value: (g) => g.severity,
    render: (g) => (
      <Chip label={g.severity} epi={SEVERITY_EPI[g.severity]} title={SEVERITY_DEF[g.severity]} />
    ),
  },
  {
    key: 'panels',
    header: 'Panels affected',
    width: '8rem',
    note: 'Click a number to open that panel.',
    value: (g) => (g.panels.length ? g.panels.join(' ') : null),
    render: (g) => <PanelLinks gap={g} />,
  },
  {
    key: 'evidence',
    header: 'Evidence',
    value: (g) => g.evidence,
    render: (g) => <span style={LONG}>{g.evidence}</span>,
  },
  {
    key: 'remedy',
    header: 'Remedy adopted',
    note: 'What this console does instead. Never a plan — a description of the rendering already shipped.',
    value: (g) => g.remedy,
    render: (g) => (
      <span style={{ ...LONG, maxWidth: '26rem', color: 'var(--ink-2)' }}>{g.remedy}</span>
    ),
  },
];

/* ------------------------------------------------------------------ panel */

export default function GapRegister() {
  const byStatus = useMemo(() => {
    const m = new Map<GapStatus, Gap[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const g of GAPS) m.get(g.status)?.push(g);
    return m;
  }, []);

  const crosstab = useMemo(
    () =>
      STATUS_ORDER.map((status) => {
        const list = byStatus.get(status) ?? [];
        return {
          status,
          blocking: list.filter((g) => g.severity === 'blocking').length,
          major: list.filter((g) => g.severity === 'major').length,
          minor: list.filter((g) => g.severity === 'minor').length,
          total: list.length,
        };
      }),
    [byStatus],
  );

  const panelLoad = useMemo(
    () =>
      PANELS.filter((p): p is PanelMeta & { n: number } => p.n !== null).map((p) => {
        const list = gapsForPanel(p.n);
        return {
          panel: p,
          gaps: list,
          blocking: list.filter((g) => g.severity === 'blocking').length,
          major: list.filter((g) => g.severity === 'major').length,
          minor: list.filter((g) => g.severity === 'minor').length,
        };
      }),
    [],
  );

  const unattributed = useMemo(() => GAPS.filter((g) => g.panels.length === 0), []);

  return (
    <>
      <Section
        title="Why this register exists"
        subtitle={
          <>
            So that no absence in this console is silent. Every{' '}
            <span className="not-collected" data-epi="unavailable">
              Not collected
            </span>{' '}
            elsewhere in the interface carries a gap identifier, and every identifier resolves to a
            row below with the evidence that established it and the rendering decision taken in
            consequence. A reader who distrusts a blank cell can find out here whether the value was
            never collected, collected and empty, collected and unserved, or collected twice with
            two different answers — four states that a blank cell would otherwise flatten into one.
          </>
        }
      >
        <p className="lede" style={{ margin: '0 0 var(--s4)' }}>
          The register is an assessment of the repository, transcribed by direct read. It is not an
          output of the pipeline: it has no observation count, no discovery date and no closure
          workflow. Its authority is that each entry names the file and behaviour that produced it.
        </p>

        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap' }}>
          <Tally label="Requirements unmet" value={GAP_COUNTS.total} of={null} epi="unavailable" />
          <Tally label="Blocking" value={GAP_COUNTS.blocking} of={GAP_COUNTS.total} epi="rejected" />
          <Tally label="Major" value={GAP_COUNTS.major} of={GAP_COUNTS.total} epi="estimated" />
          <Tally label="Minor" value={GAP_COUNTS.minor} of={GAP_COUNTS.total} epi="derived" />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--s5)',
            flexWrap: 'wrap',
            paddingTop: 'var(--s4)',
          }}
        >
          {STATUS_ORDER.map((s) => (
            <Tally
              key={s}
              label={STATUS_LABEL[s]}
              value={(byStatus.get(s) ?? []).length}
              of={GAP_COUNTS.total}
              epi={STATUS_EPI[s]}
              note={STATUS_DEF[s]}
            />
          ))}
        </div>

        <Callout
          status="rejected"
          title={`${GAP_COUNTS.blocking} blocking gaps, and they are not evenly distributed`}
        >
          Every one of them is a <em>not collected</em> or a <em>partial</em> — the capability was
          never built, or it was built and returned nothing. Not a single blocking gap is an
          inconsistency or an unserved artifact, the two classes that a serializer change would
          close. That asymmetry is the shape of this delivery: the defects are absences, not errors,
          and absences cannot be fixed by editing the presentation layer.
        </Callout>
      </Section>

      <Section
        title="Status against severity"
        subtitle="The cross-tabulation the tallies above cannot show: which kinds of absence are the expensive ones."
      >
        <DataTable
          rows={crosstab}
          rowKey={(r) => r.status}
          filename="nmas-gap-register-crosstab"
          pageSize={null}
          caption={`Counts of gap-register entries. Rows sum to ${GAP_COUNTS.total}.`}
          columns={[
            {
              key: 'status',
              header: 'Status',
              width: '14rem',
              value: (r) => STATUS_LABEL[r.status],
              render: (r) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Chip
                    label={STATUS_LABEL[r.status]}
                    epi={STATUS_EPI[r.status]}
                    title={STATUS_DEF[r.status]}
                  />
                </span>
              ),
            },
            {
              key: 'blocking',
              header: 'Blocking',
              numeric: true,
              value: (r) => r.blocking,
              render: (r) => <Figure value={r.blocking} status="rejected" unit="count" />,
            },
            {
              key: 'major',
              header: 'Major',
              numeric: true,
              value: (r) => r.major,
              render: (r) => <Figure value={r.major} status="estimated" unit="count" />,
            },
            {
              key: 'minor',
              header: 'Minor',
              numeric: true,
              value: (r) => r.minor,
              render: (r) => <Figure value={r.minor} status="derived" unit="count" />,
            },
            {
              key: 'total',
              header: 'Total',
              numeric: true,
              value: (r) => r.total,
              render: (r) => <Figure value={r.total} status="derived" unit="count" keyline />,
            },
            {
              key: 'definition',
              header: 'Definition',
              value: (r) => STATUS_DEF[r.status],
              render: (r) => (
                <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
                  {STATUS_DEF[r.status]}
                </span>
              ),
            },
          ]}
        />
      </Section>

      <Section
        title="The register"
        subtitle="Blocking first. Group by status or by severity from the toolbar; filter across every visible column; export the whole thing as CSV. Panel numbers are links."
      >
        <DataTable
          rows={ROWS}
          columns={GAP_COLUMNS}
          rowKey={(g) => g.id}
          filename="nmas-gap-register"
          pageSize={null}
          caption="Clearing a column sort restores the default order: blocking, then major, then minor, each by identifier."
          expand={(g) => <GapDetail gap={g} />}
        />
      </Section>

      <Section
        title="Gap load per panel"
        subtitle="How many unmet requirements each panel carries, against the proportion of its specification the artifacts can support. The two columns move together, which is the point."
      >
        <DataTable
          rows={panelLoad}
          rowKey={(r) => r.panel.id}
          filename="nmas-gap-load-by-panel"
          pageSize={null}
          initialSort={{ key: 'total', dir: 'desc' }}
          caption="Register panels are excluded: the gap register indexes gaps by numbered panel only."
          columns={[
            {
              key: 'n',
              header: '#',
              width: '2.5rem',
              numeric: true,
              value: (r) => r.panel.n,
              render: (r) => (
                <span className="fig" style={{ color: 'var(--ink-4)' }}>
                  {String(r.panel.n).padStart(2, '0')}
                </span>
              ),
            },
            {
              key: 'title',
              header: 'Panel',
              width: '14rem',
              value: (r) => r.panel.title,
              render: (r) => (
                <button
                  type="button"
                  onClick={() => goToPanel(r.panel.id)}
                  style={{
                    font: 'inherit',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                    textAlign: 'left',
                  }}
                >
                  {r.panel.title}
                </button>
              ),
            },
            {
              key: 'feasibility',
              header: 'Feasibility',
              width: '9rem',
              groupable: true,
              value: (r) => r.panel.feasibility,
              render: (r) => (
                <Chip
                  label={r.panel.feasibility.replace('_', ' ')}
                  epi={FEASIBILITY_EPISTEMIC[r.panel.feasibility]}
                  title={r.panel.summary}
                />
              ),
            },
            {
              key: 'backed',
              header: 'Backed',
              width: '5rem',
              numeric: true,
              note: 'An editorial assessment recorded in panels/registry.ts, not a measured quantity — shown assumed.',
              value: (r) => r.panel.backed,
              render: (r) => <Figure value={r.panel.backed} status="assumed" unit="pct" />,
            },
            {
              key: 'blocking',
              header: 'Blocking',
              numeric: true,
              value: (r) => r.blocking,
              render: (r) => <Figure value={r.blocking} status="rejected" unit="count" />,
            },
            {
              key: 'major',
              header: 'Major',
              numeric: true,
              value: (r) => r.major,
              render: (r) => <Figure value={r.major} status="estimated" unit="count" />,
            },
            {
              key: 'minor',
              header: 'Minor',
              numeric: true,
              value: (r) => r.minor,
              render: (r) => <Figure value={r.minor} status="derived" unit="count" />,
            },
            {
              key: 'total',
              header: 'Total',
              numeric: true,
              value: (r) => r.gaps.length,
              render: (r) => <Figure value={r.gaps.length} status="derived" unit="count" keyline />,
            },
            {
              key: 'ids',
              header: 'Gap identifiers',
              value: (r) => r.gaps.map((g) => g.id).join(' '),
              render: (r) => (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {r.gaps.map((g) => (
                    <span
                      key={g.id}
                      className="epi-chip"
                      data-epi={SEVERITY_EPI[g.severity]}
                      title={`${g.severity} — ${g.requirement}`}
                      style={{ letterSpacing: 0, fontFamily: 'var(--font-mono)' }}
                    >
                      {g.id.replace('GAP-', '')}
                    </span>
                  ))}
                </span>
              ),
            },
          ]}
        />

        {unattributed.length > 0 ? (
          <Callout
            status="unavailable"
            title="Gaps attributed to no panel"
            gapId={unattributed.map((g) => g.id).join(', ')}
          >
            {unattributed.length === 1 ? 'One entry is' : `${unattributed.length} entries are`} a
            property of the console as a whole rather than of any panel, so{' '}
            {unattributed.length === 1 ? 'it appears' : 'they appear'} in the register above and in
            no row of this table:{' '}
            {unattributed.map((g) => `${g.id} — ${g.requirement}`).join('; ')}.
          </Callout>
        ) : null}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ row detail */

function GapDetail({ gap }: { gap: Gap }) {
  const siblings = gap.panels.flatMap((n) => gapsForPanel(n)).filter((g) => g.id !== gap.id);
  const unique = [...new Map(siblings.map((g) => [g.id, g])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return (
    <div style={{ maxWidth: '68rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
        <span className="fig" style={{ fontSize: 'var(--t-title)' }}>
          {gap.id}
        </span>
        <span className="h-title" style={{ fontSize: 'var(--t-section)' }}>
          {gap.requirement}
        </span>
        <Chip label={STATUS_LABEL[gap.status]} epi={STATUS_EPI[gap.status]} title={STATUS_DEF[gap.status]} />
        <Chip label={gap.severity} epi={SEVERITY_EPI[gap.severity]} title={SEVERITY_DEF[gap.severity]} />
      </div>

      <DetailRow k="Evidence" v={gap.evidence} />
      <DetailRow k="Remedy adopted" v={gap.remedy} />
      <DetailRow
        k="Panels degraded"
        v={
          gap.panels.length === 0 ? (
            <span style={{ color: 'var(--ink-3)' }}>
              None — this is a property of the console's transport.
            </span>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {gap.panels.map((n) => {
                const meta = PANEL_BY_N.get(n);
                if (!meta) return null;
                return (
                  <li key={n} style={{ padding: '0.1rem 0' }}>
                    <button
                      type="button"
                      onClick={() => goToPanel(meta.id)}
                      style={{
                        font: 'inherit',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: 'var(--ink)',
                        textAlign: 'left',
                      }}
                    >
                      <span className="fig" style={{ color: 'var(--ink-4)' }}>
                        {String(n).padStart(2, '0')}
                      </span>{' '}
                      <span style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                        {meta.title}
                      </span>{' '}
                      <span style={{ color: 'var(--ink-3)' }}>— {meta.summary}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        }
      />
      <DetailRow
        k="Compounding gaps"
        v={
          unique.length === 0 ? (
            <span style={{ color: 'var(--ink-3)' }}>None — no other gap touches the same panels.</span>
          ) : (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {unique.map((g) => (
                <span
                  key={g.id}
                  className="epi-chip"
                  data-epi={SEVERITY_EPI[g.severity]}
                  title={`${g.severity} · ${STATUS_LABEL[g.status]} — ${g.requirement}`}
                  style={{ letterSpacing: 0, fontFamily: 'var(--font-mono)' }}
                >
                  {g.id}
                </span>
              ))}
            </span>
          )
        }
      />
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      className="rule-bh"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(9rem, 11rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.4rem 0',
      }}
    >
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{k}</dt>
      <dd style={{ margin: 0, maxWidth: '62ch', lineHeight: 1.5 }}>{v}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ tally */

function Tally({
  label,
  value,
  of,
  epi,
  note,
}: {
  label: string;
  value: number;
  of: number | null;
  epi: string;
  note?: string;
}) {
  const pct = of && of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <div
      data-epi={epi}
      title={note}
      style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}
    >
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.375rem', color: 'var(--ink)' }}>
        {value}
        {of !== null ? (
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            {' '}
            / {of} · {pct}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
