/**
 * PANEL 6 — Platform Revenue
 *
 * What this panel renders, from revenue.json and accounts.json:
 *   · gross streaming revenue for each of the five quarters that carry revenue
 *   · its decomposition across Spotify, YouTube, Deezer and “other platforms”
 *   · the per-stream payout rate the code actually applied, beside the rate the
 *     published rate card claims — one inlined literal against three documented
 *     values
 *   · the full per-artist per-platform table for the selected quarter
 *   · the flat operating-cost model and the fact that it does not vary at all
 *
 * What this panel cannot render, and says so at the point of display:
 *   · a payout-rate effective date. No rate table exists on any model; the value
 *     is a literal at the call site (GAP-021).
 *   · operating cost allocated to a platform. Cost is a flat artist-count model
 *     apportioned to nothing (GAP-022).
 *   · net revenue. Net is gross minus allocated cost, and the allocation does
 *     not exist, so the subtraction has no second operand.
 *   · a Deezer stream volume. The intermediate stream count the Deezer revenue
 *     figure is built from is discarded and written to no artifact.
 *   · any volume at all for “other platforms”. Apple Music, Audiomack, Boomplay
 *     and Tidal were never called.
 *
 * Nothing on this page is an observed stream. All 20 track-level stream
 * endpoints are confirmed 401 (GAP-006); every stream figure here is a
 * coefficient applied to an audience count.
 */

