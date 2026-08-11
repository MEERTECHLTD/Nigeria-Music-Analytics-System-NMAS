/**
 * REGISTER — Constants Register (no panel number)
 *
 * Renders: every hardcoded coefficient in registry/constants.ts that shapes a
 * published NMAS figure — its value, what it is used for, the justification the
 * code actually carries, the file and line it was read from, and the three ways
 * a constant can be defective: divergent across the codebase, attributed to
 * data that was never collected, or unjustified altogether.
 *
 * Cannot render: an effective date, a confidence interval, or a sensitivity
 * analysis. No constant in this repository carries a date of adoption, and no
 * artifact records what any published figure would have been under a different
 * coefficient — so nothing here can be re-run at another value. Two constants
 * are also transcribed as prose ranges rather than numbers, and are shown as
 * the strings they are rather than parsed into figures they never were.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { Callout, NotCollected, Section } from '../components/primitives';
import {
  CONSTANTS,
  CONSTANTS_BY_ID,
  DIVERGENT_CONSTANTS,
  FALSE_PROVENANCE_CONSTANTS,
  UNSOURCED_CONSTANTS,
  type ConstantEntry,
  type Justification,
} from '../registry/constants';

/* ------------------------------------------------------------ vocabularies */

const JUSTIFICATION_ORDER: Justification[] = [
  'absent',
  'self-declared-unsourced',
  'title-only',
  'cited',
];

const JUSTIFICATION_LABEL: Record<Justification, string> = {
  cited: 'Cited',
  'title-only': 'Title only',
  'self-declared-unsourced': 'Self-declared',
  absent: 'None',
};

const JUSTIFICATION_DEF: Record<Justification, string> = {
  cited: 'A source with a locatable reference — a title and a URL a reader can follow.',
  'title-only': 'A source is named but not linkable. No URL, no retrieval date, no page.',
  'self-declared-unsourced':
    'The code states a rationale in its own voice — "industry proxy", "~2 streams/fan/month" — and cites nobody.',
  absent: 'No justification of any kind accompanies the value.',
};

/**
 * Colour is only ever epistemic here. A cited constant is the closest a
 * coefficient gets to observed; an uncited one is an assumption; one with no
 * justification at all is, epistemically, not collected.
 */
const JUSTIFICATION_EPI: Record<Justification, string> = {
  cited: 'observed',
  'title-only': 'estimated',
  'self-declared-unsourced': 'assumed',
  absent: 'unavailable',
};

/** Weakest justification first: the register is read for its failures. */
const JUSTIFICATION_RANK: Record<Justification, number> = {
  absent: 0,
  'self-declared-unsourced': 1,
  'title-only': 2,
  cited: 3,
};

const ROWS: ConstantEntry[] = [...CONSTANTS].sort(
  (a, b) =>
    JUSTIFICATION_RANK[a.justification] - JUSTIFICATION_RANK[b.justification] ||
    a.concept.localeCompare(b.concept),
);

const LONG: CSSProperties = {
  display: 'block',
  whiteSpace: 'normal',
  maxWidth: '26rem',
  fontSize: 'var(--t-small)',
  lineHeight: 1.45,
  padding: '0.2rem 0',
};

function Chip({ label, epi, title }: { label: string; epi: string; title?: string }) {
  return (
    <span className="epi-chip" data-epi={epi} title={title}>
      {label}
    </span>
  );
}

/** Not applicable is not the same as not collected, and neither is a blank cell. */
function NoneRecorded({ what }: { what: string }) {
  return (
    <span
      style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}
      title={`The register records no ${what} for this constant. That is a finding, not a missing field.`}
    >
      none recorded
    </span>
  );
}

function SourceRefs({ refs }: { refs: string[] }) {
  return (
    <span style={{ display: 'block' }}>
      {refs.map((r) => (
        <code
          key={r}
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-2)',
            wordBreak: 'break-all',
            lineHeight: 1.5,
          }}
        >
          {r}
        </code>
      ))}
    </span>
  );
}

