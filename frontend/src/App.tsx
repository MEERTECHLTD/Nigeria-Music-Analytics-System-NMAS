import { useState } from 'react';
import { NbsConsole } from './features/nmas/NbsConsole';
import { NbsDashboard } from './features/nmas/NbsDashboard';
import { BarChart3, Terminal } from 'lucide-react';

type View = 'dashboard' | 'console';

function App() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <>
      {/* Global view toggle */}
      <div className="fixed bottom-6 right-6 z-50 flex gap-2">
        <button
          onClick={() => setView('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg transition-all ${
            view === 'dashboard'
              ? 'bg-[var(--nmas-accent)] text-white'
              : 'bg-[var(--nmas-card)] text-[var(--nmas-muted)] border border-[var(--nmas-border)] hover:text-[var(--nmas-ink)]'
          }`}
        >
          <BarChart3 size={16} />
          NBS Dashboard
        </button>
        <button
          onClick={() => setView('console')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg transition-all ${
            view === 'console'
              ? 'bg-[var(--nmas-accent)] text-white'
              : 'bg-[var(--nmas-card)] text-[var(--nmas-muted)] border border-[var(--nmas-border)] hover:text-[var(--nmas-ink)]'
          }`}
        >
          <Terminal size={16} />
          Console
        </button>
      </div>

      {view === 'dashboard' ? <NbsDashboard /> : <NbsConsole />}
    </>
  );
}

export default App;