import { useMemo, useState } from 'react';
import {
  comparePeriods,
  formatFigure,
  formatPeriod,
  useAccounts,
  useRevenue,
} from '../data/client';
import {
  Callout,
  EpistemicChip,
  Figure,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import { CONSTANTS_BY_ID } from '../registry/constants';
import { gapsForPanel } from '../registry/gaps';
import type { Accounts, CostRow, Epistemic, Revenue, RevenueRow } from '../data/types';

/** The master artist list. Revenue rows never reach it — see GAP-033. */
const ARTIST_UNIVERSE = 131;

/** The pseudo-row the cost artifact embeds inside its own data. */
const COST_TOTAL_CATEGORY = '=== PERIOD TOTAL ===';

const PERIOD_TOTAL_FIELDS = [
  'gross_streaming_revenue_usd',
  'gross_streaming_revenue_ngn',
] as const;

function num(v: number | string | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------- platforms */

interface PlatformDef {
  key: 'spotify' | 'youtube' | 'deezer' | 'other';
  name: string;
  /** epistemic class of the revenue figure this platform contributes */
  epistemic: Epistemic;
  revenueField: string;
  /** the rate the code applies, verified against the shipped rows */
  rateApplied: number | null;
  rateConstantId: string;
  /** the rate the published rate card states, where it differs */
  publishedRate: number | null;
  publishedNote: string;
  volumeLabel: string;
  volumeUnit: string;
  volumeDerivation: string;
}

/**
 * Rates are transcribed from the constants register (rate-spotify, rate-youtube,
 * rate-deezer) and independently confirmed against the shipped rows: YouTube
 * revenue ÷ YouTube views is exactly 0.004 on all 638 rows, and Spotify revenue
 * ÷ estimated streams is 0.004 to the limit of per-row cent rounding.
 */
const PLATFORMS: PlatformDef[] = [
  {
    key: 'spotify',
    name: 'Spotify',
    epistemic: 'estimated',
    revenueField: 'spotify_revenue_usd',
    rateApplied: 0.004,
    rateConstantId: 'rate-spotify',
    publishedRate: null,
    publishedNote:
      'The constants register records no separate published rate for Spotify. Code and rate card do not diverge here.',
    volumeLabel: 'Estimated quarterly streams',
    volumeUnit: 'streams',
    volumeDerivation: 'monthly listeners × 3.5 streams/listener/month × 3 months',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    epistemic: 'estimated',
    revenueField: 'youtube_revenue_usd',
    rateApplied: 0.004,
    rateConstantId: 'rate-youtube',
    publishedRate: 0.0071,
    publishedNote:
      'The published rate card states $0.0071 per view. No code path applies it — every YouTube figure in the delivery used $0.004.',
    volumeLabel: 'Views',
    volumeUnit: 'views',
    volumeDerivation:
      'returned where the call succeeded; elsewhere subscribers × 15 views/sub/month × 3 months',
  },
  {
    key: 'deezer',
    name: 'Deezer',
    epistemic: 'estimated',
    revenueField: 'deezer_revenue_usd',
    rateApplied: 0.004,
    rateConstantId: 'rate-deezer',
    publishedRate: 0.0046,
    publishedNote:
      'The published rate card states $0.0046 per stream. Applied by no code path.',
    volumeLabel: 'Estimated quarterly streams',
    volumeUnit: 'streams',
    volumeDerivation: 'fans × 2.0 streams/fan/month × 3 months — the result is never written',
  },
  {
    key: 'other',
    name: 'Other platforms',
    epistemic: 'assumed',
    revenueField: 'other_platforms_revenue_usd',
    rateApplied: null,
    rateConstantId: 'other-platforms',
    publishedRate: null,
    publishedNote:
      'The rate card carries Apple Music at $0.007–0.01 and Tidal at $0.013. Neither is applied to anything: both are folded into a flat multiplier on Spotify revenue.',
    volumeLabel: 'Volume',
    volumeUnit: '—',
    volumeDerivation: 'Spotify revenue × 0.30. No platform in this bucket was ever queried.',
  },
];

interface PlatformFigures extends PlatformDef {
  gross: number | null;
  share: number | null;
  volume: number | null;
  volumeStatus: Epistemic;
  /** YouTube only: the split between returned and synthesised view volume */
  volumeSplit: { observed: number; estimated: number; rowsObserved: number; rowsEstimated: number } | null;
  grossAtCardRate: number | null;
}

/* ------------------------------------------------------------------ panel */

export default function PlatformRevenue() {
  const revenue = useRevenue();
  const accounts = useAccounts();

  return (
    <Resolved query={revenue} artifact="revenue.json" label="Reading 638 artist-quarter revenue rows">
      {(rev) => (
        <Resolved query={accounts} artifact="accounts.json" label="Reading the cost model">
          {(acc) => <Body rev={rev} acc={acc} />}
        </Resolved>
      )}
    </Resolved>
  );
}

function Body({ rev, acc }: { rev: Revenue; acc: Accounts }) {
  const periods = useMemo(() => [...rev.periods].sort(comparePeriods), [rev.periods]);
  const [period, setPeriod] = useState<string>(() => periods[periods.length - 1] ?? 'Q1_2026');

  const rows = useMemo(
    () => rev.rows.filter((r) => r.period === period),
    [rev.rows, period],
  );

  const published = useMemo(() => {
    const t = rev.streaming_totals.find((x) => x.period === period);
    return {
      usd: t ? num(t[PERIOD_TOTAL_FIELDS[0]]) : null,
      ngn: t ? num(t[PERIOD_TOTAL_FIELDS[1]]) : null,
    };
  }, [rev.streaming_totals, period]);

  const platforms = useMemo<PlatformFigures[]>(() => {
    const sum = (k: keyof RevenueRow): number | null => {
      const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number');
      return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
    };
    const grossAll = sum('gross_streaming_revenue_usd');

    return PLATFORMS.map((p) => {
      const gross = sum(p.revenueField as keyof RevenueRow);

      let volume: number | null = null;
      let volumeSplit: PlatformFigures['volumeSplit'] = null;

      if (p.key === 'spotify') {
        volume = sum('est_spotify_quarterly_streams');
      } else if (p.key === 'youtube') {
        volume = sum('youtube_actual_views');
        const observed = rows
          .filter((r) => r.youtube_views_source === 'actual')
          .reduce((a, r) => a + (r.youtube_actual_views ?? 0), 0);
        const estimated = rows
          .filter((r) => r.youtube_views_source === 'estimated')
          .reduce((a, r) => a + (r.youtube_actual_views ?? 0), 0);
        volumeSplit = {
          observed,
          estimated,
          rowsObserved: rows.filter((r) => r.youtube_views_source === 'actual').length,
          rowsEstimated: rows.filter((r) => r.youtube_views_source === 'estimated').length,
        };
      }
      // Deezer and "other platforms" have no volume in any artifact.

      return {
        ...p,
        gross,
        share: gross !== null && grossAll ? (gross / grossAll) * 100 : null,
        volume,
        // Every volume on this page is a conversion applied to an audience
        // count. The YouTube column is part-returned, and says so in volumeSplit.
        volumeStatus: 'estimated' as Epistemic,
        volumeSplit,
        grossAtCardRate:
          gross !== null && p.publishedRate !== null && p.rateApplied
            ? gross * (p.publishedRate / p.rateApplied)
            : null,
      };
    });
  }, [rows]);

  const componentSum = useMemo(
    () => platforms.reduce((a, p) => a + (p.gross ?? 0), 0),
    [platforms],
  );
  const residual = published.usd !== null ? componentSum - published.usd : null;

  const costs = useMemo(
    () => acc.costs.filter((c) => c.cost_category !== COST_TOTAL_CATEGORY),
    [acc.costs],
  );
  const costTotalsByPeriod = useMemo(
    () => acc.costs.filter((c) => c.cost_category === COST_TOTAL_CATEGORY),
    [acc.costs],
  );
  const costForPeriod = costTotalsByPeriod.find((c) => c.period === period) ?? null;

  /** How many distinct NGN values each cost line takes across the five quarters. */
  const costVariance = useMemo(() => {
    const byCategory = new Map<string, Set<number>>();
    for (const c of costs) {
      const key = c.cost_category ?? 'unnamed';
      if (c.total_cost_ngn === null) continue;
      const set = byCategory.get(key) ?? new Set<number>();
      set.add(c.total_cost_ngn);
      byCategory.set(key, set);
    }
    const categories = [...byCategory.keys()];
    const varying = categories.filter((k) => (byCategory.get(k)?.size ?? 0) > 1);
    return { categories: categories.length, varying: varying.length };
  }, [costs]);

  const ytObservedRows = rows.filter((r) => r.youtube_views_source === 'actual').length;
  const ytEstimatedRows = rows.filter((r) => r.youtube_views_source === 'estimated').length;

  const platformCols = useMemo(() => platformColumns(period), [period]);

  return (
    <>
      {/* ------------------------------------------------------ quarter */}
      <Section
        title="Quarter"
        subtitle={
          <>
            Revenue exists for <strong className="fig">{periods.length}</strong> quarters — the
            observation archive carries nine, but only these five were ever converted into money.
            Every figure below is an estimate or an assumption; no observed stream count exists
            anywhere in the system.
          </>
        }
        actions={
          <div role="group" aria-label="Select quarter" style={{ display: 'flex', gap: '0.25rem' }}>
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s5)',
            rowGap: 'var(--s4)',
          }}
        >
          <StatFigure
            label={`Gross streaming revenue · ${formatPeriod(period)}`}
            value={published.usd}
            field="gross_streaming_revenue_usd"
            unit="usd"
            precision={0}
            footnote="Sum of four platform columns, none of them observed."
          />
          <StatFigure
            label="Gross streaming revenue (NGN)"
            value={published.ngn}
            field="gross_streaming_revenue_ngn"
            unit="ngn"
            precision={0}
            compact
            footnote="Converted at a fixed ₦1,500/USD with no effective date."
          />
          <StatFigure
            label="Artist rows in this quarter"
            value={rows.length}
            status="observed"
            unit="count"
            footnote={
              <>
                of <span className="fig">{ARTIST_UNIVERSE}</span> in the master list · GAP-033
              </>
            }
          />
          <StatFigure
            label="Allocated operating cost"
            value={null}
            status="allocated"
            gapId="GAP-022"
            reason="Cost is a flat artist-count model. Nothing is apportioned to a platform, an artist or a quarter."
            footnote="The cost model is shown in full at the foot of this panel."
          />
          <StatFigure
            label="Net revenue"
            value={null}
            status="unavailable"
            gapId="GAP-022"
            reason="Net is gross minus allocated cost. The allocation does not exist, so the subtraction has no second operand."
            footnote="Not zero. Not computable."
          />
        </div>
      </Section>

      {/* ------------------------------------------------ rate divergence */}
      <Section
        title="Payout rates: code against the published rate card"
        subtitle="The revenue figures in this delivery were produced by a single numeric literal applied to three different platforms. The rate card shipped alongside them states differentiated rates that no code path reads."
      >
        <Callout
          status="estimated"
          title="One rate is applied. Three are documented."
          gapId="GAP-021"
        >
          <p style={{ margin: 0 }}>
            <strong>$0.004</strong> is inlined at the call site for Spotify, YouTube{' '}
            <em>and</em> Deezer. The published rate card states{' '}
            <Figure value={0.0071} status="assumed" unit="usd" precision={4} /> for YouTube and{' '}
            <Figure value={0.0046} status="assumed" unit="usd" precision={4} /> for Deezer. Against
            the documented YouTube rate the shipped figures understate by{' '}
            <Figure value={(1 - 0.004 / 0.0071) * 100} status="derived" unit="pct" precision={0} />{' '}
            and against the documented Deezer rate by{' '}
            <Figure value={(1 - 0.004 / 0.0046) * 100} status="derived" unit="pct" precision={0} />.
            Those two percentages are computed on this page from the two rates and are labelled
            derived; they are not backend figures.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            No rate table exists on any model, so no rate carries an effective date, a currency
            basis or a revision history. A payout rate without an effective date cannot be
            reconciled against a period, which is the whole point of quarterly national accounts.
          </p>
        </Callout>

        <Callout status="assumed" title="“Other platforms” is not a measurement" gapId="GAP-021">
          Apple Music, Audiomack, Boomplay and Tidal are inside the “other platforms” column and
          none of them was ever called. The column is Spotify revenue ×&nbsp;0.30 — a multiplier with
          no justification text of any kind in the code, and with two further values (0.40 and 1.40)
          still present at other call sites. It carries{' '}
          <Figure
            value={platforms.find((p) => p.key === 'other')?.share ?? null}
            status="derived"
            unit="pct"
            precision={1}
          />{' '}
          of gross streaming revenue in {formatPeriod(period)}.
        </Callout>
      </Section>

      {/* -------------------------------------------- platform breakdown */}
      <Section
        title={`Platform decomposition · ${formatPeriod(period)}`}
        subtitle="Each row states the rate that produced it, where that rate came from, what volume it was applied to, and the two columns that cannot exist because cost is never allocated."
      >
        <Callout status="derived" title="Platform totals are summed on this page">
          The projection's <code style={{ fontFamily: 'var(--font-mono)' }}>streaming_totals</code>{' '}
          block carries <strong>null</strong> in every per-platform column, so the four gross figures
          below are summed here from the{' '}
          <span className="fig">{rows.length}</span> artist rows of this quarter. Their epistemic
          class is inherited from the components — summing estimates does not produce an observation.
          {residual !== null && Math.abs(residual) >= 0.005 ? (
            <>
              {' '}
              They sum to{' '}
              <Figure value={componentSum} status="estimated" unit="usd" precision={2} /> against a
              published period total of{' '}
              <Figure value={published.usd} field="gross_streaming_revenue_usd" unit="usd" precision={2} />
              , a residual of{' '}
              <Figure value={residual} status="derived" unit="usd" precision={2} /> from per-row
              rounding to cents.
            </>
          ) : null}
        </Callout>

        <ShareBar platforms={platforms} />

        <div style={{ paddingTop: 'var(--s4)' }}>
          <DataTable<PlatformFigures>
            rows={platforms}
            rowKey={(p) => p.key}
            filename={`nmas-platform-revenue-${period}`}
            pageSize={null}
            caption={`Per-platform revenue for ${formatPeriod(period)}. Rate source, effective date, allocated cost and net are register columns, not data columns.`}
            columns={platformCols}
          />
        </div>

        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)', marginTop: 'var(--s3)' }}>
          YouTube view volume in {formatPeriod(period)} is returned data on{' '}
          <span className="fig">{ytObservedRows}</span> rows and synthesised from subscribers on{' '}
          <span className="fig">{ytEstimatedRows}</span>. It is the only column in the entire
          delivery that carries an epistemic flag of its own.
        </p>
      </Section>

      {/* ------------------------------------------------ per-artist table */}
      <Section
        title={`Per-artist, per-platform · ${formatPeriod(period)}`}
        subtitle={
          <>
            Every revenue row the quarter contains. The three audience counts are observed; every
            money column is an estimate, and the “other platforms” column is an assumption. Expand a
            row for its full derivation.
          </>
        }
      >
        <Callout status="rejected" title="The source string credits a source that does not exist" gapId="GAP-036">
          Every row in this quarter carries{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
            {rows[0]?.streaming_source ?? 'Chartmetric + SoundCharts API + per-stream rates'}
          </code>{' '}
          in its source column. No SoundCharts client, URL or credential exists anywhere in the
          repository; the only HTTP client targets Chartmetric. The credit is carried in the shipped
          data and is wrong.
        </Callout>

        <DataTable<RevenueRow>
          rows={rows}
          rowKey={(r) => `${r.period}|${r.artist_name}`}
          filename={`nmas-artist-platform-revenue-${period}`}
          initialSort={{ key: 'gross', dir: 'desc' }}
          pageSize={40}
          dense
          caption={`${rows.length} artist rows. Sorted by gross streaming revenue.`}
          columns={artistColumns}
          expand={(r) => <ArtistDerivation row={r} />}
        />
      </Section>

      {/* --------------------------------------------------- cost model */}
      <Section
        title="Operating cost model"
        subtitle="Shown separately from revenue because it cannot be joined to it. The model is flat, national, and identical in every quarter."
      >
        <Callout status="allocated" title="Cost is never apportioned" gapId="GAP-022">
          <p style={{ margin: 0 }}>
            There is no allocation here in the statistical sense. Four cost lines are computed as
            artist count × a unit cost — three of them also × 2 tracks per artist, hosting alone
            without that multiplier — and the result is attached to a quarter and to nothing else.
            No platform, no artist and no revenue stream receives any share of it. That is why the
            allocated-cost and net columns above render NOT COLLECTED rather than zero.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            <strong>Zero temporal variance:</strong>{' '}
            <span className="fig">{costVariance.categories}</span> cost categories across{' '}
            <span className="fig">{new Set(costs.map((c) => c.period)).size}</span> quarters, of
            which <span className="fig">{costVariance.varying}</span> vary between quarters. The
            series is one number repeated five times. Any quarter-on-quarter cost movement a reader
            infers from it is an artefact of the model, not of the economy.
          </p>
        </Callout>

        <Callout status="unavailable" title="The cost model bills a different population" gapId="GAP-033">
          Every cost row is computed against{' '}
          <Figure value={ARTIST_UNIVERSE} status="observed" unit="count" /> artists, while this
          quarter produced <Figure value={rows.length} status="observed" unit="count" /> revenue
          rows. The two sides of any margin calculation are drawn from different populations, so
          they are not presented as a margin here.
        </Callout>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s5)',
            padding: 'var(--s2) 0 var(--s4)',
          }}
        >
          <StatFigure
            label={`Total operating cost · ${formatPeriod(period)}`}
            value={costForPeriod?.total_cost_ngn ?? null}
            field="total_cost_ngn"
            unit="ngn"
            precision={0}
            footnote="Identical in all five quarters."
          />
          <StatFigure
            label="Total operating cost (USD)"
            value={costForPeriod?.total_cost_usd ?? null}
            status="allocated"
            unit="usd"
            precision={2}
            footnote="Converted at the same fixed ₦1,500/USD."
          />
          <StatFigure
            label="Cost per artist per quarter"
            value={
              costForPeriod?.total_cost_ngn && costForPeriod.num_artists
                ? costForPeriod.total_cost_ngn / costForPeriod.num_artists
                : null
            }
            status="derived"
            unit="ngn"
            precision={0}
            footnote="Computed on this page from the two columns beside it."
          />
        </div>

        <DataTable<CostRow>
          rows={costs}
          rowKey={(c) => `${c.period}|${c.cost_category}`}
          filename="nmas-operating-cost-model"
          pageSize={null}
          caption="The four cost lines, all five quarters. The artifact additionally embeds a “=== PERIOD TOTAL ===” pseudo-row inside its own data; it is excluded here and shown as the total above."
          columns={costColumns}
        />
      </Section>

      {/* -------------------------------------------------------- gaps */}
      <Section
        title="Gaps governing this panel"
        subtitle="Every absence rendered above resolves to one of these register entries."
      >
        <DataTable
          rows={gapsForPanel(6)}
          rowKey={(g) => g.id}
          filename="nmas-panel-6-gaps"
          pageSize={null}
          dense
          columns={gapColumns}
        />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- columns */

