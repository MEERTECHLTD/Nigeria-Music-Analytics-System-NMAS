/**
 * PANEL 4 — Artist Universe
 *
 * The 131-row master list (129 distinct artists — two are held twice), joined to the 638 revenue
 * rows and to the 65-row entity-resolution audit.
 *
 * What this panel renders from artifacts:
 *   artist name, Chartmetric identifier, revenue period membership, observation
 *   count, distinct variables observed, first/last observation, estimated stream
 *   total, gross streaming revenue total, how many of the artist's periods used
 *   synthesised YouTube views, and the provider match score where one exists.
 *
 * What it cannot render, and says so on every row rather than in a footnote:
 *   Spotify id, YouTube id, label and genres — empty on 131/131 rows (GAP-027)
 *   residency classification — the country field is a constant, not a
 *     classification, and no classification logic exists anywhere (GAP-004)
 *   account routing — no GDP/GNI concept exists on any model (GAP-005)
 *   confidence — no confidence, standard error or interval field exists (GAP-023)
 *   match score for 66 of 131 roster rows — the audit covers 65 (GAP-024)
 *
 * The panel's own finding, computed here rather than asserted: the artists that
 * carry an observation record and the artists that carry a match score are two
 * disjoint sets. No artist has both. So the resolution smell this panel was
 * asked to surface — a famous name with an implausibly thin observation record —
 * cannot be detected automatically, because the evidence needed to detect it is
 * never present on the same row.
 */

