/**
 * PANEL 11 — Methodology Inspector
 *
 * The panel was specified around two composite indices: NCR (Nigeria
 * Consumption Ratio) and DEI (Digital Export Index). Neither exists. There are
 * zero occurrences of either term, or of any equivalent computation, anywhere
 * in the code or the documentation. That is stated first and not softened.
 *
 * What the panel does instead is the useful remainder: it takes the four
 * indicators the system actually publishes and renders each as a live formula
 * with the quarter's own numbers substituted in, so the arithmetic can be
 * checked on screen rather than taken on trust:
 *
 *   I    Gross streaming revenue     revenue.json, recomputed from artist rows
 *   II   Gross export revenue        revenue.json, one literal multiplier
 *   III  Employment                  accounts.json, a baseline compounded
 *   IV   Operating costs             accounts.json, a flat per-artist model
 *
 * Two findings are carried at the point of display rather than in a footnote:
 *
 *   · the export-share tautology — export revenue is DEFINED as streaming
 *     × 0.70, so any export share recomputed from it is necessarily 70% and
 *     carries no information whatsoever;
 *   · the shipped delivery's own methodology file marks all four of these
 *     variables "Status: pending_external_methodology — Placeholder only. Do not
 *     treat as observed", while the published CSVs and this console apply
 *     concrete formulas to them.
 *
 * It CANNOT show: NCR, DEI, any index at all, any confidence interval, any
 * effective date on a payout rate, or any sensitivity of the headline figure to
 * its coefficients (no alternative coefficient was ever run).
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useAccounts, useRevenue, formatFigure, formatPeriod } from '../data/client';
import {
  Callout,
  EpistemicChip,
  Figure,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import { DataTable } from '../components/DataTable';
import { CONSTANTS_BY_ID } from '../registry/constants';
import { FIELD_SPECS } from '../registry/epistemic';
import { gapsForPanel } from '../registry/gaps';
import type { Accounts, Epistemic, PeriodTotal, Revenue } from '../data/types';

/* ---------------------------------------------------------- the two indices */

const ABSENT_INDICES: Array<{
  name: string;
  expansion: string;
  gapId: string;
  occurrences: string;
  nearest: string;
  wouldRequire: string;
}> = [
  {
    name: 'NCR',
    expansion: 'Nigeria Consumption Ratio',
    gapId: 'GAP-002',
    occurrences:
      'Zero occurrences of the term, or of any equivalent computation, in code or documentation.',
    nearest:
      'The nearest artifact is the 30% domestic-share constant, which is imposed from outside the data and is not a ratio of anything observed.',
    wouldRequire:
      'Observed consumption inside Nigeria and observed consumption of the same catalogue in total. The first would require listener geography, which was never retrieved; the second would require observed stream counts, which are behind 20 confirmed 401 endpoints.',
  },
  {
    name: 'DEI',
    expansion: 'Digital Export Index',
    gapId: 'GAP-003',
    occurrences: 'Zero occurrences. No index of any kind is computed anywhere in the pipeline.',
    nearest:
      'The nearest artifact is Export Share %, which is tautologically 70.0 on every row because export revenue is itself defined as streaming revenue × 0.70.',
    wouldRequire:
      'At minimum a measured non-domestic share per artist-quarter, an agreed weighting across markets, and a base period. None of the three exists; the first is the same missing listener geography.',
  },
];

/* ------------------------------------- the shipped delivery's own warning */

/**
 * Transcribed verbatim from delivery/02_Methodology/Variable_Methodology.md,
 * which shipped with the delivery. Line numbers verified by direct read.
 */
const SHIPPED_STATUS: Array<{
  variable: string;
  line: number;
  shippedSource: string;
  shippedGeneration: string;
  shippedStatus: string;
  consoleField: string;
}> = [
  {
    variable: 'Gross_Streaming_Revenue_Quarterly',
    line: 113,
    shippedSource: 'Pending approved methodology',
    shippedGeneration: 'Placeholder only. Do not treat as observed.',
    shippedStatus: 'pending_external_methodology',
    consoleField: 'gross_streaming_revenue_usd',
  },
  {
    variable: 'Gross_Export_Revenue_Quarterly',
    line: 99,
    shippedSource: 'Pending approved methodology',
    shippedGeneration: 'Placeholder only. Do not treat as observed.',
    shippedStatus: 'pending_external_methodology',
    consoleField: 'gross_export_revenue_usd',
  },
  {
    variable: 'Employment_Quarterly',
    line: 43,
    shippedSource: 'Pending approved methodology',
    shippedGeneration: 'Placeholder only. Do not treat as observed.',
    shippedStatus: 'pending_external_methodology',
    consoleField: 'total_employment',
  },
  {
    variable: 'Hosting_And_Production_Costs_Quarterly',
    line: 127,
    shippedSource: 'Pending approved methodology',
    shippedGeneration: 'Placeholder only. Do not treat as observed.',
    shippedStatus: 'pending_external_methodology',
    consoleField: 'total_cost_ngn',
  },
];