function platformColumns(period: string): Column<PlatformFigures>[] {
  return [
    {
      key: 'platform',
      header: 'Platform',
      width: '11rem',
      value: (p) => p.name,
      render: (p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600 }}>{p.name}</span>
          <EpistemicChip status={p.epistemic} />
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Rate applied (code)',
      numeric: true,
      value: (p) => p.rateApplied,
      note: 'The literal the extraction script actually multiplies by.',
      render: (p) =>
        p.rateApplied === null ? (
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
            No rate applied
          </span>
        ) : (
          <Figure
            value={p.rateApplied}
            status="assumed"
            unit="usd"
            precision={4}
            label={`${p.name} payout rate`}
            provenance={{
              chain: [
                { op: `× $${p.rateApplied} per ${p.volumeUnit}`, constantId: p.rateConstantId },
              ],
              note: CONSTANTS_BY_ID[p.rateConstantId]?.value
                ? `Constants register: ${CONSTANTS_BY_ID[p.rateConstantId].value}`
                : undefined,
              gapId: 'GAP-021',
            }}
          />
        ),
    },
    {
      key: 'rateSource',
      header: 'Rate source',
      width: '18rem',
      value: (p) => CONSTANTS_BY_ID[p.rateConstantId]?.justification ?? null,
      render: (p) => <RateSource constantId={p.rateConstantId} />,
    },
    {
      key: 'effective',
      header: 'Effective date',
      value: () => null,
      note: 'No rate table exists on any model.',
      render: () => (
        <NotCollected
          reason="No rate table, no effective date, no revision history. The value is a literal at the call site."
          gapId="GAP-021"
        />
      ),
    },
    {
      key: 'published',
      header: 'Published rate card',
      numeric: true,
      value: (p) => p.publishedRate,
      render: (p) =>
        p.publishedRate === null ? (
          <span
            style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}
            title={p.publishedNote}
          >
            No divergence recorded
          </span>
        ) : (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            title={p.publishedNote}
          >
            <Figure value={p.publishedRate} status="assumed" unit="usd" precision={4} />
            <span
              className="epi-chip"
              data-epi="rejected"
              title="Documented in the published rate card and applied by no code path."
            >
              never applied
            </span>
          </span>
        ),
    },
    {
      key: 'volume',
      header: 'Volume',
      numeric: true,
      value: (p) => p.volume,
      note: 'Streams or views the rate was applied to.',
      render: (p) =>
        p.volume === null ? (
          <NotCollected
            reason={
              p.key === 'deezer'
                ? 'The intermediate Deezer stream count is computed inside the revenue expression and written to no artifact.'
                : 'No platform in this bucket was ever queried, so no volume exists to report.'
            }
          />
        ) : (
          <span style={{ display: 'inline-block', textAlign: 'right' }}>
            <Figure
              value={p.volume}
              status={p.volumeStatus}
              unit="count"
              precision={0}
              label={`${p.name} ${p.volumeLabel.toLowerCase()}`}
              provenance={{ chain: [{ op: p.volumeDerivation }], gapId: 'GAP-006' }}
            />
            {p.volumeSplit ? (
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatFigure(p.volumeSplit.observed, { compact: true })} returned ·{' '}
                {formatFigure(p.volumeSplit.estimated, { compact: true })} synthesised
              </span>
            ) : (
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.volumeUnit}
              </span>
            )}
          </span>
        ),
    },
    {
      key: 'gross',
      header: 'Gross revenue',
      numeric: true,
      value: (p) => p.gross,
      render: (p) => (
        <Figure
          value={p.gross}
          field={p.revenueField}
          unit="usd"
          precision={2}
          keyline
          label={`${p.name} gross revenue, ${formatPeriod(period)}`}
        />
      ),
    },
    {
      key: 'share',
      header: 'Share of gross',
      numeric: true,
      value: (p) => p.share,
      note: 'Computed on this page from the column beside it.',
      render: (p) => <Figure value={p.share} status="derived" unit="pct" precision={1} />,
    },
    {
      key: 'grossAtCard',
      header: 'Gross at card rate (derived)',
      numeric: true,
      optional: true,
      note: 'Presentation-side restatement: gross × (published rate ÷ applied rate). Not a backend figure.',
      value: (p) => p.grossAtCardRate,
      render: (p) =>
        p.grossAtCardRate === null ? (
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
            No divergent rate
          </span>
        ) : (
          <Figure value={p.grossAtCardRate} status="derived" unit="usd" precision={2} />
        ),
    },
    {
      key: 'allocatedCost',
      header: 'Allocated operating cost',
      value: () => null,
      note: 'Cost is never apportioned to a platform.',
      render: () => (
        <NotCollected
          reason="Cost is a flat artist-count model, identical in all five quarters and apportioned to nothing."
          gapId="GAP-022"
        />
      ),
    },
    {
      key: 'net',
      header: 'Net',
      value: () => null,
      note: 'Cannot exist without an allocated cost.',
      render: () => (
        <NotCollected
          reason="Net = gross − allocated cost. The second operand does not exist."
          gapId="GAP-022"
        />
      ),
    },
  ];
}

