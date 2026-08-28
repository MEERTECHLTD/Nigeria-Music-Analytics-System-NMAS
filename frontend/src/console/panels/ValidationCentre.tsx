/**
 * PANEL 12 — Validation Centre
 *
 * WHAT IT RENDERS
 *   1. The one genuine tested / passed / failed triple the system produces:
 *      13,624 extraction units attempted, 13,410 completed, 214 failed, from the
 *      single recorded run. The decomposition 131 master-list rows × 13 variables ×
 *      8 quarters is verified against the artifacts at render time rather than
 *      asserted.
 *   2. The five quality checks that shipped with the delivery, each transcribed
 *      verbatim with the predicate the code actually evaluates, and each given a
 *      verdict: TAUTOLOGICAL, NO THRESHOLD or REAL. Three of the five cannot
 *      fail by construction, so "5/5 PASS" is not evidence of quality — that is
 *      the finding this panel exists to state.
 *   3. The limitation and coverage-gap counts from quality.json, grouped by
 *      variable and code.
 *
 * WHAT IT CANNOT RENDER
 *   There is no validation rule registry and no failing-record list (GAP-012).
 *   No rule has an identifier, a severity, an owner or a threshold; no record is
 *   named as having failed one. Records rejected during normalisation are not
 *   counted anywhere — six silent skip branches in the normaliser increment no
 *   counter (GAP-029). Per-call attribution of the 214 failures does not exist
 *   (GAP-028), and quality metadata stops at Q4 2025, so the newest and largest
 *   quarter is unchecked rather than clean (GAP-031).
 */

