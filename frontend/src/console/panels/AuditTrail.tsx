/**
 * PANEL 15 — Audit Trail
 *
 * What it renders: the audit schema that exists — nine action types across three
 * categories, a free-text actor and a JSON detail blob — set against the columns
 * a statistical production audit trail is required to carry. And then the one
 * piece of integrity evidence that actually survived: the SHA-256 digest of
 * every artifact this console reads.
 *
 * What it cannot render: the audit trail. Zero rows survive, because no database
 * file exists on disk. This is not an empty table awaiting its first entry; it
 * is a table whose contents were written and are now unrecoverable, along with
 * every raw payload and every checkpoint the pipeline ever recorded.
 *
 * It also cannot claim tamper-evidence. The schema has no hash chain, no
 * signature and no immutability constraint, and the actor field is an
 * unauthenticated string that the caller supplies about itself. A trail with
 * those properties records intent; it does not prove it.
 */

import { useMemo } from 'react';
import { useManifest, formatTimestamp } from '../data/client';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import {
  Callout,
  EpistemicChip,
  Figure,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
} from '../components/primitives';
import type { ArtifactRecord, Manifest } from '../data/types';

/* ------------------------------------------------- the schema, transcribed */

type Presence = 'present' | 'present-unverified' | 'absent';

interface SchemaField {
  /** the concept an audit trail is required to carry */
  requirement: string;
  /** the column that carries it, where one does */
  column: string | null;
  type: string | null;
  presence: Presence;
  requiredByBrief: boolean;
  note: string;
  gapId?: string;
}

const SCHEMA: SchemaField[] = [
  {
    requirement: 'Timestamp',
    column: 'created_at',
    type: 'datetime (UTC, default at insert)',
    presence: 'present',
    requiredByBrief: true,
    note:
      'Set by the application at insert time from its own clock. Not sourced from a trusted time authority and not independently attested.',
  },
  {
    requirement: 'Actor',
    column: 'actor',
    type: 'str, indexed, default "system"',
    presence: 'present-unverified',
    requiredByBrief: true,
    note:
      'A free-text string the caller supplies about itself. There is no authentication behind it, no user table it references and no constraint on its contents. It records a claim of identity, not an identity.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Service',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'No service, component or module column exists. The nearest available signal is the category, which has three values and names a domain rather than a service.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Stage',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'No stage column, because no stage identity exists anywhere in the pipeline to put in one.',
    gapId: 'GAP-013',
  },
  {
    requirement: 'Duration',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'A single created_at is written; there is no started_at, no finished_at and no elapsed field, so duration is not recorded and not derivable from a row.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Status / outcome',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'No success, failure or error column. An audit row is written on the path that succeeded; a failed action leaves no row saying so, which means absence of a row cannot be read as absence of an attempt.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Payload reference',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'No foreign key from an audit row to a raw payload. The raw payload store itself does not survive, so even an added key would resolve to nothing for this delivery.',
    gapId: 'GAP-011',
  },
  {
    requirement: 'Row identity',
    column: 'id',
    type: 'str, primary key',
    presence: 'present',
    requiredByBrief: false,
    note: 'A generated identifier. Unique, but not sequential and not ordered, so gaps in the trail are undetectable.',
  },
  {
    requirement: 'Category',
    column: 'category',
    type: 'str, indexed',
    presence: 'present',
    requiredByBrief: false,
    note: 'Three values in use: jobs, exports, entity_universe.',
  },
  {
    requirement: 'Action',
    column: 'action',
    type: 'str, indexed',
    presence: 'present',
    requiredByBrief: false,
    note: 'Nine values in use across the three categories.',
  },
  {
    requirement: 'Entity reference',
    column: 'entity_type, entity_id',
    type: 'str | null, indexed',
    presence: 'present',
    requiredByBrief: false,
    note: 'Optional on both columns. Nothing enforces that an entity-scoped action populates them.',
  },
  {
    requirement: 'Job reference',
    column: 'job_id, job_run_id',
    type: 'str | null, foreign key',
    presence: 'present',
    requiredByBrief: false,
    note: 'The only structural link from the audit trail into the run record.',
  },
  {
    requirement: 'Details',
    column: 'details',
    type: 'JSON blob, default {}',
    presence: 'present',
    requiredByBrief: false,
    note:
      'Free-form and unschematised. What any given action writes into it is not constrained, documented or validated, so it cannot be queried across action types.',
  },
  {
    requirement: 'Hash of previous row (chain)',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'No chain. Rows are independent, so a deleted row leaves no evidence of its deletion and an edited row leaves no evidence of its edit.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Signature',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note: 'No signing key, no signature column, no verification path.',
    gapId: 'GAP-026',
  },
  {
    requirement: 'Immutability constraint',
    column: null,
    type: null,
    presence: 'absent',
    requiredByBrief: true,
    note:
      'An ordinary mutable table. Nothing at the database or application layer prevents update or delete.',
    gapId: 'GAP-026',
  },
];

