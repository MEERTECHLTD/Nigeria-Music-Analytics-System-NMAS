/**
 * PANEL 9 — Entity Graph
 *
 * There is no graph to draw. One entity type in this system carries rows; the
 * rest are either defined and empty or were never modelled at all. A
 * force-directed rendering of that would be a picture of nothing pretending to
 * be a network, so this panel draws the SCHEMA instead: every entity type the
 * data model defines, every entity type the brief requires, the edges between
 * them, and the actual populated row count on each node.
 *
 * Three node states are kept apart, because collapsing them is how a missing
 * table becomes indistinguishable from an empty one:
 *
 *   POPULATED      a served artifact carries rows for it
 *   DEFINED, EMPTY a table exists in the data model; no artifact exposes rows,
 *                  and the database that would hold them is not on disk
 *   NOT MODELLED   no table, no column and no endpoint anywhere
 *
 * What this panel cannot do: draw a single artist-to-artist, artist-to-chart or
 * track-to-market edge, because none exists. It also cannot show a row count for
 * any empty node — with no database on disk (GAP-011) "zero rows" is not a
 * measurement, so those nodes render NOT COLLECTED rather than 0.
 */

import { useMemo } from 'react';
import { useCoverage, useManifest, useVariables } from '../data/client';
import {
  Callout,
  Figure,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import type { Coverage, DeniedEndpoint, Epistemic, Manifest, Variables } from '../data/types';

/* ---------------------------------------------------------------- model */

type NodeStatus = 'POPULATED' | 'DEFINED_EMPTY' | 'NOT_MODELLED';

const STATUS_EPI: Record<NodeStatus, Epistemic> = {
  POPULATED: 'observed',
  DEFINED_EMPTY: 'unavailable',
  NOT_MODELLED: 'unavailable',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  POPULATED: 'Populated',
  DEFINED_EMPTY: 'Defined, empty',
  NOT_MODELLED: 'Not modelled',
};

interface NodeSpec {
  id: string;
  label: string;
  /** the table in backend/nmas/models.py, or null when nothing defines it */
  table: string | null;
  status: NodeStatus;
  x: number;
  y: number;
  w: number;
  h: number;
  /** endpoint prefixes in the denied-endpoint register that would have fed it */
  deniedPrefixes: string[];
  artifact: string | null;
  gapId: string | null;
  evidence: string;
  /** set only where a served artifact or the gap register supplies a count */
  rowsFrom?: 'manifest:artist_master_list' | 'coverage:observations' | 'register:track';
}

const NODES: NodeSpec[] = [
  {
    id: 'artist',
    label: 'Artist',
    table: 'artists',
    status: 'POPULATED',
    x: 20,
    y: 196,
    w: 200,
    h: 100,
    deniedPrefixes: ['/api/artist/'],
    artifact: 'artists.json · delivery/04_Datasets/Artist_Master_List.csv',
    gapId: 'GAP-027',
    evidence:
      'The only entity type with a populated roster. Four of its eight columns — spotify_id, youtube_id, label, genres — are empty on every row, so the node exists but carries almost no attributes.',
    rowsFrom: 'manifest:artist_master_list',
  },
  {
    id: 'observation',
    label: 'Metric observation',
    table: 'normalized_metric_observations',
    status: 'POPULATED',
    x: 340,
    y: 180,
    w: 180,
    h: 80,
    deniedPrefixes: [],
    artifact: 'coverage.json · delivery/04_Datasets/Daily_Metric_Observations.csv',
    gapId: 'GAP-017',
    evidence:
      'The one dense edge in the whole model: artist → daily observation, 18 variables, 11 endpoints, all of them artist-level. Every observation carries an endpoint, source field and extraction timestamp; the payload foreign key and provenance fields are written and exposed by no projection.',
    rowsFrom: 'coverage:observations',
  },
  {
    id: 'platform_account',
    label: 'Platform account',
    table: 'platform_accounts',
    status: 'DEFINED_EMPTY',
    x: 340,
    y: 12,
    w: 180,
    h: 64,
    deniedPrefixes: [],
    artifact: null,
    gapId: 'GAP-027',
    evidence:
      'The table that would bind an artist to a Spotify, YouTube or Deezer account id. Referenced nowhere outside its own definition, and the identifier columns it would have populated are null on 131 of 131 artist rows.',
  },
  {
    id: 'override',
    label: 'Resolution override',
    table: 'entity_resolution_overrides',
    status: 'DEFINED_EMPTY',
    x: 340,
    y: 96,
    w: 180,
    h: 64,
    deniedPrefixes: [],
    artifact: null,
    gapId: 'GAP-024',
    evidence:
      'The manual-correction table for a bad entity match. Referenced nowhere outside its definition, so no match was ever overridden, approved or reasoned about.',
  },
  {
    id: 'track',
    label: 'Track',
    table: 'tracks',
    status: 'DEFINED_EMPTY',
    x: 340,
    y: 284,
    w: 180,
    h: 76,
    deniedPrefixes: ['/api/track/'],
    artifact: 'registry/gaps.ts · GAP-006',
    gapId: 'GAP-006',
    evidence:
      'The table exists and every track-level route that would fill it is a confirmed 401. The gap register records exactly one track row from a direct read of the system before the database was lost; no served artifact carries a track count, so the console cannot re-verify it.',
    rowsFrom: 'register:track',
  },
  {
    id: 'label',
    label: 'Label',
    table: null,
    status: 'NOT_MODELLED',
    x: 340,
    y: 372,
    w: 180,
    h: 64,
    deniedPrefixes: [],
    artifact: null,
    gapId: 'GAP-027',
    evidence:
      'No label table, no label endpoint. The one place a label could have been recorded is a free-text column on the artist row, and it is null on 131 of 131 rows.',
  },
  {
    id: 'release',
    label: 'Release / album',
    table: null,
    status: 'NOT_MODELLED',
    x: 610,
    y: 196,
    w: 180,
    h: 64,
    deniedPrefixes: ['/api/album'],
    artifact: null,
    gapId: 'GAP-006',
    evidence:
      'No release or album table anywhere in the model. The album-metadata route that would have supplied one is in the confirmed-401 register.',
  },
  {
    id: 'chart',
    label: 'Chart entry',
    table: null,
    status: 'NOT_MODELLED',
    x: 610,
    y: 284,
    w: 180,
    h: 64,
    deniedPrefixes: ['/api/charts', '/api/city/'],
    artifact: null,
    gapId: 'GAP-009',
    evidence:
      'No chart table. Shazam chart position is defined as a metric and produced zero observations across every quarter; every remaining chart route is a confirmed 401. No code compares chart appearances across markets.',
  },
  {
    id: 'station',
    label: 'Radio station',
    table: null,
    status: 'NOT_MODELLED',
    x: 610,
    y: 368,
    w: 180,
    h: 64,
    deniedPrefixes: [],
    artifact: null,
    gapId: 'GAP-007',
    evidence:
      'No table, no endpoint, no column — and not an oversight. International radio airplay is one of five capabilities scoped against a proposed SoundCharts integration and deferred with it. Scoped and deferred is a different claim from never considered.',
  },
  {
    id: 'market',
    label: 'Market / territory',
    table: null,
    status: 'NOT_MODELLED',
    x: 852,
    y: 284,
    w: 168,
    h: 64,
    deniedPrefixes: [],
    artifact: null,
    gapId: 'GAP-009',
    evidence:
      'No market table. The listener-geography metric that would have populated one is fully defined and was explicitly skipped by the extraction on the grounds that the 30% domestic share was already assumed. The five "top export markets" are a constant string repeated on every revenue row.',
  },
];

interface EdgeSpec {
  from: string;
  to: string;
  verb: string;
  /** true only when rows actually traverse this edge */
  carriesData: boolean;
  /** the join table, where the model defines one */
  through?: string;
  note: string;
  path: string;
  lx: number;
  ly: number;
}

const EDGES: EdgeSpec[] = [
  {
    from: 'artist',
    to: 'observation',
    verb: 'observes',
    carriesData: true,
    note: 'The only edge in the model that rows actually traverse.',
    path: 'M220,246 L340,220',
    lx: 280,
    ly: 227,
  },
  {
    from: 'artist',
    to: 'platform_account',
    verb: 'has account',
    carriesData: false,
    note: 'Defined by platform_accounts. Never written.',
    path: 'M220,246 L340,44',
    lx: 280,
    ly: 141,
  },
  {
    from: 'artist',
    to: 'override',
    verb: 'corrected by',
    carriesData: false,
    note: 'Defined by entity_resolution_overrides. Never written.',
    path: 'M220,246 L340,128',
    lx: 280,
    ly: 183,
  },
  {
    from: 'artist',
    to: 'track',
    verb: 'performs',
    carriesData: false,
    through: 'artist_track_links',
    note: 'The join table is defined with a unique constraint and a link type. No artifact exposes a single row of it.',
    path: 'M220,246 L340,316',
    lx: 280,
    ly: 277,
  },
  {
    from: 'artist',
    to: 'label',
    verb: 'signed to',
    carriesData: false,
    note: 'No join table. A free-text column on the artist row, null on every row.',
    path: 'M220,246 L340,400',
    lx: 280,
    ly: 319,
  },
  {
    from: 'track',
    to: 'release',
    verb: 'released on',
    carriesData: false,
    note: 'Neither endpoint of this edge is modelled beyond the track table.',
    path: 'M520,316 L610,228',
    lx: 565,
    ly: 268,
  },
  {
    from: 'track',
    to: 'chart',
    verb: 'charts in',
    carriesData: false,
    note: 'Every chart route is a confirmed 401.',
    path: 'M520,316 L610,316',
    lx: 565,
    ly: 310,
  },
  {
    from: 'track',
    to: 'station',
    verb: 'played by',
    carriesData: false,
    note: 'Scoped against SoundCharts and deferred with it.',
    path: 'M520,316 L610,400',
    lx: 565,
    ly: 364,
  },
  {
    from: 'chart',
    to: 'market',
    verb: 'scoped to',
    carriesData: false,
    note: 'Cross-market chart comparison is the requirement neither endpoint can support.',
    path: 'M790,316 L852,316',
    lx: 821,
    ly: 310,
  },
  {
    from: 'station',
    to: 'market',
    verb: 'broadcasts in',
    carriesData: false,
    note: 'Both endpoints unmodelled.',
    path: 'M790,400 L852,340',
    lx: 830,
    ly: 376,
  },
  {
    from: 'artist',
    to: 'market',
    verb: 'export revenue attributed to',
    carriesData: false,
    note: 'Export revenue is computed as a flat 70% of streaming revenue and attributed to an identical five-market string on every row. No observation binds an artist to a territory.',
    path: 'M120,296 L120,540 L936,540 L936,348',
    lx: 528,
    ly: 534,
  },
];

const NODES_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

/* ---------------------------------------------------------------- panel */

export default function EntityGraph() {
  const manifest = useManifest();
  const coverage = useCoverage();
  const variables = useVariables();

  return (
    <Resolved query={manifest} artifact="manifest.json" label="Reading the artifact manifest">
      {(m) => (
        <Resolved query={coverage} artifact="coverage.json">
          {(c) => (
            <Resolved query={variables} artifact="variables.json">
              {(v) => <Graph manifest={m} coverage={c} variables={v} />}
            </Resolved>
          )}
        </Resolved>
      )}
    </Resolved>
  );
}

interface EntityRow {
  node: NodeSpec;
  rows: number | null;
  denied: DeniedEndpoint[];
}

function Graph({
  manifest,
  coverage,
  variables,
}: {
  manifest: Manifest;
  coverage: Coverage;
  variables: Variables;
}) {
  const artistRows = useMemo(
    () => manifest.artifacts.find((a) => a.role === 'artist_master_list')?.rows ?? null,
    [manifest.artifacts],
  );

  const rows = useMemo<EntityRow[]>(
    () =>
      NODES.map((node) => ({
        node,
        rows:
          node.rowsFrom === 'manifest:artist_master_list'
            ? artistRows
            : node.rowsFrom === 'coverage:observations'
              ? coverage.total_observations
              : node.rowsFrom === 'register:track'
                ? 1
                : null,
        denied: variables.denied_endpoints.filter((d) =>
          node.deniedPrefixes.some((p) => (d.endpoint ?? '').startsWith(p)),
        ),
      })),
    [artistRows, coverage.total_observations, variables.denied_endpoints],
  );

  const rowsById = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.node.id, r])),
    [rows],
  );

  const counts = useMemo(
    () => ({
      populated: NODES.filter((n) => n.status === 'POPULATED').length,
      definedEmpty: NODES.filter((n) => n.status === 'DEFINED_EMPTY').length,
      notModelled: NODES.filter((n) => n.status === 'NOT_MODELLED').length,
      total: NODES.length,
      edgesWithData: EDGES.filter((e) => e.carriesData).length,
      edges: EDGES.length,
      deniedTotal: variables.denied_endpoints.length,
    }),
    [variables.denied_endpoints.length],
  );

  return (
    <>
      <Section
        title="The graph, at schema level"
        subtitle={
          <>
            The model defines {counts.total} entity types across this panel’s scope. Rows exist for{' '}
            <strong className="fig">{counts.populated}</strong> of them, and{' '}
            <strong className="fig">{counts.edgesWithData}</strong> of{' '}
            <strong className="fig">{counts.edges}</strong> relationships carries a single record.
            Everything hatched below is an edge the data model can express and the data cannot.
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
            gap: 'var(--s4)',
            paddingBottom: 'var(--s4)',
          }}
        >
          <StatFigure
            label="Artists"
            value={artistRows}
            status="observed"
            footnote="The one populated node type"
            provenance={{
              artifact: 'delivery/04_Datasets/Artist_Master_List.csv',
              note: 'Row count taken from the artifact manifest, not from a hardcoded constant.',
            }}
          />
          <StatFigure
            label="Metric observations"
            value={coverage.total_observations}
            status="observed"
            footnote={`${coverage.variables.length} variables, ${coverage.distinct_artists} artists`}
            provenance={{
              artifact: 'delivery/04_Datasets/Daily_Metric_Observations.csv',
              note: 'Every observation is artist-level. None is attached to a track, release, chart, market or station.',
            }}
          />
          <StatFigure
            label="Tracks"
            value={1}
            status="observed"
            footnote="Asserted by the gap register; not re-verifiable"
            provenance={{
              artifact: 'frontend/src/console/registry/gaps.ts',
              sourceField: 'GAP-006.evidence',
              note: 'The system contains exactly one track row. No served artifact carries a track count and the database that held it is not on disk, so this figure rests on the register rather than on data this console can read.',
              gapId: 'GAP-011',
            }}
          />
          <StatFigure
            label="Releases, labels, charts, markets, stations"
            value={null}
            status="unavailable"
            gapId="GAP-009"
            reason="None of these is modelled. There is no table, column or endpoint to count."
            footnote="Not empty — absent"
          />
          <StatFigure
            label="Confirmed 401 endpoints"
            value={counts.deniedTotal}
            status="rejected"
            footnote="Track, album, chart, city, playlist and curator routes"
            provenance={{
              artifact: 'variables.json',
              sourceField: 'denied_endpoints',
              note: 'Every route that would have populated a non-artist node in this graph is in this register. The estimation layer exists because of it.',
              gapId: 'GAP-038',
            }}
          />
        </div>

        <Callout status="unavailable" title="One populated node type, and a constellation of empty ones" gapId="GAP-027">
          The system is not a graph. It is a single roster of {artistRows ?? 'the'} artists with a
          deep time series hanging off it, drawn as a graph because the specification asked for one.
          Of the {counts.total} entity types shown, {counts.definedEmpty} are defined in the data
          model and carry nothing, and {counts.notModelled} were never modelled at all. The
          distinction matters: a defined-and-empty table is a serialiser or a backfill away from
          being useful, while an unmodelled entity needs a schema, an endpoint and a source that the
          current plan tier does not return.
        </Callout>
      </Section>

      <Section
        title="Entity schema"
        subtitle="Node fill carries populated state; every edge that carries no record is drawn hatched. The row counts are read from the artifacts, not from the diagram."
        actions={<GraphKey />}
      >
        <div className="scroll-x">
          <Diagram rowsById={rowsById} />
        </div>
      </Section>

      <Section
        title="Entity register"
        subtitle="Every node in the diagram, with the table that defines it, the rows that exist, the artifact those rows come from and the gap that explains the absence."
      >
        <DataTable
          rows={rows}
          columns={ENTITY_COLUMNS}
          rowKey={(r) => r.node.id}
          filename="nmas-entity-graph"
          pageSize={null}
          initialSort={{ key: 'rows', dir: 'desc' }}
          caption={
            <>
              Row counts are rendered NOT COLLECTED, never 0, for every empty node: no database
              exists on disk (GAP-011), so “zero rows” would be an assertion this console cannot
              make. “Not modelled” means no table, column or endpoint exists anywhere — a stronger
              statement than an empty table.
            </>
          }
          expand={(r) => <EntityDetail row={r} />}
        />
      </Section>

      <Section
        title="Relationships"
        subtitle="Each edge in the diagram, and whether anything travels along it."
      >
        <DataTable
          rows={EDGES}
          columns={EDGE_COLUMNS}
          rowKey={(e) => `${e.from}→${e.to}`}
          filename="nmas-entity-edges"
          pageSize={null}
          dense
          caption="An edge carries data only where a served artifact contains rows joining both endpoints."
        />

        <Callout status="unavailable" title="Cross-market appearances have no path through this graph" gapId="GAP-009">
          The requirement is an artist observed on a chart in a market other than Nigeria. It needs
          four consecutive edges — artist → track → chart entry → market — and three of the four
          nodes do not exist. Every chart route in the denied register returns 401, no code compares
          chart appearances across markets, and the listener-geography metric that would have bound
          an artist to a territory was defined, implemented and then explicitly skipped. Building
          this edge is not a query change; it needs a chart table, a market table, a plan tier that
          returns chart data, and a backfill across the nine quarters the archive reaches.
        </Callout>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------- diagram */

