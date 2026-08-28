/**
 * PANEL 1 — Executive Console
 *
 * The front door. Top-level figures only, each carrying its epistemic status at
 * the point of display and each clicking through to the panel that holds its
 * lineage.
 *
 * What it renders, all computed from the static projection at read time:
 *   coverage      quarters framed / observed / with revenue / before the floor,
 *                 total daily observations, artist universe, artists with revenue
 *   balance       total estimated streams against total observed streams, which
 *                 is zero, drawn to scale
 *   revenue       the latest quarter's gross streaming and export figures with
 *                 the full coefficient chain behind each
 *   run           the one recorded extraction run and its unit triple
 *
 * What it cannot render, and says so on the page rather than here:
 *   observed streams          all 20 track-level endpoints are 401 (GAP-006)
 *   NCR, DEI                  no such computation exists (GAP-002, GAP-003)
 *   resident / diaspora split no residency field or rule exists (GAP-004)
 *   export markets detected   listener geography is 100% empty (GAP-008)
 *   confidence on any figure  no interval exists anywhere (GAP-023)
 *
 * Every number below is read from an artifact or is arithmetic over artifact
 * values performed in this file. Nothing is transcribed from prose.
 */

import { useMemo, type ReactNode } from 'react';
import { useArtists, useCoverage, useRevenue, useRun } from '../data/client';
import { formatFigure, formatPeriod } from '../data/client';
import {
  Callout,
  EpistemicChip,
  EpistemicDot,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
  type ProvenanceInfo,
} from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import { resolveEpistemic } from '../registry/epistemic';
import { gapsForPanel, type Gap } from '../registry/gaps';
import type { ArtistRow, Coverage, Epistemic, Revenue, Run } from '../data/types';

/**
 * The study frame. Twenty-four quarters is the requirement recorded in the gap
 * register (GAP-001); no artifact contains it, so it is displayed as an assumed
 * frame rather than as a measurement.
 */
const STUDY_FRAME_QUARTERS = 24;

/** Confirmed 401 endpoints in variables.json, all track-level or chart-level. */
const DENIED_ENDPOINTS = 20;

function go(panel: string): void {
  window.location.hash = `/${panel}`;
}

/* ------------------------------------------------------------------ tiles */

interface TileProps {
  label: string;
  value: number | null;
  status?: Epistemic;
  field?: string;
  unit?: 'usd' | 'ngn' | 'count' | 'pct';
  precision?: number;
  footnote?: ReactNode;
  gapId?: string;
  reason?: string;
  provenance?: ProvenanceInfo;
  to?: string;
}

/**
 * A headline figure. The epistemic chip is rendered beside the figure itself,
 * not in a page footnote — an estimate must be legible where it is read.
 */
function Tile({
  label,
  value,
  status,
  field,
  unit,
  precision,
  footnote,
  gapId,
  reason,
  provenance,
  to,
}: TileProps) {
  const absent = value === null || value === undefined;
  const epi: Epistemic = absent
    ? 'unavailable'
    : (status ?? (field ? resolveEpistemic(field) : 'derived'));

  return (
    <StatFigure
      label={label}
      value={value}
      field={field}
      status={status}
      unit={unit}
      precision={precision}
      gapId={gapId}
      reason={reason}
      provenance={provenance}
      onClick={to ? () => go(to) : undefined}
      footnote={
        <span style={{ display: 'block' }}>
          <EpistemicChip status={epi} />
          {footnote ? <span style={{ display: 'block', marginTop: '0.2rem' }}>{footnote}</span> : null}
        </span>
      }
    />
  );
}