import { useMemo } from 'react';
import {
  comparePeriods,
  formatPeriod,
  useArtists,
  useResolutionAudit,
  useRevenue,
} from '../data/client';
import {
  Callout,
  EpistemicChip,
  Figure,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import { DISTINCT_ARTISTS, DUPLICATE_ARTISTS } from '../../generated/cohortFacts';
import { DataTable, type Column } from '../components/DataTable';
import { resolveEpistemic } from '../registry/epistemic';
import type { ArtistRow, Epistemic, ResolutionRow, Revenue, RevenueRow } from '../data/types';

/* ------------------------------------------------------------------ dates */

/** The master list stores dates as M/D/YYYY strings. Displayed as ISO. */
function parseUsDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(s: string | null): string | null {
  const d = parseUsDate(s);
  return d ? d.toISOString().slice(0, 10) : null;
}

function spanDays(first: string | null, last: string | null): number | null {
  const a = parseUsDate(first);
  const b = parseUsDate(last);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------- rows */

type RecordSet = 'observations + score' | 'observations only' | 'match score only' | 'neither';

interface Row {
  a: ArtistRow;
  audit: ResolutionRow | null;
  revenueRows: RevenueRow[];
  span: number | null;
  recordSet: RecordSet;
}

const NULL_ON_EVERY_ROW =
  'Empty on 131 of 131 rows in every artist artifact. The platform-account table that would hold it is referenced nowhere.';

export default function ArtistUniverse() {
  const artists = useArtists();
  const revenue = useRevenue();
  const audit = useResolutionAudit();

  return (
    <Resolved query={artists} artifact="artists.json" label="Reading the 131-row master list">
      {(artistRows) => (
        <Resolved query={revenue} artifact="revenue.json">
          {(rev) => (
            <Resolved query={audit} artifact="resolution-audit.json">
              {(aud) => <Universe artists={artistRows} revenue={rev} audit={aud} />}
            </Resolved>
          )}
        </Resolved>
      )}
    </Resolved>
  );
}

function Universe({
  artists,
  revenue,
  audit,
}: {
  artists: ArtistRow[];
  revenue: Revenue;
  audit: ResolutionRow[];
}) {
  const auditById = useMemo(() => {
    const m = new Map<string, ResolutionRow>();
    for (const r of audit) {
      if (r.chartmetric_artist_id !== null) m.set(String(r.chartmetric_artist_id), r);
    }
    return m;
  }, [audit]);

  const revenueByArtist = useMemo(() => {
    const m = new Map<string, RevenueRow[]>();
    for (const r of revenue.rows) {
      const list = m.get(r.artist_name);
      if (list) list.push(r);
      else m.set(r.artist_name, [r]);
    }
    for (const list of m.values()) list.sort((x, y) => comparePeriods(x.period, y.period));
    return m;
  }, [revenue.rows]);

  const rows = useMemo<Row[]>(
    () =>
      artists.map((a) => {
        const auditRow = auditById.get(String(a.chartmetric_artist_id)) ?? null;
        const hasObs = a.observation_count !== null;
        const hasScore = auditRow !== null && auditRow.match_score !== null;
        return {
          a,
          audit: auditRow,
          revenueRows: revenueByArtist.get(a.artist_name) ?? [],
          span: spanDays(a.first_observation, a.last_observation),
          recordSet: hasObs
            ? hasScore
              ? 'observations + score'
              : 'observations only'
            : hasScore
              ? 'match score only'
              : 'neither',
        };
      }),
    [artists, auditById, revenueByArtist],
  );

  /* ---- counts, all computed from the artifacts, none asserted ---- */

  const perPeriod = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of revenue.rows) m.set(r.period, (m.get(r.period) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => comparePeriods(x[0], y[0]));
  }, [revenue.rows]);

  const stats = useMemo(() => {
    const withRevenue = rows.filter((r) => r.a.revenue_period_count > 0);
    const maxPeriods = rows.reduce((m, r) => Math.max(m, r.a.revenue_period_count), 0);
    return {
      universe: rows.length,
      withRevenue: withRevenue.length,
      noRevenue: rows.filter((r) => r.a.revenue_period_count === 0),
      partialRevenue: withRevenue.filter((r) => r.a.revenue_period_count < maxPeriods),
      withObs: rows.filter((r) => r.a.observation_count !== null).length,
      withScore: rows.filter((r) => r.audit?.match_score != null).length,
      withBoth: rows.filter((r) => r.recordSet === 'observations + score').length,
      withNeither: rows.filter((r) => r.recordSet === 'neither'),
      ytSynth: rows.filter((r) => r.a.youtube_estimated_period_count > 0).length,
    };
  }, [rows]);

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Artist',
        width: '13rem',
        value: (r) => r.a.artist_name,
        render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.a.artist_name}</span>,
      },
      {
        key: 'cmid',
        header: 'Chartmetric ID',
        numeric: true,
        note: 'The only external identifier populated anywhere in the delivery.',
        value: (r) => (r.a.chartmetric_artist_id === null ? null : String(r.a.chartmetric_artist_id)),
        render: (r) => (
          <span className="fig" data-epi="observed">
            {String(r.a.chartmetric_artist_id)}
          </span>
        ),
      },
      nullColumn('spotify', 'Spotify ID', (r) => r.a.spotify_id),
      nullColumn('youtube', 'YouTube ID', (r) => r.a.youtube_id),
      nullColumn('label', 'Label', (r) => r.a.label),
      nullColumn('genres', 'Genres', (r) => r.a.genres),
      {
        key: 'country_raw',
        header: 'Country field (raw)',
        optional: true,
        note: 'The literal stored string. A hardcoded default with zero variance — not a classification.',
        value: (r) => r.a.country_field_value,
        render: (r) => (
          <span
            data-epi="assumed"
            className="fig"
            style={{ color: 'var(--epi)' }}
            title="artists.country defaults to “NG” and is never written by any classification step."
          >
            {r.a.country_field_value ?? ''}
          </span>
        ),
      },
      {
        key: 'residency',
        header: 'Residency',
        width: '6rem',
        note: 'No residency classification exists. The country field is a constant passthrough.',
        value: () => null,
        render: () => (
          <NotCollected
            short
            gapId="GAP-004"
            reason="country is a constant “NG” passthrough on 131/131 rows — a stored default, not a classification. No resident/diaspora rule exists in code."
          />
        ),
      },
      {
        key: 'routing',
        header: 'Account routing',
        width: '7rem',
        note: 'No GDP or GNI field exists on any model; no routing logic exists.',
        value: () => null,
        render: () => (
          <NotCollected
            short
            gapId="GAP-005"
            reason="No GDP or GNI field on any model and no routing logic. The concept appears only in prose."
          />
        ),
      },
      {
        key: 'revperiods',
        header: 'Revenue periods',
        numeric: true,
        groupable: true,
        note: 'How many of the 5 revenue quarters carry a row for this artist.',
        value: (r) => r.a.revenue_period_count,
        render: (r) => (
          <span style={{ whiteSpace: 'nowrap' }}>
            <Figure
              value={r.a.revenue_period_count}
              status="observed"
              label="Revenue periods"
              provenance={{
                artifact: 'revenue.json',
                note: `Rows present for this artist across the ${revenue.periods.length} quarters that carry revenue at all.`,
                gapId: 'GAP-033',
              }}
            />
            <span style={{ color: 'var(--ink-4)' }}> / {revenue.periods.length}</span>
          </span>
        ),
      },
      {
        key: 'obs',
        header: 'Observations',
        numeric: true,
        note: 'Daily observation rows. Present for 65 of 131 roster rows — the database-export subset only.',
        value: (r) => r.a.observation_count,
        render: (r) => (
          <Figure
            value={r.a.observation_count}
            field="obs_count"
            gapId="GAP-032"
            reason="This artist is outside the 65-artist database export, which is the only artifact carrying per-artist observation counts."
          />
        ),
      },
      {
        key: 'vars',
        header: 'Variables',
        numeric: true,
        note: 'Distinct variables with at least one observation, of the 18 the pipeline produced.',
        value: (r) => r.a.variables_observed,
        render: (r) => (
          <Figure
            value={r.a.variables_observed}
            status="observed"
            gapId="GAP-032"
            reason="Outside the 65-artist database export."
          />
        ),
      },
      {
        key: 'first',
        header: 'First observation',
        note: 'Stored M/D/YYYY in the artifact; displayed ISO.',
        value: (r) => isoDate(r.a.first_observation),
        render: (r) => <DateCell v={isoDate(r.a.first_observation)} />,
      },
      {
        key: 'last',
        header: 'Last observation',
        value: (r) => isoDate(r.a.last_observation),
        render: (r) => <DateCell v={isoDate(r.a.last_observation)} />,
      },
      {
        key: 'span',
        header: 'Span (d)',
        numeric: true,
        optional: true,
        note: 'Last minus first observation date. A derived display value, not a coverage measure — nothing records whether the interval is continuous.',
        value: (r) => r.span,
        render: (r) => (
          <Figure
            value={r.span}
            status="derived"
            unit="days"
            label="Observation span"
            provenance={{
              artifact: 'artists.json',
              note: 'last_observation − first_observation. Says nothing about density or continuity within the interval.',
            }}
          />
        ),
      },
      {
        key: 'streams',
        header: 'Est. streams',
        numeric: true,
        note: 'Monthly listeners × 3.5 × 3, summed across the artist’s revenue periods. No observed stream count exists anywhere.',
        value: (r) => r.a.est_streams_total,
        render: (r) => (
          <Figure
            value={r.a.est_streams_total}
            field="est_spotify_quarterly_streams"
            gapId="GAP-033"
            reason="This artist produces no revenue row in any period, so no estimate was computed."
          />
        ),
      },
      {
        key: 'gross',
        header: 'Gross streaming rev.',
        numeric: true,
        note: 'Sum of estimated and assumed platform components. No observed component exists.',
        value: (r) => r.a.gross_streaming_revenue_usd_total,
        render: (r) => (
          <Figure
            value={r.a.gross_streaming_revenue_usd_total}
            field="gross_streaming_revenue_usd"
            gapId="GAP-033"
            reason="This artist produces no revenue row in any period."
          />
        ),
      },
      {
        key: 'ytsynth',
        header: 'YT views synthesised',
        numeric: true,
        note: 'Periods whose youtube_actual_views was synthesised from subscribers × 45 rather than returned by the source.',
        value: (r) => (r.a.revenue_period_count === 0 ? null : r.a.youtube_estimated_period_count),
        render: (r) =>
          r.a.revenue_period_count === 0 ? (
            <NotCollected
              short
              gapId="GAP-033"
              reason="No revenue row in any period, so there is no youtube_views_source flag to count."
            />
          ) : (
            <span style={{ whiteSpace: 'nowrap' }} data-epi="estimated">
              <Figure
                value={r.a.youtube_estimated_period_count}
                status={r.a.youtube_estimated_period_count > 0 ? 'estimated' : 'observed'}
                label="Periods with synthesised YouTube views"
                provenance={{
                  artifact: 'revenue.json',
                  sourceField: 'youtube_views_source',
                  note: 'Counted from the one epistemic flag that exists in the whole delivery. “estimated” means the view count was manufactured from subscribers × 15 views/sub/month × 3 months and written into a column named youtube_actual_views.',
                  gapId: 'GAP-030',
                }}
              />
              <span style={{ color: 'var(--ink-4)' }}> / {r.a.revenue_period_count}</span>
            </span>
          ),
      },
      {
        key: 'confidence',
        header: 'Confidence',
        width: '6rem',
        note: 'No confidence, standard error or interval field exists anywhere in the system.',
        value: () => null,
        render: () => (
          <NotCollected
            short
            gapId="GAP-023"
            reason="No confidence, standard error or interval field exists on any model or artifact. Observation count is the nearest available coverage proxy and is shown separately."
          />
        ),
      },
      {
        key: 'score',
        header: 'Match score',
        numeric: true,
        note: 'Provider match score from the entity-resolution audit. Exists for 65 of 131 roster rows.',
        value: (r) => r.audit?.match_score ?? null,
        render: (r) =>
          r.audit?.match_score != null ? (
            <Figure
              value={r.audit.match_score}
              status="observed"
              precision={2}
              label="Entity-resolution match score"
              provenance={{
                artifact: 'resolution-audit.json',
                sourceField: 'score',
                note: `Search name “${r.audit.search_name ?? ''}” matched provider name “${
                  r.audit.matched_name ?? ''
                }”. The score is the provider’s, on an undocumented scale; no threshold is recorded anywhere and no match was ever rejected on it.`,
                gapId: 'GAP-024',
              }}
            />
          ) : (
            <NotCollected
              short
              gapId="GAP-024"
              reason="No audit row exists for this artist. 66 of 131 roster rows carry no score at all — including every artist that carries an observation record."
            />
          ),
      },
      {
        key: 'recordset',
        header: 'Record set',
        groupable: true,
        note: 'Which of the two per-artist evidence sets this artist appears in. They do not overlap.',
        value: (r) => r.recordSet,
        render: (r) => (
          <span
            className="epi-chip epi-chip--bare"
            data-epi={RECORD_SET_EPI[r.recordSet]}
            style={{ whiteSpace: 'nowrap' }}
          >
            {r.recordSet}
          </span>
        ),
      },
    ],
    [revenue.periods.length],
  );

  return (
    <>
      <Section
        title="The universe"
        subtitle={
          <>
            The master list holds <strong className="fig">{stats.universe}</strong> rows describing{' '}
            <strong className="fig">{DISTINCT_ARTISTS}</strong> distinct artists.{' '}
            <strong className="fig">{stats.withRevenue}</strong> rows produce a revenue row in at
            least one quarter, <strong className="fig">{stats.withObs}</strong> carry a per-artist
            observation record, and <strong className="fig">{stats.withScore}</strong> carry an
            entity-resolution match score. Those last two sets share{' '}
            <strong className="fig">{stats.withBoth}</strong> artists.
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
            gap: 'var(--s4)',
            paddingBottom: 'var(--s3)',
          }}
        >
          <StatFigure
            label="Artists in universe"
            value={stats.universe}
            status="observed"
            footnote="Rows in Artist_Master_List.csv"
            provenance={{
              artifact: 'artists.json',
              note: 'A row count of the delivered master list. This is the denominator every other figure on this panel is read against.',
            }}
          />
          <StatFigure
            label="With a revenue row"
            value={stats.withRevenue}
            status="observed"
            footnote={`${stats.noRevenue.length} artists never produce one`}
            provenance={{ artifact: 'revenue.json', gapId: 'GAP-033' }}
          />
          <StatFigure
            label="With an observation record"
            value={stats.withObs}
            status="observed"
            footnote="The database-export subset"
            provenance={{ artifact: 'artists.json', gapId: 'GAP-032' }}
          />
          <StatFigure
            label="With a match score"
            value={stats.withScore}
            status="observed"
            footnote="The entity-resolution audit"
            provenance={{ artifact: 'resolution-audit.json', gapId: 'GAP-024' }}
          />
          <StatFigure
            label="With both"
            value={stats.withBoth}
            status="observed"
            footnote="No artist carries observations and a score"
            provenance={{
              artifact: 'artists.json + resolution-audit.json',
              note: 'Computed here by joining the two artifacts on chartmetric_artist_id. The intersection is empty.',
              gapId: 'GAP-024',
            }}
          />
          <StatFigure
            label="Residency classified"
            value={null}
            status="unavailable"
            gapId="GAP-004"
            reason="No classification exists. The country field is a constant."
            footnote="0 of 131 is not the finding — the field does not exist"
          />
        </div>

        <Callout status="unavailable" title="Four different artist counts are all true at once" gapId="GAP-033">
          <p style={{ margin: 0 }}>
            The universe is <span className="fig">{stats.universe}</span> rows, describing{' '}
            <span className="fig">{DISTINCT_ARTISTS}</span> distinct artists
            {DUPLICATE_ARTISTS.length > 0 ? (
              <>
                {' — '}
                {DUPLICATE_ARTISTS.map((d) => (
                  <span key={d.alias}>
                    <strong>{d.alias}</strong> and <strong>{d.canonical}</strong> are one person,
                    held under provider ids {d.aliasProviderId} and {d.canonicalProviderId}, each
                    producing its own revenue rows
                  </span>
                ))}
              </>
            ) : null}
            . Per-quarter revenue rows are{' '}
            <span className="fig">{perPeriod.map((e) => String(e[1])).join(' / ')}</span> for{' '}
            {perPeriod.map((e) => formatPeriod(e[0])).join(', ')}. The database export covers{' '}
            <span className="fig">{stats.withObs}</span>. None of these is wrong; they count
            different things. The gap between the first two is the duplicate identity named
            above, which no delivered artifact reconciles.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            {stats.noRevenue.length > 0 ? (
              <>
                {stats.noRevenue.length === 1 ? 'One artist produces' : `${stats.noRevenue.length} artists produce`}{' '}
                no revenue row in any quarter:{' '}
                <strong>{stats.noRevenue.map((r) => r.a.artist_name).join(', ')}</strong>.{' '}
              </>
            ) : null}
            {stats.partialRevenue.length > 0 ? (
              <>
                {stats.partialRevenue.length === 1 ? 'One artist appears' : `${stats.partialRevenue.length} artists appear`}{' '}
                in some quarters and not others —{' '}
                {stats.partialRevenue
                  .map(
                    (r) =>
                      `${r.a.artist_name} (${r.a.revenue_periods.map(formatPeriod).join(', ')})`,
                  )
                  .join('; ')}
                . That single disappearance is the whole difference between the 128 and 127 columns.
              </>
            ) : null}
          </p>
        </Callout>

        <Callout status="unavailable" title="Platform identifiers are empty on every row" gapId="GAP-027">
          Spotify id, YouTube id, label and genres are null on{' '}
          <span className="fig">{stats.universe}</span> of{' '}
          <span className="fig">{stats.universe}</span> rows. They are rendered as NOT COLLECTED
          columns rather than dropped, because an omitted column reads as an editorial choice and an
          empty one reads as a finding. The Chartmetric identifier is the only external key the
          delivery populates, so no cross-source join is possible against any other platform.
        </Callout>

        <Callout status="unavailable" title="The resolution smell cannot be detected" gapId="GAP-024">
          <p style={{ margin: 0 }}>
            A famous name bound to a thin observation record is the classic entity-resolution
            failure, and this console cannot find one. The evidence needed sits on two disjoint sets
            of rows: <span className="fig">{stats.withObs}</span> artists carry an observation record
            and no match score, <span className="fig">{stats.withScore}</span> carry a match score
            and no observation record, and{' '}
            <span className="fig">{stats.withBoth}</span> carry both.
            {stats.withNeither.length > 0 ? (
              <>
                {' '}
                <span className="fig">{stats.withNeither.length}</span> carry neither (
                {stats.withNeither.map((r) => r.a.artist_name).join(', ')}).
              </>
            ) : null}
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            The audit also carries a prominence proxy — Spotify followers and monthly listeners at
            match time — but only for the artists whose observation record is missing, so it cannot
            be set against an observation range either. Sorting this table by observation span will
            show short records; it will not tell you whether a short record means a quiet artist or
            the wrong artist. Detecting that needs a score on every row, a threshold, and a rejection
            log. The system has none of the three.
          </p>
        </Callout>
      </Section>

      <Section
        title="Artist register"
        subtitle="One row per artist in the master list. Group by revenue periods or by record set to see the coverage strata directly. Expand any row for its full record, every revenue period row and its resolution audit entry."
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => String(r.a.chartmetric_artist_id)}
          filename="nmas-artist-universe"
          dense
          pageSize={40}
          initialSort={{ key: 'gross', dir: 'desc' }}
          caption={
            <>
              {stats.universe} rows — {DISTINCT_ARTISTS} distinct artists. Spotify ID, YouTube ID,
              Label and Genres are null on{' '}
              {stats.universe}/{stats.universe} rows (GAP-027); Residency (GAP-004), Account routing
              (GAP-005) and Confidence (GAP-023) have no field anywhere in the system and are shown
              as permanently empty columns. Observation columns exist for {stats.withObs} rows and
              Match score for {stats.withScore} — never for the same artist.
            </>
          }
          expand={(r) => <ArtistDetail row={r} periods={revenue.periods} />}
        />
      </Section>

      <Section
        title="What the columns rest on"
        subtitle="Every column on this panel, and the strongest claim it can support."
      >
        <ul style={{ margin: 0, paddingLeft: '1.1rem', maxWidth: '78ch' }}>
          <li style={{ padding: '0.15rem 0' }}>
            <strong>Chartmetric ID</strong> — observed, and the only identifier that can join
            anything to anything. {stats.universe}/{stats.universe} populated.
          </li>
          <li style={{ padding: '0.15rem 0' }}>
            <strong>Revenue periods, observations, variables, dates</strong> — observed structure.
            They describe how much data exists, not how good it is.
          </li>
          <li style={{ padding: '0.15rem 0' }}>
            <strong>Est. streams and gross streaming revenue</strong> — estimated throughout. Both
            descend from monthly listeners through a single unsourced coefficient. Neither contains
            an observed stream.
          </li>
          <li style={{ padding: '0.15rem 0' }}>
            <strong>YT views synthesised</strong> — observed metadata about an estimate.{' '}
            <span className="fig">{stats.ytSynth}</span> artists have at least one period whose
            YouTube view count was manufactured from the subscriber count.
          </li>
          <li style={{ padding: '0.15rem 0' }}>
            <strong>Match score</strong> — observed, provider-supplied, on an undocumented scale,
            with no recorded threshold. A high score is not evidence the binding is right; it is
            evidence the provider thought so.
          </li>
        </ul>
      </Section>
    </>
  );
}