const HATCH_ID = 'nmas-eg-hatch';
const ARROW_ID = 'nmas-eg-arrow';
const ARROW_DIM_ID = 'nmas-eg-arrow-dim';

function Diagram({ rowsById }: { rowsById: Record<string, EntityRow> }) {
  return (
    <svg
      viewBox="0 0 1040 570"
      role="img"
      aria-labelledby="nmas-eg-title nmas-eg-desc"
      style={{
        width: '100%',
        minWidth: '58rem',
        height: 'auto',
        fontFamily: 'var(--font-sans)',
        display: 'block',
      }}
    >
      <title id="nmas-eg-title">NMAS entity schema</title>
      <desc id="nmas-eg-desc">
        Ten entity types. Artist and metric observation carry rows. Track, platform account and
        resolution override are defined in the data model and carry no rows this console can read.
        Label, release, chart entry, radio station and market are not modelled at all. Of eleven
        relationships, only artist to metric observation carries any record. The full contents of
        this diagram are repeated as the entity register and relationship tables below.
      </desc>

      <defs>
        <pattern id={HATCH_ID} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" style={{ fill: 'var(--una-bg)' }} />
          <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--una-edge)', strokeWidth: 1 }} />
        </pattern>
        <marker id={ARROW_ID} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--obs)' }} />
        </marker>
        <marker id={ARROW_DIM_ID} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--una-edge)' }} />
        </marker>
      </defs>

      {/* edges first, so nodes sit on top of them */}
      {EDGES.map((e) => (
        <g key={`${e.from}-${e.to}`}>
          <title>
            {`${NODES_BY_ID[e.from].label} → ${NODES_BY_ID[e.to].label} · ${e.verb} · ${
              e.carriesData ? 'carries records' : 'no record traverses this edge'
            }${e.through ? ` · join table ${e.through}` : ''}`}
          </title>
          <path
            d={e.path}
            fill="none"
            markerEnd={`url(#${e.carriesData ? ARROW_ID : ARROW_DIM_ID})`}
            style={{
              stroke: e.carriesData ? 'var(--obs)' : 'var(--una-edge)',
              strokeWidth: e.carriesData ? 2 : 1.25,
              strokeDasharray: e.carriesData ? undefined : '5 4',
            }}
          />
          <EdgeLabel edge={e} />
        </g>
      ))}

      {NODES.map((n) => (
        <Node key={n.id} node={n} row={rowsById[n.id]} />
      ))}
    </svg>
  );
}

