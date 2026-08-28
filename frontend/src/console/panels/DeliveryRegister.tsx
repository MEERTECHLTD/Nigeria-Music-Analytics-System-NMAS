/**
 * DELIVERY REGISTER
 *
 * The package submitted to the National Bureau of Statistics, and the copy held
 * in the repository, inventoried file by file.
 *
 * Modification dates are preserved exactly as recorded on disk. They are the
 * only evidence of when each artifact was produced, and a submission is only
 * auditable if they survive — so they are shown to the second, never reformatted
 * into a relative phrase.
 *
 * What it cannot show: nothing here opens a workbook or a video. It reports what
 * was shipped, when, and at what hash.
 */

import { useMemo, useState } from 'react';
import { useDelivery } from '../data/client';
import { Callout, Resolved, Section, NotCollected } from '../components/primitives';
import { DataTable, type Column } from '../components/DataTable';
import type { Delivery, DeliveryFile, DeliveryPackage } from '../data/types';

const SECTION_TITLES: Record<string, string> = {
  '01_Executive_Summary': 'Executive summary',
  '02_Methodology': 'Methodology and sources',
  '03_Excel_Deliveries': 'Excel deliverables',
  '04_Datasets': 'Datasets',
  '05_Database_Extracts': 'Database extracts',
  '06_Sample_Workbooks': 'Sample workbooks',
  '07_Quality_Checks': 'Quality checks',
  '08_References': 'References and proof',
  '09_AI_Disclosure': 'AI disclosure',
  '10_Presentation': 'Presentation',
  '11_Raw_Extractions': 'Raw extractions',
  '12_System_Exports': 'System exports',
  '13_Database': 'Database',
  '(root)': 'Package root',
};

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${n} B`;
}

/** Full precision, UTC. A submission date is evidence, not a nicety. */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function fmtDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export default function DeliveryRegister() {
  const query = useDelivery();
  return (
    <Resolved query={query} artifact="delivery.json" label="Reading delivery packages">
      {(data) => <Register data={data} />}
    </Resolved>
  );
}

function Register({ data }: { data: Delivery }) {
  const submitted = data.deliveries.find((d) => d.id === 'submitted') ?? null;
  const project = data.deliveries.find((d) => d.id === 'project') ?? null;
  const [activeId, setActiveId] = useState<string>(submitted ? 'submitted' : 'project');
  const active = data.deliveries.find((d) => d.id === activeId) ?? data.deliveries[0] ?? null;

  return (
    <>
      <Section
        title="Packages"
        subtitle="Two copies of the Month 1 delivery. Dates are as recorded on disk, in UTC."
      >
        {data.deliveries.length === 0 ? (
          <Callout status="unavailable" title="No delivery package found">
            Neither the submitted package nor the in-repository delivery could be located.
          </Callout>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--s6)', flexWrap: 'wrap' }}>
            {data.deliveries.map((d) => (
              <PackageSummary key={d.id} pkg={d} />
            ))}
          </div>
        )}

        {data.missing_sections.length > 0 && (
          <Callout
            status="unavailable"
            title={`The package README advertises ${data.missing_sections.length} section${
              data.missing_sections.length === 1 ? '' : 's'
            } that ${data.missing_sections.length === 1 ? 'was' : 'were'} never shipped`}
            gapId="GAP-011"
          >
            <p style={{ margin: 0 }}>
              {data.missing_sections
                .map((s) => `${s} (${SECTION_TITLES[s] ?? s})`)
                .join(', ')}{' '}
              {data.missing_sections.length === 1 ? 'is' : 'are'} listed in the delivery contents
              table and absent from both packages.
            </p>
            {data.missing_sections.includes('13_Database') && (
              <p style={{ margin: '0.5rem 0 0' }}>
                This is the SQLite store the README describes as the complete NMAS data store.
                Without it, every raw payload, audit row and checkpoint the pipeline wrote is
                unavailable, which is why the Lineage Inspector and Audit Trail can show only the
                flat-file chain.
              </p>
            )}
          </Callout>
        )}
      </Section>

      <Section
        title="What differs between the two packages"
        subtitle="Files present in one copy and not the other."
      >
        <div style={{ display: 'grid', gap: 'var(--s5)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))' }}>
          <DiffList
            title="Only in the submitted package"
            paths={data.only_in_submitted}
            epi="observed"
            note="Shipped to NBS and not carried back into the repository."
          />
          <DiffList
            title="Only in the repository copy"
            paths={data.only_in_project}
            epi="estimated"
            note="Produced after the submission, or never included in it."
          />
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)', marginTop: 'var(--s3)' }}>
          <span className="fig">{data.in_both}</span> files are common to both packages.
        </p>
      </Section>

      <HeadlineIndicatorsSection data={data} />

      <Section
        title="File register"
        subtitle={
          active
            ? `Every file in the ${active.label.toLowerCase()}, with its size, modification date and SHA-256.`
            : undefined
        }
        actions={
          data.deliveries.length > 1 ? (
            <div style={{ display: 'flex', gap: 'var(--s1)' }}>
              {data.deliveries.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="btn"
                  aria-pressed={d.id === activeId}
                  onClick={() => setActiveId(d.id)}
                >
                  {d.id === 'submitted' ? 'Submitted' : 'Repository'}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {active ? <FileTable pkg={active} /> : null}
      </Section>

      {submitted?.readme_markdown ? (
        <Section
          title="Package README"
          subtitle="Transcribed from the submitted package, unedited."
        >
          <pre
            style={{
              margin: 0,
              padding: 'var(--s4)',
              background: 'var(--paper-sunk)',
              border: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--t-small)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
            }}
          >
            {submitted.readme_markdown}
          </pre>
        </Section>
      ) : null}

      {project ? (
        <Section title="Paths">
          <dl style={{ margin: 0 }}>
            {data.deliveries.map((d) => (
              <div
                key={d.id}
                className="rule-bh"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(10rem, 14rem) 1fr',
                  gap: 'var(--s3)',
                  padding: '0.3rem 0',
                }}
              >
                <dt style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>{d.label}</dt>
                <dd
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--t-small)',
                    wordBreak: 'break-all',
                  }}
                >
                  {d.root}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </>
  );
}

function PackageSummary({ pkg }: { pkg: DeliveryPackage }) {
  const submitted = pkg.id === 'submitted';
  return (
    <div
      data-epi={submitted ? 'observed' : 'derived'}
      style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s4)', minWidth: '18rem' }}
    >
      <div className="h-section">{pkg.label}</div>
      <div style={{ display: 'flex', gap: 'var(--s4)', alignItems: 'baseline', marginTop: '0.3rem' }}>
        <span className="fig" style={{ fontSize: '1.375rem', fontWeight: 600 }}>
          {pkg.file_count}
        </span>
        <span style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)' }}>files</span>
        <span className="fig" style={{ fontSize: '1rem' }}>
          {fmtBytes(pkg.total_bytes)}
        </span>
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '0.1rem 0.6rem',
          margin: 'var(--s2) 0 0',
          fontSize: 'var(--t-micro)',
        }}
      >
        <dt style={{ color: 'var(--ink-3)' }}>Earliest file</dt>
        <dd className="fig" style={{ margin: 0 }}>
          {fmtDate(pkg.first_modified) ?? <NotCollected short />}
        </dd>
        <dt style={{ color: 'var(--ink-3)' }}>Latest file</dt>
        <dd className="fig" style={{ margin: 0 }}>
          {fmtDate(pkg.last_modified) ?? <NotCollected short />}
        </dd>
        <dt style={{ color: 'var(--ink-3)' }}>Sections</dt>
        <dd className="fig" style={{ margin: 0 }}>
          {pkg.sections.length}
        </dd>
      </dl>
    </div>
  );
}

function DiffList({
  title,
  paths,
  epi,
  note,
}: {
  title: string;
  paths: string[];
  epi: string;
  note: string;
}) {
  return (
    <div data-epi={epi} style={{ borderLeft: '2px solid var(--epi)', padding: '0 var(--s4)' }}>
      <div className="h-section">
        {title} <span className="fig">({paths.length})</span>
      </div>
      <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-micro)', margin: '0.2rem 0 0.5rem' }}>
        {note}
      </p>
      {paths.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--t-small)', margin: 0 }}>None.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {paths.map((p) => (
            <li
              key={p}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--t-small)',
                padding: '0.1rem 0',
                wordBreak: 'break-word',
              }}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HeadlineIndicatorsSection({ data }: { data: Delivery }) {
  const h = data.headline_indicators;

  if (!h.present || h.rows.length === 0) {
    return (
      <Section title="Quarterly headline indicators">
        <Callout status="unavailable" title="Headline indicators workbook not read">
          {h.error ?? 'No headline indicators workbook was found in the submitted package.'}
        </Callout>
      </Section>
    );
  }

  // The workbook is a plain grid: first row is the header, the rest are periods.
  const [header, ...rows] = h.rows;
  const width = Math.max(header.length, ...rows.map((r) => r.length));

  return (
    <Section
      title="Quarterly headline indicators"
      subtitle={
        <>
          The figures the submission puts forward as its headline result, transcribed from{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>{h.source}</code> exactly as the workbook
          records them.
        </>
      }
    >
      <Callout status="estimated" title="Every indicator below is an estimate">
        These are the published headline figures. None has an observed stream component: streaming
        revenue is an audience count converted by a coefficient, export revenue is a fixed 70% share
        of it, employment is a national baseline compounded at a constant rate, and cost is a flat
        per-artist model. The Estimation Transparency panel decomposes each one.
      </Callout>

      <div className="scroll-x">
        <table className="tbl">
          <caption>
            Source: {h.source} · modified{' '}
            <span className="fig">{fmtDate(h.modified_utc ?? null)}</span>
            {h.sha256 ? (
              <>
                {' '}· sha256 <span className="fig">{h.sha256.slice(0, 16)}…</span>
              </>
            ) : null}
          </caption>
          <thead>
            <tr>
              {Array.from({ length: width }).map((_, i) => (
                <th key={i} className={i === 0 ? undefined : 'num-col'}>
                  {header[i] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {Array.from({ length: width }).map((_, ci) => {
                  const v = r[ci] ?? '';
                  const numeric = ci > 0;
                  return (
                    <td key={ci} className={numeric ? 'num-col' : undefined}>
                      {v === '' ? (
                        <NotCollected short reason="The workbook cell is empty." />
                      ) : numeric ? (
                        <span className="fig" data-epi="estimated">
                          {v}
                        </span>
                      ) : (
                        v
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function FileTable({ pkg }: { pkg: DeliveryPackage }) {
  const columns: Column<DeliveryFile>[] = useMemo(
    () => [
      {
        key: 'section',
        header: 'Section',
        value: (f) => SECTION_TITLES[f.section] ?? f.section,
        groupable: true,
        width: '13rem',
      },
      {
        key: 'name',
        header: 'File',
        value: (f) => f.name,
        render: (f) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-small)' }}>{f.name}</span>
        ),
        width: '26rem',
      },
      {
        key: 'ext',
        header: 'Type',
        value: (f) => f.extension,
        groupable: true,
        width: '5rem',
        render: (f) =>
          f.extension ? (
            <span className="epi-chip epi-chip--bare" data-epi="derived">
              {f.extension}
            </span>
          ) : (
            <NotCollected short reason="No file extension." />
          ),
      },
      {
        key: 'bytes',
        header: 'Size',
        value: (f) => f.bytes,
        numeric: true,
        width: '6rem',
        render: (f) => <span className="fig">{fmtBytes(f.bytes)}</span>,
      },
      {
        key: 'day',
        header: 'Date',
        value: (f) => f.modified_utc,
        width: '7rem',
        groupable: true,
        note: 'Modification date as recorded on disk, UTC.',
        render: (f) => <span className="fig">{fmtDay(f.modified_utc)}</span>,
      },
      {
        key: 'modified',
        header: 'Modified (UTC)',
        value: (f) => f.modified_utc,
        width: '11rem',
        optional: true,
        note: 'Full timestamp, to the second.',
        render: (f) => <span className="fig">{fmtDate(f.modified_utc)}</span>,
      },
      {
        key: 'sha',
        header: 'SHA-256',
        value: (f) => f.sha256,
        optional: true,
        width: '14rem',
        note: 'Skipped for files over 40 MB.',
        render: (f) =>
          f.sha256 ? (
            <span
              className="fig"
              title={f.sha256}
              style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}
            >
              {f.sha256.slice(0, 24)}…
            </span>
          ) : (
            <NotCollected
              short
              reason={
                f.sha256_skipped
                  ? 'Not hashed — the file exceeds the 40 MB hashing threshold.'
                  : 'No hash recorded.'
              }
            />
          ),
      },
      {
        key: 'path',
        header: 'Path',
        value: (f) => f.path,
        optional: true,
        render: (f) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)' }}>{f.path}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      rows={pkg.files}
      columns={columns}
      rowKey={(f) => f.path}
      filename={`nmas-delivery-${pkg.id}`}
      dense
      pageSize={null}
      initialSort={{ key: 'section', dir: 'asc' }}
      caption={
        <>
          <span className="fig">{pkg.file_count}</span> files ·{' '}
          <span className="fig">{fmtBytes(pkg.total_bytes)}</span> ·{' '}
          <span className="fig">{fmtDay(pkg.first_modified)}</span> to{' '}
          <span className="fig">{fmtDay(pkg.last_modified)}</span>
        </>
      }
    />
  );
}