const artistColumns: Column<RevenueRow>[] = [
  {
    key: 'artist',
    header: 'Artist',
    width: '13rem',
    value: (r) => r.artist_name,
    groupable: false,
  },
  {
    key: 'listeners',
    header: 'Spotify listeners',
    numeric: true,
    value: (r) => r.spotify_monthly_listeners,
    note: 'Observed. /api/artist/{id}/stat/spotify',
    render: (r) => (
      <Figure value={r.spotify_monthly_listeners} field="spotify_monthly_listeners" unit="count" />
    ),
  },
  {
    key: 'estStreams',
    header: 'Est. Spotify streams',
    numeric: true,
    value: (r) => r.est_spotify_quarterly_streams,
    note: 'listeners × 3.5 × 3. No observed stream count exists.',
    render: (r) => (
      <Figure
        value={r.est_spotify_quarterly_streams}
        field="est_spotify_quarterly_streams"
        unit="count"
      />
    ),
  },
  {
    key: 'spotifyUsd',
    header: 'Spotify USD',
    numeric: true,
    value: (r) => r.spotify_revenue_usd,
    render: (r) => <Figure value={r.spotify_revenue_usd} field="spotify_revenue_usd" precision={2} />,
  },
  {
    key: 'ytSubs',
    header: 'YouTube subscribers',
    numeric: true,
    optional: true,
    value: (r) => r.youtube_subscribers,
    render: (r) => <Figure value={r.youtube_subscribers} field="youtube_subscribers" unit="count" />,
  },
  {
    key: 'ytViews',
    header: 'YouTube views',
    numeric: true,
    value: (r) => r.youtube_actual_views,
    note: 'Named “actual”, synthetic on 426 of 638 rows delivery-wide.',
    render: (r) => (
      <Figure
        value={r.youtube_actual_views}
        field="youtube_actual_views"
        row={r as unknown as Record<string, unknown>}
        unit="count"
        keyline
      />
    ),
  },
  {
    key: 'ytSource',
    header: 'Views basis',
    value: (r) => r.youtube_views_source,
    groupable: true,
    note: 'The only epistemic flag in the entire delivery.',
    render: (r) =>
      r.youtube_views_source === 'actual' ? (
        <EpistemicChip status="observed" title="The view count the endpoint returned." />
      ) : r.youtube_views_source === 'estimated' ? (
        <EpistemicChip status="estimated" title="Subscribers × 15 views/sub/month × 3 months." />
      ) : (
        <NotCollected short reason="No flag on this row." />
      ),
  },
  {
    key: 'youtubeUsd',
    header: 'YouTube USD',
    numeric: true,
    value: (r) => r.youtube_revenue_usd,
    render: (r) => <Figure value={r.youtube_revenue_usd} field="youtube_revenue_usd" precision={2} />,
  },
  {
    key: 'deezerFans',
    header: 'Deezer fans',
    numeric: true,
    optional: true,
    value: (r) => r.deezer_fans,
    render: (r) => <Figure value={r.deezer_fans} field="deezer_fans" unit="count" />,
  },
  {
    key: 'deezerUsd',
    header: 'Deezer USD',
    numeric: true,
    value: (r) => r.deezer_revenue_usd,
    render: (r) => <Figure value={r.deezer_revenue_usd} field="deezer_revenue_usd" precision={2} />,
  },
  {
    key: 'otherUsd',
    header: 'Other platforms USD',
    numeric: true,
    value: (r) => r.other_platforms_revenue_usd,
    note: 'ASSUMED — Spotify × 0.30, attributed to platforms never queried.',
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.3rem' }}>
        <Figure
          value={r.other_platforms_revenue_usd}
          field="other_platforms_revenue_usd"
          precision={2}
          keyline
        />
        <EpistemicChip status="assumed" bare />
      </span>
    ),
  },
  {
    key: 'gross',
    header: 'Gross USD',
    numeric: true,
    value: (r) => r.gross_streaming_revenue_usd,
    render: (r) => (
      <Figure value={r.gross_streaming_revenue_usd} field="gross_streaming_revenue_usd" precision={2} />
    ),
  },
  {
    key: 'grossNgn',
    header: 'Gross NGN',
    numeric: true,
    optional: true,
    value: (r) => r.gross_streaming_revenue_ngn,
    render: (r) => (
      <Figure value={r.gross_streaming_revenue_ngn} field="gross_streaming_revenue_ngn" precision={0} />
    ),
  },
  {
    key: 'domestic',
    header: 'Domestic USD',
    numeric: true,
    optional: true,
    note: 'Total × an assumed 30% domestic share.',
    value: (r) => r.domestic_revenue_usd,
    render: (r) => <Figure value={r.domestic_revenue_usd} field="domestic_revenue_usd" precision={2} />,
  },
  {
    key: 'export',
    header: 'Export USD',
    numeric: true,
    optional: true,
    note: 'Total × an assumed 70% export share.',
    value: (r) => r.gross_export_revenue_usd,
    render: (r) => (
      <Figure value={r.gross_export_revenue_usd} field="gross_export_revenue_usd" precision={2} />
    ),
  },
  {
    key: 'allocatedCost',
    header: 'Allocated cost',
    optional: true,
    value: () => null,
    note: 'Never apportioned to an artist.',
    render: () => <NotCollected short gapId="GAP-022" reason="Cost is not apportioned per artist." />,
  },
];