function EdgeLabel({ edge }: { edge: EdgeSpec }) {
  const w = edge.verb.length * 4.9 + 10;
  return (
    <g>
      <rect
        x={edge.lx - w / 2}
        y={edge.ly - 7}
        width={w}
        height={13}
        style={{ fill: 'var(--paper)' }}
      />
      <text
        x={edge.lx}
        y={edge.ly + 3}
        textAnchor="middle"
        style={{
          fontSize: 8.5,
          letterSpacing: '0.04em',
          fill: edge.carriesData ? 'var(--obs)' : 'var(--ink-4)',
          fontWeight: edge.carriesData ? 650 : 400,
        }}
      >
        {edge.verb}
      </text>
    </g>
  );
}

function Node({ node, row }: { node: NodeSpec; row: EntityRow | undefined }) {
  const populated = node.status === 'POPULATED';
  const epi = STATUS_EPI[node.status];
  const count = row?.rows ?? null;

  return (
    <g data-epi={epi}>
      <title>
        {`${node.label} · ${STATUS_LABEL[node.status]} · ${
          node.table ? `table ${node.table}` : 'no table defined'
        } · ${count === null ? 'rows NOT COLLECTED' : `${count.toLocaleString('en-US')} rows`}${
          node.gapId ? ` · ${node.gapId}` : ''
        }`}
      </title>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        style={{
          fill: populated ? 'var(--obs-bg)' : `url(#${HATCH_ID})`,
          stroke: populated ? 'var(--obs)' : 'var(--una-edge)',
          strokeWidth: populated ? 1.75 : 1,
          strokeDasharray: node.status === 'NOT_MODELLED' ? '4 3' : undefined,
        }}
      />
      <text
        x={node.x + 12}
        y={node.y + 21}
        style={{
          fontSize: 12.5,
          fontWeight: 650,
          fill: populated ? 'var(--obs)' : 'var(--ink-2)',
        }}
      >
        {node.label}
      </text>

      <text
        x={node.x + 12}
        y={node.y + 34}
        style={{
          fontSize: 8.5,
          fontFamily: 'var(--font-mono)',
          fill: 'var(--ink-4)',
        }}
      >
        {node.table ?? 'no table defined'}
      </text>

      {count !== null ? (
        <text
          x={node.x + 12}
          y={node.y + (node.h > 80 ? 60 : node.rowsFrom === 'register:track' ? 52 : 53)}
          style={{
            fontSize: node.h > 80 ? 19 : 15,
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums lining-nums',
            fontWeight: 600,
            fill: 'var(--ink)',
          }}
        >
          {count.toLocaleString('en-US')}
          <tspan style={{ fontSize: 9, fill: 'var(--ink-3)', fontWeight: 400 }}>
            {count === 1 ? ' row' : ' rows'}
          </tspan>
        </text>
      ) : (
        <text
          x={node.x + 12}
          y={node.y + 53}
          style={{
            fontSize: 9,
            fontWeight: 650,
            letterSpacing: '0.07em',
            fill: 'var(--una)',
          }}
        >
          NOT COLLECTED
          <tspan style={{ fontWeight: 400, fill: 'var(--ink-4)', letterSpacing: 0 }}>
            {node.gapId ? `  ${node.gapId}` : ''}
          </tspan>
        </text>
      )}

      {node.rowsFrom === 'register:track' ? (
        <text
          x={node.x + 12}
          y={node.y + 65}
          style={{ fontSize: 7.5, fill: 'var(--ink-4)' }}
        >
          asserted by GAP-006 · not re-verifiable
        </text>
      ) : null}
    </g>
  );
}

