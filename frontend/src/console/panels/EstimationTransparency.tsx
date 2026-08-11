/**
 * PANEL 7 — Estimation Transparency
 *
 * The best-backed panel in the console, because the thing it documents — the
 * estimation layer — is the one part of this system that is completely knowable.
 * Every coefficient is a literal in a file that was read directly, every input
 * it is applied to is on disk, and every output it produced is in the shipped
 * artifacts. Nothing here needs to be inferred.
 *
 * What this panel renders:
 *   · the observed-against-estimated ratio for every quantity that carries money
 *   · every non-observed figure in the delivery, driven by the FIELDS register:
 *     observed input → conversion applied → resulting estimate → share of total
 *     → the justification the code actually carries
 *   · the full coefficient register, with divergences and false provenance shown
 *     at full weight rather than footnoted
 *   · the twenty confirmed-401 endpoints, which are the entire reason an
 *     estimation layer exists at all
 *   · a presentation-side sensitivity on the single coefficient that determines
 *     the headline figure
 *
 * What this panel cannot render:
 *   · any observed stream count. There are none. Not few — none (GAP-006).
 *   · a confidence interval, standard error or uncertainty of any kind on any
 *     figure. No such field exists anywhere in the system (GAP-023).
 *   · an epistemic flag read from the data. Exactly one exists in the whole
 *     delivery, on YouTube views. Every other classification on this page is
 *     presentation metadata from the register, never written back (GAP-019).
 *
 * The sensitivity section is arithmetic performed here, on figures displayed
 * here, and is labelled DERIVED at every point of display. It is not a backend
 * result and must never be exported as one.
 */