const RECORD_SET_EPI: Record<RecordSet, Epistemic> = {
  'observations + score': 'observed',
  'observations only': 'estimated',
  'match score only': 'assumed',
  neither: 'unavailable',
};

/** A column that is null on every row in every artifact. GAP-027. */
function nullColumn(key: string, header: string, value: (r: Row) => string | null): Column<Row> {
  return {
    key,
    header,
    width: '5.5rem',
    note: NULL_ON_EVERY_ROW,
    value,
    render: () => <NotCollected short gapId="GAP-027" reason={`${header}. ${NULL_ON_EVERY_ROW}`} />,
  };
}

function DateCell({ v }: { v: string | null }) {
  if (v === null) {
    return (
      <NotCollected
        short
        gapId="GAP-032"
        reason="Observation dates exist only in the 65-artist database export."
      />
    );
  }
  return (
    <span className="fig" data-epi="observed">
      {v}
    </span>
  );
}

/* --------------------------------------------------------------- detail */

function ArtistDetail({ row, periods }: { row: Row; periods: string[] }) {
  const { a, audit } = row;
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 21rem), 1fr))',
          gap: 'var(--s5)',
        }}
      >
        <div>
          <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Identity
          </div>
          <dl style={{ margin: 0 }}>
            <KeyValue k="Artist name" v={a.artist_name} />
            <KeyValue k="Chartmetric artist id" v={String(a.chartmetric_artist_id)} mono />
            <KeyValue
              k="Spotify id"
              v={<NotCollected gapId="GAP-027" reason={NULL_ON_EVERY_ROW} />}
            />
            <KeyValue
              k="YouTube id"
              v={<NotCollected gapId="GAP-027" reason={NULL_ON_EVERY_ROW} />}
            />
            <KeyValue k="Label" v={<NotCollected gapId="GAP-027" reason={NULL_ON_EVERY_ROW} />} />
            <KeyValue k="Genres" v={<NotCollected gapId="GAP-027" reason={NULL_ON_EVERY_ROW} />} />
            <KeyValue
              k="Country field (raw)"
              v={
                <span data-epi="assumed">
                  <span className="fig" style={{ color: 'var(--epi)' }}>
                    {a.country_field_value ?? ''}
                  </span>{' '}
                  <EpistemicChip status="assumed" bare title="Stored default, identical on every row." />
                </span>
              }
            />
            <KeyValue
              k="Residency classification"
              v={
                <NotCollected
                  gapId="GAP-004"
                  reason="The country field above is a stored default, not a classification. No classification rule exists in code."
                />
              }
            />
            <KeyValue
              k="Residency basis"
              v={<NotCollected gapId="GAP-004" reason="No basis is recorded because no classification occurs." />}
            />
            <KeyValue
              k="Account routing (GDP / GNI)"
              v={<NotCollected gapId="GAP-005" reason="No GDP or GNI field exists on any model." />}
            />
            <KeyValue
              k="Confidence score"
              v={<NotCollected gapId="GAP-023" reason="No confidence field exists anywhere in the system." />}
            />
            <KeyValue k="Status field" v={a.status ?? ''} mono />
          </dl>
        </div>

        <div>
          <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Observation record
          </div>
          <dl style={{ margin: 0 }}>
            <KeyValue
              k="Observations"
              v={
                <Figure
                  value={a.observation_count}
                  field="obs_count"
                  gapId="GAP-032"
                  reason="Outside the 65-artist database export."
                />
              }
            />
            <KeyValue
              k="Variables observed"
              v={
                <Figure
                  value={a.variables_observed}
                  status="observed"
                  gapId="GAP-032"
                  reason="Outside the 65-artist database export."
                />
              }
            />
            <KeyValue k="First observation" v={<DateCell v={isoDate(a.first_observation)} />} />
            <KeyValue k="Last observation" v={<DateCell v={isoDate(a.last_observation)} />} />
            <KeyValue
              k="Span"
              v={
                <Figure
                  value={row.span}
                  status="derived"
                  unit="days"
                  gapId="GAP-032"
                  reason="Requires both observation dates, which exist only in the database export."
                />
              }
            />
            <KeyValue
              k="Revenue periods"
              v={
                a.revenue_periods.length > 0 ? (
                  <span className="fig">{a.revenue_periods.map(formatPeriod).join(', ')}</span>
                ) : (
                  <NotCollected
                    gapId="GAP-033"
                    reason={`This artist appears in none of the ${periods.length} revenue quarters.`}
                  />
                )
              }
            />
            <KeyValue
              k="Est. streams total"
              v={
                <Figure
                  value={a.est_streams_total}
                  field="est_spotify_quarterly_streams"
                  gapId="GAP-033"
                  reason="No revenue row in any period."
                />
              }
            />
            <KeyValue
              k="Gross streaming revenue"
              v={
                <Figure
                  value={a.gross_streaming_revenue_usd_total}
                  field="gross_streaming_revenue_usd"
                  gapId="GAP-033"
                  reason="No revenue row in any period."
                />
              }
            />
          </dl>

          <div className="h-section" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
            Entity resolution audit
          </div>
          {audit ? (
            <dl style={{ margin: 0 }}>
              <KeyValue k="Search name" v={audit.search_name ?? ''} mono />
              <KeyValue
                k="Matched name"
                v={
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {audit.matched_name ?? ''}
                    {audit.search_name !== null &&
                    audit.matched_name !== null &&
                    audit.search_name !== audit.matched_name ? (
                      <strong style={{ color: 'var(--est)', fontFamily: 'var(--font-sans)' }}>
                        {' '}
                        · differs from the search string
                      </strong>
                    ) : null}
                  </span>
                }
              />
              <KeyValue
                k="Match score"
                v={<Figure value={audit.match_score} status="observed" precision={4} />}
              />
              <KeyValue
                k="Score threshold"
                v={
                  <NotCollected
                    gapId="GAP-024"
                    reason="No threshold is recorded anywhere and no candidate was ever rejected on the score."
                  />
                }
              />
              <KeyValue
                k="Spotify followers at match"
                v={<Figure value={numberOrNull(audit.raw.sp_followers)} status="observed" />}
              />
              <KeyValue
                k="Spotify monthly listeners at match"
                v={<Figure value={numberOrNull(audit.raw.sp_monthly_listeners)} status="observed" />}
              />
              <KeyValue k="Audit artifact" v="resolution-audit.json" mono />
            </dl>
          ) : (
            <Callout status="unavailable" title="No audit row for this artist" gapId="GAP-024">
              The entity-resolution audit covers 65 of the 131 roster rows. For this artist the binding
              between the name in the master list and the Chartmetric identifier is unevidenced: no
              search string, no matched name, no score.
            </Callout>
          )}
        </div>
      </div>

      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Revenue periods
        </div>
        {row.revenueRows.length > 0 ? (
          <DataTable
            rows={row.revenueRows}
            columns={REVENUE_COLUMNS}
            rowKey={(r) => r.period}
            filename={`nmas-revenue-${slug(a.artist_name)}`}
            dense
            pageSize={null}
            caption={`Every stored revenue row for ${a.artist_name}. Listener, subscriber and fan counts are observed; every currency figure is estimated or assumed.`}
          />
        ) : (
          <Callout status="unavailable" title="No revenue row in any quarter" gapId="GAP-033">
            This artist is in the master list and in the cost model’s artist count, and contributes
            nothing to any published revenue figure.
          </Callout>
        )}
      </div>
    </div>
  );
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const REVENUE_COLUMNS: Column<RevenueRow>[] = [
  {
    key: 'period',
    header: 'Quarter',
    value: (r) => r.period,
    render: (r) => <span className="fig">{formatPeriod(r.period)}</span>,
  },
  observedCol('spotify_monthly_listeners', 'Spotify listeners', (r) => r.spotify_monthly_listeners),
  observedCol('youtube_subscribers', 'YouTube subs', (r) => r.youtube_subscribers),
  observedCol('deezer_fans', 'Deezer fans', (r) => r.deezer_fans),
  {
    key: 'youtube_actual_views',
    header: 'YouTube views',
    numeric: true,
    note: 'Column named “actual”, synthetic on 426 of 638 rows across the delivery.',
    value: (r) => r.youtube_actual_views,
    render: (r) => (
      <Figure
        value={r.youtube_actual_views}
        field="youtube_actual_views"
        row={r as unknown as Record<string, unknown>}
      />
    ),
  },
  {
    key: 'youtube_views_source',
    header: 'Views source',
    note: 'The only epistemic flag in the entire delivery. Both states are marked.',
    value: (r) => r.youtube_views_source,
    render: (r) => {
      const epi = resolveEpistemic('youtube_actual_views', r as unknown as Record<string, unknown>);
      return r.youtube_views_source === null ? (
        <NotCollected short gapId="GAP-030" reason="The flag is absent on this row." />
      ) : (
        <EpistemicChip
          status={epi}
          title={
            r.youtube_views_source === 'actual'
              ? 'youtube_views_source = "actual" — returned by the source.'
              : 'youtube_views_source = "estimated" — manufactured from subscribers × 15 views/sub/month × 3 months.'
          }
        />
      );
    },
  },
  figureCol('est_spotify_quarterly_streams', 'Est. streams'),
  figureCol('spotify_revenue_usd', 'Spotify rev.'),
  figureCol('youtube_revenue_usd', 'YouTube rev.'),
  figureCol('deezer_revenue_usd', 'Deezer rev.'),
  figureCol('other_platforms_revenue_usd', 'Other platforms'),
  figureCol('gross_streaming_revenue_usd', 'Gross USD'),
  figureCol('gross_streaming_revenue_ngn', 'Gross NGN', true),
  figureCol('nigeria_domestic_share_pct', 'Domestic share', true),
  figureCol('domestic_revenue_usd', 'Domestic rev.', true),
  figureCol('gross_export_revenue_usd', 'Export rev.', true),
  {
    key: 'top_export_markets',
    header: 'Top export markets',
    optional: true,
    note: 'An identical constant string on all 638 rows. Not derived from any listener-geography observation.',
    value: (r) => r.top_export_markets,
    render: (r) =>
      r.top_export_markets === null ? (
        <NotCollected short />
      ) : (
        <span data-epi="assumed" style={{ color: 'var(--epi)', whiteSpace: 'nowrap' }}>
          {r.top_export_markets}
        </span>
      ),
  },
  {
    key: 'streaming_source',
    header: 'Source string',
    optional: true,
    note: 'Credited SoundCharts when no client existed (GAP-036, first delivery). Superseded: the Soundcharts integration now exists and supplies the extended series.',
    value: (r) => r.streaming_source,
    render: (r) =>
      r.streaming_source === null ? (
        <NotCollected short />
      ) : (
        <span
          data-epi="rejected"
          style={{ color: 'var(--epi)', fontSize: 'var(--t-micro)' }}
          title="GAP-036 (historical) — at the first delivery, the credited SoundCharts integration did not exist. It does now."
        >
          {r.streaming_source}
        </span>
      ),
  },
];

function observedCol(
  key: keyof RevenueRow,
  header: string,
  value: (r: RevenueRow) => number | null,
): Column<RevenueRow> {
  return {
    key: String(key),
    header,
    numeric: true,
    value,
    render: (r) => <Figure value={value(r)} field={String(key)} />,
  };
}

function figureCol(field: keyof RevenueRow, header: string, optional = false): Column<RevenueRow> {
  return {
    key: String(field),
    header,
    numeric: true,
    optional,
    value: (r) => {
      const v = r[field];
      return typeof v === 'number' ? v : null;
    },
    render: (r) => {
      const v = r[field];
      return <Figure value={typeof v === 'number' ? v : null} field={String(field)} />;
    },
  };
}
