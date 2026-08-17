/**
 * PANEL 10 — Export Footprint
 *
 * The panel that would show where Nigerian music is consumed outside Nigeria.
 * It cannot, because neither of the two inputs was ever collected:
 *
 *   listener geography     defined, implemented in the client, then explicitly
 *                          skipped by the extraction. 100% empty. GAP-008.
 *   chart appearances      Shazam chart position produced zero rows across every
 *                          quarter; every other chart endpoint is a confirmed
 *                          401. No code compares markets. GAP-009.
 *
 * The only market content in the entire system is a single hardcoded string,
 * byte-identical on all 638 artist-quarter rows, and five literal percentages
 * living in a Python tuple. They are rendered here as CONSTANTS, labelled
 * ASSUMED — NOT MEASURED, and deliberately NOT as a map or a choropleth. Drawing
 * them geographically would give an unmeasured literal the visual authority of a
 * measurement, which is precisely the failure this console exists to prevent.
 *
 * The sharpest finding on the page: the endpoint that eight documents credit for
 * the five foreign markets is, in its own metric definition, scoped to NIGERIAN
 * CITIES ONLY. Had it been called, it would not have produced a foreign-market
 * breakdown either.
 */

import { useMemo, type ReactNode } from 'react';
import { useCoverage, useQuality, useRevenue, useVariables } from '../data/client';
import { formatPeriod } from '../data/client';
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
import { GAPS_BY_ID } from '../registry/gaps';
import type { Coverage, Quality, Revenue, Variables } from '../data/types';

const WPL = 'Where_People_Listen';

/**
 * The five literal share strings, transcribed from
 * backend/scripts/build_digital_export_excel.py:256-262. They are Python tuple
 * members, not data. Rank order here is the workbook's own.
 */
const MARKET_LITERALS: Array<{ rank: number; market: string; role: string; share: number }> = [
  { rank: 1, market: 'United States', role: 'Diaspora + mainstream Afrobeats audience', share: 30 },
  { rank: 2, market: 'United Kingdom', role: 'Diaspora + UK Afrobeats scene', share: 20 },
  { rank: 3, market: 'Ghana', role: 'Regional West African market', share: 15 },
  { rank: 4, market: 'South Africa', role: 'Regional Sub-Saharan market', share: 10 },
  { rank: 5, market: 'France', role: 'European diaspora (Francophone Africa)', share: 8 },
];

const LITERAL_SUM = MARKET_LITERALS.reduce((a, m) => a + m.share, 0);

/**
 * Every document that attributes market or domestic-share content to
 * Where-People-Listen data. Each quote was read directly at the line given.
 */
const FALSE_PROVENANCE_DOCS: Array<{ doc: string; line: number; quote: string }> = [
  {
    doc: 'delivery/01_Executive_Summary/Executive_Summary.md',
    line: 102,
    quote: '30% domestic / 70% export split based on Chartmetric Where People Listen data',
  },
  {
    doc: 'delivery/10_Presentation/NMAS_NBS_Final_Delivery_Presentation.md',
    line: 116,
    quote:
      'Export Revenue: Total streaming × 70%, where 70% is the non-Nigerian share derived from Chartmetric Where People Listen (30% domestic, per WIPO 2025 international music trade methodology).',
  },
  {
    doc: 'delivery/02_Methodology/NBS_Methodology_and_Sources.md',
    line: 22,
    quote: 'Chartmetric API: 11 stat endpoints + Where People Listen + charts (26 total accessible)',
  },
  {
    doc: 'delivery/11_Raw_Extractions/NBS_METHODOLOGY_AND_SOURCES.md',
    line: 22,
    quote: 'Chartmetric API: 11 stat endpoints + Where People Listen + charts (26 total accessible)',
  },
  {
    doc: 'backend/data/nbs_deliverables/NBS_METHODOLOGY_AND_SOURCES.md',
    line: 22,
    quote: 'Chartmetric API: 11 stat endpoints + Where People Listen + charts (26 total accessible)',
  },
  {
    doc: 'delivery/12_System_Exports/export_run_1/nmas_extraction_notes.md',
    line: 15,
    quote: 'Where People Listen rows are preserved as Nigeria city-level proxy data when present.',
  },
  {
    doc: 'delivery/12_System_Exports/export_run_2/nmas_extraction_notes.md',
    line: 15,
    quote: 'Where People Listen rows are preserved as Nigeria city-level proxy data when present.',
  },
  {
    doc: 'delivery/09_AI_Disclosure/NMAS_AI_Disclosure_and_Claude_Code_Architecture.md',
    line: 22,
    quote:
      'Upstream ML consumed as inputs: Spotify popularity, Chartmetric platform ranks / Where People Listen, Shazam chart positions.',
  },
];

