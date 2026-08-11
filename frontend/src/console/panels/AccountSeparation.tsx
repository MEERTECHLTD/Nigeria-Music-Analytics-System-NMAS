/**
 * PANEL 5 — Account Separation
 *
 * The GDP production account and the GNI account, separated by the residency of
 * the producing unit. This panel renders NONE of that, because none of it was
 * built. What it renders instead is the shape of the missing capability, drawn
 * precisely enough that someone could implement it.
 *
 * It CAN show:
 *   · the exact record shape a residency classification would require
 *   · direct evidence, recomputed from the artifacts on every load, that the
 *     one field that looks like a residency field has zero variance
 *   · the three points in the codebase where the question was deferred to NBS
 *   · the review queue, which — with no classification anywhere — is the whole
 *     131-artist universe
 *
 * It CANNOT show: any resident/non-resident split, any GDP-vs-GNI routing, any
 * compensation-of-employees or property-income flow crossing the border, or any
 * artist-level account assignment. Not one of those fields exists on any model,
 * in any artifact, in any export. See GAP-004 and GAP-005.
 *
 * Nothing on this panel is a proxy for the missing data. There is no proxy.
 */

import { useMemo, type ReactNode } from 'react';
import { useArtists, usePopulationFrame } from '../data/client';
import {
  Callout,
  EpistemicChip,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import { gapsForPanel } from '../registry/gaps';
import { STAGES } from '../registry/stages';
import type { ArtistRow, PopulationFrame } from '../data/types';

/* ------------------------------------------------------------------ setup */

/** The stages this panel would be the read-out of. Both are ABSENT. */
const STAGE_IDS = [5, 22];

/**
 * The blocks the panel specification calls for, each against the single field
 * whose absence blocks it. Listed rather than omitted: an absent block reads as
 * an oversight, a NOT COLLECTED block reads as a finding.
 */
const INTENDED_BLOCKS: Array<{
  block: string;
  shows: string;
  requires: string;
  gapId: string;
}> = [
  {
    block: 'Production account (GDP)',
    shows:
      'Output, intermediate consumption and value added of music production undertaken by units resident in Nigeria, regardless of the nationality of the producer.',
    requires: 'residency_classification on every producing unit',
    gapId: 'GAP-005',
  },
  {
    block: 'National income account (GNI)',
    shows:
      'GDP plus net primary income receivable from abroad — royalty and performance income accruing to Nigerian-resident units from non-resident payers, less the reverse flow.',
    requires: 'account_routing plus a cross-border income flow record',
    gapId: 'GAP-005',
  },
  {
    block: 'Reconciliation GDP → GNI',
    shows:
      'The bridge between the two accounts, line by line, so the difference is attributable rather than asserted.',
    requires: 'both accounts populated for the same period',
    gapId: 'GAP-005',
  },
  {
    block: 'Residency split of the roster',
    shows:
      'How many of the 131 artists are resident units, how many are not, and on what recorded basis each was placed.',
    requires: 'residency_classification and residency_basis per artist',
    gapId: 'GAP-004',
  },
  {
    block: 'Basis-of-classification audit',
    shows:
      'For every classified unit: the evidence used, its retrieval date, the classifier, and the rule version in force.',
    requires: 'a basis-evidence record; no such table exists',
    gapId: 'GAP-004',
  },
  {
    block: 'Review queue',
    shows:
      'Units whose classification is unresolved or contested, routed for methodologist adjudication.',
    requires: 'a classification to be unresolved against',
    gapId: 'GAP-004',
  },
];

/**
 * The record a single classified artist would have to carry. This is a
 * specification of required fields, not a claim that any of them hold values.
 */
const REQUIRED_FIELDS: Array<{
  field: string;
  type: string;
  allowed: string;
  why: string;
}> = [
  {
    field: 'residency_classification',
    type: 'enum, not null',
    allowed: 'resident · non_resident · unresolved',
    why: 'Decides which of the two accounts the unit’s output enters. Without it neither account can be closed.',
  },
  {
    field: 'residency_basis',
    type: 'enum, not null when classified',
    allowed:
      'tax_residence · declared_domicile · centre_of_predominant_economic_interest · label_registration · adjudicated',
    why: 'A classification without a recorded basis cannot be reviewed, challenged or reproduced. The basis is the classification.',
  },
  {
    field: 'basis_evidence',
    type: 'object, not null when classified',
    allowed: '{ document_type, reference, retrieved_at }',
    why: 'The specific document the basis rests on, and when it was obtained. Residency changes; an undated basis rots silently.',
  },
  {
    field: 'account_routing',
    type: 'enum, derived, not null',
    allowed: 'gdp_production_account · gni_account · both · excluded',
    why: 'The routing decision itself, stored rather than recomputed, so a published account can be reproduced after the rule changes.',
  },
  {
    field: 'routing_rule_version',
    type: 'string, not null',
    allowed: 'semantic version of the classification rule in force',
    why: 'Two quarters classified under different rules are not comparable. Without a version this is undetectable.',
  },
  {
    field: 'classified_by / classified_at',
    type: 'string / timestamp, not null',
    allowed: 'NBS methodologist identity and UTC timestamp',
    why: 'Statistical classifications are attributable acts. An unattributed one cannot be defended.',
  },
  {
    field: 'review_state',
    type: 'enum, not null',
    allowed: 'unclassified · proposed · accepted · contested',
    why: 'Drives the review queue. Every unit starts unclassified, which is where all 131 sit today.',
  },
];

/** The three places the question was put down rather than answered. */
const DEFERRAL_POINTS: Array<{
  where: string;
  quote: string;
  reading: string;
}> = [
  {
    where: 'backend/scripts/build_expanded_population_frame.py:1404',
    quote:
      'Diaspora artists with Nigerian heritage (e.g. Sade Adu, Obongjayar, Afrikan Boy) are included where Wikipedia categorises them under Nigerian music. NBS should decide whether to keep or drop them for domestic-economy estimates.',
    reading:
      'Written into the caveats block of a delivered spreadsheet. The residency question is identified, named as consequential for domestic-economy estimates, and handed to NBS. It was deferred deliberately — which is a different claim from overlooked — and nothing downstream ever picks it back up.',
  },
  {
    where: 'backend/scripts/generate_console_api.py:507-508',
    quote:
      '`country` is a hardcoded default, identical on every row. It is NOT a residency classification and must never be displayed as one.',
    reading:
      'The projection that feeds this console refuses to promote the country field into a residency field, and emits residency_classification, residency_basis and account_routing as explicit nulls instead of inventing them.',
  },
  {
    where: 'frontend/src/console/registry/stages.ts — stage 5',
    quote:
      'The country field is a constant on every row and no classification logic exists. The question is explicitly deferred to NBS in a spreadsheet note.',
    reading:
      'The pipeline stage register records Residency Classification as ABSENT with no telemetry, and Account Aggregation (stage 22) likewise.',
  },
];

/**
 * ILLUSTRATION OF REQUIRED SHAPE — NOT DATA.
 * Every value is an angle-bracketed placeholder so that no line of this block
 * can be read, copied or screenshotted as an assertion about any real artist.
 */
const SHAPE_ILLUSTRATION = `{
  "artist_id":              "<internal id>",
  "artist_name":            "<name as held in the master list>",
  "chartmetric_artist_id":  "<provider id>",

  "residency_classification": "<resident | non_resident | unresolved>",
  "residency_basis":          "<tax_residence | declared_domicile |
                                centre_of_predominant_economic_interest |
                                label_registration | adjudicated>",
  "basis_evidence": {
    "document_type": "<what was inspected>",
    "reference":     "<locator for that document>",
    "retrieved_at":  "<UTC timestamp>"
  },

  "account_routing":      "<gdp_production_account | gni_account | both | excluded>",
  "routing_rule_version": "<version of the rule in force>",

  "classified_by": "<NBS methodologist identity>",
  "classified_at": "<UTC timestamp>",
  "review_state":  "<unclassified | proposed | accepted | contested>"
}`;

/* ------------------------------------------------------------------ panel */

export default function AccountSeparation() {
  const artists = useArtists();
  const frame = usePopulationFrame();

  return (
    <Resolved query={artists} artifact="artists.json" label="Reading the artist master list">
      {(artistRows) => (
        <Resolved
          query={frame}
          artifact="population-frame.json"
          label="Reading the population frame"
        >
          {(frameData) => <Panel artists={artistRows} frame={frameData} />}
        </Resolved>
      )}
    </Resolved>
  );
}

function Panel({ artists, frame }: { artists: ArtistRow[]; frame: PopulationFrame }) {
  /* Every count below is recomputed from the artifacts on load. Nothing here is
     transcribed from a document — the claim "zero variance" is only worth making
     if it is re-measured each time the panel renders. */
  const evidence = useMemo(() => {
    const tally = (values: Array<string | null>) => {
      const m = new Map<string, number>();
      for (const v of values) {
        const k = v ?? '(null)';
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    const artistCountry = tally(artists.map((a) => a.country_field_value));
    const frameCountry = tally(frame.rows.map((r) => r.country));

    const nullFields = (
      [
        'residency_classification',
        'residency_basis',
        'account_routing',
        'confidence_score',
        'resolution_match_score',
      ] as const
    ).map((f) => ({
      field: f,
      populated: artists.filter((a) => a[f] !== null && a[f] !== undefined).length,
      total: artists.length,
    }));

    return { artistCountry, frameCountry, nullFields };
  }, [artists, frame.rows]);

  const stages = STAGES.filter((s) => STAGE_IDS.includes(s.n));
  const gaps = gapsForPanel(5);

  const queueColumns: Column<ArtistRow>[] = [
    {
      key: 'artist_name',
      header: 'Artist',
      value: (r) => r.artist_name,
      width: '16rem',
    },
    {
      key: 'cmid',
      header: 'Chartmetric ID',
      value: (r) => (r.chartmetric_artist_id === null ? null : String(r.chartmetric_artist_id)),
      numeric: true,
      render: (r) =>
        r.chartmetric_artist_id === null ? (
          <NotCollected short />
        ) : (
          <span className="fig">{String(r.chartmetric_artist_id)}</span>
        ),
      note: 'The only cross-source identifier any artist row carries.',
    },
    {
      key: 'country_field',
      header: 'country field',
      value: (r) => r.country_field_value,
      render: (r) => (
        <span data-epi="assumed" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'baseline' }}>
          <span className="fig">{r.country_field_value ?? ''}</span>
          <span className="epi-chip epi-chip--bare" data-epi="assumed">
            constant
          </span>
        </span>
      ),
      note: 'A hardcoded default, not a classification. Identical on every row.',
      groupable: true,
    },
    {
      key: 'residency',
      header: 'Residency classification',
      value: () => null,
      render: () => <NotCollected reason="No classification field exists." gapId="GAP-004" short />,
    },
    {
      key: 'basis',
      header: 'Basis',
      value: () => null,
      render: () => <NotCollected reason="No basis is recorded anywhere." gapId="GAP-004" short />,
    },
    {
      key: 'routing',
      header: 'Account routing',
      value: () => null,
      render: () => (
        <NotCollected reason="No GDP or GNI field exists on any model." gapId="GAP-005" short />
      ),
    },
    {
      key: 'review_state',
      header: 'Review state',
      value: () => 'unclassified',
      render: () => (
        <span
          className="epi-chip"
          data-epi="unavailable"
          title="No classification has ever been proposed for this unit, so it has never left the initial state."
        >
          unclassified
        </span>
      ),
      groupable: true,
      note: 'Derived from the absence, not read from a field: with no classification anywhere, every unit is in the initial state.',
    },
    {
      key: 'revenue_periods',
      header: 'Revenue quarters',
      value: (r) => r.revenue_period_count || null,
      numeric: true,
      optional: true,
      note: 'Quarters in which this artist produced a revenue row. Present for context only — it is not a residency signal.',
    },
  ];

  return (
    <>
      <Section
        title="An unbuilt capability"
        subtitle={
          <>
            This panel is the read-out of two pipeline stages that do not exist. Residency
            Classification and Account Aggregation are both recorded ABSENT in the stage register,
            with no telemetry of any kind. There is no partial version of this panel to show, and no
            field in any artifact that could stand in for the missing one.
          </>
        }
      >
        <Callout status="unavailable" title="No account separation exists" gapId="GAP-005">
          No GDP or GNI field exists on any model, in any artifact, in any export. No routing logic
          exists. The concept appears in prose only. Nothing on this page is a partial result,
          an approximation or a proxy — the capability was not built, and the honest rendering of a
          capability that was not built is an empty one that says what would be required.
        </Callout>

        <div style={{ paddingTop: 'var(--s3)' }}>
          {stages.map((s) => (
            <div
              key={s.n}
              className="rule-bh"
              data-epi="unavailable"
              style={{
                display: 'grid',
                gridTemplateColumns: '2rem minmax(12rem, 16rem) 1fr',
                gap: 'var(--s3)',
                padding: 'var(--s2) 0',
                alignItems: 'baseline',
              }}
            >
              <span className="fig" style={{ color: 'var(--ink-4)' }}>
                {String(s.n).padStart(2, '0')}
              </span>
              <span>
                <span style={{ display: 'block' }}>{s.name}</span>
                {s.subtitle ? (
                  <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                    {s.subtitle}
                  </span>
                ) : null}
                <span style={{ display: 'inline-block', marginTop: '0.2rem' }}>
                  <EpistemicChip status="unavailable" title={`Stage status: ${s.status}`} />
                </span>
              </span>
              <span style={{ color: 'var(--ink-2)', maxWidth: '70ch' }}>
                {s.evidence}
                <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)', marginTop: '0.2rem' }}>
                  Telemetry: {s.telemetry}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="What this panel would contain"
        subtitle="Six blocks, each blocked by one field. The dependency is not diffuse — every block below fails on the same missing classification."
      >
        <DataTable
          rows={INTENDED_BLOCKS}
          rowKey={(r) => r.block}
          filename="panel-05-intended-blocks"
          pageSize={null}
          caption="Specification of the panel, against the state of the artifacts."
          columns={[
            { key: 'block', header: 'Block', value: (r) => r.block, width: '15rem' },
            { key: 'shows', header: 'What it would show', value: (r) => r.shows },
            {
              key: 'requires',
              header: 'Field required',
              value: (r) => r.requires,
              width: '18rem',
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.requires}
                </span>
              ),
            },
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

      <Section
        title="The record that would be required"
        subtitle="A residency classification is not a country code. It is a decision, a basis for that decision, the evidence behind the basis, and an attributable author — and it must survive a change of rule."
      >
        <DataTable
          rows={REQUIRED_FIELDS}
          rowKey={(r) => r.field}
          pageSize={null}
          filename="panel-05-required-record"
          caption="Required field specification. No artifact in this repository supplies any of these."
          columns={[
            {
              key: 'field',
              header: 'Field',
              value: (r) => r.field,
              width: '15rem',
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.field}
                </span>
              ),
            },
            { key: 'type', header: 'Type', value: (r) => r.type, width: '13rem' },
            {
              key: 'allowed',
              header: 'Domain',
              value: (r) => r.allowed,
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                  {r.allowed}
                </span>
              ),
            },
            { key: 'why', header: 'Why it is load-bearing', value: (r) => r.why },
            {
              key: 'present',
              header: 'Present',
              value: () => null,
              width: '7rem',
              render: () => <NotCollected short gapId="GAP-004" />,
            },
          ]}
        />

        <div style={{ paddingTop: 'var(--s5)' }}>
          <ShapeIllustration />
        </div>
      </Section>

      <Section
        title="Evidence that the field does not exist"
        subtitle="Recomputed from the artifacts on every load. The field that superficially resembles a residency marker carries one value and no variance, which is the whole of the finding."
      >
        <Callout status="assumed" title="country is a constant passthrough, not a classification" gapId="GAP-004">
          A classification with one category is not a classification. The value below is a hardcoded
          default written at ingestion; nothing in the pipeline ever assigns, checks or revises it,
          and it distinguishes no artist from any other.
        </Callout>

        <DataTable
          rows={[
            {
              key: 'artists',
              artifact: 'artists.json',
              field: 'country_field_value',
              rows: artists.length,
              distinct: evidence.artistCountry.length,
              breakdown: evidence.artistCountry,
            },
            {
              key: 'frame',
              artifact: 'population-frame.json',
              field: 'country',
              rows: frame.rows.length,
              distinct: evidence.frameCountry.length,
              breakdown: evidence.frameCountry,
            },
          ]}
          rowKey={(r) => r.key}
          pageSize={null}
          filename="panel-05-country-variance"
          caption="Distinct values of the country field, counted directly from the served artifacts."
          columns={[
            {
              key: 'artifact',
              header: 'Artifact',
              value: (r) => r.artifact,
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.artifact}
                </span>
              ),
            },
            {
              key: 'field',
              header: 'Field',
              value: (r) => r.field,
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.field}
                </span>
              ),
            },
            { key: 'rows', header: 'Rows', value: (r) => r.rows, numeric: true },
            {
              key: 'distinct',
              header: 'Distinct values',
              value: (r) => r.distinct,
              numeric: true,
              render: (r) => (
                <span className="fig" data-epi="assumed">
                  {r.distinct}
                </span>
              ),
            },
            {
              key: 'breakdown',
              header: 'Value → count',
              value: (r) => r.breakdown.map(([v, n]) => `${v}=${n}`).join('; '),
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                  {r.breakdown.map(([v, n]) => `${v} → ${n.toLocaleString('en-US')}`).join('   ')}
                </span>
              ),
            },
            {
              key: 'variance',
              header: 'Variance',
              value: (r) => (r.distinct <= 1 ? 'zero' : 'present'),
              width: '7rem',
              render: (r) =>
                r.distinct <= 1 ? (
                  <EpistemicChip status="assumed" title="One value on every row. No information." />
                ) : (
                  <span className="fig">{r.distinct}</span>
                ),
            },
          ]}
        />

        <div style={{ paddingTop: 'var(--s5)' }}>
          <DataTable
            rows={evidence.nullFields}
            rowKey={(r) => r.field}
            pageSize={null}
            filename="panel-05-null-fields"
            caption="Fields the console asks for by name and the artifact emits as null on every row."
            columns={[
              {
                key: 'field',
                header: 'Field',
                value: (r) => r.field,
                render: (r) => (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {r.field}
                  </span>
                ),
              },
              {
                key: 'populated',
                header: 'Rows populated',
                value: (r) => r.populated,
                numeric: true,
                render: (r) => (
                  <span className="fig" data-epi="unavailable">
                    {r.populated} / {r.total}
                  </span>
                ),
              },
              {
                key: 'state',
                header: 'State',
                value: () => null,
                width: '11rem',
                render: (r) => (
                  <NotCollected
                    gapId={r.field.startsWith('residency') || r.field === 'account_routing' ? 'GAP-004' : 'GAP-023'}
                  />
                ),
              },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Where the decision was deferred"
        subtitle="The residency question was raised, understood to matter, and handed on. That is a materially different record from one in which it was never considered, and it is worth reading before anyone assumes the classification was simply forgotten."
      >
        {DEFERRAL_POINTS.map((d) => (
          <figure key={d.where} style={{ margin: '0 0 var(--s5)', maxWidth: '80ch' }}>
            <blockquote
              data-epi="unavailable"
              style={{
                margin: 0,
                borderLeft: '3px solid var(--rule-strong)',
                padding: 'var(--s2) var(--s4)',
                fontFamily: 'var(--font-serif)',
                fontSize: '0.9375rem',
                lineHeight: 1.5,
                color: 'var(--ink)',
              }}
            >
              “{d.quote}”
            </blockquote>
            <figcaption style={{ paddingTop: 'var(--s2)' }}>
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                }}
              >
                {d.where}
              </code>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-2)' }}>{d.reading}</p>
            </figcaption>
          </figure>
        ))}
      </Section>

      <Section
        title="Review queue"
        subtitle={
          <>
            A review queue holds the units whose classification is unresolved. With no
            classification anywhere in the system, every unit is unresolved, so the queue is the
            entire universe: all{' '}
            <strong className="fig">{artists.length}</strong> of{' '}
            <strong className="fig">{artists.length}</strong> artists are unclassified, and the
            population frame behind them adds{' '}
            <strong className="fig">{(frame.total - frame.in_sample).toLocaleString('en-US')}</strong>{' '}
            more that were never sampled at all.
          </>
        }
      >
        <Callout status="unavailable" title="The queue is not a backlog — it is the population" gapId="GAP-004">
          There is nothing to triage here, because triage presumes some units have been decided. The
          correct reading of the table below is not “131 items awaiting review” but “the
          classification exercise has not begun”. The country column is shown so it can be ruled out
          by eye: it is the same value on every row.
        </Callout>

        <DataTable
          rows={artists}
          columns={queueColumns}
          rowKey={(r) => r.artist_name}
          filename="panel-05-review-queue"
          dense
          pageSize={40}
          initialSort={{ key: 'artist_name', dir: 'asc' }}
          caption="Every artist in the master list, with the classification fields the account separation would need."
          emptyMessage="The artist master list returned no rows."
        />
      </Section>

      <Section
        title="Gap register"
        subtitle="The two entries that govern this panel, verbatim from the register."
      >
        {gaps.map((g) => (
          <div key={g.id} style={{ paddingBottom: 'var(--s4)' }}>
            <Callout status="unavailable" title={g.requirement} gapId={g.id}>
              <dl style={{ margin: 0 }}>
                <GapRow k="Status" v={`${g.status} · ${g.severity}`} />
                <GapRow k="Evidence" v={g.evidence} />
                <GapRow k="Remedy" v={g.remedy} />
                <GapRow k="Panels" v={g.panels.join(', ')} />
              </dl>
            </Callout>
          </div>
        ))}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------- components */

