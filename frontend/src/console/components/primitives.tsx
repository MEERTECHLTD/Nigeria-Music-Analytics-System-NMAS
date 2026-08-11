/**
 * Console primitives.
 *
 * Two rules are enforced here rather than left to each panel:
 *   1. A figure always declares how it came to exist.
 *   2. An absent value renders NOT COLLECTED — never 0, never a blank cell.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Epistemic } from '../data/types';
import { downloadCsv, formatFigure, type FormatOptions } from '../data/client';
import {
  EPISTEMIC_DEFINITION,
  EPISTEMIC_LABEL,
  EPISTEMIC_ORDER,
  FIELD_SPECS,
  resolveEpistemic,
} from '../registry/epistemic';
import { CONSTANTS_BY_ID } from '../registry/constants';

/* ------------------------------------------------------------------ chips */

export function EpistemicChip({
  status,
  bare = false,
  title,
}: {
  status: Epistemic;
  bare?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`epi-chip${bare ? ' epi-chip--bare' : ''}`}
      data-epi={status}
      title={title ?? EPISTEMIC_DEFINITION[status]}
    >
      {EPISTEMIC_LABEL[status]}
    </span>
  );
}

export function EpistemicDot({ status }: { status: Epistemic }) {
  return (
    <span
      className="epi-dot"
      data-epi={status}
      role="img"
      aria-label={EPISTEMIC_LABEL[status]}
      title={EPISTEMIC_DEFINITION[status]}
    />
  );
}