/** The two shipped surfaces that present the literals to a reader as findings. */
const SHIPPED_SURFACES: Array<{ where: string; quote: string; note: string }> = [
  {
    where: 'backend/scripts/build_digital_export_excel.py:249-251',
    quote:
      'Destination markets are inferred from Chartmetric “Where People Listen” city-level data, aggregated to country. The top-5 markets are consistent across Nigerian artists.',
    note:
      'This sentence sits five lines above the tuple of literals it purports to describe. No aggregation from any listener-geography payload exists in the codebase — there is no payload to aggregate.',
  },
  {
    where: 'frontend/src/features/nmas/NbsDashboard.tsx:544',
    quote:
      'Destination countries from Chartmetric + SoundCharts “Where People Listen” data.',
    note:
      'The current dashboard restates the claim and adds a second false credit: no SoundCharts client, URL or credential exists anywhere in the repository (GAP-036).',
  },
];

/** The extraction's own reason for never calling the endpoint. */
const SKIP_COMMENT = [
  '# Where People Listen — skip for now (already have domestic share = 30%)',
  '# Will be extracted in a separate pass if needed',
].join('\n');

/** What the panel would contain, had listener geography been retrieved. */
const WOULD_CONTAIN: Array<{ block: string; requires: string; gapId: string; note: string }> = [
  {
    block: 'Measured domestic share per artist-quarter',
    requires: 'Where_People_Listen city shares, aggregated to a Nigeria total',
    gapId: 'GAP-008',
    note: 'This is the figure the 30% constant currently stands in for. It would replace an assumption with an observation.',
  },
  {
    block: 'Measured export share, breaking the tautology',
    requires: '1 − measured domestic share, per unit, per quarter',
    gapId: 'GAP-008',
    note: 'Today export share is 70.0 on every row because export revenue is defined as streaming × 0.70. A measured share would vary, and could be wrong — which is what makes it informative.',
  },
  {
    block: 'Country distribution of listeners',
    requires: 'listener shares outside Nigeria, which this metric does not emit',
    gapId: 'GAP-008',
    note: 'The metric definition restricts emission to Nigerian cities. A foreign-market breakdown would need a different endpoint or a widened definition, not merely a re-run.',
  },
  {
    block: 'Market concentration over time',
    requires: 'a measured country distribution across two or more quarters',
    gapId: 'GAP-008',
    note: 'Nine quarters of observations exist for other variables, so the time axis is available the moment the geography is.',
  },
  {
    block: 'Cross-market chart appearances',
    requires: 'chart endpoints that return, and code that compares markets',
    gapId: 'GAP-009',
    note: 'Shazam chart position is defined and produced zero rows in every quarter; the remaining chart endpoints are confirmed 401. No code compares markets in any case.',
  },
  {
    block: 'International radio airplay',
    requires: 'an airplay source; none is integrated',
    gapId: 'GAP-007',
    note: 'Scoped — international radio airplay is one of five capabilities listed against a proposed SoundCharts integration — and deferred with that proposal. Scoped-and-deferred is a different record from never considered.',
  },
];

/* ------------------------------------------------------------------ panel */

