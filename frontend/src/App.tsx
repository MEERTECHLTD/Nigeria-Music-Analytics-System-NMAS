/**
 * Three surfaces, one app.
 *
 *   #/dashboard    NBS Delivery Dashboard — the results view for NBS readers.
 *   #/<panel>      Statistical Production Console — the methodological view.
 *   #/operations   Operations Console — drives the live API, gated until it answers.
 *
 * Theme is global to all three and lives on the root element, so a reader's
 * choice survives switching surfaces and reloading.
 *
 * Both auto-fetch independently and neither blocks the other: the console polls
 * its artifacts and the dashboard polls the NBS routes, each falling back to the
 * generated projection when the live API is absent or answers empty. Activating
 * the Chartmetric and SoundCharts endpoints requires no change here — the
 * transport probe promotes both surfaces to live on its own.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BarChart3, Terminal, Server } from 'lucide-react';
import ConsoleApp from './console/ConsoleApp';
import { ThemeToggle } from './ThemeToggle';

// The dashboard carries the charting library; the console uses none of it.
// Loading it on demand keeps the console's first paint free of ~350 kB.
const NbsDashboard = lazy(() =>
  import('./features/nmas/NbsDashboard').then((m) => ({ default: m.NbsDashboard })),
);

// The operations console drives the live API. Its gate watches for the backend
// and mounts it automatically once /health answers.
const BackendGate = lazy(() => import('./features/nmas/BackendGate'));

type Surface = 'console' | 'dashboard' | 'operations';

function surfaceFromHash(): Surface {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (h === 'dashboard') return 'dashboard';
  if (h === 'operations') return 'operations';
  return 'console';
}

export default function App() {
  const [surface, setSurface] = useState<Surface>(surfaceFromHash);

  useEffect(() => {
    const onHash = () => setSurface(surfaceFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: Surface) => {
    window.location.hash =
      next === 'dashboard' ? '/dashboard' : next === 'operations' ? '/operations' : '/executive';
  }, []);

  const fallback = (label: string) => (
    <div style={{ padding: '3rem', fontSize: '0.8125rem', color: '#736e64' }}>{label}…</div>
  );

  return (
    <>
      {surface === 'dashboard' ? (
        <Suspense fallback={fallback('Loading dashboard')}>
          <NbsDashboard />
        </Suspense>
      ) : surface === 'operations' ? (
        <Suspense fallback={fallback('Loading operations console')}>
          <BackendGate />
        </Suspense>
      ) : (
        <ConsoleApp />
      )}

      <nav
        aria-label="Surface"
        className="no-print"
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 60,
          display: 'flex',
          border: '1px solid var(--nmas-border)',
          background: 'var(--nmas-card)',
          borderRadius: 2,
          overflow: 'hidden',
          fontFamily: 'var(--font-sans, system-ui)',
          fontSize: '0.75rem',
        }}
      >
        <SurfaceButton
          active={surface === 'dashboard'}
          onClick={() => go('dashboard')}
          icon={<BarChart3 size={13} />}
          label="NBS Dashboard"
        />
        <SurfaceButton
          active={surface === 'console'}
          onClick={() => go('console')}
          icon={<Terminal size={13} />}
          label="Console"
        />
        <SurfaceButton
          active={surface === 'operations'}
          onClick={() => go('operations')}
          icon={<Server size={13} />}
          label="Operations"
        />
        <span aria-hidden style={{ width: 1, background: 'var(--nmas-border)' }} />
        <ThemeToggle />
      </nav>
    </>
  );
}

function SurfaceButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.3rem 0.65rem',
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        background: active ? 'var(--nmas-ink)' : 'transparent',
        color: active ? 'var(--nmas-bg)' : 'var(--nmas-muted)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
