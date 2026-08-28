/**
 * REGISTER — Artifact Manifest (no panel number)
 *
 * Renders: manifest.json — every source artifact the console's static
 * projection was built from, with its role, path, presence, row count, size,
 * SHA-256 and modification time, plus the full column list of each. This is the
 * provenance of the console itself: it lets a reader check that the interface
 * reads the files it claims to read, and re-derive the whole projection by
 * re-running the generator against these hashes.
 *
 * Cannot render: a hash of the projection files the browser actually fetches.
 * The manifest digests the upstream artifacts, not its own output, so the twelve
 * JSON documents served under /api/v1/console/ are listed here unhashed. Nor is
 * there any lineage between an artifact and the run that produced it — no
 * database survives, so no artifact carries a job identifier.
 */

import { useMemo, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { formatFigure, formatPeriod, formatTimestamp, useManifest } from '../data/client';
import {
  Callout,
  Figure,
  KeyValue,
  NotCollected,
  Resolved,
  Section,
  StatFigure,
} from '../components/primitives';
import type { ArtifactRecord, Manifest } from '../data/types';

/**
 * The documents the browser fetches, declared in
 * frontend/src/console/data/client.ts. Listed so a reader can see both halves
 * of the chain — the artifacts below are the inputs to these files.
 */
const PROJECTION_FILES: Array<{ file: string; hook: string }> = [
  { file: 'manifest.json', hook: 'useManifest' },
  { file: 'coverage.json', hook: 'useCoverage' },
  { file: 'revenue.json', hook: 'useRevenue' },
  { file: 'artists.json', hook: 'useArtists' },
  { file: 'aggregates.json', hook: 'useAggregates' },
  { file: 'variables.json', hook: 'useVariables' },
  { file: 'quality.json', hook: 'useQuality' },
  { file: 'run.json', hook: 'useRun' },
  { file: 'population-frame.json', hook: 'usePopulationFrame' },
  { file: 'accounts.json', hook: 'useAccounts' },
  { file: 'resolution-audit.json', hook: 'useResolutionAudit' },
  { file: 'observation-summary.json', hook: 'useObservationSummary' },
];

/** 1 MiB, for the derived size column. Bytes remain the observed quantity. */
const MIB = 1024 * 1024;

function humanRole(role: string): string {
  return role.replace(/_/g, ' ');
}

function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--t-micro)',
        color: 'var(--ink-2)',
        wordBreak: 'break-all',
      }}
      title={title}
    >
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ panel */

export default function ArtifactManifest() {
  const query = useManifest();
  return (
    <Resolved query={query} artifact="manifest.json" label="Reading the artifact manifest">
      {(data) => <ManifestView data={data} />}
    </Resolved>
  );
}