export default function ExportFootprint() {
  const revenue = useRevenue();
  const variables = useVariables();
  const quality = useQuality();
  const coverage = useCoverage();

  return (
    <>
      <Callout status="observed" title="Superseded — geography has since been collected">
        This panel is the forensic record of the FIRST delivery, in which listener
        geography was never collected. That finding is now historical: the second
        provider observed listener geography across 217 countries and 242 Nigerian
        cities (Export_Markets_Quarterly.csv, Geography_Full_Daily.csv.gz), and the
        domestic/export split is measured per artist where coverage exists. See the
        Provider Expansion panel for was-versus-now.
      </Callout>

    <Resolved query={revenue} artifact="revenue.json" label="Reading 638 artist-quarter rows">
      {(rev) => (
        <Resolved query={variables} artifact="variables.json" label="Reading the metric register">
          {(vars) => (
            <Resolved query={quality} artifact="quality.json" label="Reading the limitation report">
              {(qual) => (
                <Resolved query={coverage} artifact="coverage.json" label="Reading coverage">
                  {(cov) => (
                    <Panel revenue={rev} variables={vars} quality={qual} coverage={cov} />
                  )}
                </Resolved>
              )}
            </Resolved>
          )}
        </Resolved>
      )}
    </Resolved>
    </>
  );
}