export function EpistemicLegend({
  only,
  className = '',
}: {
  only?: Epistemic[];
  className?: string;
}) {
  const list = only ?? EPISTEMIC_ORDER;
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 list-none p-0 m-0 ${className}`}
      aria-label="Epistemic status legend"
    >
      {list.map((s) => (
        <li key={s} className="flex items-center gap-1.5" data-epi={s}>
          <EpistemicDot status={s} />
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>
            {EPISTEMIC_LABEL[s]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ absence */

export function NotCollected({
  reason,
  gapId,
  short = false,
}: {
  reason?: string;
  gapId?: string;
  short?: boolean;
}) {
  const label = short ? 'N/C' : 'Not collected';
  const title = [reason, gapId].filter(Boolean).join(' · ') || 'No artifact in the repository supports this field.';
  return (
    <span className="not-collected" data-epi="unavailable" title={title}>
      {label}
      {gapId && !short ? (
        <span style={{ color: 'var(--ink-4)', marginLeft: '0.35em', letterSpacing: 0 }}>
          {gapId}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------- provenance */

export interface ProvenanceInfo {
  /** where the value came from, in order */
  chain?: Array<{ op: string; sourceRef?: string; constantId?: string }>;
  endpoint?: string | null;
  sourceField?: string | null;
  extractedAt?: string | null;
  artifact?: string | null;
  note?: string | null;
  gapId?: string;
}

/**
 * The provenance affordance. Attached to every figure, not only where it was
 * convenient — that is the whole point of the interface.
 */
export function ProvenanceButton({ info, label }: { info: ProvenanceInfo; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Provenance of ${label}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          padding: '0 0.15em',
          color: 'var(--ink-4)',
          fontSize: '0.6875rem',
          lineHeight: 1,
          fontFamily: 'var(--font-sans)',
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={`Provenance of ${label}`}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: 0,
            zIndex: 40,
            minWidth: '22rem',
            maxWidth: '30rem',
            background: 'var(--paper-raised)',
            border: '1px solid var(--rule-strong)',
            padding: 'var(--s3)',
            textAlign: 'left',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--t-small)',
            lineHeight: 1.5,
            whiteSpace: 'normal',
          }}
        >
          <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            {label}
          </div>
          {info.chain && info.chain.length > 0 && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {info.chain.map((step, i) => {
                const constant = step.constantId ? CONSTANTS_BY_ID[step.constantId] : undefined;
                return (
                  <li
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.25rem 1fr',
                      gap: '0.35rem',
                      paddingBottom: 'var(--s2)',
                    }}
                  >
                    <span className="fig" style={{ color: 'var(--ink-4)' }}>
                      {i + 1}.
                    </span>
                    <span>
                      <span style={{ color: 'var(--ink)' }}>{step.op}</span>
                      {constant && (
                        <span
                          style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}
                        >
                          {constant.concept} = {constant.value}
                          {constant.justification === 'absent' ||
                          constant.justification === 'self-declared-unsourced' ? (
                            <strong style={{ color: 'var(--asm)' }}> · unsourced</strong>
                          ) : null}
                        </span>
                      )}
                      {step.sourceRef && (
                        <code
                          style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--t-micro)',
                            color: 'var(--ink-4)',
                          }}
                        >
                          {step.sourceRef}
                        </code>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.6rem' }}>
            {info.endpoint && <ProvRow k="Endpoint" v={info.endpoint} mono />}
            {info.sourceField && <ProvRow k="Source field" v={info.sourceField} mono />}
            {info.extractedAt && <ProvRow k="Extracted" v={info.extractedAt} mono />}
            {info.artifact && <ProvRow k="Artifact" v={info.artifact} mono />}
          </dl>
          {info.note && (
            <p style={{ margin: 'var(--s2) 0 0', color: 'var(--ink-2)' }}>{info.note}</p>
          )}
          {info.gapId && (
            <p style={{ margin: 'var(--s2) 0 0', color: 'var(--una)', fontSize: 'var(--t-micro)' }}>
              Gap register: {info.gapId}
            </p>
          )}
        </div>
      )}
    </span>
  );
}

function ProvRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)', whiteSpace: 'nowrap' }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: 'var(--t-micro)',
          wordBreak: 'break-all',
        }}
      >
        {v}
      </dd>
    </>
  );
}

/* ---------------------------------------------------------------- figures */

export interface FigureProps extends FormatOptions {
  value: number | null | undefined;
  /** field id from the epistemic register — supplies status, precision and chain */
  field?: string;
  /** the row, so per-row epistemic flags can be honoured */
  row?: Record<string, unknown> | null;
  /** override the register */
  status?: Epistemic;
  provenance?: ProvenanceInfo;
  label?: string;
  /** show the epistemic keyline under the number */
  keyline?: boolean;
  gapId?: string;
  reason?: string;
  className?: string;
}

/**
 * Every number in the console goes through here. Tabular numerals, consistent
 * precision per metric class, epistemic status attached, provenance reachable.
 */
export function Figure({
  value,
  field,
  row,
  status,
  provenance,
  label,
  keyline = false,
  precision,
  unit,
  compact,
  gapId,
  reason,
  className = '',
}: FigureProps) {
  const spec = field ? FIELD_SPECS[field] : undefined;
  const epi: Epistemic = status ?? (field ? resolveEpistemic(field, row) : 'derived');
  const text = formatFigure(value, {
    precision: precision ?? spec?.precision ?? 0,
    unit: unit ?? spec?.unit,
    compact,
  });

  if (text === null) {
    return <NotCollected reason={reason ?? spec?.note} gapId={gapId} short />;
  }

  const info: ProvenanceInfo | undefined =
    provenance ?? (spec ? { chain: spec.chain, note: spec.note } : undefined);

  return (
    <span
      className={`fig ${keyline ? 'epi-rule' : ''} ${className}`}
      data-epi={epi}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.15em' }}
    >
      <span title={`${EPISTEMIC_LABEL[epi]} — ${EPISTEMIC_DEFINITION[epi]}`}>{text}</span>
      {info && (info.chain?.length || info.endpoint || info.artifact) ? (
        <ProvenanceButton info={info} label={label ?? spec?.label ?? field ?? 'value'} />
      ) : null}
    </span>
  );
}

/** A headline figure with its label, epistemic chip and provenance. */
export function StatFigure({
  label,
  value,
  field,
  status,
  provenance,
  precision,
  unit,
  compact,
  gapId,
  reason,
  footnote,
  onClick,
}: FigureProps & { footnote?: ReactNode; onClick?: () => void }) {
  const spec = field ? FIELD_SPECS[field] : undefined;
  const epi: Epistemic = status ?? (field ? resolveEpistemic(field) : 'derived');
  const absent = value === null || value === undefined;

  const body = (
    <>
      <div
        className="h-section"
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}
      >
        <EpistemicDot status={absent ? 'unavailable' : epi} />
        <span>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        {absent ? (
          <NotCollected reason={reason ?? spec?.note} gapId={gapId} />
        ) : (
          <span
            className="fig"
            data-epi={epi}
            style={{ fontSize: '1.375rem', fontWeight: 600, color: 'var(--ink)' }}
          >
            {formatFigure(value, {
              precision: precision ?? spec?.precision ?? 0,
              unit: unit ?? spec?.unit,
              compact,
            })}
          </span>
        )}
        {!absent && provenance ? (
          <ProvenanceButton info={provenance} label={label ?? 'value'} />
        ) : null}
      </div>
      {footnote ? (
        <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)', marginTop: '0.2rem' }}>
          {footnote}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          textAlign: 'left',
          background: 'none',
          border: 'none',
          borderLeft: '2px solid var(--rule)',
          padding: '0 var(--s3)',
          cursor: 'pointer',
          width: '100%',
          font: 'inherit',
        }}
      >
        {body}
      </button>
    );
  }
  return <div style={{ borderLeft: '2px solid var(--rule)', padding: '0 var(--s3)' }}>{body}</div>;
}

/* ----------------------------------------------------------------- layout */

export function Section({
  title,
  subtitle,
  actions,
  children,
  id,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <div>
          <h2 className="h-title">{title}</h2>
          {subtitle ? (
            <p className="lede" style={{ margin: '0.35rem 0 0' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="no-print" style={{ flex: 'none' }}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A statement of fact about the data that the reader must not miss. Used for
 * structural absences and integrity warnings, never for decoration.
 */
export function Callout({
  status = 'unavailable',
  title,
  children,
  gapId,
}: {
  status?: Epistemic;
  title: string;
  children?: ReactNode;
  gapId?: string;
}) {
  return (
    <div
      data-epi={status}
      style={{
        borderLeft: '3px solid var(--epi)',
        background: 'var(--epi-bg)',
        padding: 'var(--s3) var(--s4)',
        margin: 'var(--s3) 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s3)',
        }}
      >
        <strong style={{ color: 'var(--epi)', fontSize: 'var(--t-body)' }}>{title}</strong>
        {gapId ? (
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
            {gapId}
          </code>
        ) : null}
      </div>
      {children ? (
        <div style={{ marginTop: '0.35rem', color: 'var(--ink-2)', maxWidth: '78ch' }}>{children}</div>
      ) : null}
    </div>
  );
}

export function KeyValue({
  k,
  v,
  mono = false,
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="rule-bh"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(9rem, 14rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.3rem 0',
        alignItems: 'baseline',
      }}
    >
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? 'var(--t-small)' : 'var(--t-body)',
          wordBreak: mono ? 'break-word' : undefined,
        }}
      >
        {v}
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------- loading */

export function LoadingBlock({ label = 'Reading artifact' }: { label?: string }) {
  return (
    <div
      style={{ padding: 'var(--s6)', color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}
      role="status"
      aria-live="polite"
    >
      {label}…
    </div>
  );
}

/** An artifact that could not be read. Distinct from an artifact that is empty. */
export function ArtifactError({ error, artifact }: { error: unknown; artifact: string }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Callout status="rejected" title="Artifact unavailable">
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>{artifact}</code>
      {' could not be read. '}
      {msg}
      <br />
      This is a transport failure, not an assertion that the data is absent. Re-run{' '}
      <code style={{ fontFamily: 'var(--font-mono)' }}>
        backend/scripts/generate_console_api.py
      </code>{' '}
      to regenerate the projection.
    </Callout>
  );
}

/** Wrap a query so loading, transport failure and absence are always distinguished. */
export function Resolved<T>({
  query,
  artifact,
  children,
  label,
}: {
  query: { data?: T; isLoading: boolean; error: unknown };
  artifact: string;
  label?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <LoadingBlock label={label} />;
  if (query.error) return <ArtifactError error={query.error} artifact={artifact} />;
  if (query.data === undefined) return <ArtifactError error="No data returned" artifact={artifact} />;
  return <>{children(query.data)}</>;
}

/* ------------------------------------------------------------ misc utils */

/* ------------------------------------------------------------ capability */

/**
 * Renders `children` when the system can evidence the capability, and an
 * explained absence when it cannot.
 *
 * Panels must use this rather than asserting an absence in JSX. The Chartmetric
 * and SoundCharts endpoints are being activated, so any hardcoded "this does not
 * exist" would still be claiming that after the data arrives. A gate flips on
 * its own the moment records back it.
 */
export function CapabilityGate({
  capability,
  children,
  title,
  whenAbsent,
  requires,
}: {
  capability: import('../data/capabilities').Capability;
  children: ReactNode;
  title?: string;
  /** extra explanation of what the panel would show once activated */
  whenAbsent?: ReactNode;
  /** what would have to be true for this to populate */
  requires?: string;
}) {
  if (capability.present) return <>{children}</>;

  if (capability.indeterminate) {
    return (
      <Callout status="rejected" title={title ?? `${capability.label} — cannot be determined`}>
        {capability.evidence}
      </Callout>
    );
  }

  return (
    <Callout
      status="unavailable"
      title={title ?? `${capability.label} — not collected`}
      gapId={capability.gapId}
    >
      <p style={{ margin: 0 }}>{capability.evidence}</p>
      {requires ? (
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Populates when:</strong> {requires}
        </p>
      ) : null}
      {whenAbsent ? <div style={{ marginTop: '0.5rem' }}>{whenAbsent}</div> : null}
    </Callout>
  );
}

/** Inline capability status, for tables and stat rows. */
export function CapabilityChip({
  capability,
}: {
  capability: import('../data/capabilities').Capability;
}) {
  return (
    <span
      className="epi-chip"
      data-epi={capability.present ? 'observed' : 'unavailable'}
      title={capability.evidence}
    >
      {capability.present ? 'Present' : 'Not collected'}
      {capability.count !== null ? (
        <span className="fig" style={{ marginLeft: '0.3em' }}>
          {capability.count.toLocaleString('en-US')}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Says which transport answered. A reader must always know whether they are
 * looking at a live backend or the generated projection.
 */
export function TransportBadge({
  transport,
}: {
  transport: import('../data/transport').TransportState | undefined;
}) {
  if (!transport) return null;
  const live = transport.mode === 'live';
  return (
    <span
      className={`epi-chip${live ? ' is-running' : ''}`}
      data-epi={live ? 'observed' : 'derived'}
      title={
        live
          ? `Reading the live API at ${transport.liveBase}. Polling for new data.`
          : `Reading the generated projection. ${transport.reason ?? ''}`
      }
    >
      <span className="epi-dot" />
      {live ? 'Live' : 'Projection'}
    </span>
  );
}

export function useCsvExport(filename: string) {
  return useCallback(
    (rows: Array<Record<string, unknown>>, columns?: string[]) =>
      downloadCsv(filename, rows, columns),
    [filename],
  );
}