import { useMemo, type ReactNode } from 'react';
import {
  comparePeriods,
  formatFigure,
  formatPeriod,
  useAccounts,
  useCoverage,
  useRevenue,
  useVariables,
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
import { FIELDS, type DerivationStep, type FieldSpec } from '../registry/epistemic';
import {
  CONSTANTS,
  CONSTANTS_BY_ID,
  DIVERGENT_CONSTANTS,
  FALSE_PROVENANCE_CONSTANTS,
  UNSOURCED_CONSTANTS,
  type ConstantEntry,
} from '../registry/constants';
import { gapsForPanel } from '../registry/gaps';
import type {
  Accounts,
  Coverage,
  DeniedEndpoint,
  Epistemic,
  Revenue,
  Variables,
} from '../data/types';

/** The coefficient the delivery shipped, and the two bounds tested against it. */
const SHIPPED_STREAMS_PER_LISTENER = 3.5;
const SENSITIVITY_COEFFICIENTS = [2.0, SHIPPED_STREAMS_PER_LISTENER, 5.0];

/* ------------------------------------------------------------------ totals */

interface Totals {
  rows: number;
  periods: string[];
  spotifyStreams: number;
  ytViews: number;
  ytViewsReturned: number;
  ytViewsSynthesised: number;
  ytRowsReturned: number;
  ytRowsSynthesised: number;
  /** synthesised rows whose subscriber count is zero, so no multiplier applied */
  ytRowsZeroSubscribers: number;
  spotifyUsd: number;
  youtubeUsd: number;
  deezerUsd: number;
  otherUsd: number;
  grossUsd: number;
  grossNgn: number;
  domesticUsd: number;
  exportUsd: number;
  domesticSharePct: number | null;
  exportSharePct: number | null;
  exportMarkets: string | null;
  costNgn: number;
  costQuarters: number;
  employmentLatest: number | null;
  maleLatest: number | null;
  femaleLatest: number | null;
  latestEmploymentPeriod: string | null;
}

function buildTotals(rev: Revenue, acc: Accounts): Totals {
  const rows = rev.rows;
  const sum = (pick: (r: (typeof rows)[number]) => number | null): number =>
    rows.reduce((a, r) => a + (pick(r) ?? 0), 0);

  const returnedRows = rows.filter((r) => r.youtube_views_source === 'actual');
  const synthRows = rows.filter((r) => r.youtube_views_source === 'estimated');

  const costRows = acc.costs.filter((c) => c.cost_category !== '=== PERIOD TOTAL ===');
  const employmentTotals = acc.employment.filter((e) =>
    (e.category ?? '').toUpperCase().startsWith('TOTAL'),
  );
  const employmentByPeriod = [...employmentTotals].sort((a, b) =>
    comparePeriods(a.period, b.period),
  );
  const latestEmployment =
    employmentByPeriod.length > 0 ? employmentByPeriod[employmentByPeriod.length - 1] : null;

  const first = rows[0] ?? null;

  return {
    rows: rows.length,
    periods: [...rev.periods].sort(comparePeriods),
    spotifyStreams: sum((r) => r.est_spotify_quarterly_streams),
    ytViews: sum((r) => r.youtube_actual_views),
    ytViewsReturned: returnedRows.reduce((a, r) => a + (r.youtube_actual_views ?? 0), 0),
    ytViewsSynthesised: synthRows.reduce((a, r) => a + (r.youtube_actual_views ?? 0), 0),
    ytRowsReturned: returnedRows.length,
    ytRowsSynthesised: synthRows.length,
    ytRowsZeroSubscribers: synthRows.filter((r) => !r.youtube_subscribers).length,
    spotifyUsd: sum((r) => r.spotify_revenue_usd),
    youtubeUsd: sum((r) => r.youtube_revenue_usd),
    deezerUsd: sum((r) => r.deezer_revenue_usd),
    otherUsd: sum((r) => r.other_platforms_revenue_usd),
    grossUsd: sum((r) => r.gross_streaming_revenue_usd),
    grossNgn: sum((r) => r.gross_streaming_revenue_ngn),
    domesticUsd: sum((r) => r.domestic_revenue_usd),
    exportUsd: sum((r) => r.gross_export_revenue_usd),
    domesticSharePct: first?.nigeria_domestic_share_pct ?? null,
    exportSharePct: first?.export_share_pct ?? null,
    exportMarkets: first?.top_export_markets ?? null,
    costNgn: costRows.reduce((a, c) => a + (c.total_cost_ngn ?? 0), 0),
    costQuarters: new Set(costRows.map((c) => c.period)).size,
    employmentLatest: latestEmployment?.total_employment ?? null,
    maleLatest: latestEmployment?.male ?? null,
    femaleLatest: latestEmployment?.female ?? null,
    latestEmploymentPeriod: latestEmployment?.period ?? null,
  };
}

/* ------------------------------------------------------------------ panel */

export default function EstimationTransparency() {
  const revenue = useRevenue();
  const variables = useVariables();
  const accounts = useAccounts();
  const coverage = useCoverage();

  return (
    <Resolved query={revenue} artifact="revenue.json" label="Reading 638 revenue rows">
      {(rev) => (
        <Resolved query={variables} artifact="variables.json" label="Reading the metric register">
          {(vars) => (
            <Resolved query={accounts} artifact="accounts.json" label="Reading the cost model">
              {(acc) => (
                <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
                  {(cov) => <Body rev={rev} vars={vars} acc={acc} cov={cov} />}
                </Resolved>
              )}
            </Resolved>
          )}
        </Resolved>
      )}
    </Resolved>
  );
}

function Body({
  rev,
  vars,
  acc,
  cov,
}: {
  rev: Revenue;
  vars: Variables;
  acc: Accounts;
  cov: Coverage;
}) {
  const t = useMemo(() => buildTotals(rev, acc), [rev, acc]);
  const estimatedRows = useMemo(() => buildEstimatedRows(t), [t]);

  const volumeTotal = t.spotifyStreams + t.ytViews;
  const observedVolumeShare = volumeTotal > 0 ? (t.ytViewsReturned / volumeTotal) * 100 : null;

  const workingEndpoints = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(cov.endpoints_by_variable)) for (const e of list) set.add(e);
    return [...set].sort();
  }, [cov.endpoints_by_variable]);

  const sensitivity = useMemo(() => buildSensitivity(t), [t]);
  const perQuarterSensitivity = useMemo(() => buildPerQuarterSensitivity(rev), [rev]);

  return (
    <>
      {/* ------------------------------------------- observed vs estimated */}
      <Section
        title="Observed against estimated"
        subtitle={
          <>
            The question this panel exists to answer is how much of the delivery was measured. For
            consumption volume the answer is{' '}
            <strong className="fig">
              {formatFigure(observedVolumeShare, { precision: 1, unit: 'pct' })}
            </strong>
            , and all of it is YouTube views. For streams the answer is none at all.
          </>
        }
      >
        <Callout status="unavailable" title="There are no observed stream counts. Not few — none." gapId="GAP-006">
          All twenty track-level stream and chart endpoints are confirmed HTTP 401 at the plan tier
          this study ran on. The system contains exactly one track row and no track-level
          observation. Every stream figure in every deliverable is monthly listeners ×{' '}
          {SHIPPED_STREAMS_PER_LISTENER} × 3. The estimation layer is not a refinement applied to a
          measured remainder; it is the entire measurement.
        </Callout>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s5)',
            padding: 'var(--s2) 0 var(--s5)',
          }}
        >
          <StatFigure
            label="Observed stream count"
            value={0}
            status="observed"
            unit="count"
            footnote="A true zero: a count of records that exist. Denominator below."
          />
          <StatFigure
            label="Estimated streams, five quarters"
            value={t.spotifyStreams}
            field="est_spotify_quarterly_streams"
            unit="count"
            compact
            footnote="Spotify only. The Deezer intermediate is discarded."
          />
          <StatFigure
            label="YouTube views returned"
            value={t.ytViewsReturned}
            status="observed"
            unit="count"
            compact
            footnote={
              <>
                on <span className="fig">{t.ytRowsReturned}</span> of{' '}
                <span className="fig">{t.rows}</span> rows — the only observed volume in the delivery
              </>
            }
          />
          <StatFigure
            label="YouTube views synthesised"
            value={t.ytViewsSynthesised}
            status="estimated"
            unit="count"
            compact
            footnote={
              <>
                on <span className="fig">{t.ytRowsSynthesised}</span> rows, as subscribers × 45 —{' '}
                <span className="fig">{t.ytRowsZeroSubscribers}</span> of them have no subscribers, so
                no multiplier was applied and they contribute nothing
              </>
            }
          />
          <StatFigure
            label="Confidence interval on any figure"
            value={null}
            status="unavailable"
            gapId="GAP-023"
            reason="No confidence, standard error or interval field exists anywhere in the system."
            footnote="Observation count is used as a coverage proxy elsewhere, never as a confidence."
          />
        </div>

        <RatioBar
          title="Consumption volume behind every money figure"
          basis={`${formatFigure(volumeTotal, { compact: true })} units across ${t.rows} artist-quarter rows`}
          segments={[
            {
              label: 'YouTube views returned by the endpoint',
              value: t.ytViewsReturned,
              status: 'observed',
            },
            {
              label: 'YouTube views synthesised from subscribers',
              value: t.ytViewsSynthesised,
              status: 'estimated',
            },
            {
              label: 'Spotify streams synthesised from monthly listeners',
              value: t.spotifyStreams,
              status: 'estimated',
            },
          ]}
          footnote={
            <>
              Views and streams are different units and are combined in this bar only to show the
              epistemic split. The revenue model itself treats them as interchangeable — it applies
              the same $0.004 to a Spotify stream and a YouTube view. Deezer contributes no volume
              because its intermediate stream count is discarded, and “other platforms” contributes
              none because no platform in that bucket was ever queried.
            </>
          }
        />

        <RatioBar
          title="Streams, specifically"
          basis="Every stream figure in every deliverable"
          segments={[
            {
              label: 'Estimated — listeners × 3.5 × 3',
              value: t.spotifyStreams,
              status: 'estimated',
            },
          ]}
          footnote={
            <>
              Observed component: <span className="fig">0</span>, with the twenty-endpoint denial
              register below as the reason. This bar is one colour because the boundary between
              observation and estimate does not fall anywhere inside it.
            </>
          }
        />

        <RatioBar
          title="Gross streaming revenue by the epistemic class of its components"
          basis={`${formatFigure(t.grossUsd, { precision: 0, unit: 'usd' })} across five quarters`}
          segments={[
            {
              label: 'Estimated — a rate applied to a converted volume',
              value: t.spotifyUsd + t.youtubeUsd + t.deezerUsd,
              status: 'estimated',
            },
            {
              label: 'Assumed — a multiplier on platforms never queried',
              value: t.otherUsd,
              status: 'assumed',
            },
          ]}
          footnote={
            <>
              No observed component exists at any share. A rate applied to a returned YouTube view
              still yields an estimate, because the rate itself is an unsourced constant — which is
              why the returned-views share does not appear here as observed revenue.
            </>
          }
        />
      </Section>

      {/* ------------------------------------- every estimated figure */}
      <Section
        title="Every estimated figure in the system"
        subtitle="Driven by the epistemic register, not written by hand. Each row states the observed input, the conversion the code performs on it, what that produced across all five quarters, and the justification the code actually carries for the coefficient involved."
      >
        <Callout status="estimated" title="Classification is presentation metadata, not data" gapId="GAP-019">
          Exactly one epistemic flag exists in the entire delivery — YouTube views source. Every
          other classification in this table is applied here from the register and is never written
          back into any artifact. A downstream consumer reading the CSVs directly receives none of
          it.
        </Callout>

        <DataTable<EstimatedRow>
          rows={estimatedRows}
          rowKey={(r) => r.field}
          filename="nmas-estimated-figures"
          pageSize={null}
          caption="All five quarters combined. Employment is a stock and is shown at its latest quarter rather than summed."
          columns={estimatedColumns}
          expand={(r) => <EstimatedDetail row={r} />}
        />
      </Section>

      {/* --------------------------------------------- constants register */}
      <Section
        title="Coefficient register"
        subtitle={
          <>
            Every hardcoded coefficient that shapes a published figure, transcribed from source.{' '}
            <strong className="fig">{UNSOURCED_CONSTANTS.length}</strong> of{' '}
            <strong className="fig">{CONSTANTS.length}</strong> carry no locatable source;{' '}
            <strong className="fig">{DIVERGENT_CONSTANTS.length}</strong> hold more than one value
            for a single concept; <strong className="fig">{FALSE_PROVENANCE_CONSTANTS.length}</strong>{' '}
            are attributed to data that was never collected.
          </>
        }
      >
        {FALSE_PROVENANCE_CONSTANTS.map((c) => (
          <Callout key={c.id} status="rejected" title={`False provenance — ${c.concept}`}>
            <p style={{ margin: 0 }}>{c.falseProvenance}</p>
            <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--t-small)', color: 'var(--ink-3)' }}>
              Value <span className="fig">{c.value}</span>
              {c.unit ? ` ${c.unit}` : ''} ·{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>{c.sourceRefs.join(' · ')}</code>
            </p>
          </Callout>
        ))}

        <Callout status="assumed" title="One coefficient carries the headline figure" gapId="GAP-001">
          The streams-per-listener coefficient is a single unsourced number whose only justification
          in the code is the comment “Industry proxy”. It determines every Spotify stream figure, all
          Spotify revenue, and — through the 0.30 multiplier — the “other platforms” column as well.
          Between them those two columns are{' '}
          <Figure
            value={t.grossUsd > 0 ? ((t.spotifyUsd + t.otherUsd) / t.grossUsd) * 100 : null}
            status="derived"
            unit="pct"
            precision={1}
          />{' '}
          of gross streaming revenue. The sensitivity section below shows what moves when it moves.
        </Callout>

        <DataTable<ConstantEntry>
          rows={CONSTANTS}
          rowKey={(c) => c.id}
          filename="nmas-coefficient-register"
          pageSize={null}
          dense
          columns={constantColumns}
          expand={(c) => <ConstantDetail entry={c} />}
          caption="Every sourceRef was verified by direct read. Expand a row for its full justification, divergences and call sites."
        />
      </Section>

      {/* --------------------------------------------- denied endpoints */}
      <Section
        title="Denied endpoints — why an estimation layer exists at all"
        subtitle={
          <>
            This register is not a footnote to the estimation layer; it is its cause. Of the
            endpoints this study needed,{' '}
            <strong className="fig">{workingEndpoints.length}</strong> returned data and{' '}
            <strong className="fig">{vars.denied_endpoints.length}</strong> returned HTTP 401. Every
            endpoint that would have supplied an observed stream count is in the second list.
          </>
        }
      >
        <Callout status="rejected" title="Twenty confirmed denials, and every one of them matters" gapId="GAP-038">
          <p style={{ margin: 0 }}>
            The {workingEndpoints.length} endpoints that did work are all artist-level statistics
            under <code style={{ fontFamily: 'var(--font-mono)' }}>/api/artist/{'{id}'}/stat/*</code>{' '}
            — audience counts, not consumption. Track-level streams, every chart route, playlist
            appearances, fan metrics, listening demographics and album metadata were all refused.
            Read the two lists together and the shape of the delivery follows necessarily: with
            audience counts as the only input, a conversion coefficient is the only way to reach a
            volume, and a volume is the only way to reach money.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            This register is recorded in code and served by nothing. It should be the first thing a
            reader of the revenue figures sees.
          </p>
        </Callout>

        <DataTable<DeniedEndpoint>
          rows={vars.denied_endpoints}
          rowKey={(d) => `${d.metric}|${d.endpoint ?? ''}`}
          filename="nmas-denied-endpoints"
          pageSize={null}
          dense
          columns={deniedColumns}
          caption={`${vars.denied_endpoints.length} endpoints, all confirmed 401.`}
        />

        <div style={{ paddingTop: 'var(--s4)' }}>
          <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Endpoints that did return data
          </div>
          <ul
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem var(--s4)',
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {workingEndpoints.map((e) => (
              <li
                key={e}
                data-epi="observed"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-2)',
                  borderLeft: '2px solid var(--epi)',
                  paddingLeft: '0.4rem',
                }}
              >
                {e}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* --------------------------------------------------- sensitivity */}
      <Section
        title="Sensitivity — presentation-side, derived on this page"
        subtitle="What the headline streaming revenue would be if the streams-per-listener coefficient were 2.0 or 5.0 instead of the 3.5 the delivery shipped."
      >
        <Callout status="derived" title="These are not backend figures" >
          <p style={{ margin: 0 }}>
            Every number in this section is arithmetic performed in the browser over figures already
            displayed above: shipped Spotify revenue × (k ÷ 3.5), with the 0.30 “other platforms”
            multiplier carried through because it is defined on Spotify revenue. YouTube and Deezer
            do not move, because neither uses this coefficient. Nothing here was produced by the
            pipeline, nothing here is written to any artifact, and the CSV export of this table
            carries the same DERIVED classification.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            Held fixed: the $0.004 payout rate, the 15 views-per-subscriber coefficient, the 2.0
            streams-per-Deezer-fan coefficient and the ₦1,500 exchange rate. This is a
            one-coefficient sensitivity, not an uncertainty interval — the system supplies no
            distribution from which an interval could be drawn (GAP-023).
          </p>
        </Callout>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s5)',
            padding: 'var(--s2) 0 var(--s4)',
          }}
        >
          {sensitivity.map((s) => (
            <StatFigure
              key={s.k}
              label={
                s.k === SHIPPED_STREAMS_PER_LISTENER
                  ? `k = ${s.k.toFixed(1)} — as shipped`
                  : `k = ${s.k.toFixed(1)} — derived`
              }
              value={s.grossUsd}
              status={s.k === SHIPPED_STREAMS_PER_LISTENER ? 'estimated' : 'derived'}
              unit="usd"
              precision={0}
              footnote={
                s.k === SHIPPED_STREAMS_PER_LISTENER ? (
                  'The published five-quarter total.'
                ) : (
                  <>
                    {s.deltaPct > 0 ? '+' : ''}
                    <span className="fig">{s.deltaPct.toFixed(1)}%</span> against the published total
                  </>
                )
              }
            />
          ))}
        </div>

        <SensitivityBars rows={sensitivity} />

        <div style={{ paddingTop: 'var(--s4)' }}>
          <DataTable<SensitivityRow>
            rows={sensitivity}
            rowKey={(s) => String(s.k)}
            filename="nmas-streams-per-listener-sensitivity-DERIVED"
            pageSize={null}
            columns={sensitivityColumns}
            caption="Five quarters combined. Every column is DERIVED except the k = 3.5 row, which reproduces the published platform figures to within per-row cent rounding — which is itself the demonstration that this one coefficient drives them."
          />
        </div>

        <div style={{ paddingTop: 'var(--s5)' }}>
          <DataTable<QuarterSensitivity>
            rows={perQuarterSensitivity}
            rowKey={(q) => q.period}
            filename="nmas-sensitivity-by-quarter-DERIVED"
            pageSize={null}
            dense
            columns={quarterSensitivityColumns}
            caption="The same restatement quarter by quarter. The published column is the artifact figure; the two flanking columns are derived here."
          />
        </div>
      </Section>

      {/* -------------------------------------------------------- gaps */}
      <Section
        title="Gaps governing this panel"
        subtitle="Every absence rendered above resolves to one of these register entries."
      >
        <DataTable
          rows={gapsForPanel(7)}
          rowKey={(g) => g.id}
          filename="nmas-panel-7-gaps"
          pageSize={null}
          dense
          columns={gapColumns}
        />
      </Section>
    </>
  );
}