/* ------------------------------------------------------------------ panel */

export default function MethodologyInspector() {
  const revenue = useRevenue();
  const accounts = useAccounts();

  return (
    <Resolved query={revenue} artifact="revenue.json" label="Reading 638 artist-quarter revenue rows">
      {(rev) => (
        <Resolved query={accounts} artifact="accounts.json" label="Reading the employment and cost accounts">
          {(acc) => <Panel revenue={rev} accounts={acc} />}
        </Resolved>
      )}
    </Resolved>
  );
}

interface QuarterFacts {
  period: string;
  index: number;
  artistRows: number;
  spotify: number;
  youtube: number;
  deezer: number;
  other: number;
  componentSum: number;
  rowGrossSum: number;
  publishedGross: number | null;
  rowExportSum: number;
  publishedExport: number | null;
  publishedDomestic: number | null;
  recomputedExportSharePct: number | null;
  employmentDirect: number | null;
  employmentIndirect: number | null;
  employmentTotal: number | null;
  employmentMale: number | null;
  employmentFemale: number | null;
  costArtists: number | null;
  costTotalNgn: number | null;
  costTotalUsd: number | null;
  costLines: Array<{ category: string; ngn: number | null; usd: number | null; source: string | null }>;
}

function Panel({ revenue, accounts }: { revenue: Revenue; accounts: Accounts }) {
  const periods = revenue.periods;
  const [period, setPeriod] = useState<string>(periods[periods.length - 1] ?? '');

  const facts = useMemo<Record<string, QuarterFacts>>(() => {
    const out: Record<string, QuarterFacts> = {};
    const streamingTotals = new Map<string, PeriodTotal>(
      revenue.streaming_totals.map((t) => [t.period, t] as [string, PeriodTotal]),
    );
    const exportTotals = new Map<string, PeriodTotal>(
      revenue.export_totals.map((t) => [t.period, t] as [string, PeriodTotal]),
    );

    periods.forEach((p, i) => {
      const rows = revenue.rows.filter((r) => r.period === p);
      const sum = (pick: (r: (typeof rows)[number]) => number | null) =>
        rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);

      const spotify = sum((r) => r.spotify_revenue_usd);
      const youtube = sum((r) => r.youtube_revenue_usd);
      const deezer = sum((r) => r.deezer_revenue_usd);
      const other = sum((r) => r.other_platforms_revenue_usd);
      const rowGrossSum = sum((r) => r.gross_streaming_revenue_usd);
      const rowExportSum = sum((r) => r.gross_export_revenue_usd);

      const st = streamingTotals.get(p);
      const xt = exportTotals.get(p);
      const publishedGross =
        typeof st?.gross_streaming_revenue_usd === 'number' ? st.gross_streaming_revenue_usd : null;
      const publishedExport =
        typeof xt?.gross_export_revenue_usd === 'number' ? xt.gross_export_revenue_usd : null;
      const publishedDomestic =
        typeof xt?.domestic_revenue_usd === 'number' ? xt.domestic_revenue_usd : null;

      const emp = accounts.employment.filter((e) => e.period === p);
      const pick = (needle: string) =>
        emp.find((e) => (e.category ?? '').toLowerCase().includes(needle)) ?? null;
      const direct = pick('direct employment');
      const indirect = pick('indirect employment');
      const total = emp.find((e) => (e.category ?? '').toUpperCase().includes('TOTAL')) ?? null;

      const costs = accounts.costs.filter((c) => c.period === p);
      const costTotal = costs.find((c) => (c.cost_category ?? '').includes('TOTAL')) ?? null;
      const costLines = costs
        .filter((c) => !(c.cost_category ?? '').includes('TOTAL'))
        .map((c) => ({
          category: c.cost_category ?? 'uncategorised',
          ngn: c.total_cost_ngn,
          usd: c.total_cost_usd,
          source: c.source,
        }));

      out[p] = {
        period: p,
        index: i,
        artistRows: rows.length,
        spotify,
        youtube,
        deezer,
        other,
        componentSum: spotify + youtube + deezer + other,
        rowGrossSum,
        publishedGross,
        rowExportSum,
        publishedExport,
        publishedDomestic,
        recomputedExportSharePct: rowGrossSum > 0 ? (rowExportSum / rowGrossSum) * 100 : null,
        employmentDirect: direct?.total_employment ?? null,
        employmentIndirect: indirect?.total_employment ?? null,
        employmentTotal: total?.total_employment ?? null,
        employmentMale: total?.male ?? null,
        employmentFemale: total?.female ?? null,
        costArtists: costTotal?.num_artists ?? null,
        costTotalNgn: costTotal?.total_cost_ngn ?? null,
        costTotalUsd: costTotal?.total_cost_usd ?? null,
        costLines,
      };
    });
    return out;
  }, [revenue, accounts, periods]);

  const q = facts[period];

  /* Zero temporal variance in the cost model is a finding, so it is measured
     rather than asserted: count the distinct period totals across all quarters. */
  const distinctCostTotals = useMemo(
    () =>
      new Set(
        periods
          .map((p) => facts[p]?.costTotalNgn)
          .filter((v): v is number => typeof v === 'number'),
      ).size,
    [facts, periods],
  );

  const gaps = gapsForPanel(11);

  if (!q) {
    return (
      <Section title="Methodology inspector">
        <Callout status="rejected" title="No quarter could be selected">
          revenue.json declared no periods, so no formula can be substituted.
        </Callout>
      </Section>
    );
  }

  return (
    <>
      <Section
        title="Neither index exists"
        subtitle="The panel was specified around two composite indices. Both were checked for by name and by computation. Neither is present in any form, under any name, anywhere in the codebase or the documentation."
      >
        <Callout status="unavailable" title="NCR and DEI are not implemented" gapId="GAP-002">
          There is no partial implementation, no stub and no superseded version. Nothing below is an
          approximation of either index — the four formulas on this page are the indicators the
          system actually publishes, and they are different things. Presenting the 30% domestic share
          as an NCR, or the 70% export share as a DEI, would be the single most misleading thing this
          console could do.
        </Callout>

        {ABSENT_INDICES.map((ix) => (
          <div
            key={ix.name}
            data-epi="unavailable"
            className="rule-bh"
            style={{ padding: 'var(--s3) 0', maxWidth: '82ch' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
              <strong className="h-title" style={{ fontSize: 'var(--t-section)' }}>
                {ix.name}
              </strong>
              <span style={{ color: 'var(--ink-3)' }}>{ix.expansion}</span>
              <EpistemicChip status="unavailable" title="Not implemented in any form." />
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
                {ix.gapId}
              </code>
            </div>
            <dl style={{ margin: '0.4rem 0 0' }}>
              <SmallRow k="Occurrences" v={ix.occurrences} />
              <SmallRow k="Nearest artifact" v={ix.nearest} />
              <SmallRow k="Would require" v={ix.wouldRequire} />
              <SmallRow k="Value" v={<NotCollected reason="The index is not computed." gapId={ix.gapId} />} />
            </dl>
          </div>
        ))}
      </Section>

      <Section
        title="The four indicators that do exist"
        subtitle="Each formula below is rendered twice — once in symbols, once with this quarter's own numbers substituted — and then checked against the value the artifact actually publishes. The residual is shown, not suppressed."
        actions={
          <div style={{ display: 'flex', gap: 'var(--s1)', flexWrap: 'wrap' }}>
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                className="btn"
                aria-pressed={p === period}
                onClick={() => setPeriod(p)}
              >
                {formatPeriod(p)}
              </button>
            ))}
          </div>
        }
      >
        <p className="lede" style={{ marginTop: 0 }}>
          Substituted for <strong>{formatPeriod(q.period)}</strong>, over{' '}
          <strong className="fig">{q.artistRows}</strong> artist rows.
        </p>

        {/* ---------------------------------------------------------- I */}
        <Formula
          numeral="I"
          name="Gross streaming revenue"
          status="estimated"
          symbolic={`GSR_q  =  Σ_artists [ (L × 3.5 × 3 × $0.004) + (V × $0.004) + (F × 2.0 × 3 × $0.004) + (0.30 × Spotify) ]`}
          legend={[
            ['L', 'Spotify monthly listeners — observed', 'observed'],
            ['V', 'YouTube views — observed on 212 rows, subscribers × 45 on 426', 'estimated'],
            ['F', 'Deezer fans — observed', 'observed'],
            ['0.30 × Spotify', '“other platforms”, attributed to platforms never queried', 'assumed'],
          ]}
          terms={[
            { label: 'Spotify revenue', value: q.spotify, status: 'estimated' },
            { label: 'YouTube revenue', value: q.youtube, status: 'estimated' },
            { label: 'Deezer revenue', value: q.deezer, status: 'estimated' },
            { label: 'Other platforms', value: q.other, status: 'assumed' },
          ]}
          operator="+"
          result={{ label: 'Recomputed from artist rows', value: q.componentSum, status: 'estimated' }}
          check={{
            label: 'Published period total (revenue.json → streaming_totals)',
            value: q.publishedGross,
            residual: q.publishedGross === null ? null : q.componentSum - q.publishedGross,
            note:
              'The residual is float rounding: every component is stored to two decimals on each of the artist rows and summed here, while the published total was computed before rounding.',
          }}
          constants={['streams-per-listener', 'rate-spotify', 'rate-youtube', 'rate-deezer', 'other-platforms']}
          warning="No observed stream count enters this figure at any point. Every stream is monthly listeners × 3.5 × 3, and all 20 track-level stream endpoints are confirmed 401. The same $0.004 rate is applied to Spotify streams, YouTube views and Deezer streams, although the published rate card states three different rates."
          warningGapId="GAP-006"
        />

        {/* --------------------------------------------------------- II */}
        <Formula
          numeral="II"
          name="Gross export revenue"
          status="estimated"
          symbolic={`GXR_q  =  GSR_q × 0.70          DOM_q  =  GSR_q × 0.30`}
          legend={[
            ['0.70', 'export share — a literal, attributed to “WIPO 2025 methodology” by title only', 'assumed'],
            ['0.30', 'domestic share — a separate literal in a different file', 'assumed'],
          ]}
          terms={[
            { label: 'Gross streaming revenue (from I)', value: q.rowGrossSum, status: 'estimated' },
            { label: '× export share 0.70', value: 0.7, status: 'assumed', unit: 'ratio', precision: 2 },
          ]}
          operator="×"
          result={{ label: 'Gross export revenue', value: q.rowGrossSum * 0.7, status: 'estimated' }}
          check={{
            label: 'Published period total (revenue.json → export_totals)',
            value: q.publishedExport,
            residual: q.publishedExport === null ? null : q.rowGrossSum * 0.7 - q.publishedExport,
            note: 'Row-level two-decimal rounding again. The multiplier itself reproduces exactly.',
          }}
          constants={['export-share', 'domestic-share']}
          warning="0.70 is written as a literal, not as 1 − domestic share, and the two constants live in different files (nbs_extract_new_artists.py:244 and nbs_extract_full.py:54). They happen to sum to 1.00; nothing in the code enforces that they do."
          warningGapId="GAP-039"
          extra={
            <dl style={{ margin: 0, paddingTop: 'var(--s2)' }}>
              <SmallRow
                k="Domestic revenue"
                v={
                  <>
                    <Figure value={q.rowGrossSum * 0.3} unit="usd" precision={2} status="estimated" />
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      · published{' '}
                      {q.publishedDomestic === null ? (
                        <NotCollected short />
                      ) : (
                        <Figure value={q.publishedDomestic} unit="usd" precision={2} status="estimated" />
                      )}
                    </span>
                  </>
                }
              />
            </dl>
          }
        />

        {/* -------------------------------------------------------- III */}
        <Formula
          numeral="III"
          name="Employment"
          status="allocated"
          symbolic={`E_q  =  300,000 × 1.02^k  +  1,000,000 × 1.02^k          k = ${q.index}   (quarters since ${formatPeriod(periods[0] ?? '')})`}
          legend={[
            ['300,000', 'direct employment baseline — US ITA Nigeria Commercial Guide 2024, cited with URL', 'allocated'],
            ['1,000,000', 'indirect employment baseline — same source', 'allocated'],
            ['1.02', 'quarter-on-quarter growth — unsourced; the delivery self-flags it as gap G8', 'assumed'],
            ['0.62 / 0.38', 'male / female split — UNESCO 2023, title only, applied identically to both buckets', 'allocated'],
          ]}
          terms={[
            {
              label: `Direct  300,000 × 1.02^${q.index}`,
              value: Math.round(300000 * 1.02 ** q.index),
              status: 'allocated',
              unit: 'count',
            },
            {
              label: `Indirect  1,000,000 × 1.02^${q.index}`,
              value: Math.round(1000000 * 1.02 ** q.index),
              status: 'allocated',
              unit: 'count',
            },
          ]}
          operator="+"
          result={{
            label: 'Total music industry employment',
            value: Math.round(300000 * 1.02 ** q.index) + Math.round(1000000 * 1.02 ** q.index),
            status: 'allocated',
            unit: 'count',
          }}
          check={{
            label: 'Published (accounts.json → employment, TOTAL MUSIC INDUSTRY)',
            value: q.employmentTotal,
            residual:
              q.employmentTotal === null
                ? null
                : Math.round(300000 * 1.02 ** q.index) +
                  Math.round(1000000 * 1.02 ** q.index) -
                  q.employmentTotal,
            unit: 'count',
            note:
              'The reconstruction from the constants register reproduces the published series exactly, in every quarter. That is the point: the entire employment series is two baselines and one growth constant, and contains no observation of the Nigerian music sector at all.',
          }}
          constants={['employment-direct', 'employment-indirect', 'employment-growth', 'gender-split']}
          warning="Not attributable to the 130 artists, or to any artist. This is a national baseline compounded by a constant, published quarterly, and it moves only because 1.02 moves it."
          warningGapId="GAP-019"
          extra={
            <dl style={{ margin: 0, paddingTop: 'var(--s2)' }}>
              <SmallRow
                k="Male  E × 0.62"
                v={
                  <>
                    <Figure value={q.employmentMale} field="male" row={null} unit="count" />
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      · reconstruction{' '}
                      {q.employmentTotal === null ? (
                        <NotCollected short />
                      ) : (
                        <Figure value={Math.round(q.employmentTotal * 0.62)} unit="count" status="allocated" />
                      )}
                    </span>
                  </>
                }
              />
              <SmallRow
                k="Female  E × 0.38"
                v={
                  <>
                    <Figure value={q.employmentFemale} field="female" row={null} unit="count" />
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      · reconstruction{' '}
                      {q.employmentTotal === null ? (
                        <NotCollected short />
                      ) : (
                        <Figure value={Math.round(q.employmentTotal * 0.38)} unit="count" status="allocated" />
                      )}
                    </span>
                  </>
                }
              />
            </dl>
          }
        />

        {/* --------------------------------------------------------- IV */}
        <Formula
          numeral="IV"
          name="Operating costs"
          status="allocated"
          symbolic={`C_q  =  N × 2 × (₦750,000 + ₦15,000 + ₦250,000)  +  N × ₦50,000          N = ${
            q.costArtists === null ? 'NOT COLLECTED' : q.costArtists.toLocaleString('en-US')
          }`}
          legend={[
            ['N', 'artist count used by the cost model', 'allocated'],
            ['2', 'tracks per artist per quarter — no justification recorded', 'assumed'],
            ['₦750,000', 'production per track — NigerianInformer 2025, quoted range ₦100K–₦2M', 'allocated'],
            ['₦15,000', 'distribution per release', 'allocated'],
            ['₦250,000', 'promotion per track', 'allocated'],
            ['₦50,000', 'hosting per artist per quarter — multiplied by N only, NOT by tracks', 'assumed'],
          ]}
          terms={q.costLines.map((l) => ({
            label: l.category,
            value: l.ngn,
            status: 'allocated' as Epistemic,
            unit: 'ngn' as const,
          }))}
          operator="+"
          result={{
            label: 'Period total',
            value: q.costLines.reduce((a, l) => a + (l.ngn ?? 0), 0),
            status: 'allocated',
            unit: 'ngn',
          }}
          check={{
            label: 'Published (accounts.json → costs, PERIOD TOTAL)',
            value: q.costTotalNgn,
            residual:
              q.costTotalNgn === null
                ? null
                : q.costLines.reduce((a, l) => a + (l.ngn ?? 0), 0) - q.costTotalNgn,
            unit: 'ngn',
            note: `USD is this figure divided by the ₦1,500 fixed rate — published as ${
              formatFigure(q.costTotalUsd, { unit: 'usd', precision: 2 }) ?? 'NOT COLLECTED'
            }. Across all ${periods.length} quarters the cost model produces ${distinctCostTotals} distinct period total${
              distinctCostTotals === 1 ? '' : 's'
            }: the model has zero temporal variance because nothing in it varies with time.`,
          }}
          constants={['cost-production', 'cost-hosting', 'tracks-per-artist', 'fx-usd-ngn']}
          warning="This is not an allocation. Nothing is apportioned to a platform, an artist or a period — it is a flat per-artist model, evaluated once and repeated. Because no cost is allocated, no net figure can exist, so operating surplus cannot be computed for any unit."
          warningGapId="GAP-022"
        />
      </Section>

      <Section
        title="The export-share tautology"
        subtitle="Export revenue is defined as gross streaming revenue × 0.70. Any export share recomputed from the published export figure therefore returns 0.70, in every quarter, for every artist, by construction. It measures the constant, not the economy."
      >
        <Callout status="assumed" title="Export share % carries no information" gapId="GAP-003">
          The column labelled <code style={{ fontFamily: 'var(--font-mono)' }}>export_share_pct</code>{' '}
          is not a finding about Nigerian music. It is the multiplier read back out of its own
          product. A reader who sees 70% moving in step across five quarters is seeing a literal, and
          any index built on top of it — a DEI, for instance — would inherit that emptiness whole.
        </Callout>

        <DataTable
          rows={periods.map((p) => facts[p]).filter((f): f is QuarterFacts => Boolean(f))}
          rowKey={(r) => r.period}
          pageSize={null}
          filename="panel-11-export-share-tautology"
          caption="Export share recomputed from the published figures, quarter by quarter."
          columns={[
            { key: 'period', header: 'Quarter', value: (r) => r.period, render: (r) => formatPeriod(r.period) },
            {
              key: 'gross',
              header: 'Gross streaming (USD)',
              value: (r) => r.rowGrossSum,
              numeric: true,
              render: (r) => <Figure value={r.rowGrossSum} unit="usd" precision={2} status="estimated" />,
            },
            {
              key: 'export',
              header: 'Gross export (USD)',
              value: (r) => r.rowExportSum,
              numeric: true,
              render: (r) => <Figure value={r.rowExportSum} unit="usd" precision={2} status="estimated" />,
            },
            {
              key: 'recomputed',
              header: 'Export ÷ streaming',
              value: (r) => r.recomputedExportSharePct,
              numeric: true,
              render: (r) => (
                <Figure
                  value={r.recomputedExportSharePct}
                  unit="pct"
                  precision={4}
                  status="assumed"
                  keyline
                  label="Recomputed export share"
                />
              ),
              note: 'Recomputed on load from the two columns to its left. It cannot differ from the constant.',
            },
            {
              key: 'constant',
              header: 'Constant applied',
              value: () => 70,
              numeric: true,
              render: () => <Figure value={70} field="export_share_pct" unit="pct" />,
            },
            {
              key: 'information',
              header: 'Information content',
              value: () => 'none',
              render: () => (
                <EpistemicChip status="assumed" title="The recomputation returns the input constant." />
              ),
            },
          ]}
        />
      </Section>

      <Section
        title="The shipped delivery carried its own warning"
        subtitle="Variable_Methodology.md was written by this system, shipped inside the delivery, and marks all four of the indicators above as placeholders that must not be treated as observed. The published CSVs — and this console — nonetheless apply concrete formulas to them."
      >
        <Callout status="rejected" title="Status divergence between the shipped methodology file and the shipped data" gapId="GAP-040">
          This is not an external criticism. It is a contradiction internal to the delivery: the same
          package contains a methodology file saying “Do not treat as observed” and a set of
          workbooks presenting the same four variables as quarterly economic indicators. The
          delivery's own presentation deck records it as gap G1 and leaves it open.
        </Callout>

        <DataTable
          rows={SHIPPED_STATUS}
          rowKey={(r) => r.variable}
          pageSize={null}
          filename="panel-11-methodology-status-divergence"
          caption="delivery/02_Methodology/Variable_Methodology.md, transcribed verbatim, against the status this console assigns."
          columns={[
            {
              key: 'variable',
              header: 'Variable',
              value: (r) => r.variable,
              width: '20rem',
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.variable}
                </span>
              ),
            },
            { key: 'source', header: 'Shipped “Source”', value: (r) => r.shippedSource },
            { key: 'generation', header: 'Shipped “Generation”', value: (r) => r.shippedGeneration },
            {
              key: 'status',
              header: 'Shipped “Status”',
              value: (r) => r.shippedStatus,
              render: (r) => (
                <span
                  className="epi-chip"
                  data-epi="unavailable"
                  title="The status recorded in the shipped methodology file."
                  style={{ textTransform: 'none', letterSpacing: 0 }}
                >
                  {r.shippedStatus}
                </span>
              ),
            },
            {
              key: 'console',
              header: 'This console',
              value: (r) => FIELD_SPECS[r.consoleField]?.epistemic ?? 'derived',
              render: (r) => {
                const spec = FIELD_SPECS[r.consoleField];
                return spec ? (
                  <EpistemicChip status={spec.epistemic} />
                ) : (
                  <NotCollected short />
                );
              },
              note: 'Assigned from the epistemic register as presentation metadata. Never written back into the data.',
            },
            {
              key: 'line',
              header: 'Line',
              value: (r) => r.line,
              numeric: true,
              render: (r) => <span className="fig">{r.line}</span>,
              optional: true,
            },
          ]}
        />
      </Section>

      <Section title="Gap register" subtitle="The register entries that govern this panel.">
        {gaps.map((g) => (
          <div key={g.id} style={{ paddingBottom: 'var(--s3)' }}>
            <Callout
              status={g.status === 'INCONSISTENT' ? 'rejected' : 'unavailable'}
              title={g.requirement}
              gapId={g.id}
            >
              <dl style={{ margin: 0 }}>
                <SmallRow k="Status" v={`${g.status} · ${g.severity}`} />
                <SmallRow k="Evidence" v={g.evidence} />
                <SmallRow k="Remedy" v={g.remedy} />
              </dl>
            </Callout>
          </div>
        ))}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------- components */