const costColumns: Column<CostRow>[] = [
  { key: 'period', header: 'Quarter', value: (c) => c.period, groupable: true, render: (c) => formatPeriod(c.period) },
  { key: 'category', header: 'Cost category', value: (c) => c.cost_category, groupable: true, width: '15rem' },
  {
    key: 'artists',
    header: 'Artists',
    numeric: true,
    value: (c) => c.num_artists,
    note: 'The master list size, not the number that produced revenue.',
    render: (c) => <Figure value={c.num_artists} status="observed" unit="count" />,
  },
  {
    key: 'ngn',
    header: 'Cost (NGN)',
    numeric: true,
    value: (c) => c.total_cost_ngn,
    render: (c) => <Figure value={c.total_cost_ngn} field="total_cost_ngn" unit="ngn" precision={0} keyline />,
  },
  {
    key: 'usd',
    header: 'Cost (USD)',
    numeric: true,
    value: (c) => c.total_cost_usd,
    note: 'Converted at a fixed ₦1,500/USD.',
    render: (c) => <Figure value={c.total_cost_usd} status="allocated" unit="usd" precision={2} />,
  },
  {
    key: 'source',
    header: 'Source string',
    value: (c) => c.source,
    width: '14rem',
    render: (c) =>
      c.source ? (
        <span style={{ fontSize: 'var(--t-small)' }}>
          {c.source}
          {c.source === 'Industry estimate' ? (
            <strong style={{ color: 'var(--asm)', marginLeft: '0.35rem' }}>unsourced</strong>
          ) : null}
        </span>
      ) : (
        <NotCollected short />
      ),
  },
  {
    key: 'platform',
    header: 'Platform',
    value: () => null,
    note: 'Cost carries no platform dimension at all.',
    render: () => <NotCollected short gapId="GAP-022" reason="Cost carries no platform dimension." />,
  },
];