import { useMemo, type ReactNode } from 'react';
import {
  comparePeriods,
  formatPeriod,
  formatTimestamp,
  humanizeVariable,
  useCoverage,
  useQuality,
  useRun,
} from '../data/client';
import {
  Callout,
  Figure,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import { DISTINCT_ARTISTS, MASTER_LIST_ROWS } from '../../generated/cohortFacts';
import { DataTable, type Column } from '../components/DataTable';
import type { Coverage, LimitationGroup, Quality, Run } from '../data/types';

/* ---------------------------------------------------------- check register */

type Verdict = 'TAUTOLOGICAL' | 'NO THRESHOLD' | 'REAL';

/**
 * Verdict → epistemic colour. Stated explicitly on the panel so the colour is
 * making a claim, not decorating one:
 *   TAUTOLOGICAL  unavailable — the check carries no information
 *   NO THRESHOLD  assumed     — the pass condition is an imposed constant
 *   REAL          observed    — the check tests data against a condition it
 *                              could actually violate
 */
const VERDICT_EPI: Record<Verdict, string> = {
  TAUTOLOGICAL: 'unavailable',
  'NO THRESHOLD': 'assumed',
  REAL: 'observed',
};

interface ShippedCheck {
  n: number;
  /** the heading exactly as it appears in the shipped report */
  title: string;
  /** the pass condition, transcribed from the generator */
  predicate: string;
  sourceRef: string;
  /** what the shipped report records */
  shippedResult: string;
  verdict: Verdict;
  /** one sentence: why this verdict */
  why: ReactNode;
}

const CHECKS: ShippedCheck[] = [
  {
    n: 1,
    title: 'Check 1: Revenue Totals Consistency',
    predicate: 'abs(export_total − streaming_total × 0.7) < streaming_total × 0.01',
    sourceRef: 'backend/scripts/nbs_final_delivery.py:841',
    shippedResult: 'PASS on all 5 revenue periods',
    verdict: 'TAUTOLOGICAL',
    why: (
      <>
        Export revenue is <em>defined</em> as streaming revenue × 0.70 by the
        extraction that wrote both files, so this asks whether 0.70 × x is within
        1% of 0.70 × x; it can only fail if one of the two CSVs is truncated, and
        its failing branch prints CHECK rather than FAIL.
      </>
    ),
  },
  {
    n: 2,
    title: 'Check 2: No Negative Revenues',
    predicate: 'count(gross_streaming_revenue_usd < 0) == 0',
    sourceRef: 'backend/scripts/nbs_final_delivery.py:846',
    shippedResult: 'PASS — 0 negative entries',
    verdict: 'REAL',
    why: (
      <>
        This is the only one of the five that compares data against an external
        condition rather than against a quantity derived from itself: a negative
        value would make it print FAIL, and the quarterly aggregation layer of this
        same system does emit negative quarterly values, so the property is not
        vacuous.
      </>
    ),
  },
  {
    n: 3,
    title: 'Check 3: Artist Counts per Period',
    predicate: "count(artists with revenue) > 50  →  'PASS' else 'LOW COVERAGE'",
    sourceRef: 'backend/scripts/nbs_final_delivery.py:852',
    shippedResult: 'PASS on all 5 periods, at 127–128 artists',
    verdict: 'NO THRESHOLD',
    why: (
      <>
        The only bound in the code is a floor of 50 — 38% of a {MASTER_LIST_ROWS}-row roster —
        and the failing branch prints LOW COVERAGE rather than FAIL, so no target
        coverage rate is declared anywhere and the check passes at 127 of {MASTER_LIST_ROWS}
        without recording the 2.3–3.1% shortfall as a defect.
      </>
    ),
  },
  {
    n: 4,
    title: 'Check 4: Employment Totals',
    predicate: 'abs(total − male − female) <= 1',
    sourceRef: 'backend/scripts/nbs_final_delivery.py:862',
    shippedResult: 'PASS on all 5 periods',
    verdict: 'TAUTOLOGICAL',
    why: (
      <>
        Male and female are written as complementary fractions of the same total —
        0.62 and 0.38 of one number — so the identity being tested is the identity
        that produced the two operands.
      </>
    ),
  },
  {
    n: 5,
    title: 'Check 5: Cost Totals',
    predicate: 'abs(sum(line items) − total_row) < 1',
    sourceRef: 'backend/scripts/nbs_final_delivery.py:873',
    shippedResult: 'PASS on all 5 periods, at an identical ₦272,480,000 each quarter',
    verdict: 'TAUTOLOGICAL',
    why: (
      <>
        The total row is written as the sum of the line items by the generator that
        produced the file, so the check re-derives the arithmetic that created the
        value it is comparing against.
      </>
    ),
  },
];

/**
 * The roster the shipped check measured against: a MASTER-LIST ROW count.
 * Those rows describe DISTINCT_ARTISTS real artists — one artist is held twice
 * under two provider ids (GAP-033) — so this denominator counts rows, not people.
 */
const ARTIST_UNIVERSE = MASTER_LIST_ROWS;
const SHIPPED_REPORT_PATH = 'delivery/07_Quality_Checks/Quality_Check_Report.md';

/* ------------------------------------------------------------- run parsing */

interface UnitTriple {
  total: number | null;
  completed: number | null;
  skipped: number | null;
  failed: number | null;
  jobLabel: string | null;
}

/** The unit triple lives only inside the run's markdown summary. Parse, never guess. */
function parseUnits(md: string | null): UnitTriple {
  const pick = (label: string): number | null => {
    if (!md) return null;
    const m = new RegExp(`-\\s*${label}\\s*:\\s*([0-9,]+)`, 'i').exec(md);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const job = md ? /-\s*Job\s*:\s*(.+)/.exec(md) : null;
  return {
    total: pick('Total units'),
    completed: pick('Completed units'),
    skipped: pick('Skipped units'),
    failed: pick('Failed units'),
    jobLabel: job ? job[1].trim() : null,
  };
}

/** run.duration is null in the artifact; derive it from the two timestamps. */
function derivedDuration(started: string | null, finished: string | null): string | null {
  if (!started || !finished) return null;
  const a = new Date(started).getTime();
  const b = new Date(finished).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const s = Math.round((b - a) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}

/* ==================================================================== panel */

export default function ValidationCentre() {
  return (
    <>
      <Section
        title="There is no validation rule registry"
        subtitle="Nothing in this system enumerates the rules a record must satisfy, and nothing records which records failed one. What follows is everything that does exist, and nothing has been added to fill the shape of what does not."
      >
        <Callout status="unavailable" title="No rule registry, no failing-record list" gapId="GAP-012">
          A validation centre would list rules with identifiers, severities, owners
          and thresholds, and let a methodologist open any rule to see the records
          that failed it. No such table exists in this codebase. Five checks were
          written into a markdown report by the delivery generator; they have no
          identifiers, no severities, no owners, and only one of them declares a
          numeric bound. Building the missing capability requires a rule table, a
          rule-result table keyed to record identity, and a validation stage that
          writes to both — none of which exists today.
        </Callout>
        <Callout status="unavailable" title="Records rejected during normalisation" gapId="GAP-029">
          Six silent skip branches in the normaliser drop records and increment no
          counter of any kind, so the count of records rejected at every stage of
          this pipeline is <NotCollected short />, not zero. A rejection rate cannot
          be computed, and a record that was silently discarded is indistinguishable
          from a record the provider never returned.
        </Callout>
      </Section>

      <RealDenominator />
      <ShippedChecks />
      <QualityMetadata />
    </>
  );
}

/* ------------------------------------------------ 1. the real denominator */

function RealDenominator() {
  const run = useRun();
  const quality = useQuality();
  const coverage = useCoverage();

  return (
    <Section
      title="The one real denominator"
      subtitle="A genuine tested / passed / failed triple exists at extraction-unit granularity. It is the only place in the system where a denominator, a numerator and a failure count were all recorded by the same process."
    >
      <Resolved query={run} artifact="run.json" label="Reading run summary">
        {(runData) => (
          <Resolved query={quality} artifact="quality.json" label="Reading quality metadata">
            {(q) => (
              <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
                {(cov) => <UnitTripleView run={runData} quality={q} coverage={cov} />}
              </Resolved>
            )}
          </Resolved>
        )}
      </Resolved>
    </Section>
  );
}

function UnitTripleView({
  run,
  quality,
  coverage,
}: {
  run: Run;
  quality: Quality;
  coverage: Coverage;
}) {
  const units = useMemo(() => parseUnits(run.report_markdown), [run.report_markdown]);

  /* The decomposition, taken from artifacts rather than asserted. */
  const decomposition = useMemo(() => {
    const variables = new Set(
      quality.limitations.map((l) => l.variable).filter((v): v is string => !!v),
    ).size;
    const periods = quality.periods_with_quality_metadata.length;
    const artists = coverage.distinct_artists;
    const product = artists * variables * periods;
    return { artists, variables, periods, product };
  }, [quality, coverage]);

  const failureRate =
    units.total && units.failed !== null ? (units.failed / units.total) * 100 : null;

  const duration = derivedDuration(run.started, run.finished);
  const matches = units.total !== null && units.total === decomposition.product;

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))',
          gap: 'var(--s5)',
          paddingBottom: 'var(--s5)',
        }}
      >
        <StatFigure
          label="Units attempted"
          value={units.total}
          status="observed"
          gapId="GAP-012"
          reason="The unit triple exists only inside the run's markdown summary."
          footnote="Tested"
          provenance={{
            artifact: 'run.json → report_markdown',
            sourceField: 'Total units',
            note: 'Parsed from the one recorded run summary. No other artifact carries this number.',
          }}
        />
        <StatFigure
          label="Units completed"
          value={units.completed}
          status="observed"
          gapId="GAP-012"
          footnote="Passed"
          provenance={{
            artifact: 'run.json → report_markdown',
            sourceField: 'Completed units',
          }}
        />
        <StatFigure
          label="Units failed"
          value={units.failed}
          status="rejected"
          gapId="GAP-012"
          footnote="Failed"
          provenance={{
            artifact: 'run.json → report_markdown',
            sourceField: 'Failed units',
            note: 'An aggregate count only. No unit is named and no call is attributed.',
            gapId: 'GAP-028',
          }}
        />
        <StatFigure
          label="Failure rate"
          value={failureRate}
          status="derived"
          unit="pct"
          precision={2}
          footnote="Failed ÷ attempted, computed here for display"
        />
        <StatFigure
          label="Units skipped"
          value={units.skipped}
          status="observed"
          footnote="Recorded as zero by the run. Entities passed over for a missing identifier are not counted as skips."
        />
      </div>

      <Callout
        status={matches ? 'observed' : 'estimated'}
        title="What one unit is"
        gapId="GAP-012"
      >
        A unit is one artist × one variable × one quarter — a single extraction
        attempt against the provider. The run's own denominator decomposes exactly:{' '}
        <span className="fig">{decomposition.artists}</span> artists ×{' '}
        <span className="fig">{decomposition.variables}</span> variables ×{' '}
        <span className="fig">{decomposition.periods}</span> quarters ={' '}
        <span className="fig">{decomposition.product.toLocaleString('en-US')}</span>
        {matches ? (
          <>
            , which is the attempted figure above. The artist count comes from the
            coverage projection, the variable and quarter counts from the
            limitation report's own grouping — so the decomposition is checked
            against the artifacts, not asserted.
          </>
        ) : (
          <>
            . This does not equal the attempted figure the run reports, so the unit
            definition cannot be confirmed from the artifacts and the decomposition
            above is shown as an estimate.
          </>
        )}{' '}
        Note the frame: eight quarters, not the nine the observation archive holds.
        The run that produced this denominator ran Q1 2024 through Q4 2025, so
        Q1 2026 was never inside a tested population at all.
      </Callout>

      <Callout status="rejected" title="This is the only thing in the system that failed" gapId="GAP-028">
        The five quality checks below all pass. The 214 failures here are the only
        recorded negative result anywhere in the delivery, and they belong to the
        extraction, not to validation. They are known as three error classes and one
        total; no failure is attributed to an artist, a variable, a quarter or a
        call.
      </Callout>

      <div className="scroll-x" style={{ paddingTop: 'var(--s3)' }}>
        <table className="tbl">
          <caption>
            Failure classes as recorded. One aggregate row exists in the whole
            delivery.
          </caption>
          <thead>
            <tr>
              <th>Error type</th>
              <th className="num-col">Count</th>
              <th>Classes present</th>
              <th className="num-col">Per-class count</th>
            </tr>
          </thead>
          <tbody>
            {run.failures.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <NotCollected reason="No failure rows in the run artifact." gapId="GAP-028" />
                </td>
              </tr>
            ) : (
              run.failures.map((f) => (
                <tr key={f.error_type ?? 'unknown'}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {f.error_type ?? <NotCollected short />}
                  </td>
                  <td className="num-col">
                    <Figure value={f.count} status="observed" keyline />
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                      {f.messages.map((m) => (
                        <li
                          key={m}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--t-micro)',
                            padding: '0.1rem 0',
                          }}
                        >
                          {m}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="num-col">
                    <NotCollected
                      reason="Failures are counted in one bucket. No per-class or per-call attribution exists."
                      gapId="GAP-028"
                      short
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <dl style={{ margin: 'var(--s5) 0 0', maxWidth: '58rem' }}>
        <MetaRow k="Job" v={units.jobLabel} mono />
        <MetaRow k="Started" v={formatTimestamp(run.started)} mono />
        <MetaRow k="Finished" v={formatTimestamp(run.finished)} mono />
        <MetaRow
          k="Duration"
          v={
            duration ? (
              <>
                <span className="fig" data-epi="derived">
                  {duration}
                </span>
                <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
                  {' '}
                  — derived here from the two timestamps; the artifact's own duration
                  field is empty
                </span>
              </>
            ) : null
          }
        />
        <MetaRow
          k="Per-stage timings"
          v={null}
          gapId="GAP-013"
          reason="No stage table, stage name or stage timing was ever recorded."
        />
      </dl>
    </>
  );
}

function MetaRow({
  k,
  v,
  mono,
  gapId,
  reason,
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
  gapId?: string;
  reason?: string;
}) {
  const absent = v === null || v === undefined || v === '';
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
          fontSize: mono ? 'var(--t-small)' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {absent ? <NotCollected reason={reason} gapId={gapId} /> : v}
      </dd>
    </div>
  );
}