interface Term {
  label: string;
  value: number | null;
  status: Epistemic;
  unit?: 'usd' | 'ngn' | 'count' | 'pct' | 'ratio';
  precision?: number;
}

function Formula({
  numeral,
  name,
  status,
  symbolic,
  legend,
  terms,
  operator,
  result,
  check,
  constants,
  warning,
  warningGapId,
  extra,
}: {
  numeral: string;
  name: string;
  status: Epistemic;
  symbolic: string;
  legend: Array<[string, string, Epistemic]>;
  terms: Term[];
  operator: string;
  result: Term;
  check: {
    label: string;
    value: number | null;
    residual: number | null;
    unit?: 'usd' | 'ngn' | 'count';
    note?: string;
  };
  constants: string[];
  warning: string;
  warningGapId?: string;
  extra?: ReactNode;
}) {
  const unit = result.unit ?? 'usd';
  const precision = result.precision ?? (unit === 'usd' ? 2 : 0);

  /* The substituted arithmetic, written out as a single checkable line. */
  const arithmetic = terms
    .map((t) =>
      formatFigure(t.value, {
        precision: t.precision ?? (t.unit === 'ratio' ? 2 : t.unit === 'usd' || unit === 'usd' ? 2 : 0),
        unit: t.unit === 'ratio' ? undefined : t.unit ?? (unit === 'usd' ? 'usd' : unit),
      }) ?? 'NOT COLLECTED',
    )
    .join(`  ${operator}  `);

  return (
    <article
      data-epi={status}
      style={{
        borderTop: '2px solid var(--rule-heavy)',
        marginTop: 'var(--s6)',
        paddingTop: 'var(--s3)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
        <span className="fig" style={{ color: 'var(--ink-4)', fontSize: 'var(--t-title)' }}>
          {numeral}
        </span>
        <h3 className="h-title" style={{ fontSize: 'var(--t-section)' }}>
          {name}
        </h3>
        <EpistemicChip status={status} />
      </header>

      {/* symbols */}
      <pre
        className="fig"
        style={{
          margin: 'var(--s3) 0 0',
          padding: 'var(--s3) var(--s4)',
          background: 'var(--paper-sunk)',
          border: '1px solid var(--rule-hair)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--t-small)',
          lineHeight: 1.6,
          overflowX: 'auto',
          color: 'var(--ink)',
        }}
      >
        {symbolic}
      </pre>

      <ul
        style={{
          listStyle: 'none',
          margin: 'var(--s2) 0 0',
          padding: 0,
          display: 'grid',
          gap: '0.15rem',
        }}
      >
        {legend.map(([sym, meaning, epi]) => (
          <li
            key={sym}
            data-epi={epi}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(7rem, 11rem) 1fr',
              gap: 'var(--s3)',
              alignItems: 'baseline',
              fontSize: 'var(--t-small)',
            }}
          >
            <code
              className="fig"
              style={{ color: 'var(--epi)', fontSize: 'var(--t-small)' }}
            >
              {sym}
            </code>
            <span style={{ color: 'var(--ink-2)' }}>{meaning}</span>
          </li>
        ))}
      </ul>

      {/* substitution */}
      <div className="h-section" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
        Substituted
      </div>
      <table className="tbl tbl--dense" style={{ maxWidth: '46rem' }}>
        <tbody>
          {terms.map((t) => (
            <tr key={t.label}>
              <td style={{ color: 'var(--ink-2)' }}>{t.label}</td>
              <td className="num-col" style={{ width: '13rem' }}>
                <Figure
                  value={t.value}
                  status={t.status}
                  unit={t.unit === 'ratio' ? undefined : t.unit ?? unit}
                  precision={t.precision ?? (t.unit === 'ratio' ? 2 : precision)}
                  keyline
                  label={t.label}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ color: 'var(--ink)' }}>{result.label}</td>
            <td className="num-col">
              <Figure
                value={result.value}
                status={result.status}
                unit={unit}
                precision={precision}
                keyline
                label={result.label}
              />
            </td>
          </tr>
        </tfoot>
      </table>

      <pre
        className="fig"
        aria-label={`${name}: the substituted arithmetic`}
        style={{
          margin: 'var(--s2) 0 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--t-small)',
          color: 'var(--ink-3)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {arithmetic}
        {'  =  '}
        {formatFigure(result.value, { precision, unit }) ?? 'NOT COLLECTED'}
      </pre>

      {extra}

      {/* check */}
      <div style={{ marginTop: 'var(--s3)', borderLeft: '2px solid var(--rule)', padding: '0 var(--s3)' }}>
        <div className="h-section">Check against the artifact</div>
        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span>
            <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{check.label}: </span>
            {check.value === null ? (
              <NotCollected />
            ) : (
              <Figure
                value={check.value}
                status={status}
                unit={check.unit ?? unit}
                precision={check.unit === 'count' || unit === 'count' || unit === 'ngn' ? 0 : precision}
                label={check.label}
              />
            )}
          </span>
          <span>
            <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>Residual: </span>
            {check.residual === null ? (
              <NotCollected short />
            ) : (
              <Figure
                value={check.residual}
                status="derived"
                unit={check.unit ?? unit}
                precision={check.unit === 'count' || unit === 'count' || unit === 'ngn' ? 0 : precision}
                label="Recomputed minus published"
              />
            )}
          </span>
        </div>
        {check.note ? (
          <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-2)', maxWidth: '78ch' }}>{check.note}</p>
        ) : null}
      </div>

      {/* constants and warning */}
      <div style={{ paddingTop: 'var(--s3)' }}>
        <div className="h-section" style={{ marginBottom: 'var(--s1)' }}>
          Coefficients entering this formula
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {constants.map((id) => {
            const c = CONSTANTS_BY_ID[id];
            if (!c) return null;
            const unsourced = c.justification === 'absent' || c.justification === 'self-declared-unsourced';
            return (
              <li
                key={id}
                className="rule-bh"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(12rem, 18rem) minmax(6rem, 10rem) 1fr',
                  gap: 'var(--s3)',
                  padding: '0.25rem 0',
                  alignItems: 'baseline',
                  fontSize: 'var(--t-small)',
                }}
              >
                <span>{c.concept}</span>
                <span className="fig" data-epi="assumed" style={{ color: 'var(--epi)' }}>
                  {c.value}
                  {c.unit ? <span style={{ color: 'var(--ink-3)' }}> {c.unit}</span> : null}
                </span>
                <span style={{ color: 'var(--ink-3)' }}>
                  {unsourced ? (
                    <strong style={{ color: 'var(--asm)' }}>Unsourced. </strong>
                  ) : null}
                  {c.justificationText ?? 'No justification is recorded in the code.'}
                  {c.divergence ? (
                    <span style={{ display: 'block', color: 'var(--rej)' }}>Divergence: {c.divergence}</span>
                  ) : null}
                  {c.falseProvenance ? (
                    <span style={{ display: 'block', color: 'var(--rej)' }}>
                      False provenance: {c.falseProvenance}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <Callout status={status} title="Read this before using the figure" gapId={warningGapId}>
        {warning}
      </Callout>
    </article>
  );
}

function SmallRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(8rem, 11rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.15rem 0',
        alignItems: 'baseline',
      }}
    >
      <dt
        style={{
          color: 'var(--ink-3)',
          fontSize: 'var(--t-micro)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        {k}
      </dt>
      <dd style={{ margin: 0, maxWidth: '78ch' }}>{v}</dd>
    </div>
  );
}