/** The three problem classes the header tallies name, per constant. */
function defectClass(c: ConstantEntry): string {
  const flags: string[] = [];
  if (c.divergence) flags.push('divergent');
  if (c.falseProvenance) flags.push('false provenance');
  if (c.justification === 'absent' || c.justification === 'self-declared-unsourced')
    flags.push('unsourced');
  return flags.length ? flags.join(' + ') : 'none of the three';
}

/* ------------------------------------------------------------ the columns */

const CONSTANT_COLUMNS: Column<ConstantEntry>[] = [
  {
    key: 'concept',
    header: 'Concept',
    width: '15rem',
    value: (c) => c.concept,
    render: (c) => (
      <span style={{ display: 'block', whiteSpace: 'normal', maxWidth: '15rem' }}>
        {c.concept}
        <code
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-4)',
          }}
        >
          {c.id}
        </code>
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value',
    width: '13rem',
    note: 'Transcribed verbatim. Every value in this column is an assumed constant — the keyline under each carries that status. Where a concept holds more than one value, all of them are shown in the cell.',
    value: (c) => c.value,
    render: (c) => (
      <span
        className="fig epi-rule"
        data-epi="assumed"
        style={{ display: 'block', whiteSpace: 'normal', fontSize: 'var(--t-small)' }}
        title="Assumed — a constant imposed from outside the data, never measured."
      >
        {c.value}
      </span>
    ),
  },
  {
    key: 'unit',
    header: 'Unit',
    width: '8rem',
    value: (c) => c.unit ?? null,
    render: (c) =>
      c.unit ? (
        <span style={{ fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>{c.unit}</span>
      ) : (
        <NotCollected reason="No unit is recorded against this coefficient in the source." short />
      ),
  },
  {
    key: 'usedFor',
    header: 'Used for',
    width: '20rem',
    value: (c) => c.usedFor,
    render: (c) => <span style={{ ...LONG, maxWidth: '20rem' }}>{c.usedFor}</span>,
  },
  {
    key: 'justification',
    header: 'Justification',
    width: '8rem',
    groupable: true,
    note: 'Group by this column to read the register as it should be read: no justification first.',
    value: (c) => JUSTIFICATION_LABEL[c.justification],
    render: (c) => (
      <Chip
        label={JUSTIFICATION_LABEL[c.justification]}
        epi={JUSTIFICATION_EPI[c.justification]}
        title={JUSTIFICATION_DEF[c.justification]}
      />
    ),
  },
  {
    key: 'justificationText',
    header: 'Justification text',
    value: (c) => c.justificationText,
    render: (c) =>
      c.justificationText ? (
        <span style={LONG}>{c.justificationText}</span>
      ) : (
        <NotCollected
          reason="The value appears in the code with no comment, no citation and no rationale of any kind."
          short
        />
      ),
  },
  {
    key: 'sourceRefs',
    header: 'Source refs',
    width: '19rem',
    note: 'File and line, verified by direct read. These are the addresses at which the value is written.',
    value: (c) => c.sourceRefs.join(' · '),
    render: (c) => <SourceRefs refs={c.sourceRefs} />,
  },
  {
    key: 'defect',
    header: 'Defect class',
    width: '11rem',
    optional: true,
    groupable: true,
    note: 'Which of the three problem classes this constant falls into. Hidden by default; enable it to group the register by defect.',
    value: (c) => defectClass(c),
    render: (c) => (
      <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-2)' }}>{defectClass(c)}</span>
    ),
  },
  {
    key: 'divergence',
    header: 'Divergence',
    note: 'Set when one concept carries different values in different places, or when code and the published rate card disagree.',
    value: (c) => c.divergence ?? null,
    render: (c) =>
      c.divergence ? (
        <span style={{ ...LONG, color: 'var(--rej)' }} data-epi="rejected">
          {c.divergence}
        </span>
      ) : (
        <NoneRecorded what="divergence" />
      ),
  },
  {
    key: 'falseProvenance',
    header: 'False provenance',
    note: 'Set when the constant is attributed to data that was never collected.',
    value: (c) => c.falseProvenance ?? null,
    render: (c) =>
      c.falseProvenance ? (
        <span style={{ ...LONG, color: 'var(--asm)' }} data-epi="assumed">
          {c.falseProvenance}
        </span>
      ) : (
        <NoneRecorded what="false provenance" />
      ),
  },
  {
    key: 'dead',
    header: 'Dead',
    width: '6rem',
    groupable: true,
    note: 'Computed or documented, and applied to no published figure.',
    value: (c) => (c.dead ? 'dead' : 'in use'),
    render: (c) =>
      c.dead ? (
        <Chip
          label="dead"
          epi="unavailable"
          title="Present in the codebase or the rate card and applied to no published figure."
        />
      ) : (
        <span style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}>in use</span>
      ),
  },
];