/* --------------------------------------------------- 2. the five checks */

function ShippedChecks() {
  const counts = useMemo(() => {
    const t = CHECKS.filter((c) => c.verdict === 'TAUTOLOGICAL').length;
    const n = CHECKS.filter((c) => c.verdict === 'NO THRESHOLD').length;
    const r = CHECKS.filter((c) => c.verdict === 'REAL').length;
    return { t, n, r, total: CHECKS.length };
  }, []);

  return (
    <Section
      title="The five shipped quality checks"
      subtitle={
        <>
          Transcribed verbatim from {SHIPPED_REPORT_PATH}, each beside the predicate
          the generator actually evaluates. The verdict on each is assigned by this
          console, not by the delivery. Colour states the claim:{' '}
          <strong>TAUTOLOGICAL</strong> carries no information,{' '}
          <strong>NO THRESHOLD</strong> passes against an imposed constant, and{' '}
          <strong>REAL</strong> tests data against a condition it could violate.
        </>
      }
    >
      <Callout
        status="rejected"
        title={`${counts.t} of ${counts.total} checks cannot fail by construction`}
        gapId="GAP-012"
      >
        The delivery presents this set as “5/5 checks PASS across 5 periods”. Three
        of the five compare a quantity against an identity that produced it, so they
        would report PASS against any input whatsoever, including an input that is
        entirely wrong. A fourth passes at any coverage above 38% of the roster. A
        pass rate computed over this set measures the generator's arithmetic, not
        the data's quality, and it must not be reported as a quality figure.
      </Callout>

      <div
        style={{
          display: 'flex',
          gap: 'var(--s5)',
          flexWrap: 'wrap',
          padding: 'var(--s3) 0 var(--s5)',
        }}
      >
        <VerdictTally label="Cannot fail" value={counts.t} of={counts.total} verdict="TAUTOLOGICAL" />
        <VerdictTally label="No declared threshold" value={counts.n} of={counts.total} verdict="NO THRESHOLD" />
        <VerdictTally label="Capable of failing" value={counts.r} of={counts.total} verdict="REAL" />
      </div>

      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {CHECKS.map((c) => (
          <li
            key={c.n}
            className="rule-bh"
            data-epi={VERDICT_EPI[c.verdict]}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 'var(--s4)',
              padding: 'var(--s4) 0 var(--s4) var(--s3)',
              borderLeft: '3px solid var(--epi)',
              alignItems: 'start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650, color: 'var(--ink)' }}>{c.title}</div>
              <code
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-small)',
                  color: 'var(--ink-2)',
                  background: 'var(--paper-sunk)',
                  padding: '0.25rem 0.4rem',
                  margin: '0.35rem 0',
                  wordBreak: 'break-word',
                }}
              >
                {c.predicate}
              </code>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-2)', maxWidth: '76ch' }}>
                {c.why}
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-4)',
                  marginTop: '0.35rem',
                  wordBreak: 'break-all',
                }}
              >
                {c.sourceRef}
              </div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span className="epi-chip" data-epi={VERDICT_EPI[c.verdict]}>
                {c.verdict}
              </span>
              <div
                style={{
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                  marginTop: '0.35rem',
                  maxWidth: '14rem',
                  whiteSpace: 'normal',
                }}
              >
                As shipped: {c.shippedResult}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ paddingTop: 'var(--s5)' }}>
        <h3 className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          What each check does not have
        </h3>
        <dl style={{ margin: 0, maxWidth: '58rem' }}>
          <MetaRow
            k="Rule identifier"
            v={null}
            gapId="GAP-012"
            reason="The checks exist as markdown headings in a generated report, not as records."
          />
          <MetaRow
            k="Severity"
            v={null}
            gapId="GAP-012"
            reason="No check declares whether failing it would block publication."
          />
          <MetaRow k="Owner" v={null} gapId="GAP-012" reason="No owner field exists." />
          <MetaRow
            k="Declared threshold"
            v={null}
            gapId="GAP-012"
            reason="Two tolerances are inlined at the call site (1% and 1 unit) and one floor (50 artists). None is declared as a statistical acceptance criterion."
          />
          <MetaRow
            k="Failing records"
            v={null}
            gapId="GAP-012"
            reason="No check writes the identity of a record that failed it. All five report only a count or a verdict string."
          />
          <MetaRow
            k="Coverage of Q1 2026"
            v={null}
            gapId="GAP-031"
            reason="The report covers the five revenue periods; the quality metadata behind it stops at Q4 2025."
          />
        </dl>
      </div>
    </Section>
  );
}