function GraphKey() {
  const items: Array<{ label: string; status: NodeStatus | 'edge' | 'edge-empty' }> = [
    { label: 'Populated', status: 'POPULATED' },
    { label: 'Defined, empty', status: 'DEFINED_EMPTY' },
    { label: 'Not modelled', status: 'NOT_MODELLED' },
    { label: 'Edge carries records', status: 'edge' },
    { label: 'Edge carries nothing', status: 'edge-empty' },
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
      {items.map((i) => (
        <li key={i.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <svg width="26" height="14" aria-hidden="true" style={{ flex: 'none' }}>
            <defs>
              <pattern
                id={`${HATCH_ID}-key-${i.label.replace(/\W+/g, '')}`}
                width="7"
                height="7"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="7" height="7" style={{ fill: 'var(--una-bg)' }} />
                <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--una-edge)', strokeWidth: 1 }} />
              </pattern>
            </defs>
            {i.status === 'edge' || i.status === 'edge-empty' ? (
              <line
                x1="1"
                y1="7"
                x2="25"
                y2="7"
                style={{
                  stroke: i.status === 'edge' ? 'var(--obs)' : 'var(--una-edge)',
                  strokeWidth: i.status === 'edge' ? 2 : 1.25,
                  strokeDasharray: i.status === 'edge' ? undefined : '5 4',
                }}
              />
            ) : (
              <rect
                x="1"
                y="1"
                width="24"
                height="12"
                style={{
                  fill:
                    i.status === 'POPULATED'
                      ? 'var(--obs-bg)'
                      : `url(#${HATCH_ID}-key-${i.label.replace(/\W+/g, '')})`,
                  stroke: i.status === 'POPULATED' ? 'var(--obs)' : 'var(--una-edge)',
                  strokeWidth: i.status === 'POPULATED' ? 1.75 : 1,
                  strokeDasharray: i.status === 'NOT_MODELLED' ? '4 3' : undefined,
                }}
              />
            )}
          </svg>
          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- tables */

const ENTITY_COLUMNS: Column<EntityRow>[] = [
  {
    key: 'entity',
    header: 'Entity type',
    width: '12rem',
    value: (r) => r.node.label,
    render: (r) => (
      <span data-epi={STATUS_EPI[r.node.status]} style={{ whiteSpace: 'nowrap' }}>
        {r.node.label}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'State',
    groupable: true,
    value: (r) => STATUS_LABEL[r.node.status],
    render: (r) => (
      <span className="epi-chip epi-chip--bare" data-epi={STATUS_EPI[r.node.status]}>
        {STATUS_LABEL[r.node.status]}
      </span>
    ),
  },
  {
    key: 'table',
    header: 'Model table',
    note: 'The SQLModel table in backend/nmas/models.py, where one exists.',
    value: (r) => r.node.table,
    render: (r) =>
      r.node.table ? (
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
          {r.node.table}
        </code>
      ) : (
        <NotCollected
          short
          reason="No table, column or endpoint defines this entity anywhere in the codebase."
          gapId={r.node.gapId ?? undefined}
        />
      ),
  },
  {
    key: 'rows',
    header: 'Rows populated',
    numeric: true,
    note: 'Rendered NOT COLLECTED rather than 0 for every empty node — with no database on disk, zero is not a measurement.',
    value: (r) => r.rows,
    render: (r) => (
      <Figure
        value={r.rows}
        status="observed"
        gapId={r.node.status === 'NOT_MODELLED' ? (r.node.gapId ?? undefined) : 'GAP-011'}
        reason={
          r.node.status === 'NOT_MODELLED'
            ? 'Nothing defines this entity, so there is no table to count.'
            : 'The table is defined but no artifact exposes its rows, and the database that held them does not exist on disk.'
        }
        label={`${r.node.label} rows`}
        provenance={
          r.rows !== null
            ? {
                artifact: r.node.artifact ?? undefined,
                note:
                  r.node.rowsFrom === 'register:track'
                    ? 'Asserted by the gap register from a direct read before the database was lost. No served artifact carries a track count.'
                    : 'Read from the artifact manifest / coverage projection.',
                gapId: r.node.rowsFrom === 'register:track' ? 'GAP-011' : undefined,
              }
            : undefined
        }
      />
    ),
  },
  {
    key: 'denied',
    header: '401 routes',
    numeric: true,
    note: 'Confirmed-401 endpoints in the denied register that would have populated this entity.',
    value: (r) => (r.denied.length > 0 ? r.denied.length : null),
    render: (r) =>
      r.denied.length > 0 ? (
        <span
          className="fig"
          data-epi="rejected"
          style={{ color: 'var(--epi)' }}
          title={r.denied.map((d) => `${d.metric} — ${d.endpoint ?? ''}`).join('\n')}
        >
          {r.denied.length}
        </span>
      ) : (
        <NotCollected
          short
          reason="No endpoint was ever registered for this entity — its absence is not an access-tier problem."
        />
      ),
  },
  {
    key: 'artifact',
    header: 'Source artifact',
    value: (r) => r.node.artifact,
    render: (r) =>
      r.node.artifact ? (
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
          {r.node.artifact}
        </code>
      ) : (
        <NotCollected
          short
          reason="No artifact in the repository carries a row for this entity."
          gapId={r.node.gapId ?? undefined}
        />
      ),
  },
  {
    key: 'gap',
    header: 'Gap',
    width: '5.5rem',
    value: (r) => r.node.gapId,
    render: (r) =>
      r.node.gapId ? (
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
          {r.node.gapId}
        </code>
      ) : (
        <span style={{ color: 'var(--ink-4)' }}>—</span>
      ),
  },
];

function EntityDetail({ row }: { row: EntityRow }) {
  return (
    <div style={{ maxWidth: '78ch', display: 'grid', gap: 'var(--s3)' }}>
      <p style={{ margin: 0 }}>{row.node.evidence}</p>
      {row.denied.length > 0 ? (
        <div>
          <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Confirmed 401 routes that would have populated it
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {row.denied.map((d) => (
              <li key={d.endpoint ?? d.metric} style={{ padding: '0.1rem 0' }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {d.endpoint}
                </code>
                <span style={{ color: 'var(--ink-3)' }}> · {d.metric}</span>
                <span data-epi="rejected" style={{ color: 'var(--epi)', marginLeft: '0.5rem' }}>
                  {d.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Edges touching this node
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {EDGES.filter((e) => e.from === row.node.id || e.to === row.node.id).map((e) => (
            <li key={`${e.from}-${e.to}`} style={{ padding: '0.1rem 0' }}>
              <span data-epi={e.carriesData ? 'observed' : 'unavailable'}>
                {NODES_BY_ID[e.from].label} <em style={{ color: 'var(--epi)' }}>{e.verb}</em>{' '}
                {NODES_BY_ID[e.to].label}
              </span>
              <span style={{ color: 'var(--ink-3)' }}> — {e.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const EDGE_COLUMNS: Column<EdgeSpec>[] = [
  {
    key: 'from',
    header: 'From',
    value: (e) => NODES_BY_ID[e.from].label,
  },
  {
    key: 'verb',
    header: 'Relationship',
    value: (e) => e.verb,
    render: (e) => (
      <span data-epi={e.carriesData ? 'observed' : 'unavailable'} style={{ color: 'var(--epi)' }}>
        {e.verb}
      </span>
    ),
  },
  {
    key: 'to',
    header: 'To',
    value: (e) => NODES_BY_ID[e.to].label,
  },
  {
    key: 'join',
    header: 'Join table',
    value: (e) => e.through ?? null,
    render: (e) =>
      e.through ? (
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
          {e.through}
        </code>
      ) : (
        <NotCollected short reason="No join table defines this relationship." />
      ),
  },
  {
    key: 'carries',
    header: 'Carries records',
    groupable: true,
    value: (e) => (e.carriesData ? 'yes' : 'no'),
    render: (e) => (
      <span className="epi-chip epi-chip--bare" data-epi={e.carriesData ? 'observed' : 'unavailable'}>
        {e.carriesData ? 'yes' : 'no'}
      </span>
    ),
  },
  {
    key: 'note',
    header: 'Evidence',
    value: (e) => e.note,
  },
];
