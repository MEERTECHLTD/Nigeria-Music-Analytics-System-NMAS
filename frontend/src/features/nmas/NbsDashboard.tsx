import { useEffect, useState, useMemo, useRef } from 'react';
import { NAIRA_PER_USD } from '../../generated/assumptions';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
  AreaChart, Area, Line, ComposedChart,
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, Globe,
  ArrowUpRight, ArrowDownRight, Loader2, ChevronDown,
  Music, Award, BarChart3,
} from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { nbsFetch, nbsJson, NBS_POLL_MS } from '../../lib/nbsTransport';

// ─── Types ───────────────────────────────────────────────

interface PeriodTotal {
  period: string;
  gross_streaming_revenue_usd?: number;
  gross_streaming_revenue_ngn?: number;
  domestic_revenue_usd?: number;
  gross_export_revenue_usd?: number;
  gross_export_revenue_ngn?: number;
  total_employment?: number;
  male?: number;
  female?: number;
  total_cost_ngn?: number;
  total_cost_usd?: number;
}

interface NbsSummary {
  streaming_revenue: PeriodTotal[];
  export_revenue: PeriodTotal[];
  employment: PeriodTotal[];
  costs: PeriodTotal[];
  artist_count: number;
  periods: string[];
}

interface ArtistRevenue {
  artist_name: string;
  period: string;
  gross_streaming_revenue_usd: number;
  spotify_monthly_listeners: number;
  youtube_actual_views: number;
  youtube_views_source: string;
  deezer_fans: number;
  spotify_revenue_usd: number;
  youtube_revenue_usd: number;
  deezer_revenue_usd: number;
  other_platforms_revenue_usd: number;
  gross_streaming_revenue_ngn: number;
}

interface TopArtist {
  artist_name: string;
  gross_streaming_revenue_usd: number;
  spotify_monthly_listeners: number;
  youtube_actual_views: number;
}

// ─── Helpers ─────────────────────────────────────────────

const fmtNgn = (n: number) =>
  n >= 1_000_000_000 ? `₦${(n / 1_000_000_000).toFixed(1)}B`
  : n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M`
  : `₦${n.toLocaleString()}`;

const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K`
  : `$${n.toFixed(0)}`;

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : `${n}`;

const PIE_COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#9333ea', '#dc2626', '#059669', '#d97706', '#6366f1'];
const GENDER_COLORS = ['#1d4ed8', '#ec4899'];

const periodLabel = (p: unknown) => String(p).replace('_', ' ');

const pctChange = (curr: number, prev: number) => {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
};

// ─── Fetch helper ────────────────────────────────────────
//
// Transport-aware: prefers the live API when it is up and answering with data,
// otherwise reads the generated projection. Keeps the dashboard working through
// endpoint activation without any change here.

// All reads go through nbsFetch/nbsJson, which resolve live-vs-projection and
// keep polling. API_BASE is still exported for the console's own transport.
void API_BASE;