/* ------------------------------------------------- estimated-figure rows */

interface EstimatedRow {
  field: string;
  label: string;
  epistemic: Epistemic;
  mixedNote: string | null;
  observedInput: string;
  chain: DerivationStep[];
  constants: ConstantEntry[];
  value: number | null;
  valueText: string | null;
  unit: FieldSpec['unit'];
  precision: number;
  compact: boolean;
  share: number | null;
  shareBasis: string;
  scope: string;
  note?: string;
}

/** Per-field statements of what was actually observed, grounded in the registers. */
const OBSERVED_INPUT: Record<string, string> = {
  youtube_actual_views:
    'YouTube subscribers on the synthesised rows; the view count itself on the rows flagged “actual”.',
  est_spotify_quarterly_streams: 'Spotify monthly listeners — /api/artist/{id}/stat/spotify.',
  spotify_revenue_usd: 'Spotify monthly listeners, via the estimated stream count.',
  youtube_revenue_usd: 'YouTube views — returned on some rows, synthesised from subscribers on the rest.',
  deezer_revenue_usd: 'Deezer fans — /api/artist/{id}/stat/deezer.',
  other_platforms_revenue_usd:
    'None. No Apple Music, Audiomack, Boomplay or Tidal endpoint was ever called.',
  gross_streaming_revenue_usd: 'The four platform columns above, summed.',
  gross_streaming_revenue_ngn: 'Gross streaming revenue in USD.',
  nigeria_domestic_share_pct:
    'None. The listener-geography endpoint that would have supplied it was explicitly skipped.',
  export_share_pct: 'None. Written as a literal 0.70, not as one minus the domestic share.',
  domestic_revenue_usd: 'Total streaming revenue.',
  gross_export_revenue_usd: 'Total streaming revenue.',
  top_export_markets: 'None. A constant string emitted identically on every row.',
  total_cost_ngn: 'Artist roster size — a count of names on a list, not a cost observation.',
  total_employment: 'None. A national baseline taken from a cited secondary source.',
  male: 'Total employment, which is itself allocated.',
  female: 'Total employment, which is itself allocated.',
};

