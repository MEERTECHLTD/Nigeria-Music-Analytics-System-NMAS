import { ReactNode, startTransition, useEffect, useMemo, useState } from 'react';
import {
  Artist,
  CoverageGap,
  DashboardData,
  ExportArtifact,
  Job,
  JobRun,
  Limitation,
  MethodologyEntry,
  Observation,
  PeriodDefinition,
  QuarterlyAggregate,
  RawPayload,
  Track,
  createJob,
  generateExports,
  getArtists,
  getCoverageGaps,
  getDashboard,
  getDefaultPeriods,
  getExports,
  getJobRuns,
  getJobs,
  getLimitations,
  getMethodology,
  getObservations,
  getQuarterly,
  getRawPayloads,
  getTracks,
  importArtists,
  importTracks,
  observedVariables,
  retryFailedUnits,
  resumeJob,
  runJob,
  pauseJob,
  downloadExport,
} from '../../lib/api';

type TabKey = 'overview' | 'entities' | 'jobs' | 'outputs' | 'methodology';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'entities', label: 'Entities' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'outputs', label: 'Outputs' },
  { key: 'methodology', label: 'Methodology' },
];

const emptyScope = {
  artist_ids: [] as string[],
  track_ids: [] as string[],
  artist_statuses: ['verified', 'pending'],
  track_statuses: ['verified', 'pending'],
  include_tracks: true,
};