function Panel({
  revenue,
  variables,
  quality,
  coverage,
}: {
  revenue: Revenue;
  variables: Variables;
  quality: Quality;
  coverage: Coverage;
}) {
  /* Recomputed on load. The claim "identical on all 638 rows" is only worth
     making if it is re-measured rather than transcribed. */
  const stringEvidence = useMemo(() => {
    const tally = (values: Array<string | number | null>) => {
      const m = new Map<string, number>();
      for (const v of values) {
        const k = v === null || v === undefined ? '(null)' : String(v);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      total: revenue.rows.length,
      markets: tally(revenue.rows.map((r) => r.top_export_markets)),
      exportSource: tally(revenue.rows.map((r) => r.export_source)),
      domesticShare: tally(revenue.rows.map((r) => r.nigeria_domestic_share_pct)),
      exportShare: tally(revenue.rows.map((r) => r.export_share_pct)),
    };
  }, [revenue.rows]);

  const wplLimitations = useMemo(
    () => quality.limitations.filter((l) => l.variable === WPL),
    [quality.limitations],
  );
  const wplLimitationTotal = wplLimitations.reduce((a, l) => a + l.count, 0);

  const wplDefinition = useMemo(
    () => variables.definitions.find((d) => d.name === WPL) ?? null,
    [variables.definitions],
  );

  const deniedMarketEndpoints = useMemo(
    () =>
      variables.denied_endpoints.filter(
        (d) =>
          (d.endpoint ?? '').includes('/charts') ||
          (d.endpoint ?? '').includes('/chart') ||
          d.metric.startsWith('Charts_') ||
          d.metric === 'City_charts',
      ),
    [variables.denied_endpoints],
  );

  const neverObserved = coverage.variables_defined_never_observed;
  const gapIds = ['GAP-008', 'GAP-009', 'GAP-007', 'GAP-039'];

  return (
    <>
      <Section
        title="Both inputs are empty"
        subtitle={
          <>
            An export footprint needs two things: where the listening happens, and where the
            catalogue charts. Neither exists. Listener geography was defined, implemented and then
            explicitly skipped; chart appearances produced zero rows across every quarter observed.
            What remains is one hardcoded string and five literal percentages, and this panel refuses
            to draw them on a map.
          </>
        }
      >
        <Callout status="unavailable" title="No listener geography was ever retrieved" gapId="GAP-008">
          <code style={{ fontFamily: 'var(--font-mono)' }}>{WPL}</code> is fully defined in the
          metric register and the API client can call it. The extraction skips it by name. The
          variable appears in the coverage artifact's{' '}
          <em>defined but never observed</em> list, alongside{' '}
          <span className="fig">{neverObserved.length - 1}</span> others, and produced{' '}
          <span className="fig">0</span> observations in all{' '}
          <span className="fig">{coverage.periods_observed.length}</span> quarters.
        </Callout>

        <Callout status="unavailable" title="No cross-market chart appearance exists" gapId="GAP-009">
          <code style={{ fontFamily: 'var(--font-mono)' }}>Shazam_chart_position_daily</code> is
          defined and produced zero rows. Every other chart route is a confirmed 401 — six of the{' '}
          <span className="fig">{variables.denied_endpoints.length}</span> denied endpoints are chart
          or city-chart routes. Even with data, no code in the repository compares appearances across
          markets.
        </Callout>

        <div
          style={{
            display: 'flex',
            gap: 'var(--s5)',
            flexWrap: 'wrap',
            paddingTop: 'var(--s3)',
          }}
        >
          <Tally label="Listener-geography observations" value={0} epi="unavailable" of="all quarters" />
          <Tally label="Chart-appearance observations" value={0} epi="unavailable" of="all quarters" />
          <Tally
            label="Rows carrying the market string"
            value={stringEvidence.total}
            epi="assumed"
            of={`${stringEvidence.markets.length} distinct value`}
          />
          <Tally
            label="Limitation rows for Where People Listen"
            value={wplLimitationTotal}
            epi="unavailable"
            of={`${wplLimitations.length} quarters`}
          />
        </div>
      </Section>

      <Section
        title="Assumed — not measured"
        subtitle="The whole of the system's market content, rendered as what it is: constants. No map, no choropleth, no flow diagram. A geographic drawing of these numbers would lend an unmeasured literal the authority of a measurement."
      >
        <Callout status="assumed" title="These are literals in source files, not observations" gapId="GAP-039">
          Every value in the two tables below was typed into a Python file by hand. None was returned
          by any endpoint, computed from any observation, or checked against any source. They are
          shown because they shipped and are therefore part of the record — not because they carry
          information about Nigerian music export.
        </Callout>

        <h3 className="h-section" style={{ margin: 'var(--s5) 0 var(--s2)' }}>
          A · The row-level market string
        </h3>
        <DataTable
          rows={[
            {
              key: 'markets',
              field: 'top_export_markets',
              tally: stringEvidence.markets,
              constantId: 'export-markets-list',
            },
            {
              key: 'export_source',
              field: 'export_source',
              tally: stringEvidence.exportSource,
              constantId: null,
            },
            {
              key: 'domestic',
              field: 'nigeria_domestic_share_pct',
              tally: stringEvidence.domesticShare,
              constantId: 'domestic-share',
            },
            {
              key: 'export',
              field: 'export_share_pct',
              tally: stringEvidence.exportShare,
              constantId: 'export-share',
            },
          ]}
          rowKey={(r) => r.key}
          pageSize={null}
          filename="panel-10-market-string-variance"
          caption={
            <>
              Distinct values across all{' '}
              <span className="fig">{stringEvidence.total.toLocaleString('en-US')}</span>{' '}
              artist-quarter rows, counted from revenue.json on load.
            </>
          }
          columns={[
            {
              key: 'field',
              header: 'Column',
              value: (r) => r.field,
              width: '16rem',
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.field}
                </span>
              ),
            },
            {
              key: 'distinct',
              header: 'Distinct values',
              value: (r) => r.tally.length,
              numeric: true,
              render: (r) => (
                <span className="fig" data-epi="assumed" style={{ color: 'var(--epi)' }}>
                  {r.tally.length}
                </span>
              ),
            },
            {
              key: 'value',
              header: 'Value → rows',
              value: (r) => r.tally.map(([v, n]) => `${v}=${n}`).join('; '),
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.tally.map(([v, n]) => `“${v}” → ${n.toLocaleString('en-US')}`).join('   ')}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              value: () => 'assumed',
              width: '8rem',
              render: () => <EpistemicChip status="assumed" title="A constant imposed from outside the data." />,
            },
            {
              key: 'src',
              header: 'Source in code',
              value: (r) => (r.constantId ? CONSTANTS_BY_ID[r.constantId]?.sourceRefs.join('; ') ?? null : null),
              optional: true,
              render: (r) => {
                const c = r.constantId ? CONSTANTS_BY_ID[r.constantId] : undefined;
                if (!c) return <NotCollected short reason="No named constant; the string is inlined at the call site." />;
                return (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {c.sourceRefs.join('  ')}
                  </span>
                );
              },
            },
          ]}
        />

        <h3 className="h-section" style={{ margin: 'var(--s6) 0 var(--s2)' }}>
          B · The five literal share percentages
        </h3>
        <p className="lede" style={{ margin: '0 0 var(--s3)' }}>
          Transcribed from a Python tuple at{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
            backend/scripts/build_digital_export_excel.py:256-262
          </code>
          . They appear in the published workbook and in the current dashboard. They are not present
          in any dataset this console reads, because they were never data.
        </p>

        <DataTable
          rows={MARKET_LITERALS}
          rowKey={(r) => r.market}
          pageSize={null}
          filename="panel-10-market-share-literals"
          caption="ASSUMED — NOT MEASURED. Every value is a string literal in source."
          columns={[
            {
              key: 'rank',
              header: 'Rank',
              value: (r) => r.rank,
              numeric: true,
              width: '4rem',
              render: (r) => <span className="fig">{r.rank}</span>,
            },
            { key: 'market', header: 'Market', value: (r) => r.market, width: '12rem' },
            { key: 'role', header: 'Role, as written in source', value: (r) => r.role },
            {
              key: 'share',
              header: 'Share of non-domestic listens',
              value: (r) => r.share,
              numeric: true,
              width: '14rem',
              render: (r) => (
                <Figure
                  value={r.share}
                  status="assumed"
                  unit="pct"
                  keyline
                  label={`${r.market} share`}
                  provenance={{
                    chain: [
                      {
                        op: 'string literal in a Python tuple',
                        constantId: 'export-markets',
                        sourceRef: 'backend/scripts/build_digital_export_excel.py:256-262',
                      },
                    ],
                    note:
                      'Written as “~30%”, “~20%” and so on. The tilde is in the source. No confidence interval, no method, no observation stands behind it.',
                    gapId: 'GAP-008',
                  }}
                />
              ),
            },
            {
              key: 'basis',
              header: 'Measured?',
              value: () => null,
              width: '9rem',
              render: () => <NotCollected reason="No listener geography was ever retrieved." gapId="GAP-008" short />,
            },
          ]}
        />

        <div
          className="rule-t"
          style={{
            marginTop: 'var(--s3)',
            paddingTop: 'var(--s3)',
            display: 'grid',
            gridTemplateColumns: 'minmax(12rem, 18rem) 1fr',
            gap: 'var(--s3) var(--s4)',
            alignItems: 'baseline',
            maxWidth: '62rem',
          }}
        >
          <span className="h-section">Stated shares, summed</span>
          <span>
            <Figure value={LITERAL_SUM} status="derived" unit="pct" label="Sum of the five literals" />
            <span style={{ color: 'var(--ink-3)' }}>
              {' '}
              — arithmetic over the five literals, computed here for display.
            </span>
          </span>

          <span className="h-section">Residual category</span>
          <span>
            <NotCollected reason="No sixth row, no “other markets” entry, and no residual exists in the source tuple." gapId="GAP-008" />
            <span style={{ color: 'var(--ink-3)' }}>
              {' '}
              — the five shares do not close. There is no category for the remainder and no statement
              anywhere that the list is partial, so a reader summing the published table finds a
              shortfall with no explanation attached to it.
            </span>
          </span>

          <span className="h-section">Ordering</span>
          <span style={{ color: 'var(--ink-2)' }}>
            Two incompatible orders shipped. The row-level string reads{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
              “US, UK, France, Ghana, South Africa”
            </code>{' '}
            on all <span className="fig">{stringEvidence.total.toLocaleString('en-US')}</span> rows,
            placing France third; the
            workbook tuple ranks France fifth, behind Ghana and South Africa. Neither ordering derives
            from data, so neither can be preferred on evidence. The constants register records a
            third variant that adds Germany.
          </span>
        </div>
      </Section>

      <Section
        title="False provenance"
        subtitle="Eight delivered documents attribute this content to Where-People-Listen listener geography. That data was never collected. Each quote below was read directly at the line cited."
      >
        <Callout status="rejected" title="The constant justifies itself" gapId="GAP-039">
          The extraction skipped the listener-geography call <em>because</em> the 30% domestic share
          was already held; the documentation then cites listener geography as the source of the 30%.
          The reasoning is a closed loop with no observation anywhere inside it.
        </Callout>

        <pre
          aria-label="The extraction's skip comment, quoted from source"
          style={{
            margin: 'var(--s3) 0',
            padding: 'var(--s3) var(--s4)',
            background: 'var(--paper-sunk)',
            border: '1px solid var(--rule-hair)',
            borderLeft: '3px solid var(--rej)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-small)',
            lineHeight: 1.6,
            overflowX: 'auto',
            color: 'var(--ink)',
          }}
        >
          {SKIP_COMMENT}
        </pre>
        <p style={{ margin: '0 0 var(--s5)', color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
          <code style={{ fontFamily: 'var(--font-mono)' }}>
            backend/scripts/nbs_extract_full.py:128-129
          </code>
        </p>

        <DataTable
          rows={FALSE_PROVENANCE_DOCS}
          rowKey={(r) => `${r.doc}:${r.line}`}
          pageSize={null}
          filename="panel-10-false-provenance"
          caption="Documents crediting Where-People-Listen data for content it never produced."
          columns={[
            {
              key: 'doc',
              header: 'Document',
              value: (r) => r.doc,
              width: '26rem',
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                  {r.doc}
                </span>
              ),
            },
            {
              key: 'line',
              header: 'Line',
              value: (r) => r.line,
              numeric: true,
              width: '4rem',
              render: (r) => <span className="fig">{r.line}</span>,
            },
            {
              key: 'quote',
              header: 'Quoted',
              value: (r) => r.quote,
              render: (r) => <span style={{ color: 'var(--ink-2)' }}>“{r.quote}”</span>,
            },
            {
              key: 'supported',
              header: 'Supported by an observation',
              value: () => null,
              width: '11rem',
              render: () => <NotCollected gapId="GAP-008" short />,
            },
          ]}
        />

        <div style={{ paddingTop: 'var(--s5)' }}>
          <h3 className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            And two shipped surfaces that present the claim to a reader
          </h3>
          {SHIPPED_SURFACES.map((s) => (
            <figure key={s.where} style={{ margin: '0 0 var(--s4)', maxWidth: '80ch' }}>
              <blockquote
                data-epi="rejected"
                style={{
                  margin: 0,
                  borderLeft: '3px solid var(--epi)',
                  padding: 'var(--s2) var(--s4)',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '0.9375rem',
                  lineHeight: 1.5,
                }}
              >
                “{s.quote}”
              </blockquote>
              <figcaption style={{ paddingTop: 'var(--s2)' }}>
                <code
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}
                >
                  {s.where}
                </code>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-2)' }}>{s.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        title="Evidence of the attempt"
        subtitle="Listener geography is not in the state “never considered”. It is in the state “defined, instrumented, and 100% empty”, which the quality artifact records quarter by quarter. That distinction matters: the remedy for one is a decision, for the other a re-run."
      >
        {wplDefinition ? (
          <>
            <dl style={{ margin: 0, maxWidth: '62rem', paddingBottom: 'var(--s4)' }}>
              <DefRow k="Metric" v={wplDefinition.name ?? WPL} mono />
              <DefRow k="Defined at" v={wplDefinition.source_ref} mono />
              <DefRow k="Endpoint" v={wplDefinition.endpoint_template ?? null} mono />
              <DefRow k="Unit" v={wplDefinition.unit ?? null} mono />
              <DefRow k="Aggregation rule" v={wplDefinition.aggregation_rule ?? null} mono />
              <DefRow k="Definition" v={wplDefinition.definition ?? null} />
              <DefRow
                k="Source field candidates"
                v={wplDefinition.source_field_candidates?.join(', ') ?? null}
                mono
              />
              <DefRow k="Geographic scope" v={wplDefinition.geo_scope_default ?? null} />
              <DefRow k="Coverage limitations" v={wplDefinition.coverage_limitations ?? null} />
              <DefRow k="Geographic limitations" v={wplDefinition.geo_limitations ?? null} />
              <DefRow k="Fallback" v={wplDefinition.fallback_logic ?? null} />
              <DefRow
                k="Observations produced"
                v={
                  <>
                    <Figure value={0} status="unavailable" unit="count" label="Observations produced" />
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      across all {coverage.periods_observed.length} observed quarters
                    </span>
                  </>
                }
              />
            </dl>

            <Callout status="rejected" title="The credited endpoint is scoped to Nigerian cities only" gapId="GAP-008">
              Read the two limitation lines above against the eight documents in the previous
              section. As defined, this metric emits{' '}
              <em>only Nigerian cities observed in the provider response</em> and acts as a
              Nigeria-specific proxy. Had it been called exactly as written, it would have supported
              a measured domestic share — and would still not have produced the United States, the
              United Kingdom, Ghana, South Africa or France. The five foreign markets were never
              obtainable from the endpoint they are credited to.
            </Callout>
          </>
        ) : (
          <Callout status="unavailable" title="The metric definition is not in the projection">
            variables.json carries no definition named{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>{WPL}</code>.
          </Callout>
        )}

        <div style={{ paddingTop: 'var(--s4)' }}>
          <DataTable
            rows={wplLimitations}
            rowKey={(r) => `${r.period ?? 'none'}-${r.limitation_code ?? 'none'}`}
            pageSize={null}
            filename="panel-10-where-people-listen-limitations"
            caption={
              <>
                <span className="fig">{wplLimitationTotal.toLocaleString('en-US')}</span> limitation
                rows recorded for {WPL}, across{' '}
                <span className="fig">{wplLimitations.length}</span> quarters. This is what the
                attempt left behind.
              </>
            }
            initialSort={{ key: 'period', dir: 'asc' }}
            columns={[
              {
                key: 'period',
                header: 'Quarter',
                value: (r) => r.period,
                width: '8rem',
                render: (r) => (r.period ? formatPeriod(r.period) : <NotCollected short />),
              },
              {
                key: 'code',
                header: 'Limitation code',
                value: (r) => r.limitation_code,
                width: '14rem',
                render: (r) =>
                  r.limitation_code ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                      {r.limitation_code}
                    </span>
                  ) : (
                    <NotCollected short />
                  ),
              },
              {
                key: 'count',
                header: 'Rows',
                value: (r) => r.count,
                numeric: true,
                width: '6rem',
                render: (r) => <Figure value={r.count} field="obs_count" unit="count" />,
              },
              {
                key: 'desc',
                header: 'Description, as recorded',
                value: (r) => r.descriptions.join(' | '),
              },
              {
                key: 'fallback',
                header: 'Fallback applied',
                value: (r) => r.fallback_applied.join(', '),
                width: '9rem',
              },
            ]}
          />
          <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)', maxWidth: '80ch', paddingTop: 'var(--s2)' }}>
            The stage register records an equal number of coverage-gap rows for this metric. Those
            cannot be shown here: the quality projection aggregates gaps by reason and by period only
            — all <span className="fig">{quality.gap_total.toLocaleString('en-US')}</span> of them
            carry the single reason{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>
              missing_observation_in_expected_window
            </code>{' '}
            and the single severity{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>medium</code> — so no per-variable
            attribution survives the projection. The limitation rows above are the attributable half
            of the record.
          </p>
        </div>

        <div style={{ paddingTop: 'var(--s5)' }}>
          <h3 className="h-section" style={{ marginBottom: 'var(--s2)' }}>
            Chart and city-chart routes, all confirmed 401
          </h3>
          <DataTable
            rows={deniedMarketEndpoints}
            rowKey={(r) => r.metric}
            pageSize={null}
            filename="panel-10-denied-market-endpoints"
            caption={
              <>
                <span className="fig">{deniedMarketEndpoints.length}</span> of the{' '}
                <span className="fig">{variables.denied_endpoints.length}</span> denied endpoints are
                chart or city-chart routes. These are the routes a cross-market footprint would have
                been built from.
              </>
            }
            columns={[
              {
                key: 'metric',
                header: 'Metric',
                value: (r) => r.metric,
                width: '15rem',
                render: (r) => (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {r.metric}
                  </span>
                ),
              },
              {
                key: 'endpoint',
                header: 'Endpoint',
                value: (r) => r.endpoint,
                render: (r) =>
                  r.endpoint ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                      {r.endpoint}
                    </span>
                  ) : (
                    <NotCollected short />
                  ),
              },
              {
                key: 'status',
                header: 'Status',
                value: (r) => r.status,
                width: '9rem',
                render: () => <EpistemicChip status="rejected" title="Confirmed HTTP 401 at the current plan tier." />,
              },
              {
                key: 'ref',
                header: 'Recorded at',
                value: (r) => r.source_ref,
                optional: true,
                render: (r) => (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {r.source_ref}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Section>

      <Section
        title="What this panel would contain"
        subtitle="Six blocks, and the specific input each is waiting on. Listed rather than omitted, so the shape of the missing panel is legible."
      >
        <DataTable
          rows={WOULD_CONTAIN}
          rowKey={(r) => r.block}
          pageSize={null}
          filename="panel-10-intended-blocks"
          caption="Specification of the panel, against the state of the artifacts."
          columns={[
            { key: 'block', header: 'Block', value: (r) => r.block, width: '19rem' },
            {
              key: 'requires',
              header: 'Input required',
              value: (r) => r.requires,
              width: '20rem',
              render: (r) => <span style={{ color: 'var(--ink-2)' }}>{r.requires}</span>,
            },
            { key: 'note', header: 'Note', value: (r) => r.note },
            {
              key: 'state',
              header: 'State',
              value: () => null,
              width: '9rem',
              render: (r) => <NotCollected gapId={r.gapId} />,
            },
          ]}
        />
      </Section>

      <Section title="Gap register" subtitle="The register entries this panel rests on, verbatim.">
        {gapIds.map((id) => {
          const g = GAPS_BY_ID[id];
          if (!g) return null;
          return (
            <div key={id} style={{ paddingBottom: 'var(--s3)' }}>
              <Callout
                status={g.status === 'INCONSISTENT' ? 'rejected' : 'unavailable'}
                title={g.requirement}
                gapId={g.id}
              >
                <dl style={{ margin: 0 }}>
                  <DefRow k="Status" v={`${g.status} · ${g.severity}`} />
                  <DefRow k="Evidence" v={g.evidence} />
                  <DefRow k="Remedy" v={g.remedy} />
                </dl>
              </Callout>
            </div>
          );
        })}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------- components */

function Tally({
  label,
  value,
  epi,
  of,
}: {
  label: string;
  value: number;
  epi: string;
  of: string;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.125rem', color: 'var(--ink)' }}>
        {value.toLocaleString('en-US')}
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}> · {of}</span>
      </div>
    </div>
  );
}

function DefRow({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div
      className="rule-bh"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(10rem, 14rem) 1fr',
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
          maxWidth: '80ch',
        }}
      >
        {v === null || v === undefined || v === '' ? <NotCollected short /> : v}
      </dd>
    </div>
  );
}