const PRESENCE_EPI: Record<Presence, 'observed' | 'estimated' | 'unavailable'> = {
  present: 'observed',
  'present-unverified': 'estimated',
  absent: 'unavailable',
};

const PRESENCE_LABEL: Record<Presence, string> = {
  present: 'In schema',
  'present-unverified': 'In schema, unverified',
  absent: 'Not collected',
};

/* ------------------------------------------------------ action vocabulary */

interface AuditAction {
  category: string;
  action: string;
  actor: string;
  sourceRef: string;
}

const ACTIONS: AuditAction[] = [
  { category: 'jobs', action: 'create_job', actor: '"system" (literal)', sourceRef: 'backend/nmas/services/jobs.py:43-45' },
  { category: 'jobs', action: 'run_job', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/jobs.py:241-243' },
  { category: 'jobs', action: 'retry_failed_units', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/jobs.py:288-290' },
  { category: 'jobs', action: 'pause_job', actor: '"admin" (literal)', sourceRef: 'backend/nmas/application.py:348-350' },
  { category: 'exports', action: 'generate_export_bundle', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/exports.py:375-377' },
  { category: 'entity_universe', action: 'import_artists_csv', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/entities.py:94-96' },
  { category: 'entity_universe', action: 'import_tracks_csv', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/entities.py:175-177' },
  { category: 'entity_universe', action: 'update_artist', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/entities.py:197-199' },
  { category: 'entity_universe', action: 'update_track', actor: 'caller-supplied', sourceRef: 'backend/nmas/services/entities.py:221-223' },
];

/* ------------------------------------------------------------------ panel */

export default function AuditTrail() {
  const manifest = useManifest();
  return (
    <Resolved query={manifest} artifact="manifest.json" label="Reading the artifact manifest">
      {(data) => <Body manifest={data} />}
    </Resolved>
  );
}

function Body({ manifest }: { manifest: Manifest }) {
  const artifacts = manifest.artifacts;

  /**
   * Totals are taken over distinct file paths, not over registry entries: one
   * file is registered twice under two roles, and counting its rows twice would
   * inflate the coverage claim this section makes.
   */
  const integrity = useMemo(() => {
    const byPath = new Map<string, ArtifactRecord>();
    for (const a of artifacts) if (!byPath.has(a.path)) byPath.set(a.path, a);
    const files = [...byPath.values()];
    return {
      entries: artifacts.length,
      files: files.length,
      hashed: files.filter((a) => a.sha256 !== null).length,
      totalBytes: files.reduce((sum, a) => sum + (a.bytes ?? 0), 0),
      totalRows: files.reduce((sum, a) => sum + (a.rows ?? 0), 0),
    };
  }, [artifacts]);

  const missingRequired = SCHEMA.filter((f) => f.requiredByBrief && f.presence === 'absent').length;
  const requiredTotal = SCHEMA.filter((f) => f.requiredByBrief).length;

  return (
    <>
      {/* --------------------------------------------------------- the void */}
      <Section
        title="The trail"
        subtitle="An audit schema exists and is exercised by nine code paths. Not one row it ever wrote can be read today."
      >
        <Callout status="rejected" title="Zero audit rows survive" gapId="GAP-011">
          No database file exists on disk and the delivery database directory is empty. Every audit
          row, every raw payload and every checkpoint the pipeline wrote is gone. This is not a table
          that is empty because nothing has happened yet — the actions below were performed, the rows
          were written, and the store that held them is not present.
          <br />
          <br />
          Nothing in this console can therefore answer <em>who ran what, when</em>. The one recorded
          run is known only through a markdown summary and an aggregate failure tally that were
          written to files, not to the database.
        </Callout>

        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap', paddingTop: 'var(--s3)' }}>
          <Stat label="Action types in schema" value={ACTIONS.length} epi="observed" note="exercised by nine call sites" />
          <Stat
            label="Categories"
            value={new Set(ACTIONS.map((a) => a.category)).size}
            epi="observed"
            note="jobs · exports · entity_universe"
          />
          <Stat
            label="Required columns absent"
            value={missingRequired}
            epi="unavailable"
            note={`of ${requiredTotal} the brief requires`}
          />
          <div data-epi="rejected" style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
            <div className="h-section">Surviving rows</div>
            <div style={{ paddingTop: '0.2rem' }}>
              <NotCollected reason="No database file exists on disk." gapId="GAP-011" />
            </div>
            <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
              not zero rows — no store
            </div>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------- tamper evidence */}
      <Section
        title="Tamper evidence"
        subtitle="Whether a trail can be trusted is a separate question from whether it exists. This one would fail the test even if its rows had survived."
      >
        <Callout status="unavailable" title="The trail is not tamper-evident" gapId="GAP-026">
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
            <li>
              <strong>No hash chain.</strong> Rows do not reference the digest of their predecessor,
              so a deleted row leaves no gap and an edited row leaves no discrepancy.
            </li>
            <li>
              <strong>No signature.</strong> There is no signing key and no verification path, so no
              row can be attributed to a holder of a secret.
            </li>
            <li>
              <strong>No immutability.</strong> The table is an ordinary mutable table with no
              append-only constraint, trigger or write-once storage behind it.
            </li>
            <li>
              <strong>The actor is self-asserted.</strong> Seven of the nine call sites pass the
              actor straight through from the caller; the other two hardcode the literals{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>&quot;system&quot;</code> and{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>&quot;admin&quot;</code>. Nothing
              authenticates any of them.
            </li>
            <li>
              <strong>Failures write nothing.</strong> Audit rows are appended on the success path,
              so the trail records what worked and is silent about what was attempted and refused.
            </li>
          </ul>
          Taken together: this is an activity log. It is not evidence, and it should not be described
          to an external reviewer as an audit trail in the statistical-governance sense.
        </Callout>
      </Section>

      {/* --------------------------------------------------------- schema */}
      <Section
        title="Schema against requirement"
        subtitle="Every column the audit model carries, set against every field a production audit trail is required to carry. Rows the brief requires and the schema does not have are marked at the point of display, not in a footnote."
        actions={<EpistemicChip status="unavailable" title="Absent columns" />}
      >
        <DataTable<SchemaField>
          rows={SCHEMA}
          rowKey={(f) => f.requirement}
          filename="nmas-audit-schema"
          dense
          pageSize={null}
          caption="Transcribed from backend/nmas/models.py:321-333 (AuditLog)."
          columns={[
            { key: 'requirement', header: 'Field', value: (f) => f.requirement, width: '16rem' },
            {
              key: 'presence',
              header: 'State',
              value: (f) => PRESENCE_LABEL[f.presence],
              groupable: true,
              render: (f) =>
                f.presence === 'absent' ? (
                  <NotCollected gapId={f.gapId} short />
                ) : (
                  <EpistemicChip status={PRESENCE_EPI[f.presence]} title={PRESENCE_LABEL[f.presence]} />
                ),
            },
            {
              key: 'required',
              header: 'Required by brief',
              value: (f) => (f.requiredByBrief ? 'yes' : 'no'),
              groupable: true,
              render: (f) => (
                <span style={{ color: f.requiredByBrief ? 'var(--ink)' : 'var(--ink-4)' }}>
                  {f.requiredByBrief ? 'Required' : 'Extra'}
                </span>
              ),
            },
            {
              key: 'column',
              header: 'Column',
              value: (f) => f.column,
              render: (f) =>
                f.column ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
                    {f.column}
                  </span>
                ) : (
                  <NotCollected gapId={f.gapId} short />
                ),
            },
            {
              key: 'type',
              header: 'Type',
              value: (f) => f.type,
              render: (f) =>
                f.type ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {f.type}
                  </span>
                ) : (
                  <NotCollected short />
                ),
            },
            { key: 'note', header: 'Note', value: (f) => f.note },
            {
              key: 'gap',
              header: 'Gap',
              value: (f) => f.gapId ?? null,
              optional: true,
              render: (f) =>
                f.gapId ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                    {f.gapId}
                  </span>
                ) : (
                  <span style={{ color: 'var(--ink-4)' }}>—</span>
                ),
            },
          ]}
        />
      </Section>

      {/* ---------------------------------------------------- action vocabulary */}
      <Section
        title="Action vocabulary"
        subtitle="The nine actions the schema can record, and where each is written. None of these rows can be read back, so this is a description of what would have been recorded."
      >
        <DataTable<AuditAction>
          rows={ACTIONS}
          rowKey={(a) => a.action}
          filename="nmas-audit-actions"
          dense
          pageSize={null}
          initialSort={{ key: 'category', dir: 'asc' }}
          caption="Nine actions across three categories, verified by direct read of each call site."
          columns={[
            { key: 'category', header: 'Category', value: (a) => a.category, groupable: true, width: '12rem' },
            {
              key: 'action',
              header: 'Action',
              value: (a) => a.action,
              width: '16rem',
              render: (a) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>{a.action}</span>
              ),
            },
            {
              key: 'actor',
              header: 'Actor written',
              value: (a) => a.actor,
              note: 'Unauthenticated in every case.',
            },
            {
              key: 'rows',
              header: 'Rows recoverable',
              value: () => null,
              note: 'No database file exists on disk.',
              render: () => <NotCollected gapId="GAP-011" short />,
            },
            {
              key: 'ref',
              header: 'Call site',
              value: (a) => a.sourceRef,
              render: (a) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                  {a.sourceRef}
                </span>
              ),
            },
          ]}
        />
      </Section>

      {/* ------------------------------------------------ surviving evidence */}
      <Section
        title="What integrity evidence does survive"
        subtitle="One thing, and it is worth stating plainly rather than burying: every artifact this console reads carries a SHA-256 digest of its bytes. That is the only integrity evidence in the entire system."
        actions={<EpistemicChip status="observed" title="Digests computed over files on disk" />}
      >
        <Callout status="observed" title="The artifact manifest is the audit trail this delivery actually has">
          <Figure
            value={integrity.hashed}
            status="observed"
            unit="count"
            label="Artifacts carrying a SHA-256 digest"
          />{' '}
          of <span className="fig">{integrity.files}</span> distinct files carry a SHA-256 digest —
          from <span className="fig">{integrity.entries}</span> registry entries, because one file is
          registered twice under two roles and is counted once here. Together they cover{' '}
          <Figure
            value={integrity.totalRows}
            status="observed"
            unit="count"
            label="Rows under hash"
            compact
          />{' '}
          rows and{' '}
          <Figure
            value={integrity.totalBytes / 1_048_576}
            status="derived"
            unit="count"
            precision={1}
            label="Megabytes under hash"
          />{' '}
          MB of content. Anyone holding these files can recompute the digests and establish that the
          bytes are unchanged.
        </Callout>

        <Callout status="unavailable" title="What the digests do not establish" gapId="GAP-026">
          They are content hashes computed by the projection generator over the files as they stood
          at{' '}
          <span className="fig">{formatTimestamp(manifest.generated_utc)}</span> UTC — not at the
          time the pipeline produced them. They are not signed, not chained to one another and not
          anchored to any external timestamp, and the export-artifact rows that recorded hashes at
          production time are inside the database that does not survive.
          <br />
          <br />
          So a digest proves that a file has not changed since the projection was generated. It does
          not prove who produced it, when it was produced, that the process which produced it behaved
          correctly, or that no earlier version of the same file was replaced before the hash was
          taken.
        </Callout>

        <DataTable<ArtifactRecord>
          rows={artifacts}
          rowKey={(a) => `${a.role}|${a.path}`}
          filename="nmas-artifact-integrity"
          dense
          pageSize={null}
          initialSort={{ key: 'role', dir: 'asc' }}
          caption="Artifact integrity register. Use Export CSV to hand this to a reviewer alongside the files."
          expand={(a) => (
            <dl style={{ margin: 0, maxWidth: '62rem' }}>
              <KeyValue k="Role" v={a.role} />
              <KeyValue k="Path" v={a.path} mono />
              <KeyValue k="SHA-256" v={a.sha256 ?? <NotCollected reason="File not present." />} mono />
              <KeyValue
                k="Columns"
                v={
                  a.columns && a.columns.length > 0 ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>
                      {a.columns.join(', ')}
                    </span>
                  ) : (
                    <NotCollected reason="Not a tabular artifact, or no header was read." short />
                  )
                }
              />
              <KeyValue
                k="Signature"
                v={<NotCollected reason="No signing key or signature exists anywhere in the system." gapId="GAP-026" />}
              />
              <KeyValue
                k="Chained to previous artifact"
                v={<NotCollected reason="The manifest is a list, not a chain." gapId="GAP-026" />}
              />
            </dl>
          )}
          columns={ARTIFACT_COLUMNS}
        />
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- fragments */

const ARTIFACT_COLUMNS: Column<ArtifactRecord>[] = [
  { key: 'role', header: 'Role', value: (a) => a.role, width: '15rem' },
  {
    key: 'path',
    header: 'Path',
    value: (a) => a.path,
    render: (a) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{a.path}</span>
    ),
  },
  {
    key: 'present',
    header: 'Present',
    value: (a) => (a.present ? 'yes' : 'no'),
    groupable: true,
    render: (a) => <EpistemicChip status={a.present ? 'observed' : 'unavailable'} bare />,
  },
  {
    key: 'rows',
    header: 'Rows',
    value: (a) => a.rows,
    numeric: true,
    note: 'Null where the artifact is not tabular — markdown and JSON documents carry no row count.',
    render: (a) =>
      a.rows === null ? (
        <NotCollected reason="Not a tabular artifact — no row count applies." short />
      ) : (
        <Figure value={a.rows} status="observed" unit="count" label={`${a.role} rows`} />
      ),
  },
  {
    key: 'bytes',
    header: 'Bytes',
    value: (a) => a.bytes ?? null,
    numeric: true,
    render: (a) =>
      a.bytes === undefined ? (
        <NotCollected short />
      ) : (
        <Figure value={a.bytes} status="observed" unit="count" label={`${a.role} bytes`} />
      ),
  },
  {
    key: 'sha256',
    header: 'SHA-256',
    value: (a) => a.sha256,
    note: 'Full digest is exported in CSV; the table shows the leading 16 hex characters.',
    render: (a) =>
      a.sha256 ? (
        <span
          className="fig"
          data-epi="observed"
          title={a.sha256}
          style={{ fontSize: 'var(--t-micro)' }}
        >
          {a.sha256.slice(0, 16)}…
        </span>
      ) : (
        <NotCollected reason="File not present, so nothing was hashed." short />
      ),
  },
  {
    key: 'modified',
    header: 'Modified (UTC)',
    value: (a) => a.modified_utc,
    render: (a) =>
      a.modified_utc ? (
        <span className="fig" style={{ fontSize: 'var(--t-micro)' }}>
          {formatTimestamp(a.modified_utc)}
        </span>
      ) : (
        <NotCollected short />
      ),
  },
  {
    key: 'signature',
    header: 'Signature',
    value: () => null,
    note: 'No signing key, signature column or verification path exists.',
    render: () => <NotCollected gapId="GAP-026" short />,
  },
  {
    key: 'producedBy',
    header: 'Produced by (actor)',
    value: () => null,
    note: 'The audit rows that would attribute production do not survive.',
    render: () => <NotCollected gapId="GAP-011" short />,
  },
];

function Stat({
  label,
  value,
  epi,
  note,
}: {
  label: string;
  value: number;
  epi: 'observed' | 'unavailable' | 'rejected';
  note: string;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s3)' }}>
      <div className="h-section">{label}</div>
      <div className="fig" style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>{note}</div>
    </div>
  );
}