export function NbsConsole() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [exportsList, setExportsList] = useState<ExportArtifact[]>([]);
  const [methodology, setMethodology] = useState<MethodologyEntry[]>([]);
  const [artistCsv, setArtistCsv] = useState('artist_name,chartmetric_artist_id,country,status\nBurna Boy,441923,NG,verified');
  const [trackCsv, setTrackCsv] = useState('track_name,chartmetric_track_id,artist_name,status,is_top_track\nLast Last,58291034,Burna Boy,verified,true');
  const [jobName, setJobName] = useState('Month 1 Chartmetric Extraction');
  const [periods, setPeriods] = useState<PeriodDefinition[]>([]);
  const [selectedVariables, setSelectedVariables] = useState<string[]>(observedVariables);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([]);
  const [limitations, setLimitations] = useState<Limitation[]>([]);
  const [quarterly, setQuarterly] = useState<QuarterlyAggregate[]>([]);
  const [rawPayloads, setRawPayloads] = useState<RawPayload[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const deferredObservations = useMemo(() => observations.slice(0, 12), [observations]);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setJobRuns([]);
      setObservations([]);
      setCoverageGaps([]);
      setLimitations([]);
      setQuarterly([]);
      setRawPayloads([]);
      return;
    }

    void loadJobDetails(selectedJobId);
  }, [selectedJobId]);

  async function loadInitialData() {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, artistRows, trackRows, jobRows, exportRows, methodologyRows, defaultPeriods] =
        await Promise.all([
          getDashboard(),
          getArtists(),
          getTracks(),
          getJobs(),
          getExports(),
          getMethodology(),
          getDefaultPeriods(),
        ]);

      startTransition(() => {
        setDashboard(dashboardData);
        setArtists(artistRows);
        setTracks(trackRows);
        setJobs(jobRows);
        setExportsList(exportRows);
        setMethodology(methodologyRows);
        setPeriods(defaultPeriods);
        if (jobRows[0]) {
          setSelectedJobId(jobRows[0].id);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NMAS console');
    } finally {
      setLoading(false);
    }
  }

  async function loadJobDetails(jobId: string) {
    try {
      const [runs, obs, gaps, lims, quarterRows, payloads] = await Promise.all([
        getJobRuns(jobId),
        getObservations(jobId),
        getCoverageGaps(jobId),
        getLimitations(jobId),
        getQuarterly(jobId).catch(() => []),
        getRawPayloads(jobId),
      ]);
      startTransition(() => {
        setJobRuns(runs);
        setObservations(obs);
        setCoverageGaps(gaps);
        setLimitations(lims);
        setQuarterly(quarterRows);
        setRawPayloads(payloads);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job details');
    }
  }

  async function handleArtistImport() {
    setBusyAction('artists');
    try {
      await importArtists(artistCsv);
      await loadInitialData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Artist import failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTrackImport() {
    setBusyAction('tracks');
    try {
      await importTracks(trackCsv);
      await loadInitialData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Track import failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateJob() {
    setBusyAction('create-job');
    try {
      const created = await createJob({
        name: jobName,
        cadence: 'daily',
        periods,
        variable_names: selectedVariables,
        platform_names: [],
        entity_scope: emptyScope,
        configuration: {
          notes: 'Configurable periods retained to accommodate brief/payment document conflicts.',
        },
      });
      setSelectedJobId(created.id);
      await loadInitialData();
      setActiveTab('jobs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job creation failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunJob(jobId: string, mode: 'run' | 'resume') {
    setBusyAction(`${mode}:${jobId}`);
    try {
      if (mode === 'run') {
        await runJob(jobId);
      } else {
        await resumeJob(jobId);
      }
      await loadInitialData();
      await loadJobDetails(jobId);
      setSelectedJobId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Job ${mode} failed`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateExports() {
    if (!selectedJobId) return;
    setBusyAction(`export:${selectedJobId}`);
    try {
      await generateExports(selectedJobId);
      await loadInitialData();
      setActiveTab('outputs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export generation failed');
    } finally {
      setBusyAction(null);
    }
  }

  function toggleVariable(variableName: string) {
    setSelectedVariables((current) =>
      current.includes(variableName)
        ? current.filter((value) => value !== variableName)
        : [...current, variableName]
    );
  }

  if (loading) {
    return <div className="nmas-loading">Loading NMAS Month 1 console...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--nmas-bg)] text-[var(--nmas-ink)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-[var(--nmas-border)] bg-[var(--nmas-card)] p-6 shadow-[var(--nmas-shadow)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--nmas-accent)]">
                NBS Delivery Console
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                Chartmetric-first extraction, audit, and export operations for NMAS Month 1.
              </h1>
              <p className="max-w-3xl text-sm text-[var(--nmas-muted)] sm:text-base">
                Observed metrics stay separate from unsupported GDP estimations. Raw responses, normalized
                observations, limitations, and exports are all surfaced explicitly.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricPill label="Artists" value={dashboard?.artists_total ?? 0} />
              <MetricPill label="Tracks" value={dashboard?.tracks_total ?? 0} />
              <MetricPill label="Jobs" value={dashboard?.jobs_total ?? 0} />
              <MetricPill label="Observations" value={dashboard?.observations_total ?? 0} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-[var(--nmas-accent)] text-white'
                    : 'bg-white/60 text-[var(--nmas-ink)] hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr,0.75fr]">
            <Panel title="Current Audit State" subtitle="Live repository vs source-of-truth documents">
              <ul className="space-y-3 text-sm text-[var(--nmas-muted)]">
                <li>The old app is a GDP/chat prototype using placeholder formulas and multi-source scraping.</li>
                <li>Month 1 now requires Chartmetric only, raw-response persistence, resumable jobs, and auditable exports.</li>
                <li>The source documents conflict on quarter sets, so extraction periods remain configurable per job.</li>
                <li>Unsupported GDP variables stay outside the observed fact table until approved methodology exists.</li>
              </ul>
            </Panel>

            <Panel title="Provider Health" subtitle="Extraction guardrails">
              <dl className="grid gap-3 text-sm text-[var(--nmas-muted)]">
                <KeyValue label="Provider" value={dashboard?.provider.provider ?? 'chartmetric'} />
                <KeyValue label="Auth Mode" value={dashboard?.provider.auth_mode ?? 'static'} />
                <KeyValue label="Access Token" value={dashboard?.provider.access_token_configured ? 'Configured' : 'Missing'} />
                <KeyValue label="Refresh Token" value={dashboard?.provider.refresh_token_configured ? 'Configured' : 'Missing'} />
                <KeyValue label="Throttle" value={`${dashboard?.provider.throttle_seconds ?? 1}s/request`} />
                <KeyValue label="Retries" value={dashboard?.provider.max_retries ?? 0} />
              </dl>
            </Panel>

            <Panel title="Default Reference Periods" subtitle="Loaded from the current implementation">
              <div className="space-y-3">
                {periods.map((period) => (
                  <div key={period.label} className="rounded-2xl border border-[var(--nmas-border)] bg-white/70 px-4 py-3 text-sm">
                    <div className="font-medium text-[var(--nmas-ink)]">{period.label}</div>
                    <div className="text-[var(--nmas-muted)]">
                      {period.start_date} to {period.end_date}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Recent Export Artifacts" subtitle="Most recent bundle files">
              <div className="space-y-3 text-sm">
                {exportsList.slice(0, 6).map((artifact) => (
                  <div key={artifact.id} className="rounded-2xl border border-[var(--nmas-border)] bg-white/70 px-4 py-3">
                    <div className="font-medium">{artifact.export_type}</div>
                    <div className="text-[var(--nmas-muted)]">{artifact.file_path}</div>
                  </div>
                ))}
                {exportsList.length === 0 && <p className="text-[var(--nmas-muted)]">No exports generated yet.</p>}
              </div>
            </Panel>
          </div>
        )}

        {activeTab === 'entities' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Artist Universe Import" subtitle="Paste CSV with chartmetric_artist_id where available">
              <textarea
                value={artistCsv}
                onChange={(event) => setArtistCsv(event.target.value)}
                className="h-40 w-full rounded-2xl border border-[var(--nmas-border)] bg-white/80 p-4 text-sm outline-none"
              />
              <button
                onClick={handleArtistImport}
                disabled={busyAction === 'artists'}
                className="mt-4 rounded-full bg-[var(--nmas-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === 'artists' ? 'Importing...' : 'Import Artists'}
              </button>
            </Panel>

            <Panel title="Track Universe Import" subtitle="Paste CSV with chartmetric_track_id and artist mapping">
              <textarea
                value={trackCsv}
                onChange={(event) => setTrackCsv(event.target.value)}
                className="h-40 w-full rounded-2xl border border-[var(--nmas-border)] bg-white/80 p-4 text-sm outline-none"
              />
              <button
                onClick={handleTrackImport}
                disabled={busyAction === 'tracks'}
                className="mt-4 rounded-full bg-[var(--nmas-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === 'tracks' ? 'Importing...' : 'Import Tracks'}
              </button>
            </Panel>

            <Panel title="Artist Registry" subtitle="Current entity universe">
              <SimpleTable
                headers={['Artist', 'CM ID', 'Country', 'Status']}
                rows={artists.slice(0, 10).map((artist) => [
                  artist.artist_name,
                  artist.chartmetric_artist_id ?? 'Pending',
                  artist.country,
                  artist.status,
                ])}
                emptyMessage="No artists loaded yet."
              />
            </Panel>

            <Panel title="Track Registry" subtitle="Top tracks and linked entities">
              <SimpleTable
                headers={['Track', 'CM ID', 'Primary Artist', 'Status']}
                rows={tracks.slice(0, 10).map((track) => [
                  track.track_name,
                  track.chartmetric_track_id ?? 'Pending',
                  track.primary_artist_name ?? 'Unmapped',
                  track.status,
                ])}
                emptyMessage="No tracks loaded yet."
              />
            </Panel>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.1fr]">
            <Panel title="Create Extraction Job" subtitle="Periods stay configurable because the source documents conflict">
              <label className="block text-sm font-medium text-[var(--nmas-muted)]">Job Name</label>
              <input
                value={jobName}
                onChange={(event) => setJobName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--nmas-border)] bg-white/80 px-4 py-3 text-sm outline-none"
              />

              <div className="mt-5">
                <p className="text-sm font-medium text-[var(--nmas-muted)]">Observed Variables</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {observedVariables.map((variableName) => (
                    <button
                      key={variableName}
                      onClick={() => toggleVariable(variableName)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        selectedVariables.includes(variableName)
                          ? 'bg-[var(--nmas-accent)] text-white'
                          : 'bg-white/70 text-[var(--nmas-ink)]'
                      }`}
                    >
                      {variableName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {periods.map((period, index) => (
                  <div key={period.label} className="grid gap-3 rounded-2xl border border-[var(--nmas-border)] bg-white/70 p-4 sm:grid-cols-3">
                    <input
                      value={period.label}
                      onChange={(event) => {
                        const next = [...periods];
                        next[index] = { ...period, label: event.target.value };
                        setPeriods(next);
                      }}
                      className="rounded-xl border border-[var(--nmas-border)] bg-white px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="date"
                      value={period.start_date}
                      onChange={(event) => {
                        const next = [...periods];
                        next[index] = { ...period, start_date: event.target.value };
                        setPeriods(next);
                      }}
                      className="rounded-xl border border-[var(--nmas-border)] bg-white px-3 py-2 text-sm outline-none"
                    />
                    <input
                      type="date"
                      value={period.end_date}
                      onChange={(event) => {
                        const next = [...periods];
                        next[index] = { ...period, end_date: event.target.value };
                        setPeriods(next);
                      }}
                      className="rounded-xl border border-[var(--nmas-border)] bg-white px-3 py-2 text-sm outline-none"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleCreateJob}
                disabled={busyAction === 'create-job'}
                className="mt-5 rounded-full bg-[var(--nmas-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === 'create-job' ? 'Creating...' : 'Create Job'}
              </button>
            </Panel>

            <Panel title="Job Runs And Results" subtitle="Run, resume, and inspect delivery readiness">
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`rounded-3xl border px-4 py-4 transition ${
                      selectedJobId === job.id
                        ? 'border-[var(--nmas-accent)] bg-white'
                        : 'border-[var(--nmas-border)] bg-white/70'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <button onClick={() => setSelectedJobId(job.id)} className="text-left">
                          <h3 className="text-lg font-semibold">{job.name}</h3>
                        </button>
                        <p className="text-sm text-[var(--nmas-muted)]">
                          {job.variable_names.join(', ')}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--nmas-muted)]">
                          {job.status}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleRunJob(job.id, 'run')}
                          disabled={busyAction === `run:${job.id}`}
                          className="rounded-full bg-[var(--nmas-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {busyAction === `run:${job.id}` ? 'Running...' : 'Run'}
                        </button>
                        <button
                          onClick={() => handleRunJob(job.id, 'resume')}
                          disabled={busyAction === `resume:${job.id}`}
                          className="rounded-full border border-[var(--nmas-border)] bg-white px-4 py-2 text-sm font-medium"
                        >
                          {busyAction === `resume:${job.id}` ? 'Resuming...' : 'Resume'}
                        </button>
                        <button
                          onClick={async () => {
                            setBusyAction(`retry:${job.id}`);
                            try {
                              await retryFailedUnits(job.id);
                              await loadInitialData();
                              await loadJobDetails(job.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Retry failed');
                            } finally {
                              setBusyAction(null);
                            }
                          }}
                          disabled={busyAction === `retry:${job.id}`}
                          className="rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700"
                        >
                          {busyAction === `retry:${job.id}` ? 'Retrying...' : 'Retry Failed'}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await pauseJob(job.id);
                              await loadInitialData();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Pause failed');
                            }
                          }}
                          className="rounded-full border border-[var(--nmas-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--nmas-muted)]"
                        >
                          Pause
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {jobs.length === 0 && <p className="text-sm text-[var(--nmas-muted)]">Create the first extraction job to begin.</p>}
              </div>

              {selectedJobId && (
                <>
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--nmas-muted)]">
                      Selected Job Runs
                    </h4>
                    <SimpleTable
                      headers={['Started', 'Status', 'Completed', 'Skipped', 'Failed']}
                      rows={jobRuns.map((run) => [
                        formatTimestamp(run.started_at),
                        run.status,
                        run.completed_units,
                        run.skipped_units,
                        run.failed_units,
                      ])}
                      emptyMessage="No runs yet."
                    />
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={handleGenerateExports}
                      disabled={busyAction === `export:${selectedJobId}`}
                      className="rounded-full bg-[var(--nmas-ink)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busyAction === `export:${selectedJobId}` ? 'Generating...' : 'Generate Deliverables'}
                    </button>
                  </div>
                </>
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'outputs' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Latest Fact Rows" subtitle="Normalized observations with provenance">
              <SimpleTable
                headers={['Date', 'Entity', 'Variable', 'Value', 'Geo']}
                rows={deferredObservations.map((row) => [
                  row.observation_date,
                  row.entity_name,
                  row.variable_name,
                  `${row.variable_value} ${row.unit}`,
                  row.geo_label ? `${row.geo_scope}:${row.geo_label}` : row.geo_scope,
                ])}
                emptyMessage="No observations stored yet."
              />
            </Panel>

            <Panel title="Coverage And Limitation Review" subtitle="Explicitly surfaced gaps and substitutions">
              <div className="space-y-5">
                <div>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--nmas-muted)]">
                    Coverage Gaps
                  </h4>
                  <SimpleTable
                    headers={['Variable', 'Window', 'Reason']}
                    rows={coverageGaps.slice(0, 8).map((gap) => [
                      gap.variable_name,
                      `${gap.period_label}: ${gap.gap_start} to ${gap.gap_end}`,
                      gap.reason,
                    ])}
                    emptyMessage="No coverage gaps logged."
                  />
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--nmas-muted)]">
                    Limitations
                  </h4>
                  <SimpleTable
                    headers={['Variable', 'Code', 'Fallback']}
                    rows={limitations.slice(0, 8).map((item) => [
                      `${item.variable_name} (${item.period_label})`,
                      item.limitation_code,
                      item.fallback_applied ? 'Yes' : 'No',
                    ])}
                    emptyMessage="No limitations logged."
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Raw Payload Archive" subtitle="Recent provider responses stored before normalization">
              <SimpleTable
                headers={['Endpoint', 'Status', 'Attempts', 'Entity ID']}
                rows={rawPayloads.slice(0, 8).map((payload) => [
                  payload.endpoint,
                  payload.status_code ?? 'n/a',
                  payload.attempt_count,
                  payload.chartmetric_entity_id ?? 'n/a',
                ])}
                emptyMessage="No raw payloads archived yet."
              />
            </Panel>

            <Panel title="Export Artifact History" subtitle="Output bundle files on disk">
              <div className="space-y-3">
                {exportsList.slice(0, 12).map((artifact) => (
                  <div key={artifact.id} className="flex items-center justify-between rounded-2xl border border-[var(--nmas-border)] bg-white/70 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium">{artifact.export_type}.{artifact.format}</div>
                      <div className="text-xs text-[var(--nmas-muted)]">{artifact.record_count} rows</div>
                    </div>
                    <button
                      onClick={() => downloadExport(artifact.id)}
                      className="rounded-full border border-[var(--nmas-accent)] px-3 py-1.5 text-xs font-medium text-[var(--nmas-accent)]"
                    >
                      Download
                    </button>
                  </div>
                ))}
                {exportsList.length === 0 && <p className="text-sm text-[var(--nmas-muted)]">No export artifacts yet.</p>}
              </div>
            </Panel>
          </div>
        )}

        {activeTab === 'methodology' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
            <Panel title="Methodology Registry" subtitle="Observed variables and pending economic placeholders">
              <div className="space-y-4">
                {methodology.map((entry) => (
                  <div key={entry.variable_name} className="rounded-3xl border border-[var(--nmas-border)] bg-white/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">{entry.variable_name}</h3>
                      <span className="rounded-full bg-[var(--nmas-chip)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--nmas-accent)]">
                        {entry.methodology_status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--nmas-muted)]">{entry.definition}</p>
                    <p className="mt-3 text-xs text-[var(--nmas-muted)]">
                      Endpoint: {entry.endpoint} | Field: {entry.field_name} | Rule: {entry.aggregation_rule}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Quarterly Aggregation Preview" subtitle="QoQ and YoY output from observed fact rows">
              <SimpleTable
                headers={['Entity', 'Variable', 'Period', 'Value', 'QoQ']}
                rows={quarterly.slice(0, 12).map((row) => [
                  row.entity_name,
                  row.variable_name,
                  row.period_label,
                  `${row.aggregated_value} ${row.unit}`,
                  row.qoq_change ?? 'n/a',
                ])}
                emptyMessage="Run a job first to generate quarterly aggregates."
              />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3 text-center shadow-sm">
      <div className="text-xs uppercase tracking-[0.16em] text-[var(--nmas-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--nmas-ink)]">{value}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--nmas-border)] bg-[var(--nmas-card)] p-5 shadow-[var(--nmas-shadow)]">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--nmas-muted)]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--nmas-border)] bg-white/70 px-4 py-3">
      <dt>{label}</dt>
      <dd className="font-medium text-[var(--nmas-ink)]">{value}</dd>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: Array<Array<string | number | null>>;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--nmas-muted)]">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--nmas-border)]">
      <div className="grid bg-[var(--nmas-panel)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--nmas-muted)]" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
        {headers.map((header) => (
          <div key={header}>{header}</div>
        ))}
      </div>
      <div className="divide-y divide-[var(--nmas-border)] bg-white/75">
        {rows.map((row, index) => (
          <div key={`${row[0]}-${index}`} className="grid px-4 py-3 text-sm" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
            {row.map((cell, cellIndex) => (
              <div key={`${index}-${cellIndex}`} className="truncate pr-3 text-[var(--nmas-ink)]">
                {cell ?? 'n/a'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}