function VerdictTally({
  label,
  value,
  of,
  verdict,
}: {
  label: string;
  value: number;
  of: number;
  verdict: Verdict;
}) {
  return (
    <div
      data-epi={VERDICT_EPI[verdict]}
      style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}
    >
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.125rem', color: 'var(--ink)' }}>
        {value}
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}> / {of}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------- 3. limitations and gaps */

function QualityMetadata() {
  const quality = useQuality();
  const coverage = useCoverage();
  return (
    <Section
      title="Limitations and coverage gaps"
      subtitle="What the pipeline itself recorded about its own incompleteness. These are counts of absence, not results of a rule — nothing here was tested against a criterion."
    >
      <Resolved query={quality} artifact="quality.json" label="Reading quality metadata">
        {(q) => (
          <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
            {(cov) => <QualityView quality={q} coverage={cov} />}
          </Resolved>
        )}
      </Resolved>
    </Section>
  );
}

interface VariableSummary {
  variable: string;
  limitation_code: string;
  count: number;
  quarters: number;
  description: string;
  fallback: string;
}

function QualityView({ quality, coverage }: { quality: Quality; coverage: Coverage }) {
  const summary = useMemo<VariableSummary[]>(() => {
    const m = new Map<string, VariableSummary>();
    for (const l of quality.limitations) {
      const key = `${l.variable ?? '—'}|${l.limitation_code ?? '—'}`;
      const existing = m.get(key);
      if (existing) {
        existing.count += l.count;
        existing.quarters += 1;
      } else {
        m.set(key, {
          variable: l.variable ?? '—',
          limitation_code: l.limitation_code ?? '—',
          count: l.count,
          quarters: 1,
          description: l.descriptions[0] ?? '',
          fallback: l.fallback_applied.join(', '),
        });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [quality.limitations]);

  const missingQuarters = useMemo(
    () =>
      coverage.periods_observed.filter(
        (p) => !quality.periods_with_quality_metadata.includes(p),
      ),
    [coverage.periods_observed, quality.periods_with_quality_metadata],
  );

  const gapPeriods = useMemo(() => {
    const all = [...new Set([...coverage.periods_observed, ...Object.keys(quality.gap_by_period)])];
    return all.sort(comparePeriods);
  }, [coverage.periods_observed, quality.gap_by_period]);

  const maxGap = useMemo(
    () => Math.max(1, ...Object.values(quality.gap_by_period)),
    [quality.gap_by_period],
  );

  const severityValues = Object.entries(quality.gap_severities);
  const reasonValues = Object.entries(quality.gap_reasons);

  const metadataQuarters = quality.periods_with_quality_metadata.length;
  const distinctLimitedVariables = new Set(
    quality.limitations.map((l) => l.variable).filter((v): v is string => !!v),
  ).size;

  const summaryColumns: Column<VariableSummary>[] = [
    {
      key: 'variable',
      header: 'Variable',
      value: (r) => r.variable,
      render: (r) => (
        <span title={r.variable} style={{ whiteSpace: 'nowrap' }}>
          {humanizeVariable(r.variable)}
        </span>
      ),
      width: '16rem',
    },
    {
      key: 'code',
      header: 'Limitation code',
      value: (r) => r.limitation_code,
      render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
          {r.limitation_code}
        </span>
      ),
      groupable: true,
    },
    {
      key: 'count',
      header: 'Rows',
      numeric: true,
      value: (r) => r.count,
      render: (r) => <Figure value={r.count} status="observed" keyline />,
    },
    {
      key: 'quarters',
      header: 'Quarters affected',
      numeric: true,
      value: (r) => r.quarters,
      render: (r) => <Figure value={r.quarters} status="observed" />,
      note: `Out of the ${metadataQuarters} quarters that carry quality metadata at all.`,
    },
    {
      key: 'description',
      header: 'Description as recorded',
      value: (r) => r.description,
    },
    {
      key: 'fallback',
      header: 'Fallback applied',
      value: (r) => r.fallback,
      render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
          {r.fallback}
        </span>
      ),
      note: 'False on every group — no fallback was ever applied to a limited record.',
    },
  ];

  const detailColumns: Column<LimitationGroup>[] = [
    {
      key: 'variable',
      header: 'Variable',
      value: (r) => r.variable,
      render: (r) =>
        r.variable ? (
          <span title={r.variable} style={{ whiteSpace: 'nowrap' }}>
            {humanizeVariable(r.variable)}
          </span>
        ) : (
          <NotCollected short />
        ),
      groupable: true,
      width: '16rem',
    },
    {
      key: 'period',
      header: 'Quarter',
      value: (r) => r.period,
      render: (r) =>
        r.period ? <span className="fig">{formatPeriod(r.period)}</span> : <NotCollected short />,
      groupable: true,
    },
    {
      key: 'code',
      header: 'Limitation code',
      value: (r) => r.limitation_code,
      render: (r) =>
        r.limitation_code ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
            {r.limitation_code}
          </span>
        ) : (
          <NotCollected short reason="The limitation row carries no code." />
        ),
      groupable: true,
    },
    {
      key: 'count',
      header: 'Rows',
      numeric: true,
      value: (r) => r.count,
      render: (r) => <Figure value={r.count} status="observed" />,
    },
    {
      key: 'description',
      header: 'Description as recorded',
      value: (r) => r.descriptions.join(' · '),
    },
  ];

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))',
          gap: 'var(--s5)',
          paddingBottom: 'var(--s5)',
        }}
      >
        <StatFigure
          label="Limitation rows"
          value={quality.limitation_total}
          status="observed"
          footnote={`Across ${summary.length} variable × code combinations`}
        />
        <StatFigure
          label="Coverage gap rows"
          value={quality.gap_total}
          status="observed"
          footnote="Every one of them a missing observation in an expected window"
        />
        <StatFigure
          label="Quarters with quality metadata"
          value={quality.periods_with_quality_metadata.length}
          status="observed"
          footnote={`Of ${coverage.periods_observed.length} quarters the archive holds`}
        />
        <StatFigure
          label="Distinct gap severities"
          value={severityValues.length}
          status="observed"
          footnote="One value on every row — see below"
        />
      </div>

      <Callout status="unavailable" title="Gap severity carries no information" gapId="GAP-012">
        {severityValues.map(([sev, n]) => (
          <span key={sev} style={{ display: 'block' }}>
            <code style={{ fontFamily: 'var(--font-mono)' }}>{sev}</code> ={' '}
            <Figure value={n} status="observed" /> of{' '}
            <Figure value={quality.gap_total} status="observed" /> rows
          </span>
        ))}
        <p style={{ margin: '0.5rem 0 0' }}>
          Severity is written as a literal constant at the point every gap is
          created, so it takes exactly one value across the whole register. It has
          zero variance and therefore zero discriminating power: it must not be
          plotted, filtered on, or read as a triage signal. The same is true of the
          reason column —{' '}
          {reasonValues.map(([reason]) => (
            <code key={reason} style={{ fontFamily: 'var(--font-mono)' }}>
              {reason}
            </code>
          ))}{' '}
          is the only value it ever takes.
        </p>
      </Callout>

      <Callout
        status="unavailable"
        title={`${missingQuarters.map(formatPeriod).join(', ') || 'No quarter'} is unchecked, not clean`}
        gapId="GAP-031"
      >
        Quality metadata stops at{' '}
        {formatPeriod(
          quality.periods_with_quality_metadata[
            quality.periods_with_quality_metadata.length - 1
          ] ?? '',
        )}
        . The
        quarters after it carry observations but no limitation rows and no gap rows
        at all, so a zero in the chart below means unmeasured. An unchecked quarter
        must never be presented as a quarter that passed — and this is the newest
        and largest quarter in the delivery.
      </Callout>

      <div style={{ padding: 'var(--s4) 0 var(--s6)' }}>
        <h3 className="h-section" style={{ marginBottom: 'var(--s3)' }}>
          Coverage gap rows by quarter
        </h3>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          {gapPeriods.map((p) => {
            const has = quality.periods_with_quality_metadata.includes(p);
            const n = quality.gap_by_period[p] ?? null;
            const width = n !== null ? Math.max(1, (n / maxGap) * 100) : 100;
            return (
              <div
                key={p}
                data-epi={has ? 'observed' : 'unavailable'}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '5rem minmax(0, 1fr) 6rem',
                  gap: 'var(--s3)',
                  alignItems: 'center',
                }}
              >
                <span className="fig" style={{ fontSize: 'var(--t-small)' }}>
                  {formatPeriod(p)}
                </span>
                <span
                  style={{
                    display: 'block',
                    height: '0.875rem',
                    border: '1px solid var(--rule-hair)',
                    position: 'relative',
                  }}
                >
                  <span
                    className={has ? undefined : 'hatch'}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${width}%`,
                      background: has ? 'var(--epi)' : undefined,
                      opacity: has ? 0.75 : 1,
                    }}
                  />
                </span>
                <span className="num-col" style={{ fontSize: 'var(--t-small)' }}>
                  {n !== null ? (
                    <Figure value={n} status="observed" />
                  ) : (
                    <NotCollected
                      reason="The gap report does not cover this quarter."
                      gapId="GAP-031"
                      short
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p
          style={{
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-3)',
            marginTop: 'var(--s3)',
            maxWidth: '72ch',
          }}
        >
          Hatched rows are quarters the gap report never covered. Their bar is drawn
          full width deliberately: the extent of what is unknown there is itself
          unknown, and a short bar would read as a good result.
        </p>
      </div>

      <h3 className="h-section" style={{ marginBottom: 'var(--s3)' }}>
        Limitations by variable and code
      </h3>
      <DataTable
        rows={summary}
        columns={summaryColumns}
        rowKey={(r) => `${r.variable}|${r.limitation_code}`}
        filename="limitations_by_variable"
        dense
        pageSize={null}
        initialSort={{ key: 'count', dir: 'desc' }}
        caption={
          <>
            Every limitation row the pipeline recorded, grouped by variable and code.
            The three largest are the metrics that returned a payload with no usable
            field at all — roughly one row per artist per quarter, across the whole{' '}
            {ARTIST_UNIVERSE}-row roster — {DISTINCT_ARTISTS} distinct artists.
          </>
        }
      />

      <div style={{ paddingTop: 'var(--s6)' }}>
        <h3 className="h-section" style={{ marginBottom: 'var(--s3)' }}>
          Limitation groups by variable, quarter and code
        </h3>
        <DataTable
          rows={quality.limitations}
          columns={detailColumns}
          rowKey={(r) => `${r.variable}|${r.period}|${r.limitation_code}`}
          filename="limitation_groups"
          dense
          pageSize={40}
          initialSort={{ key: 'count', dir: 'desc' }}
          caption={
            <>
              The full grouping as shipped:{' '}
              <span className="fig">{quality.limitations.length}</span> groups —{' '}
              <span className="fig">{distinctLimitedVariables}</span> variables across{' '}
              <span className="fig">{metadataQuarters}</span> quarters, the same frame
              as the extraction-unit denominator above.
            </>
          }
        />
      </div>
    </>
  );
}