/* ------------------------------------------------------------------ panel */

export default function ConstantsRegister() {
  const byJustification = useMemo(() => {
    const m = new Map<Justification, ConstantEntry[]>();
    for (const j of JUSTIFICATION_ORDER) m.set(j, []);
    for (const c of CONSTANTS) m.get(c.justification)?.push(c);
    return m;
  }, []);

  const dead = useMemo(() => CONSTANTS.filter((c) => c.dead), []);

  const otherPlatforms = CONSTANTS_BY_ID['other-platforms'];
  const domesticShare = CONSTANTS_BY_ID['domestic-share'];
  const exportShare = CONSTANTS_BY_ID['export-share'];

  return (
    <>
      <Section
        title="Every number this study publishes passes through one of these"
        subtitle={
          <>
            There is no observed stream count anywhere in the delivery, so every revenue figure is
            an observed audience size multiplied by coefficients from this list. The register is
            therefore not an appendix — it is the larger half of the estimator. Each entry is
            transcribed from source with the file and line at which it is written and the
            justification the code actually carries, which in most cases is none.
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap' }}>
          <Tally label="Constants" value={CONSTANTS.length} of={null} epi="assumed" />
          {JUSTIFICATION_ORDER.map((j) => (
            <Tally
              key={j}
              label={`Justification: ${JUSTIFICATION_LABEL[j].toLowerCase()}`}
              value={(byJustification.get(j) ?? []).length}
              of={CONSTANTS.length}
              epi={JUSTIFICATION_EPI[j]}
              note={JUSTIFICATION_DEF[j]}
            />
          ))}
          <Tally
            label="Dead"
            value={dead.length}
            of={CONSTANTS.length}
            epi="unavailable"
            note="Documented or computed, applied to no published figure."
          />
        </div>

        <Callout
          status="rejected"
          title={`${DIVERGENT_CONSTANTS.length} constants have divergent values across the codebase`}
        >
          The same concept is written more than once with different numbers, or the code and the
          published rate card disagree. A reader cannot tell from a published figure which value
          produced it. Two are rate-card divergences: the published card states YouTube at $0.0071
          and Deezer at $0.0046, and no code path applies either — every figure in the delivery used
          $0.004.
          <IdList entries={DIVERGENT_CONSTANTS} />
        </Callout>

        <Callout
          status="assumed"
          title={`${FALSE_PROVENANCE_CONSTANTS.length} constants are attributed to data that was never collected`}
          gapId="GAP-039"
        >
          These are the most dangerous entries in the register, because they do not read as
          assumptions. Prose elsewhere in the delivery presents them as derived from listener
          geography — a measurement the extraction explicitly declined to make. The attribution is
          not a rounding of the truth; the endpoint returned nothing because it was never called.
          <IdList entries={FALSE_PROVENANCE_CONSTANTS} />
        </Callout>

        <Callout
          status="unavailable"
          title={`${UNSOURCED_CONSTANTS.length} of ${CONSTANTS.length} constants have no external source at all`}
        >
          Counting both the ones with no justification and the ones that cite only themselves. Just{' '}
          {(byJustification.get('cited') ?? []).length} carry a locatable citation, and not one of
          them touches a revenue figure — they are the two employment baselines and the production
          cost per track. Every coefficient in the streaming-revenue chain is unsourced, uncited, or
          cited by title only.
          <IdList entries={UNSOURCED_CONSTANTS} />
        </Callout>
      </Section>

      {otherPlatforms ? (
        <Section
          title="One concept, three values, four call sites"
          subtitle="The “other platforms” multiplier is the clearest case in the register of a coefficient that was never settled, and it is applied to platforms that were never queried."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s6)' }}>
            <div style={{ flex: '1 1 22rem', minWidth: '20rem' }}>
              <Ladder
                items={[
                  {
                    value: 1.4,
                    label: '1.40',
                    state: 'stale',
                    note: '× (Spotify + YouTube) — a different base as well as a different rate.',
                  },
                  {
                    value: 0.4,
                    label: '0.40',
                    state: 'stale',
                    note: '× Spotify, in a second CSV built by the same script.',
                  },
                  {
                    value: 0.3,
                    label: '0.30',
                    state: 'shipped',
                    note: '× Spotify. This is the value in every row of the delivered dataset.',
                  },
                ]}
              />
            </div>
            <div style={{ flex: '1 1 26rem', minWidth: '22rem' }}>
              <dl style={{ margin: 0 }}>
                <DetailRow k="Concept" v={otherPlatforms.concept} />
                <DetailRow k="Register value" v={<span className="fig">{otherPlatforms.value}</span>} />
                <DetailRow k="Used for" v={otherPlatforms.usedFor} />
                <DetailRow
                  k="Justification"
                  v={
                    <Chip
                      label={JUSTIFICATION_LABEL[otherPlatforms.justification]}
                      epi={JUSTIFICATION_EPI[otherPlatforms.justification]}
                      title={JUSTIFICATION_DEF[otherPlatforms.justification]}
                    />
                  }
                />
                <DetailRow k="Recorded at" v={<SourceRefs refs={otherPlatforms.sourceRefs} />} />
                <DetailRow
                  k="Divergence"
                  v={otherPlatforms.divergence ?? <NoneRecorded what="divergence" />}
                />
              </dl>
            </div>
          </div>

          <Callout status="assumed" title="Only one of the three source refs is attributable to a value">
            The derivation chain in the epistemic register binds{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
              backend/scripts/nbs_extract_full.py:195
            </code>{' '}
            to <span className="fig">0.30</span>, which is the multiplier the shipped rows carry. The
            other two refs, both in{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
              nbs_deliverables.py
            </code>
            , carry <span className="fig">0.40</span> and <span className="fig">1.40</span> — the
            register does not record which line holds which, so this panel does not pair them.{' '}
            <NotCollected
              reason="No artifact attributes a specific multiplier to a specific line of nbs_deliverables.py."
              short
            />
          </Callout>

          <Callout status="unavailable" title="What this multiplier stands in for" gapId="GAP-006">
            Apple Music, Audiomack, Boomplay and Tidal sit inside this figure. None of them was
            called. There is no endpoint, no observation and no gap row for any of them — the revenue
            attributed to them is a fraction of the Spotify estimate, which is itself a conversion of
            monthly listeners. Two coefficients deep, with no observation at the bottom.
          </Callout>
        </Section>
      ) : null}

      {domesticShare ? (
        <Section
          title="A constant that cites itself"
          subtitle="The 30% Nigeria domestic consumption share is attributed, across eight documents, to listener-geography data that the extraction skipped calling precisely because it already held the 30% figure."
        >
          <Callout
            status="assumed"
            title="ASSUMED CONSTANT — NOT MEASURED"
            gapId="GAP-039 · GAP-008"
          >
            <p style={{ margin: '0 0 var(--s3)' }}>{domesticShare.falseProvenance}</p>
            <pre
              style={{
                margin: 0,
                padding: 'var(--s3)',
                background: 'var(--paper-raised)',
                border: '1px solid var(--rule)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--t-small)',
                whiteSpace: 'pre-wrap',
                color: 'var(--ink)',
              }}
            >
              {'# Where People Listen — skip for now (already have domestic share = 30%)'}
            </pre>
            <p style={{ margin: 'var(--s2) 0 0', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
              backend/scripts/nbs_extract_full.py:128-130
            </p>
          </Callout>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s6)', paddingTop: 'var(--s3)' }}>
            <div style={{ flex: '1 1 24rem' }}>
              <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
                The circle, in order
              </div>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', maxWidth: '46ch', lineHeight: 1.6 }}>
                <li>The domestic share is set to 30% as a constant.</li>
                <li>
                  The listener-geography call that could test it is skipped, on the stated grounds
                  that the 30% figure is already held.
                </li>
                <li>
                  Every artist-quarter row is emitted with{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    nigeria_domestic_share_pct = 30
                  </code>
                  .
                </li>
                <li>
                  Downstream prose reports the 30% as a finding derived from listener geography.
                </li>
              </ol>
            </div>
            <div style={{ flex: '1 1 24rem' }}>
              <dl style={{ margin: 0 }}>
                <DetailRow k="Value" v={<span className="fig">{domesticShare.value}%</span>} />
                <DetailRow k="Used for" v={domesticShare.usedFor} />
                <DetailRow
                  k="Justification"
                  v={
                    <Chip
                      label={JUSTIFICATION_LABEL[domesticShare.justification]}
                      epi={JUSTIFICATION_EPI[domesticShare.justification]}
                      title={JUSTIFICATION_DEF[domesticShare.justification]}
                    />
                  }
                />
                <DetailRow k="Recorded at" v={<SourceRefs refs={domesticShare.sourceRefs} />} />
                {exportShare ? (
                  <DetailRow
                    k="Its complement"
                    v={
                      <>
                        <span className="fig">{exportShare.value}%</span> export share.{' '}
                        {exportShare.justificationText}
                      </>
                    }
                  />
                ) : null}
              </dl>
            </div>
          </div>

          <Callout status="rejected" title="The export share is tautological, not measured" gapId="GAP-003">
            Because gross export revenue is defined as streaming revenue × 0.70, any export share
            recomputed from the published columns returns 70.0 by construction. It measures the
            constant, not the exports.
          </Callout>
        </Section>
      ) : null}

      <Section
        title="The register"
        subtitle="Weakest justification first. Group by justification, divergence or dead status from the toolbar; filter across every visible column; export as CSV. Every source ref was verified by direct read."
      >
        <DataTable
          rows={ROWS}
          columns={CONSTANT_COLUMNS}
          rowKey={(c) => c.id}
          filename="nmas-constants-register"
          pageSize={null}
          caption="Clearing a column sort restores the default order: no justification, then self-declared, then title-only, then cited."
          expand={(c) => <ConstantDetail entry={c} />}
        />
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- pieces */

function IdList({ entries }: { entries: ConstantEntry[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: 'var(--s3)' }}>
      {entries.map((c) => (
        <code
          key={c.id}
          title={`${c.concept} = ${c.value}`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-micro)',
            border: '1px solid var(--rule)',
            padding: '0 0.3rem',
            color: 'var(--ink-2)',
            background: 'var(--paper)',
          }}
        >
          {c.id}
        </code>
      ))}
    </div>
  );
}

function Ladder({
  items,
}: {
  items: Array<{ value: number; label: string; state: 'shipped' | 'stale'; note: string }>;
}) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div>
      <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
        Multipliers written for this one concept
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((i) => {
          const shipped = i.state === 'shipped';
          return (
            <li
              key={i.label}
              className="rule-bh"
              data-epi={shipped ? 'assumed' : 'unavailable'}
              style={{ padding: 'var(--s2) 0' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)' }}>
                <span
                  className="fig"
                  data-epi={shipped ? 'assumed' : 'unavailable'}
                  style={{
                    fontSize: '1.125rem',
                    width: '3.5rem',
                    color: shipped ? 'var(--ink)' : 'var(--ink-3)',
                  }}
                >
                  {i.label}
                </span>
                <span
                  className="epi-chip"
                  data-epi={shipped ? 'assumed' : 'unavailable'}
                  title={
                    shipped
                      ? 'Verified against the delivered dataset: this is the ratio every row carries.'
                      : 'Written in the codebase and applied to no delivered row.'
                  }
                >
                  {shipped ? 'shipped' : 'stale'}
                </span>
              </div>
              <div
                style={{
                  height: '0.5rem',
                  marginTop: '0.25rem',
                  background: 'var(--una-bg)',
                  border: '1px solid var(--rule-hair)',
                }}
              >
                <div
                  style={{
                    width: `${(i.value / max) * 100}%`,
                    height: '100%',
                    background: shipped ? 'var(--asm)' : 'var(--una)',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 'var(--t-micro)',
                  color: 'var(--ink-3)',
                  marginTop: '0.25rem',
                  maxWidth: '46ch',
                }}
              >
                {i.note}
              </div>
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)', margin: 'var(--s2) 0 0' }}>
        Bar length is the multiplier itself, drawn to scale against the largest of the three. The
        three are not comparable as rates: 1.40 multiplies a different base.
      </p>
    </div>
  );
}

function ConstantDetail({ entry }: { entry: ConstantEntry }) {
  return (
    <div style={{ maxWidth: '68rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
        <span className="h-title" style={{ fontSize: 'var(--t-section)' }}>
          {entry.concept}
        </span>
        <span className="fig" data-epi="assumed" style={{ fontSize: 'var(--t-title)' }}>
          {entry.value}
        </span>
        {entry.unit ? (
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{entry.unit}</span>
        ) : null}
        <Chip
          label={JUSTIFICATION_LABEL[entry.justification]}
          epi={JUSTIFICATION_EPI[entry.justification]}
          title={JUSTIFICATION_DEF[entry.justification]}
        />
        {entry.dead ? <Chip label="dead" epi="unavailable" /> : null}
      </div>

      <dl style={{ margin: 0 }}>
        <DetailRow k="Register id" v={<code style={{ fontFamily: 'var(--font-mono)' }}>{entry.id}</code>} />
        <DetailRow k="Used for" v={entry.usedFor} />
        <DetailRow
          k="Justification"
          v={
            entry.justificationText ?? (
              <NotCollected
                reason="The value appears in the code with no comment, no citation and no rationale of any kind."
              />
            )
          }
        />
        <DetailRow k="Source refs" v={<SourceRefs refs={entry.sourceRefs} />} />
        <DetailRow
          k="Divergence"
          v={entry.divergence ?? <NoneRecorded what="divergence" />}
        />
        <DetailRow
          k="False provenance"
          v={entry.falseProvenance ?? <NoneRecorded what="false provenance" />}
        />
        <DetailRow
          k="Applied"
          v={
            entry.dead
              ? 'Dead — present in the codebase or the published rate card and applied to no delivered figure.'
              : 'In use — this coefficient shapes at least one delivered figure.'
          }
        />
      </dl>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      className="rule-bh"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(8rem, 10rem) 1fr',
        gap: 'var(--s3)',
        padding: '0.4rem 0',
      }}
    >
      <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{k}</dt>
      <dd style={{ margin: 0, maxWidth: '62ch', lineHeight: 1.5 }}>{v}</dd>
    </div>
  );
}

function Tally({
  label,
  value,
  of,
  epi,
  note,
}: {
  label: string;
  value: number;
  of: number | null;
  epi: string;
  note?: string;
}) {
  const pct = of && of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <div
      data-epi={epi}
      title={note}
      style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}
    >
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.375rem', color: 'var(--ink)' }}>
        {value}
        {of !== null ? (
          <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>
            {' '}
            / {of} · {pct}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