function ManifestView({ data }: { data: Manifest }) {
  const artifacts = data.artifacts;

  const tally = useMemo(() => {
    const present = artifacts.filter((a) => a.present);
    const missing = artifacts.filter((a) => !a.present);
    const withRows = present.filter((a) => a.rows !== null);
    return {
      total: artifacts.length,
      present: present.length,
      missing: missing.length,
      missingList: missing,
      rows: withRows.reduce((s, a) => s + (a.rows ?? 0), 0),
      rowsFrom: withRows.length,
      rowsUnknown: present.length - withRows.length,
      bytes: present.reduce((s, a) => s + (a.bytes ?? 0), 0),
      columns: present.reduce((s, a) => s + (a.columns?.length ?? 0), 0),
      noColumns: present.filter((a) => !a.columns || a.columns.length === 0),
    };
  }, [artifacts]);

  /** Two roles resolving to one file is a real property of this manifest. */
  const duplicates = useMemo(() => {
    const byHash = new Map<string, ArtifactRecord[]>();
    for (const a of artifacts) {
      if (!a.sha256) continue;
      const list = byHash.get(a.sha256);
      if (list) list.push(a);
      else byHash.set(a.sha256, [a]);
    }
    return [...byHash.values()].filter((l) => l.length > 1);
  }, [artifacts]);

  const columns: Column<ArtifactRecord>[] = useMemo(
    () => [
      {
        key: 'role',
        header: 'Role',
        width: '13rem',
        groupable: true,
        value: (a) => a.role,
        render: (a) => (
          <span style={{ display: 'block', whiteSpace: 'normal', maxWidth: '13rem' }}>
            {humanRole(a.role)}
            <Mono>{a.role}</Mono>
          </span>
        ),
      },
      {
        key: 'path',
        header: 'Path',
        width: '24rem',
        note: 'Repository-relative. This is the address the generator read, not a URL the browser fetches.',
        value: (a) => a.path,
        render: (a) => (
          <span style={{ display: 'block', maxWidth: '24rem' }}>
            <Mono title={a.path}>{a.path}</Mono>
          </span>
        ),
      },
      {
        key: 'present',
        header: 'Present',
        width: '6.5rem',
        groupable: true,
        value: (a) => (a.present ? 'present' : 'missing'),
        render: (a) => (
          <span
            className="epi-chip"
            data-epi={a.present ? 'observed' : 'unavailable'}
            title={
              a.present
                ? 'The generator opened this file and hashed its contents.'
                : 'The generator could not open this file. Everything downstream of it is unavailable, not empty.'
            }
          >
            {a.present ? 'present' : 'missing'}
          </span>
        ),
      },
      {
        key: 'rows',
        header: 'Rows',
        width: '7rem',
        numeric: true,
        note: 'Data rows excluding the header. Absent for artifacts that are not tabular.',
        value: (a) => a.rows,
        render: (a) =>
          a.rows === null ? (
            <NotCollected
              reason="Not a tabular artifact — a row count does not apply to it."
              short
            />
          ) : (
            <Figure value={a.rows} status="observed" unit="count" />
          ),
      },
      {
        key: 'columns',
        header: 'Cols',
        width: '4.5rem',
        numeric: true,
        note: 'Number of columns the generator read. Expand a row for the full list.',
        value: (a) => a.columns?.length ?? null,
        render: (a) =>
          a.columns && a.columns.length > 0 ? (
            <Figure value={a.columns.length} status="observed" unit="count" />
          ) : (
            <NotCollected
              reason="The manifest records no column list for this artifact — it is not a delimited file."
              short
            />
          ),
      },
      {
        key: 'bytes',
        header: 'Bytes',
        width: '9rem',
        numeric: true,
        value: (a) => a.bytes ?? null,
        render: (a) =>
          a.bytes === undefined || a.bytes === null ? (
            <NotCollected reason="No byte count is recorded in the manifest for this artifact." short />
          ) : (
            <Figure value={a.bytes} status="observed" unit="count" />
          ),
      },
      {
        key: 'size',
        header: 'Size',
        width: '6rem',
        numeric: true,
        optional: true,
        note: 'Bytes ÷ 1,048,576. A presentation-side conversion, shown derived.',
        value: (a) => (a.bytes ? Number((a.bytes / MIB).toFixed(2)) : null),
        render: (a) =>
          a.bytes ? (
            <span>
              <Figure value={a.bytes / MIB} status="derived" precision={2} />
              <span style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}> MiB</span>
            </span>
          ) : (
            <NotCollected short />
          ),
      },
      {
        key: 'sha256',
        header: 'SHA-256',
        width: '11rem',
        note: 'Truncated to twelve hex characters. Hover, or expand the row, for the full digest.',
        value: (a) => a.sha256,
        render: (a) =>
          a.sha256 ? (
            <Mono title={a.sha256}>{a.sha256.slice(0, 12)}…</Mono>
          ) : (
            <NotCollected reason="The manifest records no digest for this artifact." short />
          ),
      },
      {
        key: 'modified',
        header: 'Modified (UTC)',
        width: '10rem',
        value: (a) => a.modified_utc,
        render: (a) => {
          const t = formatTimestamp(a.modified_utc);
          return t ? (
            <span className="fig" data-epi="observed" style={{ fontSize: 'var(--t-small)' }}>
              {t}
            </span>
          ) : (
            <NotCollected reason="No modification time is recorded for this artifact." short />
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <Section
        title="The provenance of the console itself"
        subtitle={
          <>
            Every other panel makes a claim about the data. This one makes a claim about the
            interface: that it reads the files listed below and nothing else. Each row carries a
            SHA-256 taken at generation time, so a reader can hash the file in the repository, match
            it here, re-run{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>
              backend/scripts/generate_console_api.py
            </code>{' '}
            and obtain the same projection. Nothing in this console is computed from anything not on
            this list.
          </>
        }
      >
        <dl style={{ margin: '0 0 var(--s4)', maxWidth: '64rem' }}>
          <KeyValue k="Generated" v={formatTimestamp(data.generated_utc) ?? data.generated_utc} mono />
          <KeyValue k="Generator" v={data.generator} mono />
          <KeyValue k="Generator note" v={data.note} />
          <KeyValue k="Archive floor" v={data.archive_floor} mono />
          <KeyValue
            k="Periods observed"
            v={
              <span className="fig" style={{ fontSize: 'var(--t-small)' }}>
                {data.periods_observed.map(formatPeriod).join(' · ')}{' '}
                <span style={{ color: 'var(--ink-3)' }}>({data.periods_observed.length})</span>
              </span>
            }
          />
          <KeyValue
            k="Periods with revenue"
            v={
              <span className="fig" style={{ fontSize: 'var(--t-small)' }}>
                {data.periods_with_revenue.map(formatPeriod).join(' · ')}{' '}
                <span style={{ color: 'var(--ink-3)' }}>({data.periods_with_revenue.length})</span>
              </span>
            }
          />
        </dl>

        <div style={{ display: 'flex', gap: 'var(--s5)', flexWrap: 'wrap' }}>
          <StatFigure
            label="Artifacts present"
            value={tally.present}
            status="observed"
            unit="count"
            footnote={`of ${tally.total} listed`}
          />
          <StatFigure
            label="Artifacts missing"
            value={tally.missing}
            status={tally.missing === 0 ? 'observed' : 'unavailable'}
            unit="count"
            footnote={
              tally.missing === 0
                ? 'Every file the generator expected was on disk when it ran.'
                : 'Everything downstream of these is unavailable, not empty.'
            }
          />
          <StatFigure
            label="Rows across all artifacts"
            value={tally.rows}
            status="derived"
            unit="count"
            footnote={
              tally.rowsUnknown === 0
                ? `Summed across ${tally.rowsFrom} artifacts.`
                : `Summed across ${tally.rowsFrom} artifacts; ${tally.rowsUnknown} ${
                    tally.rowsUnknown === 1
                      ? 'is non-tabular and contributes'
                      : 'are non-tabular and contribute'
                  } no rows.`
            }
          />
          <StatFigure
            label="Bytes on disk"
            value={tally.bytes}
            status="derived"
            unit="count"
            footnote={`${formatFigure(tally.bytes / MIB, { precision: 1 })} MiB across ${tally.present} files.`}
          />
          <StatFigure
            label="Columns declared"
            value={tally.columns}
            status="derived"
            unit="count"
            footnote={`${tally.noColumns.length} artifacts declare none — they are not delimited files.`}
          />
        </div>

        {tally.missing > 0 ? (
          <Callout status="unavailable" title="Artifacts the generator could not open">
            {tally.missingList.map((a) => a.path).join(', ')}. Every figure that would have rested on
            these renders NOT COLLECTED rather than zero.
          </Callout>
        ) : (
          <Callout status="observed" title="All listed artifacts were present at generation time">
            The generator opened, counted and hashed every file on this list. That is a statement
            about the run that produced this projection on{' '}
            {formatTimestamp(data.generated_utc) ?? data.generated_utc} UTC — not a guarantee that
            the files are unchanged now. Re-hash before citing.
          </Callout>
        )}

        {duplicates.map((group) => (
          <Callout
            key={group[0].sha256 ?? group[0].role}
            status="derived"
            title="Two roles, one file"
          >
            {group.map((a) => humanRole(a.role)).join(' and ')} resolve to the same path and the same
            digest —{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>
              {group[0].path}
            </code>
            . They are one artifact read under {group.length} names, so their rows must not be added
            together. The total above counts each listing once, which overstates the distinct row
            count by{' '}
            <span className="fig">
              {((group.length - 1) * (group[0].rows ?? 0)).toLocaleString('en-US')}
            </span>
            .
          </Callout>
        ))}
      </Section>

      <Section
        title="Artifact register"
        subtitle="Expand any row for the full digest and the complete column list the generator read. Sortable on every column, filterable across all of them, exportable as CSV."
      >
        <DataTable
          rows={artifacts}
          columns={columns}
          rowKey={(a) => `${a.role}|${a.path}`}
          filename="nmas-artifact-manifest"
          pageSize={null}
          dense
          caption="Row counts, byte counts, digests and modification times are read from the file system by the generator — the only figures in this console that are observations of the repository rather than of the music industry."
          expand={(a) => <ArtifactDetail artifact={a} />}
        />
      </Section>

      <Section
        title="What the browser actually fetches"
        subtitle="The manifest digests the artifacts that went in. It does not digest the projection that came out, so these twelve documents — the ones this interface loads over HTTP — carry no hash of their own."
      >
        <DataTable
          rows={PROJECTION_FILES}
          rowKey={(r) => r.file}
          filename="nmas-console-projection-files"
          pageSize={null}
          dense
          caption="Declared in frontend/src/console/data/client.ts. Served from /api/v1/console/ as static JSON — the only transport that works in production (GAP-037)."
          columns={[
            {
              key: 'file',
              header: 'Document',
              width: '18rem',
              value: (r) => r.file,
              render: (r) => <Mono>/api/v1/console/{r.file}</Mono>,
            },
            {
              key: 'hook',
              header: 'Read by',
              width: '14rem',
              value: (r) => r.hook,
              render: (r) => <Mono>{r.hook}()</Mono>,
            },
            {
              key: 'sha',
              header: 'SHA-256',
              value: () => null,
              render: () => (
                <NotCollected
                  reason="The manifest hashes the source artifacts, not the projection it emits. No digest of these files exists anywhere."
                />
              ),
            },
          ]}
        />

        <Callout status="unavailable" title="The chain has one unhashed link">
          A reader can verify the artifacts against their digests and can re-run the generator, but
          cannot verify that the JSON this page loaded is the JSON that generator wrote. Emitting a
          digest of each projection file into the manifest would close the loop; nothing else about
          the pipeline would have to change.
        </Callout>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ row detail */

function ArtifactDetail({ artifact }: { artifact: ArtifactRecord }) {
  return (
    <div style={{ maxWidth: '72rem' }}>
      <dl style={{ margin: 0 }}>
        <KeyValue k="Role" v={artifact.role} mono />
        <KeyValue k="Path" v={artifact.path} mono />
        <KeyValue
          k="SHA-256"
          v={
            artifact.sha256 ?? (
              <NotCollected reason="The manifest records no digest for this artifact." />
            )
          }
          mono
        />
        <KeyValue
          k="Modified (UTC)"
          v={
            artifact.modified_utc ?? (
              <NotCollected reason="No modification time is recorded for this artifact." />
            )
          }
          mono
        />
        <KeyValue
          k="Rows"
          v={
            artifact.rows === null ? (
              <NotCollected reason="Not a tabular artifact — a row count does not apply to it." />
            ) : (
              <Figure value={artifact.rows} status="observed" unit="count" />
            )
          }
        />
        <KeyValue
          k="Bytes"
          v={
            artifact.bytes === undefined ? (
              <NotCollected reason="No byte count is recorded in the manifest for this artifact." />
            ) : (
              <>
                <Figure value={artifact.bytes} status="observed" unit="count" />
                <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                  {' '}
                  · {formatFigure(artifact.bytes / MIB, { precision: 2 })} MiB
                </span>
              </>
            )
          }
        />
      </dl>

      <div style={{ paddingTop: 'var(--s4)' }}>
        <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
          Columns read by the generator
          {artifact.columns ? (
            <span style={{ color: 'var(--ink-4)', marginLeft: '0.5rem' }}>
              <span className="fig">{artifact.columns.length}</span>
            </span>
          ) : null}
        </div>
        {artifact.columns && artifact.columns.length > 0 ? (
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
              gap: '0 var(--s4)',
            }}
          >
            {artifact.columns.map((c, i) => (
              <li
                key={c}
                className="rule-bh"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2rem 1fr',
                  gap: '0.4rem',
                  padding: '0.15rem 0',
                }}
              >
                <span className="fig" style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Mono>{c}</Mono>
              </li>
            ))}
          </ol>
        ) : (
          <NotCollected reason="The manifest records no column list for this artifact — it is not a delimited file, so the generator read it whole." />
        )}
      </div>
    </div>
  );
}