// ─── Stat Card ───────────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string; value: string; subtitle?: string;
  icon: typeof TrendingUp; trend?: number | null;
}) {
  return (
    <div className="nbs-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--nmas-muted)] font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-[var(--nmas-muted)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="w-10 h-10 rounded-xl bg-[var(--nmas-chip)] flex items-center justify-center">
            <Icon size={20} className="text-[var(--nmas-accent)]" />
          </div>
          {trend !== undefined && trend !== null && (
            <span className={`text-xs font-medium flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-[var(--nmas-ink)] mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-[var(--nmas-accent)] rounded-full" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Main Dashboard ──────────────────────────────────────

type DashTab = 'overview' | 'revenue' | 'export' | 'employment' | 'costs' | 'artists';

export function NbsDashboard() {
  const [summary, setSummary] = useState<NbsSummary | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [artistRevenue, setArtistRevenue] = useState<ArtistRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState('Q1_2026');
  const [exportArtists, setExportArtists] = useState<Array<{
    artist_name: string; period: string;
    total_streaming_revenue_usd: number;
    // null where the provider published no city breakdown for the quarter:
    // the split was not measured, which is not the same as zero.
    domestic_revenue_usd: number | null;
    gross_export_revenue_usd: number | null;
    gross_export_revenue_ngn: number | null;
    domestic_share_observed?: number | null;
    split_basis?: string;
  }>>([]);

  const [transportMode, setTransportMode] = useState<'live' | 'static'>('static');
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Keeps the poll pointed at whatever period the user has selected, without
  // making the interval depend on it (which would restart it on every change).
  const selectedPeriodRef = useRef(selectedPeriod);
  useEffect(() => {
    selectedPeriodRef.current = selectedPeriod;
  }, [selectedPeriod]);

  // Auto-fetch. Reloads on an interval so quarters ingested after page load
  // appear on their own; the selected period is respected across refreshes.
  useEffect(() => {
    let cancelled = false;

    const load = async (period: string | null) => {
      try {
        const summaryRes = await nbsFetch<NbsSummary>('summary');
        if (cancelled) return;
        setSummary(summaryRes.data);
        setTransportMode(summaryRes.mode);

        // Default to the newest quarter the data actually contains rather than
        // a hardcoded one, so a newly ingested quarter becomes the default.
        const periods = summaryRes.data?.periods ?? [];
        const target = period ?? periods[periods.length - 1] ?? 'Q1_2026';
        if (!period) setSelectedPeriod(target);

        const [t, a, e] = await Promise.all([
          nbsJson<TopArtist[]>('top-artists', target),
          nbsJson<ArtistRevenue[]>('streaming-revenue', target),
          nbsJson<typeof exportArtists>('export-revenue', target),
        ]);
        if (cancelled) return;
        setTopArtists(t);
        setArtistRevenue(a);
        setExportArtists(e);
        setLastFetched(new Date());
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(null);
    const timer = window.setInterval(() => {
      void load(selectedPeriodRef.current);
    }, NBS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // Mount-only: the poll reads the selected period from a ref, so it must not
    // be torn down and rebuilt whenever that selection changes.
  }, []);

  const loadPeriod = (period: string) => {
    setSelectedPeriod(period);
    void nbsJson<TopArtist[]>('top-artists', period).then(setTopArtists);
    void nbsJson<ArtistRevenue[]>('streaming-revenue', period).then(setArtistRevenue);
    void nbsJson<typeof exportArtists>('export-revenue', period).then(setExportArtists);
  };

  // Period-aware KPIs (driven by dropdown)
  const orderedPeriods = summary?.periods ?? [];
  const prevPeriod = useMemo(() => {
    const idx = orderedPeriods.indexOf(selectedPeriod);
    return idx > 0 ? orderedPeriods[idx - 1] : null;
  }, [orderedPeriods, selectedPeriod]);

  const curRev = summary?.streaming_revenue?.find(r => r.period === selectedPeriod);
  const prevRev = summary?.streaming_revenue?.find(r => r.period === prevPeriod);
  const curExp = summary?.export_revenue?.find(r => r.period === selectedPeriod);
  const prevExp = summary?.export_revenue?.find(r => r.period === prevPeriod);
  const curEmp = summary?.employment?.find(r => r.period === selectedPeriod);
  const prevEmp = summary?.employment?.find(r => r.period === prevPeriod);

  const totalStreaming5p = useMemo(() =>
    summary?.streaming_revenue.reduce((s, r) => s + (r.gross_streaming_revenue_usd || 0), 0) ?? 0,
  [summary]);
  const totalExport5p = useMemo(() =>
    summary?.export_revenue.reduce((s, r) => s + (r.gross_export_revenue_usd || 0), 0) ?? 0,
  [summary]);

  const revTrend = pctChange(curRev?.gross_streaming_revenue_usd || 0, prevRev?.gross_streaming_revenue_usd || 0);
  const expTrend = pctChange(curExp?.gross_export_revenue_usd || 0, prevExp?.gross_export_revenue_usd || 0);
  const empTrend = pctChange(curEmp?.total_employment || 0, prevEmp?.total_employment || 0);

  // Revenue breakdown for pie chart
  const revBreakdown = useMemo(() => {
    if (!artistRevenue.length) return [];
    const totals = { Spotify: 0, YouTube: 0, Deezer: 0, 'Unmeasured uplift': 0 };
    artistRevenue.forEach(a => {
      totals.Spotify += a.spotify_revenue_usd;
      totals.YouTube += a.youtube_revenue_usd;
      totals.Deezer += a.deezer_revenue_usd;
      totals['Unmeasured uplift'] += a.other_platforms_revenue_usd;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [artistRevenue]);

  if (loading) return (
    <div className="nmas-loading">
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin" size={24} />
        <span>Loading NBS Dashboard...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="nmas-loading">
      <div className="text-center">
        <p className="text-red-500 font-medium">Failed to load dashboard</p>
        <p className="text-sm text-[var(--nmas-muted)] mt-1">{error}</p>
        <p className="text-xs text-[var(--nmas-muted)] mt-2">Make sure the backend is running on {API_BASE}</p>
      </div>
    </div>
  );

  if (!summary) return null;

  const tabs: { key: DashTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'revenue', label: 'Streaming Revenue' },
    { key: 'export', label: 'Export Revenue' },
    { key: 'employment', label: 'Employment' },
    { key: 'costs', label: 'Costs' },
    { key: 'artists', label: 'Artist Rankings' },
  ];

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--nmas-bg)]/80 border-b border-[var(--nmas-border)]">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-[var(--nmas-accent)]">NMAS</span>
                {' '}NBS Dashboard
              </h1>
              <p className="text-xs text-[var(--nmas-muted)]">
                Nigeria Music Analytics System — National Bureau of Statistics
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Transport and freshness. A reader must know whether this is the
                  live API or the generated projection, and how stale it is. */}
              <span
                className="text-xs px-2 py-1 rounded-md font-medium border border-[var(--nmas-border)] flex items-center gap-1.5"
                title={
                  transportMode === 'live'
                    ? 'Reading the live API. Refreshing automatically.'
                    : 'Reading the generated projection. Refreshing automatically.'
                }
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    transportMode === 'live' ? 'bg-emerald-500' : 'bg-[var(--nmas-muted)]'
                  }`}
                />
                {transportMode === 'live' ? 'Live' : 'Projection'}
                {lastFetched && (
                  <span className="text-[var(--nmas-muted)] tabular-nums">
                    {lastFetched.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </span>
              <div className="relative">
                <select
                  value={selectedPeriod}
                  onChange={e => loadPeriod(e.target.value)}
                  className="appearance-none bg-[var(--nmas-card)] border border-[var(--nmas-border)] rounded-lg px-3 py-1.5 pr-8 text-sm font-medium cursor-pointer"
                >
                  {summary.periods.map(p => (
                    <option key={p} value={p}>{periodLabel(p)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--nmas-muted)]" />
              </div>
              <span className="text-xs bg-[var(--nmas-chip)] text-[var(--nmas-accent)] px-2 py-1 rounded-md font-medium">
                {summary.artist_count} Artists
              </span>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === t.key
                    ? 'bg-[var(--nmas-card)] text-[var(--nmas-accent)] border border-[var(--nmas-border)] border-b-transparent'
                    : 'text-[var(--nmas-muted)] hover:text-[var(--nmas-ink)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 mt-6">
        {activeTab === 'overview' && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title={`Streaming — ${periodLabel(selectedPeriod)}`}
                value={fmtUsd(curRev?.gross_streaming_revenue_usd || 0)}
                subtitle={fmtNgn(curRev?.gross_streaming_revenue_ngn || 0)}
                icon={DollarSign}
                trend={revTrend}
              />
              <StatCard
                title={`Export — ${periodLabel(selectedPeriod)}`}
                value={fmtUsd(curExp?.gross_export_revenue_usd || 0)}
                subtitle={fmtNgn(curExp?.gross_export_revenue_ngn || 0)}
                icon={Globe}
                trend={expTrend}
              />
              <StatCard
                title={`Employment — ${periodLabel(selectedPeriod)}`}
                value={fmtNum(curEmp?.total_employment || 0)}
                subtitle={`${fmtNum(curEmp?.male || 0)} M / ${fmtNum(curEmp?.female || 0)} F`}
                icon={Users}
                trend={empTrend}
              />
              <StatCard
                title="5-Period Cumulative"
                value={fmtUsd(totalStreaming5p)}
                subtitle={`Export: ${fmtUsd(totalExport5p)} · ${fmtNgn(totalExport5p * NAIRA_PER_USD)}`}
                icon={TrendingUp}
              />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <StatCard
                title="Active Artists"
                value={String(artistRevenue.length)}
                subtitle={`${summary.artist_count} total in master list`}
                icon={Music}
              />
              <StatCard
                title="Top Earner"
                value={topArtists[0]?.artist_name || '—'}
                subtitle={topArtists[0] ? fmtUsd(topArtists[0].gross_streaming_revenue_usd) : ''}
                icon={Award}
              />
              <StatCard
                title="Export Share"
                value={curExp && curRev?.gross_streaming_revenue_usd
                  ? `${((curExp.gross_export_revenue_usd! / curRev.gross_streaming_revenue_usd!) * 100).toFixed(0)}%`
                  : '—'}
                subtitle="Share flowing out of Nigeria"
                icon={Globe}
              />
              <StatCard
                title="Avg Revenue / Artist"
                value={curRev && artistRevenue.length
                  ? fmtUsd((curRev.gross_streaming_revenue_usd || 0) / artistRevenue.length)
                  : '—'}
                subtitle={`${periodLabel(selectedPeriod)} mean`}
                icon={BarChart3}
              />
            </div>

            {/* Revenue Trend Chart */}
            <Section title="Quarterly Streaming Revenue Trend">
              <div className="nbs-card p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={summary.streaming_revenue}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={v => fmtUsd(v)} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      formatter={(v: unknown) => [fmtUsd(Number(v)), 'Revenue']}
                      labelFormatter={periodLabel}
                      contentStyle={{ borderRadius: 8, border: '1px solid var(--nmas-border)' }}
                    />
                    <Area type="monotone" dataKey="gross_streaming_revenue_usd" stroke="#0f766e" strokeWidth={2.5} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            {/* Two column: Platform breakdown + Top artists */}
            <div className="grid lg:grid-cols-2 gap-4 mt-6">
              <div className="nbs-card p-4">
                <h3 className="text-sm font-bold mb-3">Revenue by Platform ({periodLabel(selectedPeriod)})</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={revBreakdown}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={95}
                      dataKey="value"
                      label={(props: { name?: string; percent?: number }) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {revBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmtUsd(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="nbs-card p-4">
                <h3 className="text-sm font-bold mb-3">Top 10 Artists ({periodLabel(selectedPeriod)})</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topArtists.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis type="number" tickFormatter={v => fmtUsd(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="artist_name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: unknown) => fmtUsd(Number(v))} />
                    <Bar dataKey="gross_streaming_revenue_usd" fill="#0f766e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Employment gender split */}
            <Section title="Employment Trend">
              <div className="nbs-card p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={summary.employment}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11 }} width={70} />
                    <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} labelFormatter={periodLabel} />
                    <Legend />
                    <Bar dataKey="male" name="Male" fill={GENDER_COLORS[0]} stackId="emp" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="female" name="Female" fill={GENDER_COLORS[1]} stackId="emp" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </>
        )}

        {activeTab === 'revenue' && (
          <>
            <Section title={`Streaming Revenue — ${periodLabel(selectedPeriod)}`}>
              <div className="nbs-card overflow-x-auto">
                <table className="nbs-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Artist</th>
                      <th className="text-right">Spotify Listeners</th>
                      <th className="text-right">YouTube Views</th>
                      <th className="text-right">Spotify Rev</th>
                      <th className="text-right">YouTube Rev</th>
                      <th className="text-right">Total (USD)</th>
                      <th className="text-right">Total (NGN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artistRevenue.slice(0, 50).map((a, i) => (
                      <tr key={`${a.artist_name}-${a.period}`}>
                        <td className="text-[var(--nmas-muted)]">{i + 1}</td>
                        <td className="font-medium">{a.artist_name}</td>
                        <td className="text-right tabular-nums">{a.spotify_monthly_listeners.toLocaleString()}</td>
                        <td className="text-right tabular-nums">
                          {a.youtube_actual_views.toLocaleString()}
                          {a.youtube_views_source === 'actual' && (
                            <span className="ml-1 text-[10px] text-emerald-600 font-medium">✓</span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{fmtUsd(a.spotify_revenue_usd)}</td>
                        <td className="text-right tabular-nums">{fmtUsd(a.youtube_revenue_usd)}</td>
                        <td className="text-right tabular-nums font-medium">{fmtUsd(a.gross_streaming_revenue_usd)}</td>
                        <td className="text-right tabular-nums">{fmtNgn(a.gross_streaming_revenue_ngn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[var(--nmas-muted)] mt-2 px-2">
                Showing the top {Math.min(50, artistRevenue.length)} of {artistRevenue.length} artists.
                Total across all {artistRevenue.length}:{' '}
                {fmtUsd(artistRevenue.reduce((sum, a) => sum + (a.gross_streaming_revenue_usd || 0), 0))}.
                The difference between this table and the overview figure is the artists not
                displayed here, not the unmeasured-uplift line.
              </p>
            </Section>
          </>
        )}

        {activeTab === 'export' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {summary.export_revenue.map((r, idx) => {
                const prev = idx > 0 ? summary.export_revenue[idx - 1] : null;
                const t = prev ? pctChange(r.gross_export_revenue_usd || 0, prev.gross_export_revenue_usd || 0) : null;
                return (
                  <StatCard
                    key={r.period}
                    title={periodLabel(r.period!)}
                    value={fmtUsd(r.gross_export_revenue_usd || 0)}
                    subtitle={fmtNgn(r.gross_export_revenue_ngn || 0)}
                    icon={Globe}
                    trend={t}
                  />
                );
              })}
            </div>

            <Section title="Domestic vs Export Revenue (All Periods)">
              <div className="nbs-card p-4">
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={summary.export_revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="L" tickFormatter={v => fmtUsd(v)} tick={{ fontSize: 11 }} width={80} />
                    <YAxis yAxisId="R" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={45} domain={[0, 100]} />
                    <Tooltip formatter={(v: unknown) => fmtUsd(Number(v))} labelFormatter={periodLabel} />
                    <Legend />
                    <Bar yAxisId="L" dataKey="domestic_revenue_usd" name="Domestic (observed)" fill="#b45309" stackId="rev" />
                    <Bar yAxisId="L" dataKey="gross_export_revenue_usd" name="Export (70%)" fill="#0f766e" stackId="rev" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="R" type="monotone" dataKey={() => 70} name="Export Share %" stroke="#1d4ed8" strokeWidth={2} dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <div className="grid lg:grid-cols-3 gap-4 mt-6">
              <div className="nbs-card p-4 lg:col-span-2">
                <h3 className="text-sm font-bold mb-3">Top 15 Export Earners ({periodLabel(selectedPeriod)})</h3>
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart data={exportArtists.slice(0, 15)} layout="vertical" margin={{ left: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis type="number" tickFormatter={v => fmtUsd(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="artist_name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={(v: unknown) => fmtUsd(Number(v))} />
                    <Bar dataKey="gross_export_revenue_usd" fill="#0f766e" radius={[0, 4, 4, 0]} name="Export (USD)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="nbs-card p-4">
                <h3 className="text-sm font-bold mb-3">Top Export Markets</h3>
                <p className="text-xs text-[var(--nmas-muted)] mb-3">
                  Destination countries from Chartmetric + SoundCharts "Where People Listen" data.
                </p>
                <ul className="space-y-2">
                  {[
                    { rank: 1, country: 'United States', share: '~30%', note: 'Diaspora + Afrobeats mainstream' },
                    { rank: 2, country: 'United Kingdom', share: '~20%', note: 'UK Afrobeats scene' },
                    { rank: 3, country: 'Ghana', share: '~15%', note: 'West African regional' },
                    { rank: 4, country: 'South Africa', share: '~10%', note: 'Sub-Saharan regional' },
                    { rank: 5, country: 'France', share: '~8%', note: 'Francophone Africa diaspora' },
                  ].map(m => (
                    <li key={m.rank} className="flex items-center justify-between border-b border-[var(--nmas-border)] pb-2 last:border-0">
                      <div>
                        <span className="text-xs text-[var(--nmas-muted)] mr-2">#{m.rank}</span>
                        <span className="font-medium">{m.country}</span>
                        <p className="text-[11px] text-[var(--nmas-muted)]">{m.note}</p>
                      </div>
                      <span className="text-sm font-semibold text-[var(--nmas-accent)]">{m.share}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Section title={`Per-Artist Export Breakdown — ${periodLabel(selectedPeriod)}`}>
              <div className="nbs-card overflow-x-auto">
                <table className="nbs-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Artist</th>
                      <th className="text-right">Total Streaming (USD)</th>
                      <th className="text-right">Domestic (observed)</th>
                      <th className="text-right">Export (observed, USD)</th>
                      <th className="text-right">Export (NGN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportArtists.slice(0, 50).map((a, i) => (
                      <tr key={`${a.artist_name}-${a.period}`}>
                        <td className="text-[var(--nmas-muted)]">{i + 1}</td>
                        <td className="font-medium">{a.artist_name}</td>
                        <td className="text-right tabular-nums">{fmtUsd(a.total_streaming_revenue_usd)}</td>
                        <td className="text-right tabular-nums text-[var(--nmas-muted)]">
                          {a.domestic_revenue_usd == null ? '—' : fmtUsd(a.domestic_revenue_usd)}
                        </td>
                        <td className="text-right tabular-nums font-medium">
                          {a.gross_export_revenue_usd == null ? '—' : fmtUsd(a.gross_export_revenue_usd)}
                        </td>
                        <td className="text-right tabular-nums">
                          {a.gross_export_revenue_ngn == null ? '—' : fmtNgn(a.gross_export_revenue_ngn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[var(--nmas-muted)] mt-2 px-2">
                Showing the top {Math.min(50, exportArtists.length)} of {exportArtists.length} artists.
                Total across all {exportArtists.length}:{' '}
                {fmtUsd(exportArtists.reduce((sum, a) => sum + (a.total_streaming_revenue_usd || 0), 0))}
                {' '}streaming,{' '}
                {fmtUsd(exportArtists.reduce((sum, a) => sum + (a.gross_export_revenue_usd || 0), 0))} export.
                A dash means the provider published no city breakdown for that quarter, so no
                domestic/export split was measured — it is not zero.
              </p>
              <p className="text-[11px] text-[var(--nmas-muted)] mt-1 px-2">
                Source: Chartmetric + Soundcharts. The split is the observed Nigerian city
                listener share for the quarter, not a fixed 70%. FX ₦1,500/USD.
              </p>
            </Section>
          </>
        )}

        {activeTab === 'employment' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.employment.map(r => (
                <div key={r.period} className="nbs-card p-4">
                  <p className="text-xs uppercase tracking-wider text-[var(--nmas-muted)] font-medium">{periodLabel(r.period!)}</p>
                  <p className="text-2xl font-bold mt-1">{(r.total_employment || 0).toLocaleString()}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-blue-600">♂ {(r.male || 0).toLocaleString()}</span>
                    <span className="text-pink-500">♀ {(r.female || 0).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <Section title="Employment Gender Distribution">
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="nbs-card p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={summary.employment}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                      <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} labelFormatter={periodLabel} />
                      <Legend />
                      <Bar dataKey="male" name="Male" fill={GENDER_COLORS[0]} />
                      <Bar dataKey="female" name="Female" fill={GENDER_COLORS[1]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="nbs-card p-4 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Male (62%)', value: curEmp?.male || 0 },
                          { name: 'Female (38%)', value: curEmp?.female || 0 },
                        ]}
                        cx="50%" cy="50%"
                        innerRadius={60} outerRadius={100}
                        dataKey="value"
                        label={({ name }) => name}
                      >
                        <Cell fill={GENDER_COLORS[0]} />
                        <Cell fill={GENDER_COLORS[1]} />
                      </Pie>
                      <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>
          </>
        )}

        {activeTab === 'costs' && (
          <>
            <Section title="Hosting & Production Costs per Quarter">
              <div className="nbs-card overflow-x-auto">
                <table className="nbs-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Category</th>
                      <th className="text-right">Cost (NGN)</th>
                      <th className="text-right">Cost (USD)</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.costs.length > 0 ? (
                      // We need full cost data, fetch it
                      <CostRows />
                    ) : (
                      <tr><td colSpan={5} className="text-center text-[var(--nmas-muted)]">No cost data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}

        {activeTab === 'artists' && (
          <>
            <Section title={`Artist Rankings — ${periodLabel(selectedPeriod)}`}>
              <div className="nbs-card p-4 mb-4">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topArtists} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nmas-border)" />
                    <XAxis type="number" tickFormatter={v => fmtUsd(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="artist_name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip
                      formatter={(v: unknown, name: unknown) => [
                        String(name) === 'gross_streaming_revenue_usd' ? fmtUsd(Number(v)) : fmtNum(Number(v)),
                        String(name) === 'gross_streaming_revenue_usd' ? 'Revenue' : String(name)
                      ]}
                    />
                    <Bar dataKey="gross_streaming_revenue_usd" fill="#0f766e" radius={[0, 4, 4, 0]} name="Revenue (USD)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="nbs-card overflow-x-auto">
                <table className="nbs-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Artist</th>
                      <th className="text-right">Revenue (USD)</th>
                      <th className="text-right">Spotify Listeners</th>
                      <th className="text-right">YouTube Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topArtists.map((a, i) => (
                      <tr key={a.artist_name}>
                        <td className="text-[var(--nmas-muted)]">{i + 1}</td>
                        <td className="font-medium">{a.artist_name}</td>
                        <td className="text-right tabular-nums font-medium">{fmtUsd(a.gross_streaming_revenue_usd)}</td>
                        <td className="text-right tabular-nums">{a.spotify_monthly_listeners.toLocaleString()}</td>
                        <td className="text-right tabular-nums">{a.youtube_actual_views.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-[var(--nmas-border)] py-4">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between text-xs text-[var(--nmas-muted)]">
          <span>Nigeria Music Analytics System (NMAS) — NBS Delivery Dashboard</span>
          <span>Source: Chartmetric + SoundCharts + WIPO 2025 methodology · 131 Artists · 850K+ Observations</span>
        </div>
      </footer>
    </div>
  );
}

// Sub-component for costs table (fetches full data)
function CostRows() {
  const [costs, setCosts] = useState<Record<string, string>[]>([]);
  useEffect(() => {
    void nbsJson<Record<string, string>[]>('costs').then(setCosts);
  }, []);
  return (
    <>
      {costs.map((r, i) => {
        const isTotal = (r.cost_category || '').includes('TOTAL');
        return (
          <tr key={i} className={isTotal ? 'bg-[var(--nmas-chip)] font-bold' : ''}>
            <td>{periodLabel(r.period || '')}</td>
            <td>{(r.cost_category || '').replace('=== PERIOD TOTAL ===', 'TOTAL')}</td>
            <td className="text-right tabular-nums">{fmtNgn(parseFloat(r.total_cost_ngn || '0'))}</td>
            <td className="text-right tabular-nums">{fmtUsd(parseFloat(r.total_cost_usd || '0'))}</td>
            <td className="text-xs text-[var(--nmas-muted)]">{r.source || ''}</td>
          </tr>
        );
      })}
    </>
  );
}