function Grid({ children, min = '13rem' }: { children: ReactNode; min?: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`,
        gap: 'var(--s5) var(--s4)',
        paddingTop: 'var(--s2)',
      }}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

function countRevenueArtists(rev: Revenue): number {
  return new Set(rev.rows.map((r) => r.artist_name)).size;
}

function sumEstimatedStreams(rev: Revenue): number {
  return rev.rows.reduce((acc, r) => acc + (r.est_spotify_quarterly_streams ?? 0), 0);
}

function youtubeFlagSplit(rev: Revenue): { actual: number; estimated: number; unflagged: number } {
  let actual = 0;
  let estimated = 0;
  let unflagged = 0;
  for (const r of rev.rows) {
    if (r.youtube_views_source === 'actual') actual += 1;
    else if (r.youtube_views_source === 'estimated') estimated += 1;
    else unflagged += 1;
  }
  return { actual, estimated, unflagged };
}

/** Latest quarter by the artifact's own ordering, which is chronological. */
function latestPeriod(rev: Revenue): string | null {
  return rev.periods.length > 0 ? rev.periods[rev.periods.length - 1] : null;
}

function totalFor(
  totals: Array<Record<string, number | string | null>>,
  period: string,
  metric: string,
): number | null {
  const row = totals.find((t) => t.period === period);
  const v = row ? row[metric] : null;
  return typeof v === 'number' ? v : null;
}

/**
 * The run report is markdown. The unit triple exists nowhere else in the
 * projection, so it is read out of the report rather than left absent — and
 * returns null if the line is not there, never a zero.
 */
function unitFromReport(md: string | null, label: string): number | null {
  if (!md) return null;
  const m = new RegExp(`^-\\s*${label}:\\s*([0-9,]+)\\s*$`, 'm').exec(md);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function statusFromReport(md: string | null): string | null {
  if (!md) return null;
  const m = /^-\s*Status:\s*(.+)$/m.exec(md);
  return m ? m[1].trim() : null;
}

/** run.duration is null in the artifact, so it is derived from the two stamps. */
function durationBetween(started: string | null, finished: string | null): string | null {
  if (!started || !finished) return null;
  const a = Date.parse(started);
  const b = Date.parse(finished);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  const s = Math.round((b - a) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}

/* ==================================================================== panel */

export default function ExecutiveConsole() {
  const coverage = useCoverage();
  const revenue = useRevenue();
  const run = useRun();
  const artists = useArtists();

  return (
    <>
      <Section
        title="The headline limitation"
        subtitle="Stated first, because every figure below inherits it."
      >
        <Callout
          status="rejected"
          title="This console reports zero observed streams."
          gapId="GAP-006"
        >
          Not one stream count in this system was retrieved from a source. All{' '}
          <strong className="fig">{DENIED_ENDPOINTS}</strong> track-level stream and chart endpoints
          are confirmed HTTP 401 at the plan tier the study ran on, and the system holds exactly one
          track row. Every stream figure the study published is{' '}
          <strong>Spotify monthly listeners × 3.5 streams per listener per month × 3 months</strong>,
          and every revenue figure is that estimate multiplied by a flat $0.004 payout rate. The 3.5
          carries the entire streaming revenue estimate and its only justification in the source is
          the comment “Industry proxy”. Read what follows as an estimate resting on an audience
          size, not on a play.
        </Callout>
      </Section>

      <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
        {(cov) => (
          <Resolved query={revenue} artifact="revenue.json" label="Reading revenue">
            {(rev) => (
              <>
                <CoverageSection cov={cov} rev={rev} />
                <BalanceSection rev={rev} />
                <IndicesSection />
                <AccountsSection artists={artists.data} artistsFailed={Boolean(artists.error)} />
                <RevenueSection rev={rev} />
              </>
            )}
          </Resolved>
        )}
      </Resolved>

      <Resolved query={run} artifact="run.json" label="Reading run record">
        {(r) => <RunSection run={r} cov={coverage.data} />}
      </Resolved>

      <NotShownSection />
    </>
  );
}

/* -------------------------------------------------------------- coverage */

function CoverageSection({ cov, rev }: { cov: Coverage; rev: Revenue }) {
  const observedQuarters = cov.periods_observed.length;
  const revenueQuarters = rev.periods.length;
  const beforeFloor = STUDY_FRAME_QUARTERS - observedQuarters;
  const revenueArtists = countRevenueArtists(rev);

  const perPeriodCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rev.rows) m.set(r.period, (m.get(r.period) ?? 0) + 1);
    return rev.periods.map((p) => m.get(p) ?? 0);
  }, [rev]);

  return (
    <Section
      title="Coverage"
      subtitle={
        <>
          The study frame is <span className="fig">{STUDY_FRAME_QUARTERS}</span> quarters. The
          archive floor is <span className="fig">{cov.archive_floor}</span>, so{' '}
          <span className="fig">{beforeFloor}</span> of those quarters could not have been collected
          by any run. Revenue exists for <span className="fig">{revenueQuarters}</span> quarters
          only.
        </>
      }
    >
      <Grid>
        <Tile
          label="Quarters in study frame"
          value={STUDY_FRAME_QUARTERS}
          status="assumed"
          footnote="The six-year frame the study was scoped against. No artifact contains it. GAP-001."
          to="coverage"
        />
        <Tile
          label="Quarters with observations"
          value={observedQuarters}
          status="observed"
          footnote={`${formatPeriod(cov.periods_observed[0])} – ${formatPeriod(
            cov.periods_observed[observedQuarters - 1],
          )}. 24 was never achievable.`}
          to="coverage"
        />
        <Tile
          label="Quarters with revenue"
          value={revenueQuarters}
          status="observed"
          footnote={`${formatPeriod(rev.periods[0])} – ${formatPeriod(
            rev.periods[revenueQuarters - 1],
          )}. Four observed quarters carry no revenue row at all.`}
          to="revenue"
        />
        <Tile
          label="Quarters before archive floor"
          value={beforeFloor}
          status="derived"
          footnote={`${STUDY_FRAME_QUARTERS} framed − ${observedQuarters} observed. Structurally unrecoverable at this plan tier, not merely empty.`}
          to="coverage"
        />
        <Tile
          label="Daily observations"
          value={cov.total_observations}
          status="observed"
          unit="count"
          footnote="Script artifact. The database export holds 265,538 over 65 artists and the documentation states a third figure — GAP-032."
          to="coverage"
        />
        <Tile
          label="Artists in universe"
          value={cov.distinct_artists}
          status="observed"
          unit="count"
          footnote="Artist master list. The population frame holds 855; only these 131 rows — 130 distinct artists — were extracted."
          to="artists"
        />
        <Tile
          label="Artists with revenue"
          value={revenueArtists}
          status="observed"
          unit="count"
          footnote={
            <>
              of <span className="fig">{cov.distinct_artists}</span>. Per quarter:{' '}
              <span className="fig">{perPeriodCounts.join(' / ')}</span>. GAP-033.
            </>
          }
          to="revenue"
        />
        <Tile
          label="Variables observed"
          value={cov.variables.length}
          status="observed"
          unit="count"
          footnote={`${cov.variables_defined_never_observed.length} further metrics are fully defined and produced zero rows.`}
          to="coverage"
        />
      </Grid>
    </Section>
  );
}

/* ------------------------------------------------------- epistemic balance */

function BalanceSection({ rev }: { rev: Revenue }) {
  const estimated = sumEstimatedStreams(rev);
  const observed = 0;
  const flags = youtubeFlagSplit(rev);

  const streamProvenance: ProvenanceInfo = {
    chain: [
      { op: 'GET /api/artist/{chartmetric_id}/stat/spotify → monthly listeners' },
      {
        op: '× 3.5 streams per listener per month',
        constantId: 'streams-per-listener',
        sourceRef: 'backend/scripts/nbs_extract_full.py:52',
      },
      { op: '× 3 months per quarter', sourceRef: 'backend/scripts/nbs_extract_full.py:184' },
    ],
    artifact: 'revenue.json → est_spotify_quarterly_streams',
    note: `Summed across all ${rev.rows.length} artist-quarter rows in the five revenue quarters.`,
  };

  return (
    <Section
      title="Epistemic balance"
      subtitle="Of the stream volume this study reports, the share that was observed rather than converted."
    >
      <Grid min="15rem">
        <Tile
          label="Observed streams"
          value={observed}
          status="rejected"
          unit="count"
          footnote={
            <>
              A true zero, not a missing value. All <span className="fig">{DENIED_ENDPOINTS}</span>{' '}
              track-level stream endpoints returned HTTP 401. No call ever succeeded, so no stream
              was ever counted. GAP-006.
            </>
          }
          to="sources"
        />
        <Tile
          label="Estimated streams"
          value={estimated}
          field="est_spotify_quarterly_streams"
          unit="count"
          provenance={streamProvenance}
          footnote="Spotify only. Deezer's intermediate stream count is discarded before it is written and YouTube is counted in views."
          to="estimation"
        />
        <Tile
          label="Observed share of stream volume"
          value={0}
          status="derived"
          unit="pct"
          precision={1}
          footnote={
            <>
              <span className="fig">0</span> ÷{' '}
              <span className="fig">{formatFigure(estimated, { compact: true })}</span>. Not rounded
              down from something small.
            </>
          }
          to="estimation"
        />
      </Grid>

      <div style={{ paddingTop: 'var(--s5)' }}>
        <ProportionBar observed={observed} estimated={estimated} />
      </div>

      <div style={{ paddingTop: 'var(--s6)' }}>
        <h3 className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          The only epistemic flag in the delivery
        </h3>
        <p className="lede" style={{ margin: '0 0 var(--s3)' }}>
          One column in the entire shipped dataset distinguishes an observation from an estimate:
          youtube_views_source. Every other figure arrives undifferentiated, which is why the
          classification on this console is applied as presentation metadata from the constants
          register and never written back into the data (GAP-019).
        </p>
        <Grid min="12rem">
          <Tile
            label="YouTube views — actual"
            value={flags.actual}
            status="observed"
            unit="count"
            footnote={`of ${rev.rows.length} artist-quarter rows.`}
            to="estimation"
          />
          <Tile
            label="YouTube views — synthesised"
            value={flags.estimated}
            status="estimated"
            unit="count"
            footnote="Subscribers × 15 views/sub/month × 3, written into a column named youtube_actual_views. 52 of these are zero-subscriber rows to which no multiplier was applied."
            to="estimation"
          />
          {flags.unflagged > 0 ? (
            <Tile
              label="YouTube views — unflagged"
              value={flags.unflagged}
              status="unavailable"
              unit="count"
              footnote="Rows carrying no value in the flag column."
              to="estimation"
            />
          ) : null}
        </Grid>
      </div>
    </Section>
  );
}

/**
 * Observed against estimated, drawn to scale. The observed segment has no
 * width; a keyline marks where it would begin so the emptiness is visible as a
 * position rather than inferred from an absence.
 */
function ProportionBar({ observed, estimated }: { observed: number; estimated: number }) {
  const total = observed + estimated;
  const obsPct = total > 0 ? (observed / total) * 100 : 0;
  const estPct = 100 - obsPct;

  return (
    <figure style={{ margin: 0, maxWidth: '58rem' }}>
      <figcaption
        className="h-section"
        style={{ marginBottom: 'var(--s2)', display: 'flex', justifyContent: 'space-between' }}
      >
        <span>Stream volume by how it came to exist</span>
        <span className="fig" style={{ letterSpacing: 0 }}>
          {formatFigure(total, { compact: true })} total
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={`Observed streams ${obsPct.toFixed(1)} percent, estimated streams ${estPct.toFixed(
          1,
        )} percent`}
        style={{
          display: 'flex',
          height: '1.75rem',
          border: '1px solid var(--rule-strong)',
          background: 'var(--paper-sunk)',
        }}
      >
        <span
          data-epi="observed"
          style={{ width: `${obsPct}%`, background: 'var(--epi)', flex: 'none' }}
        />
        <span
          data-epi="observed"
          style={{ width: '2px', background: 'var(--epi)', flex: 'none' }}
          title="Where the observed segment would begin. It has no width."
        />
        <span data-epi="estimated" style={{ flex: 1, background: 'var(--epi)' }} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--s4)',
          paddingTop: 'var(--s2)',
          flexWrap: 'wrap',
        }}
      >
        <span data-epi="observed" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <EpistemicDot status="observed" />
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>
            Observed <span className="fig">0</span> · <span className="fig">0.0%</span>
          </span>
        </span>
        <span data-epi="estimated" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <EpistemicDot status="estimated" />
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>
            Estimated <span className="fig">{estimated.toLocaleString('en-US')}</span> ·{' '}
            <span className="fig">{estPct.toFixed(1)}%</span>
          </span>
        </span>
      </div>

      <p style={{ margin: 'var(--s2) 0 0', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
        The bar is one colour because the series has one epistemic state. The 2px keyline at the
        left edge marks where the observed segment would begin.
      </p>
    </figure>
  );
}

/* --------------------------------------------------------------- indices */

function IndicesSection() {
  return (
    <Section
      title="Indices"
      subtitle="The two headline indicators the brief names. Neither exists in this system under this or any other name."
    >
      <Grid min="15rem">
        <Tile
          label="NCR — Nigeria Consumption Ratio"
          value={null}
          gapId="GAP-002"
          reason="Zero occurrences of the term or any equivalent computation in code or documentation."
          footnote="Would require observed domestic consumption. The nearest artifact is a 30% constant that was never measured."
          to="methodology"
        />
        <Tile
          label="DEI — Digital Export Index"
          value={null}
          gapId="GAP-003"
          reason="Zero occurrences. No index of this kind is computed anywhere."
          footnote="Would require an export measurement independent of the revenue it indexes. Export share is 70.0% on every row because export revenue is defined as streaming × 0.70."
          to="methodology"
        />
      </Grid>
      <Callout status="unavailable" title="The nearest available substitute is tautological" gapId="GAP-003">
        Export share is not measured and then reported; it is imposed and then read back. Gross
        export revenue is defined as total streaming revenue × 0.70, so any export share computed
        from it returns 70% for every artist, in every quarter, by construction. It carries no
        information about export performance and must not be plotted as though it did.
      </Callout>
    </Section>
  );
}

/* -------------------------------------------------------------- accounts */

function AccountsSection({
  artists,
  artistsFailed,
}: {
  artists: ArtistRow[] | undefined;
  artistsFailed: boolean;
}) {
  const countryEvidence = useMemo(() => {
    if (!artists) return null;
    const values = new Set(artists.map((a) => a.country_field_value ?? '∅'));
    const ng = artists.filter((a) => a.country_field_value === 'NG').length;
    return { distinct: values.size, ng, total: artists.length };
  }, [artists]);

  return (
    <Section
      title="Accounts"
      subtitle="Resident and diaspora production route to different national accounts. This system cannot tell them apart."
    >
      <Grid min="15rem">
        <Tile
          label="Resident artists"
          value={null}
          gapId="GAP-004"
          reason="No residency field and no classification rule exists anywhere in the codebase."
          footnote="Would require a residency rule, a basis for each assignment, and a country signal with variance. None of the three exists."
          to="accounts"
        />
        <Tile
          label="Diaspora artists"
          value={null}
          gapId="GAP-004"
          reason="No residency field and no classification rule exists anywhere in the codebase."
          footnote="The country column is a hardcoded default, not a classification. GDP-versus-GNI routing does not exist either — GAP-005."
          to="accounts"
        />
        <Tile
          label="Export markets detected"
          value={null}
          gapId="GAP-008"
          reason="Listener geography was defined, implemented and then explicitly skipped. It is 100% empty."
          footnote="The market list on every revenue row is a constant string, identical on all 638 rows, not a detection. 1,047 limitation rows record the absence."
          to="footprint"
        />
      </Grid>

      <div style={{ paddingTop: 'var(--s3)' }}>
        {artistsFailed ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            artists.json could not be read, so the country-field evidence below is unavailable. The
            residency tiles are structurally NOT COLLECTED regardless.
          </p>
        ) : countryEvidence ? (
          <Callout status="unavailable" title="The country field carries no information" gapId="GAP-004">
            <span className="fig">{countryEvidence.ng}</span> of{' '}
            <span className="fig">{countryEvidence.total}</span> artist rows carry the value{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>NG</code>, across{' '}
            <span className="fig">{countryEvidence.distinct}</span> distinct value
            {countryEvidence.distinct === 1 ? '' : 's'} in total. Zero variance. It is a hardcoded
            default passed through from the roster file, and reading it as a residency classification
            would assert something the data does not contain.
          </Callout>
        ) : (
          <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>Reading artists.json…</p>
        )}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- revenue */

function RevenueSection({ rev }: { rev: Revenue }) {
  const period = latestPeriod(rev);

  if (!period) {
    return (
      <Section title="Revenue">
        <NotCollected reason="revenue.json contains no periods." gapId="GAP-001" />
      </Section>
    );
  }

  const grossUsd = totalFor(rev.streaming_totals, period, 'gross_streaming_revenue_usd');
  const grossNgn = totalFor(rev.streaming_totals, period, 'gross_streaming_revenue_ngn');
  const exportUsd = totalFor(rev.export_totals, period, 'gross_export_revenue_usd');
  const exportNgn = totalFor(rev.export_totals, period, 'gross_export_revenue_ngn');
  const domesticUsd = totalFor(rev.export_totals, period, 'domestic_revenue_usd');
  const rowsInPeriod = rev.rows.filter((r) => r.period === period).length;

  const usdChain: ProvenanceInfo = {
    chain: [
      { op: 'GET /api/artist/{chartmetric_id}/stat/spotify → monthly listeners' },
      { op: '× 3.5 × 3 → estimated quarterly streams', constantId: 'streams-per-listener' },
      { op: '× $0.004 per stream → Spotify revenue', constantId: 'rate-spotify' },
      { op: '+ YouTube views × $0.004', constantId: 'rate-youtube' },
      { op: '+ Deezer fans × 2.0 × 3 × $0.004', constantId: 'rate-deezer' },
      { op: '+ Spotify revenue × 0.30 for platforms never queried', constantId: 'other-platforms' },
    ],
    artifact: `revenue.json → streaming_totals[${period}]`,
    note: `Summed over ${rowsInPeriod} artist rows in ${formatPeriod(period)}. No component of this total is observed.`,
  };

  const ngnChain: ProvenanceInfo = {
    chain: [
      { op: 'gross streaming revenue USD' },
      { op: '× ₦1,500 per USD', constantId: 'fx-usd-ngn' },
    ],
    artifact: `revenue.json → streaming_totals[${period}]`,
    note: 'One fixed rate across all five quarters, with no effective date. Described as a Q1-2026 spot rate in one script and as a five-quarter CBN average in another.',
  };

  const exportChain: ProvenanceInfo = {
    chain: [
      { op: 'total streaming revenue' },
      { op: '× 70% export share, a literal constant', constantId: 'export-share' },
    ],
    artifact: `revenue.json → export_totals[${period}]`,
    note: 'Written as a literal 0.70, not as 1 − domestic share. Attributed to “WIPO 2025 methodology” by title only; the 70 itself is not attributed.',
  };

  const exportNgnChain: ProvenanceInfo = {
    chain: [
      { op: 'total streaming revenue × 0.70', constantId: 'export-share' },
      { op: '× ₦1,500 per USD', constantId: 'fx-usd-ngn' },
    ],
    artifact: `revenue.json → export_totals[${period}]`,
  };

  const domesticChain: ProvenanceInfo = {
    chain: [
      { op: 'total streaming revenue' },
      { op: '× 30% domestic share, an assumed constant', constantId: 'domestic-share' },
    ],
    artifact: `revenue.json → export_totals[${period}]`,
    note: 'Eight documents attribute this share to listener-geography data. That endpoint was explicitly skipped on the grounds that the 30% was already held. The constant justifies itself.',
    gapId: 'GAP-039',
  };

  return (
    <Section
      title={`Revenue — ${formatPeriod(period)}`}
      subtitle={
        <>
          The latest of <span className="fig">{rev.periods.length}</span> revenue quarters, summed
          over <span className="fig">{rowsInPeriod}</span> artist rows. Every figure here is an
          estimate built on an audience count; none has an observed component.
        </>
      }
    >
      <Grid min="16rem">
        <Tile
          label="Gross streaming revenue"
          value={grossUsd}
          field="gross_streaming_revenue_usd"
          provenance={usdChain}
          footnote="Spotify + YouTube + Deezer + a 30% uplift for Apple Music, Audiomack, Boomplay and Tidal, none of which was ever called."
          to="revenue"
        />
        <Tile
          label="Gross streaming revenue (NGN)"
          value={grossNgn}
          field="gross_streaming_revenue_ngn"
          provenance={ngnChain}
          footnote="At a fixed ₦1,500/USD with no effective date and no variance across five quarters."
          to="revenue"
        />
        <Tile
          label="Gross export revenue"
          value={exportUsd}
          field="gross_export_revenue_usd"
          provenance={exportChain}
          footnote="Streaming revenue × an assumed 70%. No export transaction was observed."
          to="footprint"
        />
        <Tile
          label="Gross export revenue (NGN)"
          value={exportNgn}
          status="estimated"
          unit="ngn"
          precision={0}
          provenance={exportNgnChain}
          footnote="Two imposed constants applied in sequence: a 70% share and a fixed exchange rate."
          to="footprint"
        />
        <Tile
          label="Domestic revenue"
          value={domesticUsd}
          field="domestic_revenue_usd"
          provenance={domesticChain}
          footnote="Streaming revenue × an assumed 30% domestic share, which was never measured. GAP-039."
          to="revenue"
        />
      </Grid>

      <Callout status="rejected" title="The source credit on every revenue row is wrong" gapId="GAP-036">
        All <span className="fig">{rev.rows.length}</span> rows carry the source string{' '}
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
          Chartmetric + SoundCharts API + per-stream rates
        </code>
        . At the first delivery no SoundCharts client, URL or credential existed anywhere in the
        repository — a claim since superseded: the Soundcharts integration now exists
        (backend/nmas/services/soundcharts.py) and feeds the extended series. At that time the only HTTP
        client that exists targets Chartmetric. One source is integrated, not two.
      </Callout>
    </Section>
  );
}

/* ------------------------------------------------------------------- run */

function RunSection({ run, cov }: { run: Run; cov: Coverage | undefined }) {
  const extraction = useMemo(() => {
    if (!cov) return null;
    const stamps = cov.cells.map((c) => c.last_extraction).filter((s): s is string => Boolean(s));
    if (stamps.length === 0) return null;
    let latest = stamps[0];
    for (const s of stamps) if (Date.parse(s) > Date.parse(latest)) latest = s;
    const naive = stamps.filter((s) => !/(Z|[+-]\d{2}:?\d{2})$/.test(s)).length;
    return { latest, total: stamps.length, naive };
  }, [cov]);

  const attempted = unitFromReport(run.report_markdown, 'Total units');
  const completed = unitFromReport(run.report_markdown, 'Completed units');
  const failed = unitFromReport(run.report_markdown, 'Failed units');
  const skipped = unitFromReport(run.report_markdown, 'Skipped units');
  const jobStatus = statusFromReport(run.report_markdown);
  const duration = durationBetween(run.started, run.finished);
  const failureRate =
    attempted !== null && failed !== null && attempted > 0 ? (failed / attempted) * 100 : null;

  const unitProvenance: ProvenanceInfo = {
    artifact: 'run.json → report_markdown (job_summary_report.md)',
    note: 'The unit triple exists only inside the run report’s markdown. It is the one genuine records-attempted / completed / rejected accounting the pipeline produces.',
  };

  return (
    <Section
      title="Extraction run"
      subtitle="One run is recorded. It is the whole operational history the system retains."
    >
      <Grid min="14rem">
        <Tile
          label="Units attempted"
          value={attempted}
          status="observed"
          unit="count"
          provenance={unitProvenance}
          gapId="GAP-012"
          reason="No unit count appears in the run report."
          footnote="131 master-list rows × 13 variables × 8 quarters."
          to="timeline"
        />
        <Tile
          label="Units completed"
          value={completed}
          status="observed"
          unit="count"
          provenance={unitProvenance}
          gapId="GAP-012"
          reason="No unit count appears in the run report."
          footnote={skipped !== null ? `${skipped} units skipped.` : undefined}
          to="timeline"
        />
        <Tile
          label="Units failed"
          value={failed}
          status="rejected"
          unit="count"
          provenance={unitProvenance}
          gapId="GAP-028"
          reason="No unit count appears in the run report."
          footnote="Three failure classes, no per-call attribution. GAP-028."
          to="monitoring"
        />
        <Tile
          label="Failure rate"
          value={failureRate}
          status="derived"
          unit="pct"
          precision={2}
          gapId="GAP-028"
          reason="Derivable only if both unit counts are present."
          footnote="Failed ÷ attempted, computed here for display. The pipeline records no rate."
          to="monitoring"
        />
      </Grid>

      <div style={{ paddingTop: 'var(--s5)', maxWidth: '60rem' }}>
        <dl style={{ margin: 0 }}>
          <KeyValue
            k="Last successful extraction"
            v={
              extraction ? (
                <>
                  <span className="fig" data-epi="observed">
                    {extraction.latest}
                  </span>
                  <span style={{ color: 'var(--ink-3)', marginLeft: '0.6rem' }}>
                    latest of {extraction.total} coverage cells
                  </span>
                </>
              ) : (
                <NotCollected reason="No extraction timestamp survives on any coverage cell." />
              )
            }
            mono
          />
          <KeyValue
            k="Run started"
            v={
              run.started ? (
                <span className="fig" data-epi="observed">
                  {run.started}
                </span>
              ) : (
                <NotCollected reason="run.json carries no start timestamp." gapId="GAP-013" />
              )
            }
            mono
          />
          <KeyValue
            k="Run finished"
            v={
              run.finished ? (
                <span className="fig" data-epi="observed">
                  {run.finished}
                </span>
              ) : (
                <NotCollected reason="run.json carries no finish timestamp." gapId="GAP-013" />
              )
            }
            mono
          />
          <KeyValue
            k="Duration"
            v={
              duration ? (
                <>
                  <span className="fig" data-epi="derived">
                    {duration}
                  </span>
                  <span style={{ marginLeft: '0.6rem' }}>
                    <EpistemicChip status="derived" />
                  </span>
                  <span style={{ color: 'var(--ink-3)', marginLeft: '0.6rem' }}>
                    run.duration is null in the artifact; computed here from the two timestamps
                  </span>
                </>
              ) : (
                <NotCollected reason="Neither a duration nor a usable timestamp pair exists." gapId="GAP-013" />
              )
            }
            mono
          />
          <KeyValue
            k="Job status"
            v={
              jobStatus ? (
                <span className="fig" data-epi="rejected">
                  {jobStatus}
                </span>
              ) : (
                <NotCollected reason="The run report states no status line." />
              )
            }
            mono
          />
          <KeyValue
            k="Failure classes"
            v={
              run.failures.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {run.failures.flatMap((f) =>
                    f.messages.map((msg) => (
                      <li key={`${f.error_type}-${msg}`} style={{ padding: '0.1rem 0' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                          {msg}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              ) : (
                <NotCollected reason="No failure record survives." gapId="GAP-028" />
              )
            }
          />
          <KeyValue
            k="Per-call telemetry"
            v={
              <NotCollected
                reason="Status code, latency and retry count are recorded for no call. The payload record is written only in the success branch, and no database survives on disk."
                gapId="GAP-010"
              />
            }
          />
          <KeyValue
            k="Stage decomposition"
            v={
              <NotCollected
                reason="No stage table, stage name or stage timing exists. Extraction is a serial loop."
                gapId="GAP-013"
              />
            }
          />
        </dl>

        {extraction && extraction.naive > 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)', marginTop: 'var(--s3)' }}>
            <span className="fig">{extraction.naive}</span> of{' '}
            <span className="fig">{extraction.total}</span> extraction timestamps carry no timezone
            offset, and the run’s own two timestamps carry none either. Timestamps from the two
            groups are not strictly comparable; both are shown verbatim rather than normalised into
            an ordering the artifacts do not support.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- what's out */

function NotShownSection() {
  const gaps = gapsForPanel(1);

  const columns: Column<Gap>[] = [
    { key: 'id', header: 'Gap', value: (g) => g.id, width: '5.5rem' },
    { key: 'requirement', header: 'Requirement', value: (g) => g.requirement },
    { key: 'status', header: 'Status', value: (g) => g.status.replace(/_/g, ' '), groupable: true },
    {
      key: 'severity',
      header: 'Severity',
      value: (g) => g.severity,
      groupable: true,
      render: (g) => (
        <span
          className="epi-chip"
          data-epi={
            g.severity === 'blocking' ? 'rejected' : g.severity === 'major' ? 'estimated' : 'unavailable'
          }
        >
          {g.severity}
        </span>
      ),
    },
  ];

  return (
    <Section
      title="What this page cannot report"
      subtitle={
        <>
          <span className="fig">{gaps.length}</span> registered gaps bear on this panel. Each one is
          a figure a reader would reasonably expect here that no artifact in the repository can
          support. Expand a row for the evidence and for what building it would require.
        </>
      }
    >
      <DataTable
        rows={gaps}
        columns={columns}
        rowKey={(g) => g.id}
        filename="panel-01-executive-gaps"
        dense
        pageSize={null}
        caption="Gaps registered against Panel 1, from registry/gaps.ts."
        expand={(g) => (
          <div style={{ maxWidth: '78ch' }}>
            <div className="h-section" style={{ marginBottom: '0.25rem' }}>
              Evidence
            </div>
            <p style={{ margin: '0 0 var(--s3)' }}>{g.evidence}</p>
            <div className="h-section" style={{ marginBottom: '0.25rem' }}>
              What this console does instead
            </div>
            <p style={{ margin: 0 }}>{g.remedy}</p>
          </div>
        )}
      />
    </Section>
  );
}