function ShapeIllustration() {
  return (
    <div data-epi="unavailable">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          border: '1px solid var(--rule-strong)',
          borderBottom: 'none',
          padding: '0.35rem var(--s3)',
          background: 'var(--paper-sunk)',
        }}
      >
        <span className="hatch" style={{ width: '2rem', height: '0.75rem', border: '1px solid var(--rule)' }} />
        <strong
          className="h-section"
          style={{ color: 'var(--ink)', letterSpacing: '0.09em' }}
        >
          Illustration of required shape — not data
        </strong>
      </div>
      <pre
        aria-label="Illustration of the record shape a classified artist would require. Every value is a placeholder."
        style={{
          margin: 0,
          border: '1px solid var(--rule-strong)',
          padding: 'var(--s4)',
          background: 'var(--paper-raised)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--t-small)',
          lineHeight: 1.55,
          overflowX: 'auto',
          color: 'var(--ink-2)',
        }}
      >
        {SHAPE_ILLUSTRATION}
      </pre>
      <p style={{ margin: 'var(--s2) 0 0', color: 'var(--ink-3)', fontSize: 'var(--t-small)', maxWidth: '78ch' }}>
        Every value above is an angle-bracketed placeholder. No artist in the master list holds any
        of these fields, and none of these values was read from an artifact. The block is here so
        that the requirement is specified precisely enough to implement, and written so that no line
        of it can be mistaken for an observation.
      </p>
    </div>
  );
}

function GapRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(5rem, 6rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.15rem 0',
        alignItems: 'baseline',
      }}
    >
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {k}
      </dt>
      <dd style={{ margin: 0 }}>{v}</dd>
    </div>
  );
}
