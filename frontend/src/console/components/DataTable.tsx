/**
 * The console's table.
 *
 * Every table in the interface is this component, so filtering, sorting,
 * grouping, column configuration and CSV export behave identically everywhere
 * and numeric columns are always right-aligned with tabular numerals.
 *
 * Absent values render NOT COLLECTED via the column's own renderer — the table
 * never substitutes a dash or a zero on the caller's behalf.
 */

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { downloadCsv } from '../data/client';
import { NotCollected } from './primitives';

export interface Column<T> {
  key: string;
  header: string;
  /** value used for sorting, filtering and CSV export */
  value: (row: T) => string | number | null | undefined;
  /** display; falls back to the raw value */
  render?: (row: T) => ReactNode;
  numeric?: boolean;
  /** hidden until enabled in the column picker */
  optional?: boolean;
  width?: string;
  /** short note shown in the column picker */
  note?: string;
  groupable?: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  /** stable row identity */
  rowKey: (row: T) => string;
  filename: string;
  caption?: ReactNode;
  dense?: boolean;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** expanded detail for a row */
  expand?: (row: T) => ReactNode;
  /** rows to show before the "show all" control; null disables the cap */
  pageSize?: number | null;
  emptyMessage?: ReactNode;
  toolbarExtra?: ReactNode;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  filename,
  caption,
  dense = false,
  initialSort,
  expand,
  pageSize = 100,
  emptyMessage = 'No rows.',
  toolbarExtra,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(pageSize === null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.optional).map((c) => c.key)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );

  const groupable = useMemo(() => columns.filter((c) => c.groupable), [columns]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      visible.some((c) => {
        const v = c.value(r);
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, visible, deferredQuery]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      // Absent values always sort last, regardless of direction — an unknown
      // is not a small number.
      const aNull = av === null || av === undefined || av === '';
      const bNull = bv === null || bv === undefined || bv === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'en') * dir;
    });
  }, [filtered, sort, columns]);

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const col = columns.find((c) => c.key === groupBy);
    if (!col) return null;
    const map = new Map<string, T[]>();
    for (const r of sorted) {
      const raw = col.value(r);
      const k = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
      const list = map.get(k);
      if (list) list.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en'));
  }, [sorted, groupBy, columns]);

  const capped = pageSize !== null && !showAll && !groups;
  const display = capped ? sorted.slice(0, pageSize) : sorted;

  const onSort = useCallback((key: string) => {
    setSort((s) =>
      s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' },
    );
  }, []);

  const exportCsv = useCallback(() => {
    downloadCsv(
      filename,
      sorted.map((r) => {
        const o: Record<string, unknown> = {};
        for (const c of visible) o[c.header] = c.value(r);
        return o;
      }),
      visible.map((c) => c.header),
    );
  }, [sorted, visible, filename]);

  const toggleExpand = useCallback((k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const colSpan = visible.length + (expand ? 1 : 0);

  const renderRow = (row: T) => {
    const k = rowKey(row);
    const isOpen = expanded.has(k);
    return (
      <Fragment key={k}>
        <tr>
          {expand ? (
            <td style={{ width: '1.5rem', paddingRight: 0 }}>
              <button
                type="button"
                className="btn"
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                onClick={() => toggleExpand(k)}
                style={{ padding: '0 0.25rem', lineHeight: 1.2, border: 'none', background: 'none' }}
              >
                {isOpen ? '▾' : '▸'}
              </button>
            </td>
          ) : null}
          {visible.map((c) => {
            const raw = c.value(row);
            const absent = raw === null || raw === undefined || raw === '';
            return (
              <td key={c.key} className={c.numeric ? 'num-col' : undefined}>
                {c.render ? (
                  c.render(row)
                ) : absent ? (
                  <NotCollected short />
                ) : c.numeric ? (
                  <span className="fig">{String(raw)}</span>
                ) : (
                  String(raw)
                )}
              </td>
            );
          })}
        </tr>
        {isOpen && expand ? (
          <tr>
            <td colSpan={colSpan} style={{ background: 'var(--paper-sunk)', padding: 'var(--s4)' }}>
              {expand(row)}
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div>
      {/* toolbar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--s2)',
          paddingBottom: 'var(--s2)',
        }}
      >
        <input
          className="inp"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter rows"
          style={{ width: '12rem' }}
        />
        {groupable.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>Group</span>
            <select
              className="inp"
              value={groupBy ?? ''}
              onChange={(e) => setGroupBy(e.target.value || null)}
              aria-label="Group rows by column"
            >
              <option value="">none</option>
              {groupable.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.header}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            Columns ({visible.length}/{columns.length})
          </button>
          {pickerOpen && (
            <div
              style={{
                position: 'absolute',
                top: '1.6rem',
                left: 0,
                zIndex: 30,
                background: 'var(--paper-raised)',
                border: '1px solid var(--rule-strong)',
                padding: 'var(--s3)',
                minWidth: '16rem',
                maxHeight: '22rem',
                overflowY: 'auto',
              }}
            >
              {columns.map((c) => (
                <label
                  key={c.key}
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    alignItems: 'flex-start',
                    padding: '0.15rem 0',
                    fontSize: 'var(--t-small)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.key)}
                    onChange={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      })
                    }
                  />
                  <span>
                    {c.header}
                    {c.note ? (
                      <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: 'var(--t-micro)' }}>
                        {c.note}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="btn" onClick={exportCsv}>
          Export CSV
        </button>

        {toolbarExtra}

        <span style={{ marginLeft: 'auto', fontSize: 'var(--t-micro)', color: 'var(--ink-3)' }}>
          <span className="fig">{sorted.length.toLocaleString('en-US')}</span>
          {sorted.length !== rows.length ? (
            <>
              {' of '}
              <span className="fig">{rows.length.toLocaleString('en-US')}</span>
            </>
          ) : null}
          {' rows'}
        </span>
      </div>

      <div className="scroll-x">
        <table className={`tbl${dense ? ' tbl--dense' : ''}`}>
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              {expand ? <th style={{ width: '1.5rem' }} aria-label="Expand" /> : null}
              {visible.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={c.numeric ? 'num-col' : undefined}
                    style={{ width: c.width }}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      title={c.note ? `${c.header} — ${c.note}` : `Sort by ${c.header}`}
                      style={{
                        font: 'inherit',
                        color: active ? 'var(--ink)' : 'inherit',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textTransform: 'inherit',
                        letterSpacing: 'inherit',
                        width: '100%',
                        textAlign: c.numeric ? 'right' : 'left',
                      }}
                    >
                      {c.header}
                      {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {display.length === 0 ? (
              <tr>
                <td colSpan={colSpan} style={{ color: 'var(--ink-3)', padding: 'var(--s5)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : groups ? (
              groups.map(([label, list]) => (
                <Fragment key={label}>
                  <tr>
                    <td
                      colSpan={colSpan}
                      style={{
                        background: 'var(--paper-sunk)',
                        borderTop: '1px solid var(--rule-strong)',
                        fontWeight: 650,
                      }}
                    >
                      {label}
                      <span style={{ color: 'var(--ink-3)', fontWeight: 400, marginLeft: '0.5rem' }}>
                        <span className="fig">{list.length}</span>
                      </span>
                    </td>
                  </tr>
                  {list.map(renderRow)}
                </Fragment>
              ))
            ) : (
              display.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {capped && sorted.length > (pageSize ?? 0) ? (
        <div className="no-print" style={{ paddingTop: 'var(--s2)' }}>
          <button type="button" className="btn" onClick={() => setShowAll(true)}>
            Show all {sorted.length.toLocaleString('en-US')} rows
          </button>
        </div>
      ) : null}
    </div>
  );
}