const gapColumns: Column<ReturnType<typeof gapsForPanel>[number]>[] = [
  { key: 'id', header: 'Gap', width: '5.5rem', value: (g) => g.id },
  { key: 'requirement', header: 'Requirement', value: (g) => g.requirement, width: '20rem' },
  { key: 'status', header: 'Status', value: (g) => g.status, groupable: true },
  { key: 'severity', header: 'Severity', value: (g) => g.severity, groupable: true },
  { key: 'evidence', header: 'Evidence', value: (g) => g.evidence },
];

/* ------------------------------------------------------------ fragments */

function RateSource({ constantId }: { constantId: string }) {
  const c = CONSTANTS_BY_ID[constantId];
  if (!c) {
    return <NotCollected reason="No constant register entry for this rate." gapId="GAP-021" />;
  }
  const unsourced = c.justification === 'absent' || c.justification === 'self-declared-unsourced';
  if (!c.justificationText) {
    return (
      <NotCollected
        reason="No source string, comment or citation accompanies this constant anywhere in the code."
        gapId="GAP-021"
      />
    );
  }
  return (
    <span style={{ fontSize: 'var(--t-small)', display: 'inline-block' }}>
      {c.justificationText}
      <span
        style={{
          display: 'block',
          marginTop: '0.15rem',
          fontSize: 'var(--t-micro)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 650,
          color: unsourced ? 'var(--asm)' : 'var(--ink-3)',
        }}
      >
        {unsourced ? 'unsourced' : c.justification}
      </span>
    </span>
  );
}