function buildEstimatedRows(t: Totals): EstimatedRow[] {
  const volumeTotal = t.spotifyStreams + t.ytViews;
  const gross = t.grossUsd;

  const spec = (field: string): FieldSpec | undefined => FIELDS.find((f) => f.field === field);

  const make = (
    field: string,
    v: {
      value?: number | null;
      valueText?: string | null;
      share?: number | null;
      shareBasis: string;
      scope: string;
      compact?: boolean;
      mixedNote?: string | null;
    },
  ): EstimatedRow | null => {
    const s = spec(field);
    if (!s) return null;
    const constants = (s.chain ?? [])
      .map((step) => (step.constantId ? CONSTANTS_BY_ID[step.constantId] : undefined))
      .filter((c): c is ConstantEntry => Boolean(c));
    return {
      field,
      label: s.label,
      epistemic: s.epistemic,
      mixedNote: v.mixedNote ?? null,
      observedInput: OBSERVED_INPUT[field] ?? 'Not stated in the register.',
      chain: s.chain ?? [],
      constants,
      value: v.value ?? null,
      valueText: v.valueText ?? null,
      unit: s.unit,
      precision: s.precision,
      compact: v.compact ?? false,
      share: v.share ?? null,
      shareBasis: v.shareBasis,
      scope: v.scope,
      note: s.note,
    };
  };

  const pctOfGross = (n: number): number | null => (gross > 0 ? (n / gross) * 100 : null);

  const out: Array<EstimatedRow | null> = [
    make('youtube_actual_views', {
      value: t.ytViews,
      share: volumeTotal > 0 ? (t.ytViews / volumeTotal) * 100 : null,
      shareBasis: 'of combined stream and view volume',
      scope: `${t.rows} rows · ${t.ytRowsReturned} returned, ${t.ytRowsSynthesised} synthesised`,
      compact: true,
      mixedNote: `Mixed: ${formatFigure(t.ytViewsReturned, { compact: true })} returned, ${formatFigure(
        t.ytViewsSynthesised,
        { compact: true },
      )} synthesised.`,
    }),
    make('est_spotify_quarterly_streams', {
      value: t.spotifyStreams,
      share: volumeTotal > 0 ? (t.spotifyStreams / volumeTotal) * 100 : null,
      shareBasis: 'of combined stream and view volume',
      scope: `${t.rows} rows · 5 quarters`,
      compact: true,
    }),
    make('spotify_revenue_usd', {
      value: t.spotifyUsd,
      share: pctOfGross(t.spotifyUsd),
      shareBasis: 'of gross streaming revenue',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('youtube_revenue_usd', {
      value: t.youtubeUsd,
      share: pctOfGross(t.youtubeUsd),
      shareBasis: 'of gross streaming revenue',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('deezer_revenue_usd', {
      value: t.deezerUsd,
      share: pctOfGross(t.deezerUsd),
      shareBasis: 'of gross streaming revenue',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('other_platforms_revenue_usd', {
      value: t.otherUsd,
      share: pctOfGross(t.otherUsd),
      shareBasis: 'of gross streaming revenue',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('gross_streaming_revenue_usd', {
      value: t.grossUsd,
      share: pctOfGross(t.grossUsd),
      shareBasis: 'it is the total',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('gross_streaming_revenue_ngn', {
      value: t.grossNgn,
      share: pctOfGross(t.grossUsd),
      shareBasis: 'the same total, converted at ₦1,500',
      scope: `${t.rows} rows · 5 quarters`,
      compact: true,
    }),
    make('domestic_revenue_usd', {
      value: t.domesticUsd,
      share: pctOfGross(t.domesticUsd),
      shareBasis: 'of gross streaming revenue — by construction, not by measurement',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('gross_export_revenue_usd', {
      value: t.exportUsd,
      share: pctOfGross(t.exportUsd),
      shareBasis: 'of gross streaming revenue — tautologically 70%',
      scope: `${t.rows} rows · 5 quarters`,
    }),
    make('nigeria_domestic_share_pct', {
      value: t.domesticSharePct,
      share: null,
      shareBasis: 'It is itself a share, imposed on every row.',
      scope: `identical on all ${t.rows} rows`,
    }),
    make('export_share_pct', {
      value: t.exportSharePct,
      share: null,
      shareBasis: 'It is itself a share, imposed on every row.',
      scope: `identical on all ${t.rows} rows`,
    }),
    make('top_export_markets', {
      valueText: t.exportMarkets,
      share: null,
      shareBasis: 'Not a quantity.',
      scope: `identical on all ${t.rows} rows`,
    }),
    make('total_cost_ngn', {
      value: t.costNgn,
      share: null,
      shareBasis: 'Not a component of revenue. Never apportioned to one.',
      scope: `4 categories × ${t.costQuarters} quarters, no variance between them`,
      compact: true,
    }),
    make('total_employment', {
      value: t.employmentLatest,
      share: null,
      shareBasis: 'A stock, not a flow. Not summed across quarters.',
      scope: t.latestEmploymentPeriod
        ? `latest quarter, ${formatPeriod(t.latestEmploymentPeriod)}`
        : 'latest quarter',
    }),
    make('male', {
      value: t.maleLatest,
      share:
        t.employmentLatest && t.maleLatest ? (t.maleLatest / t.employmentLatest) * 100 : null,
      shareBasis: 'of total employment — the imposed 0.62 split',
      scope: t.latestEmploymentPeriod
        ? `latest quarter, ${formatPeriod(t.latestEmploymentPeriod)}`
        : 'latest quarter',
    }),
    make('female', {
      value: t.femaleLatest,
      share:
        t.employmentLatest && t.femaleLatest ? (t.femaleLatest / t.employmentLatest) * 100 : null,
      shareBasis: 'of total employment — the imposed 0.38 split',
      scope: t.latestEmploymentPeriod
        ? `latest quarter, ${formatPeriod(t.latestEmploymentPeriod)}`
        : 'latest quarter',
    }),
  ];

  return out.filter((r): r is EstimatedRow => r !== null);
}

const estimatedColumns: Column<EstimatedRow>[] = [
  {
    key: 'figure',
    header: 'Figure',
    width: '13rem',
    value: (r) => r.label,
    render: (r) => (
      <span>
        <span style={{ fontWeight: 600 }}>{r.label}</span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-4)',
          }}
        >
          {r.field}
        </span>
      </span>
    ),
  },
  {
    key: 'class',
    header: 'Class',
    value: (r) => r.epistemic,
    groupable: true,
    render: (r) => (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.15rem' }}>
        <EpistemicChip status={r.epistemic} />
        {r.mixedNote ? (
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--est)' }}>mixed</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'input',
    header: 'Observed input',
    width: '18rem',
    value: (r) => r.observedInput,
    render: (r) => (
      <span style={{ fontSize: 'var(--t-small)' }}>
        {r.observedInput.startsWith('None') ? (
          <>
            <strong style={{ color: 'var(--asm)' }}>None.</strong>
            {r.observedInput.slice(5)}
          </>
        ) : (
          r.observedInput
        )}
      </span>
    ),
  },
  {
    key: 'conversion',
    header: 'Conversion applied',
    width: '20rem',
    value: (r) => r.chain.map((s) => s.op).join(' → '),
    render: (r) => (
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 'var(--t-small)' }}>
        {r.chain.length === 0 ? (
          <li style={{ color: 'var(--ink-3)' }}>No conversion recorded in the register.</li>
        ) : (
          r.chain.map((s, i) => (
            <li key={i} style={{ display: 'flex', gap: '0.35rem' }}>
              <span className="fig" style={{ color: 'var(--ink-4)' }}>
                {i + 1}.
              </span>
              <span>{s.op}</span>
            </li>
          ))
        )}
      </ol>
    ),
  },
  {
    key: 'value',
    header: 'Resulting estimate',
    numeric: true,
    value: (r) => r.value ?? r.valueText ?? null,
    render: (r) =>
      r.valueText !== null ? (
        <span style={{ fontSize: 'var(--t-small)', textAlign: 'left', display: 'inline-block' }}>
          “{r.valueText}”
        </span>
      ) : (
        <Figure
          value={r.value}
          field={r.field}
          unit={r.unit}
          precision={r.precision}
          compact={r.compact}
          keyline
          label={r.label}
        />
      ),
  },
  {
    key: 'share',
    header: 'Share of total',
    numeric: true,
    value: (r) => r.share,
    render: (r) =>
      r.share === null ? (
        <span
          style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)', display: 'inline-block', textAlign: 'right' }}
        >
          {r.shareBasis}
        </span>
      ) : (
        <span style={{ display: 'inline-block', textAlign: 'right' }}>
          <Figure value={r.share} status="derived" unit="pct" precision={1} />
          <span style={{ display: 'block', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
            {r.shareBasis}
          </span>
        </span>
      ),
  },
  {
    key: 'justification',
    header: 'Justification',
    width: '17rem',
    value: (r) =>
      r.constants.length === 0
        ? 'no coefficient'
        : r.constants
            .map((c) =>
              c.justification === 'absent' || c.justification === 'self-declared-unsourced'
                ? `${c.concept}: unsourced`
                : `${c.concept}: ${c.justification}`,
            )
            .join(' · '),
    render: (r) => <JustificationCell constants={r.constants} />,
  },
  {
    key: 'scope',
    header: 'Scope',
    optional: true,
    value: (r) => r.scope,
  },
  {
    key: 'confidence',
    header: 'Confidence',
    optional: true,
    value: () => null,
    note: 'No confidence or interval field exists anywhere.',
    render: () => <NotCollected short gapId="GAP-023" reason="No uncertainty field exists." />,
  },
];

function JustificationCell({ constants }: { constants: ConstantEntry[] }) {
  if (constants.length === 0) {
    return (
      <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
        No coefficient — an arithmetic combination of the rows above.
      </span>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {constants.map((c) => {
        const unsourced =
          c.justification === 'absent' || c.justification === 'self-declared-unsourced';
        return (
          <li key={c.id} style={{ paddingBottom: '0.2rem' }}>
            <span style={{ fontSize: 'var(--t-small)' }}>{c.concept}</span>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--t-micro)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 650,
                color: unsourced ? 'var(--asm)' : 'var(--ink-3)',
              }}
            >
              {unsourced ? 'unsourced' : c.justification}
              {c.divergence ? (
                <span style={{ color: 'var(--rej)' }}> · divergent</span>
              ) : null}
              {c.falseProvenance ? (
                <span style={{ color: 'var(--rej)' }}> · false provenance</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EstimatedDetail({ row }: { row: EstimatedRow }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--s4)', gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))' }}>
      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Derivation chain
        </div>
        <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--t-small)', lineHeight: 1.6 }}>
          {row.chain.map((s, i) => (
            <li key={i}>
              {s.op}
              {s.sourceRef ? (
                <code
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--t-micro)',
                    color: 'var(--ink-4)',
                  }}
                >
                  {s.sourceRef}
                </code>
              ) : null}
            </li>
          ))}
        </ol>
        {row.mixedNote ? (
          <p style={{ marginTop: 'var(--s3)', fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>
            {row.mixedNote}
          </p>
        ) : null}
        {row.note ? (
          <p style={{ marginTop: 'var(--s3)', fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>
            {row.note}
          </p>
        ) : null}
      </div>
      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Coefficients involved
        </div>
        {row.constants.length === 0 ? (
          <p style={{ fontSize: 'var(--t-small)', color: 'var(--ink-3)', margin: 0 }}>
            None. This figure is an arithmetic combination of others on this page.
          </p>
        ) : (
          row.constants.map((c) => <ConstantDetail key={c.id} entry={c} />)
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------- constants register */

const constantColumns: Column<ConstantEntry>[] = [
  {
    key: 'concept',
    header: 'Concept',
    width: '15rem',
    value: (c) => c.concept,
    render: (c) => (
      <span>
        <span style={{ fontWeight: 600 }}>{c.concept}</span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-4)',
          }}
        >
          {c.id}
        </span>
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value',
    value: (c) => c.value,
    width: '14rem',
    render: (c) => (
      <span className="fig" style={{ fontSize: 'var(--t-small)' }}>
        {c.value}
        {c.unit ? (
          <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-3)' }}> {c.unit}</span>
        ) : null}
      </span>
    ),
  },
  { key: 'usedFor', header: 'Where it is used', value: (c) => c.usedFor, width: '20rem' },
  {
    key: 'justification',
    header: 'Justification',
    value: (c) => c.justification,
    groupable: true,
    render: (c) => {
      const unsourced =
        c.justification === 'absent' || c.justification === 'self-declared-unsourced';
      return (
        <span
          className="epi-chip"
          data-epi={unsourced ? 'assumed' : 'observed'}
          title={c.justificationText ?? 'No justification of any kind accompanies this constant.'}
        >
          {unsourced ? 'unsourced' : c.justification}
        </span>
      );
    },
  },
  {
    key: 'flags',
    header: 'Flags',
    value: (c) =>
      [c.divergence ? 'divergent' : null, c.falseProvenance ? 'false provenance' : null, c.dead ? 'dead' : null]
        .filter(Boolean)
        .join(' · ') || null,
    render: (c) => {
      const flags: Array<[string, Epistemic, string]> = [];
      if (c.divergence) flags.push(['divergent', 'rejected', c.divergence]);
      if (c.falseProvenance) flags.push(['false provenance', 'rejected', c.falseProvenance]);
      if (c.dead) flags.push(['never applied', 'unavailable', 'Documented in code and applied to nothing.']);
      if (flags.length === 0) {
        return <span style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}>none</span>;
      }
      return (
        <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {flags.map(([label, status, title]) => (
            <span key={label} className="epi-chip" data-epi={status} title={title}>
              {label}
            </span>
          ))}
        </span>
      );
    },
  },
  {
    key: 'refs',
    header: 'Call sites',
    numeric: true,
    value: (c) => c.sourceRefs.length,
    render: (c) => <Figure value={c.sourceRefs.length} status="observed" unit="count" />,
  },
];

function ConstantDetail({ entry }: { entry: ConstantEntry }) {
  return (
    <div style={{ paddingBottom: 'var(--s3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--t-body)' }}>{entry.concept}</strong>
        <span className="fig" style={{ color: 'var(--ink-2)' }}>
          {entry.value}
          {entry.unit ? ` ${entry.unit}` : ''}
        </span>
      </div>
      <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>
        {entry.justificationText ?? (
          <span style={{ color: 'var(--asm)' }}>
            No justification of any kind accompanies this constant — no comment, no citation, no
            source string.
          </span>
        )}
      </p>
      {entry.divergence ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--t-small)', color: 'var(--rej)' }}>
          <strong>Divergence.</strong> {entry.divergence}
        </p>
      ) : null}
      {entry.falseProvenance ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--t-small)', color: 'var(--rej)' }}>
          <strong>False provenance.</strong> {entry.falseProvenance}
        </p>
      ) : null}
      <ul style={{ margin: '0.35rem 0 0', padding: 0, listStyle: 'none' }}>
        {entry.sourceRefs.map((r) => (
          <li
            key={r}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-4)' }}
          >
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------- denied endpoints */

const deniedColumns: Column<DeniedEndpoint>[] = [
  { key: 'metric', header: 'Metric', value: (d) => d.metric, width: '15rem' },
  {
    key: 'endpoint',
    header: 'Endpoint',
    value: (d) => d.endpoint,
    width: '20rem',
    render: (d) =>
      d.endpoint ? (
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>{d.endpoint}</code>
      ) : (
        <NotCollected short reason="No endpoint recorded for this denial." />
      ),
  },
  {
    key: 'status',
    header: 'Status',
    value: (d) => d.status,
    groupable: true,
    render: (d) =>
      d.status ? (
        <span
          className="epi-chip"
          data-epi="rejected"
          title="Confirmed refusal at the plan tier this study ran on."
        >
          {d.status}
        </span>
      ) : (
        <NotCollected short reason="No status recorded against this denial." />
      ),
  },
  {
    key: 'note',
    header: 'Note',
    value: (d) => d.note,
    width: '22rem',
    render: (d) =>
      d.note ? (
        <span style={{ fontSize: 'var(--t-small)' }}>{d.note}</span>
      ) : (
        <span style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}>
          Recorded without a note.
        </span>
      ),
  },
  {
    key: 'ref',
    header: 'Source',
    value: (d) => d.source_ref,
    render: (d) => (
      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-4)' }}>
        {d.source_ref}
      </code>
    ),
  },
];

/* -------------------------------------------------------- sensitivity */

interface SensitivityRow {
  k: number;
  spotifyUsd: number;
  youtubeUsd: number;
  deezerUsd: number;
  otherUsd: number;
  grossUsd: number;
  grossNgn: number;
  deltaUsd: number;
  deltaPct: number;
  shipped: boolean;
}

function buildSensitivity(t: Totals): SensitivityRow[] {
  return SENSITIVITY_COEFFICIENTS.map((k) => {
    const factor = k / SHIPPED_STREAMS_PER_LISTENER;
    const spotifyUsd = t.spotifyUsd * factor;
    // "Other platforms" is defined as Spotify revenue × 0.30, so it scales with it.
    const otherUsd = t.otherUsd * factor;
    const grossUsd = spotifyUsd + t.youtubeUsd + t.deezerUsd + otherUsd;
    return {
      k,
      spotifyUsd,
      youtubeUsd: t.youtubeUsd,
      deezerUsd: t.deezerUsd,
      otherUsd,
      grossUsd,
      grossNgn: grossUsd * 1500,
      deltaUsd: grossUsd - t.grossUsd,
      deltaPct: t.grossUsd > 0 ? ((grossUsd - t.grossUsd) / t.grossUsd) * 100 : 0,
      shipped: k === SHIPPED_STREAMS_PER_LISTENER,
    };
  });
}

interface QuarterSensitivity {
  period: string;
  low: number;
  published: number;
  high: number;
}

function buildPerQuarterSensitivity(rev: Revenue): QuarterSensitivity[] {
  return [...rev.periods].sort(comparePeriods).map((period) => {
    const rows = rev.rows.filter((r) => r.period === period);
    const spotify = rows.reduce((a, r) => a + (r.spotify_revenue_usd ?? 0), 0);
    const other = rows.reduce((a, r) => a + (r.other_platforms_revenue_usd ?? 0), 0);
    const fixed =
      rows.reduce((a, r) => a + (r.youtube_revenue_usd ?? 0), 0) +
      rows.reduce((a, r) => a + (r.deezer_revenue_usd ?? 0), 0);
    const at = (k: number) => {
      const f = k / SHIPPED_STREAMS_PER_LISTENER;
      return spotify * f + other * f + fixed;
    };
    const published =
      rev.streaming_totals.find((s) => s.period === period)?.gross_streaming_revenue_usd ?? null;
    return {
      period,
      low: at(2.0),
      published: typeof published === 'number' ? published : spotify + other + fixed,
      high: at(5.0),
    };
  });
}

const sensitivityColumns: Column<SensitivityRow>[] = [
  {
    key: 'k',
    header: 'Streams per listener',
    numeric: true,
    value: (s) => s.k,
    render: (s) => (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem' }}>
        <Figure value={s.k} status={s.shipped ? 'assumed' : 'derived'} precision={1} />
        {s.shipped ? <EpistemicChip status="assumed" bare title="The coefficient the delivery shipped." /> : null}
      </span>
    ),
  },
  {
    key: 'spotify',
    header: 'Spotify revenue',
    numeric: true,
    value: (s) => s.spotifyUsd,
    render: (s) => (
      <Figure value={s.spotifyUsd} status={s.shipped ? 'estimated' : 'derived'} unit="usd" precision={0} />
    ),
  },
  {
    key: 'other',
    header: 'Other platforms',
    numeric: true,
    value: (s) => s.otherUsd,
    note: 'Scales with Spotify revenue because it is defined as 30% of it.',
    render: (s) => (
      <Figure value={s.otherUsd} status={s.shipped ? 'assumed' : 'derived'} unit="usd" precision={0} />
    ),
  },
  {
    key: 'youtube',
    header: 'YouTube (unchanged)',
    numeric: true,
    value: (s) => s.youtubeUsd,
    note: 'Does not use this coefficient.',
    render: (s) => <Figure value={s.youtubeUsd} field="youtube_revenue_usd" unit="usd" precision={0} />,
  },
  {
    key: 'deezer',
    header: 'Deezer (unchanged)',
    numeric: true,
    value: (s) => s.deezerUsd,
    note: 'Uses its own 2.0 streams-per-fan coefficient, held fixed here.',
    render: (s) => <Figure value={s.deezerUsd} field="deezer_revenue_usd" unit="usd" precision={0} />,
  },
  {
    key: 'gross',
    header: 'Gross streaming revenue',
    numeric: true,
    value: (s) => s.grossUsd,
    render: (s) => (
      <Figure
        value={s.grossUsd}
        status={s.shipped ? 'estimated' : 'derived'}
        unit="usd"
        precision={0}
        keyline
      />
    ),
  },
  {
    key: 'grossNgn',
    header: 'Gross (NGN)',
    numeric: true,
    optional: true,
    note: 'At the same fixed ₦1,500/USD.',
    value: (s) => s.grossNgn,
    render: (s) => (
      <Figure value={s.grossNgn} status={s.shipped ? 'estimated' : 'derived'} unit="ngn" precision={0} compact />
    ),
  },
  {
    key: 'delta',
    header: 'Δ against published',
    numeric: true,
    value: (s) => s.deltaUsd,
    render: (s) =>
      s.shipped ? (
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>the published figure</span>
      ) : (
        <Figure value={s.deltaUsd} status="derived" unit="usd" precision={0} />
      ),
  },
  {
    key: 'deltaPct',
    header: 'Δ %',
    numeric: true,
    value: (s) => s.deltaPct,
    render: (s) =>
      s.shipped ? (
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>reference</span>
      ) : (
        <Figure value={s.deltaPct} status="derived" unit="pct" precision={1} />
      ),
  },
];

const quarterSensitivityColumns: Column<QuarterSensitivity>[] = [
  { key: 'period', header: 'Quarter', value: (q) => q.period, render: (q) => formatPeriod(q.period) },
  {
    key: 'low',
    header: 'k = 2.0 (derived)',
    numeric: true,
    value: (q) => q.low,
    render: (q) => <Figure value={q.low} status="derived" unit="usd" precision={0} />,
  },
  {
    key: 'published',
    header: 'k = 3.5 (published)',
    numeric: true,
    value: (q) => q.published,
    render: (q) => (
      <Figure value={q.published} field="gross_streaming_revenue_usd" unit="usd" precision={0} keyline />
    ),
  },
  {
    key: 'high',
    header: 'k = 5.0 (derived)',
    numeric: true,
    value: (q) => q.high,
    render: (q) => <Figure value={q.high} status="derived" unit="usd" precision={0} />,
  },
  {
    key: 'spread',
    header: 'Spread',
    numeric: true,
    value: (q) => q.high - q.low,
    note: 'High minus low. Derived on this page.',
    render: (q) => <Figure value={q.high - q.low} status="derived" unit="usd" precision={0} />,
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

function RatioBar({
  title,
  basis,
  segments,
  footnote,
}: {
  title: string;
  basis: string;
  segments: Array<{ label: string; value: number; status: Epistemic }>;
  footnote?: ReactNode;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return (
      <div style={{ padding: 'var(--s4) 0' }}>
        <div className="h-section">{title}</div>
        <NotCollected reason="No rows contribute to this bar." />
      </div>
    );
  }
  return (
    <div style={{ padding: 'var(--s4) 0', borderTop: '1px solid var(--rule-hair)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s4)', flexWrap: 'wrap' }}>
        <div className="h-section">{title}</div>
        <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>{basis}</div>
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '1.75rem',
          marginTop: '0.4rem',
          border: '1px solid var(--rule-strong)',
        }}
        role="img"
        aria-label={segments
          .map(
            (s) =>
              `${s.label}: ${formatFigure((s.value / total) * 100, { precision: 1, unit: 'pct' })}`,
          )
          .join('; ')}
      >
        {segments.map((s, i) => (
          <div
            key={s.label}
            data-epi={s.status}
            title={`${s.label} — ${formatFigure(s.value, { compact: true })}`}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: `color-mix(in srgb, var(--epi) ${s.status === 'observed' ? 82 : 60}%, var(--paper))`,
              borderRight: i < segments.length - 1 ? '1px solid var(--paper)' : undefined,
            }}
          />
        ))}
      </div>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.3rem var(--s5)',
          listStyle: 'none',
          margin: '0.45rem 0 0',
          padding: 0,
        }}
      >
        {segments.map((s) => (
          <li key={s.label} data-epi={s.status} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span
              style={{
                width: '0.7rem',
                height: '0.7rem',
                background: 'var(--epi)',
                display: 'inline-block',
                alignSelf: 'center',
                flex: 'none',
              }}
            />
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>{s.label}</span>
            <Figure value={(s.value / total) * 100} status="derived" unit="pct" precision={1} />
            <span className="fig" style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-4)' }}>
              {formatFigure(s.value, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
      {footnote ? (
        <p
          style={{
            margin: '0.5rem 0 0',
            fontSize: 'var(--t-small)',
            color: 'var(--ink-3)',
            maxWidth: '78ch',
          }}
        >
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

/** Three ruled bars, one per coefficient. Drawn to a common scale. */
function SensitivityBars({ rows }: { rows: SensitivityRow[] }) {
  const max = Math.max(...rows.map((r) => r.grossUsd), 1);
  return (
    <div style={{ display: 'grid', gap: '0.4rem', maxWidth: '52rem' }}>
      {rows.map((r) => (
        <div
          key={r.k}
          data-epi={r.shipped ? 'estimated' : 'derived'}
          style={{ display: 'grid', gridTemplateColumns: '5.5rem 1fr 9rem', gap: 'var(--s3)', alignItems: 'center' }}
        >
          <span className="fig" style={{ fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>
            k = {r.k.toFixed(1)}
          </span>
          <span
            style={{
              display: 'block',
              height: '0.9rem',
              background: 'var(--paper-sunk)',
              border: '1px solid var(--rule-hair)',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${(r.grossUsd / max) * 100}%`,
                background: `color-mix(in srgb, var(--epi) ${r.shipped ? 75 : 45}%, var(--paper))`,
              }}
            />
          </span>
          <Figure
            value={r.grossUsd}
            status={r.shipped ? 'estimated' : 'derived'}
            unit="usd"
            precision={0}
            compact
          />
        </div>
      ))}
    </div>
  );
}
