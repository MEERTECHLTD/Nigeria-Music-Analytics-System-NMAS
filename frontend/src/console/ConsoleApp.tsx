/**
 * Console shell.
 *
 * Hash routing, so the console works on static hosting without rewrite rules
 * and every panel and selection is a shareable URL — which is what makes
 * "traceable in at most three clicks" verifiable by someone else.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './tokens.css';
import { PANELS, PANELS_BY_ID, PANEL_GROUPS, FEASIBILITY_EPISTEMIC } from './panels/registry';
import { EpistemicLegend, LoadingBlock } from './components/primitives';
import { GAP_COUNTS } from './registry/gaps';
import { STAGE_COUNTS } from './registry/stages';

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const PANEL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  executive: lazy(() => import('./panels/ExecutiveConsole')),
  coverage: lazy(() => import('./panels/CoverageMatrix')),
  sources: lazy(() => import('./panels/SourceIntelligence')),
  artists: lazy(() => import('./panels/ArtistUniverse')),
  accounts: lazy(() => import('./panels/AccountSeparation')),
  revenue: lazy(() => import('./panels/PlatformRevenue')),
  estimation: lazy(() => import('./panels/EstimationTransparency')),
  lineage: lazy(() => import('./panels/LineageInspector')),
  graph: lazy(() => import('./panels/EntityGraph')),
  footprint: lazy(() => import('./panels/ExportFootprint')),
  methodology: lazy(() => import('./panels/MethodologyInspector')),
  validation: lazy(() => import('./panels/ValidationCentre')),
  timeline: lazy(() => import('./panels/RunTimeline')),
  monitoring: lazy(() => import('./panels/SystemMonitoring')),
  audit: lazy(() => import('./panels/AuditTrail')),
  gaps: lazy(() => import('./panels/GapRegister')),
  constants: lazy(() => import('./panels/ConstantsRegister')),
  delivery: lazy(() => import('./panels/DeliveryRegister')),
  artifacts: lazy(() => import('./panels/ArtifactManifest')),
  expansion: lazy(() => import('./panels/ProviderExpansion')),
};

function currentPanelId(): string {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return PANELS_BY_ID[raw] ? raw : 'executive';
}

export function useHashPanel(): [string, (id: string) => void] {
  const [id, setId] = useState(currentPanelId);
  useEffect(() => {
    const onHash = () => setId(currentPanelId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((next: string) => {
    window.location.hash = `/${next}`;
  }, []);
  return [id, go];
}

export default function ConsoleApp() {
  return (
    <QueryClientProvider client={client}>
      <ConsoleShell />
    </QueryClientProvider>
  );
}

function ConsoleShell() {
  const [panelId, go] = useHashPanel();
  const meta = PANELS_BY_ID[panelId];
  const Panel = PANEL_COMPONENTS[panelId];

  const grouped = useMemo(
    () => PANEL_GROUPS.map((g) => [g, PANELS.filter((p) => p.group === g)] as const),
    [],
  );

  useEffect(() => {
    document.title = `${meta?.title ?? 'Console'} · NMAS Statistical Production Console`;
  }, [meta]);

  return (
    <div className="nmas-console">
      <a
        href={`#/${panelId}`}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('panel-main')?.focus();
        }}
        className="no-print"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = '0.5rem';
          e.currentTarget.style.top = '0.5rem';
          e.currentTarget.style.background = 'var(--paper-raised)';
          e.currentTarget.style.padding = '0.5rem';
          e.currentTarget.style.zIndex = '100';
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = '-9999px';
        }}
      >
        Skip to panel
      </a>

      <Masthead />

      <div className="console-shell">
        <nav className="console-rail no-print" aria-label="Panels">
          {grouped.map(([group, panels]) => (
            <div key={group} style={{ marginBottom: 'var(--s4)' }}>
              <div className="h-section" style={{ padding: '0 var(--s4) var(--s1)' }}>
                {group}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {panels.map((p) => {
                  const active = p.id === panelId;
                  return (
                    <li key={p.id}>
                      <a
                        href={`#/${p.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          go(p.id);
                        }}
                        aria-current={active ? 'page' : undefined}
                        title={p.summary}
                        data-epi={FEASIBILITY_EPISTEMIC[p.feasibility]}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.75rem 1fr auto',
                          alignItems: 'baseline',
                          gap: '0.3rem',
                          padding: '0.2rem var(--s4)',
                          textDecoration: 'none',
                          color: active ? 'var(--ink)' : 'var(--ink-2)',
                          background: active ? 'var(--paper-sunk)' : undefined,
                          borderLeft: active
                            ? '2px solid var(--rule-heavy)'
                            : '2px solid transparent',
                          fontSize: 'var(--t-body)',
                        }}
                      >
                        <span className="fig" style={{ color: 'var(--ink-4)', fontSize: 'var(--t-micro)' }}>
                          {p.n ?? '—'}
                        </span>
                        <span>{p.title}</span>
                        <span
                          title={`${p.backed}% of this panel is backed by real artifacts`}
                          style={{
                            width: '2.25rem',
                            height: '0.3125rem',
                            background: 'var(--una-bg)',
                            border: '1px solid var(--rule-hair)',
                            position: 'relative',
                            alignSelf: 'center',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: `${p.backed}%`,
                              background: 'var(--epi)',
                            }}
                          />
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div style={{ padding: 'var(--s3) var(--s4)', borderTop: '1px solid var(--rule)' }}>
            <div className="h-section" style={{ marginBottom: 'var(--s2)' }}>
              Epistemic key
            </div>
            <EpistemicLegend
              only={['observed', 'estimated', 'assumed', 'allocated', 'unavailable']}
            />
          </div>
        </nav>

        <main
          id="panel-main"
          tabIndex={-1}
          style={{ padding: '0 var(--s5) var(--s8)', minWidth: 0 }}
        >
          {meta ? <PanelHeader /> : null}
          <Suspense fallback={<LoadingBlock label="Loading panel" />}>
            {Panel ? <Panel /> : <p>Unknown panel.</p>}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Masthead() {
  return (
    <header
      className="rule-heavy-b"
      style={{
        maxWidth: 'var(--shell-max)',
        margin: '0 auto',
        padding: 'var(--s5) var(--s5) var(--s3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s5)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="h-section">Nigeria Music Analytics Study</div>
          <h1 className="h-display" style={{ marginTop: '0.15rem' }}>
            Statistical Production Console
          </h1>
        </div>
        <dl
          style={{
            display: 'flex',
            gap: 'var(--s5)',
            margin: 0,
            fontSize: 'var(--t-micro)',
            color: 'var(--ink-3)',
          }}
        >
          <MastheadStat
            label="Stages implemented"
            value={`${STAGE_COUNTS.implemented} of ${STAGE_COUNTS.total}`}
          />
          <MastheadStat label="Open gaps" value={String(GAP_COUNTS.total)} />
          <MastheadStat label="Blocking" value={String(GAP_COUNTS.blocking)} />
        </dl>
      </div>
    </header>
  );
}

function MastheadStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</dt>
      <dd className="fig" style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--t-body)' }}>
        {value}
      </dd>
    </div>
  );
}

function PanelHeader() {
  const [panelId] = useHashPanel();
  const meta = PANELS_BY_ID[panelId];
  if (!meta) return null;
  return (
    <div style={{ padding: 'var(--s5) 0 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s3)',
          flexWrap: 'wrap',
        }}
      >
        {meta.n ? (
          <span className="fig" style={{ color: 'var(--ink-4)', fontSize: 'var(--t-title)' }}>
            {String(meta.n).padStart(2, '0')}
          </span>
        ) : null}
        <h1 className="h-display" style={{ fontSize: 'var(--t-title)' }}>
          {meta.title}
        </h1>
        <span
          className="epi-chip"
          data-epi={FEASIBILITY_EPISTEMIC[meta.feasibility]}
          title={`${meta.backed}% of this panel's specification is backed by artifacts that exist`}
        >
          {meta.feasibility.replace('_', ' ')} · {meta.backed}%
        </span>
      </div>
      <p className="lede" style={{ margin: '0.35rem 0 0' }}>
        {meta.summary}
      </p>
    </div>
  );
}