/** A single ruled bar: gross revenue by platform, shaded by epistemic class. */
function ShareBar({ platforms }: { platforms: PlatformFigures[] }) {
  const total = platforms.reduce((a, p) => a + (p.gross ?? 0), 0);
  if (total <= 0) {
    return <NotCollected reason="No revenue rows in this quarter." />;
  }
  return (
    <div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '1.5rem',
          border: '1px solid var(--rule-strong)',
        }}
        role="img"
        aria-label={platforms
          .map(
            (p) =>
              `${p.name} ${formatFigure(((p.gross ?? 0) / total) * 100, { precision: 1, unit: 'pct' })}`,
          )
          .join(', ')}
      >
        {platforms.map((p, i) => (
          <div
            key={p.key}
            data-epi={p.epistemic}
            title={`${p.name} — ${formatFigure(p.gross, { precision: 2, unit: 'usd' })}`}
            style={{
              width: `${((p.gross ?? 0) / total) * 100}%`,
              background: `color-mix(in srgb, var(--epi) ${75 - i * 12}%, var(--paper))`,
              borderRight: i < platforms.length - 1 ? '1px solid var(--paper)' : undefined,
            }}
          />
        ))}
      </div>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s4)',
          listStyle: 'none',
          margin: '0.4rem 0 0',
          padding: 0,
        }}
      >
        {platforms.map((p) => (
          <li key={p.key} data-epi={p.epistemic} style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline' }}>
            <span
              style={{
                width: '0.75rem',
                height: '0.75rem',
                background: 'var(--epi)',
                display: 'inline-block',
                alignSelf: 'center',
              }}
            />
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>{p.name}</span>
            <Figure value={((p.gross ?? 0) / total) * 100} status="derived" unit="pct" precision={1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArtistDerivation({ row }: { row: RevenueRow }) {
  const ytActual = row.youtube_views_source === 'actual';
  return (
    <div style={{ display: 'grid', gap: 'var(--s4)', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))' }}>
      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Derivation — {row.artist_name}, {formatPeriod(row.period)}
        </div>
        <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--t-small)', lineHeight: 1.6 }}>
          <li>
            Spotify monthly listeners{' '}
            <Figure value={row.spotify_monthly_listeners} field="spotify_monthly_listeners" unit="count" />{' '}
            — observed, <code style={{ fontFamily: 'var(--font-mono)' }}>/api/artist/{'{id}'}/stat/spotify</code>
          </li>
          <li>
            × 3.5 streams/listener/month × 3 months ={' '}
            <Figure value={row.est_spotify_quarterly_streams} field="est_spotify_quarterly_streams" unit="count" />
          </li>
          <li>
            × $0.004 per stream ={' '}
            <Figure value={row.spotify_revenue_usd} field="spotify_revenue_usd" precision={2} />
          </li>
          <li>
            YouTube views{' '}
            <Figure
              value={row.youtube_actual_views}
              field="youtube_actual_views"
              row={row as unknown as Record<string, unknown>}
              unit="count"
            />{' '}
            — {ytActual ? 'returned by the endpoint' : 'subscribers × 15 × 3, synthesised'} × $0.004 ={' '}
            <Figure value={row.youtube_revenue_usd} field="youtube_revenue_usd" precision={2} />
          </li>
          <li>
            Deezer fans <Figure value={row.deezer_fans} field="deezer_fans" unit="count" /> × 2.0 × 3 ×
            $0.004 = <Figure value={row.deezer_revenue_usd} field="deezer_revenue_usd" precision={2} />{' '}
            <span style={{ color: 'var(--ink-3)' }}>(the intermediate stream count is discarded)</span>
          </li>
          <li>
            Spotify revenue × 0.30 ={' '}
            <Figure value={row.other_platforms_revenue_usd} field="other_platforms_revenue_usd" precision={2} />{' '}
            <EpistemicChip status="assumed" bare /> — attributed to Apple Music, Audiomack, Boomplay and
            Tidal, none of which was called
          </li>
          <li>
            Sum ={' '}
            <Figure value={row.gross_streaming_revenue_usd} field="gross_streaming_revenue_usd" precision={2} />{' '}
            × ₦1,500 ={' '}
            <Figure value={row.gross_streaming_revenue_ngn} field="gross_streaming_revenue_ngn" precision={0} />
          </li>
        </ol>
      </div>
      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Row metadata
        </div>
        <dl style={{ margin: 0, fontSize: 'var(--t-small)' }}>
          <MetaRow k="Streaming source string" v={row.streaming_source} flag="GAP-036" />
          <MetaRow k="Export source string" v={row.export_source} flag="GAP-036" />
          <MetaRow k="Top export markets" v={row.top_export_markets} flag="GAP-020" />
          <MetaRow
            k="Domestic share"
            v={row.nigeria_domestic_share_pct === null ? null : `${row.nigeria_domestic_share_pct}% — assumed constant`}
            flag="GAP-039"
          />
          <MetaRow k="Payout rate effective date" v={null} flag="GAP-021" />
          <MetaRow k="Allocated operating cost" v={null} flag="GAP-022" />
          <MetaRow k="Net revenue" v={null} flag="GAP-022" />
          <MetaRow k="Confidence / interval" v={null} flag="GAP-023" />
        </dl>
      </div>
    </div>
  );
}

function MetaRow({ k, v, flag }: { k: string; v: string | null; flag?: string }) {
  return (
    <div
      className="rule-bh"
      style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, 13rem) 1fr', gap: 'var(--s3)', padding: '0.25rem 0' }}
    >
      <dt style={{ color: 'var(--ink-3)' }}>{k}</dt>
      <dd style={{ margin: 0, wordBreak: 'break-word' }}>
        {v === null ? <NotCollected gapId={flag} /> : v}
      </dd>
    </div>
  );
}
