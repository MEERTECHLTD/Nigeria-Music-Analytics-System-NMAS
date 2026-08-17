/**
 * PANEL 20 — Provider Expansion
 *
 * What the second provider changed. Three findings this console publishes are
 * superseded by it, and each is shown as was → now rather than quietly edited:
 *
 *   archive floor        Q1_2024 → Q1_2019. The floor was the headline finding of
 *                        the coverage matrix; it moved back five years.
 *   integrated sources   one → two, and this time quota, rate limit and archive
 *                        depth are recorded, which Panel 3 marked as never captured.
 *   listener geography   never collected → collected. Nigerian city-level listener
 *                        counts now exist, so the domestic/export split can rest on
 *                        an observation instead of five hardcoded percentages.
 *
 * The panel asserts nothing the artifact cannot support: a null renders as NOT
 * COLLECTED. Variables the incumbent could never reach (Boomplay, Audiomack, radio
 * airplay) are flagged as new capability rather than blended silently into the
 * existing series, because their history starts later than the series they join.
 */

import { useEffect, useMemo, useState } from 'react';
import { Callout, Figure, NotCollected, Section } from '../components/primitives';
import { DataTable } from '../components/DataTable';

interface VariableRow {
  variable_name: string;
  platform: string | null;
  unit: string | null;
  aggregation_rule: string | null;
  first_quarter: string | null;
  last_quarter: string | null;
  quarters_present: number;
  artists: number;
  observations: number;
  providers: string[];
  provider_earliest_year: number | null;
  new_capability: boolean;
  coverage_limitations: string | null;
}

interface ExportRow {
  period: string;
  domestic_listeners: number | null;
  total_listeners: number | null;
  export_listeners: number | null;
  export_share_pct: number | null;
  artists_reporting: number | null;
}

interface ProviderRow {
  name: string;
  role: string;
  archive_floor: string;
  auth: string;
  quota_total?: number;
  rate_limit_per_minute?: number;
  notes: string;
}

interface SupersedeRow {
  panel: string;
  was: string;
  now: string;
}

interface CityRow {
  city: string;
  listener_days: number;
}

interface ExtendedHistory {
  generated_utc: string;
  archive_floor: string | null;
  previous_archive_floor: string | null;
  periods_observed: string[];
  providers: ProviderRow[];
  variables: VariableRow[];
  domestic_vs_export: ExportRow[];
  resolution_summary: Record<string, number>;
  city_geography: {
    observation_dates: number;
    cities_observed: number;
    top_cities: CityRow[];
    note: string;
  };
  supersedes: SupersedeRow[];
}

const ADMITTED = ['exact_ng', 'ng_only', 'exact_no_country', 'exact_foreign'];

function useExtendedHistory() {
  const [state, setState] = useState<{
    data: ExtendedHistory | null;
    missing: boolean;
    loading: boolean;
  }>({ data: null, missing: false, loading: true });

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/console/extended-history.json', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data: ExtendedHistory) => {
        if (alive) setState({ data, missing: false, loading: false });
      })
      .catch(() => {
        // Absence, not failure: the artifact exists only once a merge has run.
        if (alive) setState({ data: null, missing: true, loading: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

export default function ProviderExpansion() {
  const { data, missing, loading } = useExtendedHistory();

  const newCapabilities = useMemo(
    () => (data?.variables ?? []).filter((v) => v.new_capability),
    [data],
  );
  const continued = useMemo(
    () => (data?.variables ?? []).filter((v) => !v.new_capability),
    [data],
  );
  const resolution = useMemo(
    () =>
      Object.entries(data?.resolution_summary ?? {}).map(([confidence, count]) => ({
        confidence,
        count,
        disposition: ADMITTED.includes(confidence) ? 'admitted' : 'held out',
      })),
    [data],
  );

  if (loading) {
    return (
      <Section title="Provider Expansion">
        <p>Loading…</p>
      </Section>
    );
  }

  if (missing || !data) {
    return (
      <Section title="Provider Expansion">
        <Callout status="unavailable" title="Artifact not generated yet">
          <code>extended-history.json</code> is written by{' '}
          <code>backend/scripts/merge_final_delivery.py</code> followed by{' '}
          <code>backend/scripts/generate_extended_console_api.py</code>. Until both have run,
          this panel has nothing to read.
        </Callout>
      </Section>
    );
  }

  const periods = data.periods_observed ?? [];

  return (
    <>
      <Section
        title="What the second provider changed"
        subtitle={`Generated ${data.generated_utc}`}
      >
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <Figure value={periods.length} label="Quarters observed" status="observed" unit="count" />
          <Figure value={data.variables.length} label="Variables" status="observed" unit="count" />
          <Figure
            value={newCapabilities.length}
            label="New capabilities"
            status="observed"
            unit="count"
          />
          <Figure
            value={data.city_geography.cities_observed}
            label="Nigerian cities"
            status="observed"
            unit="count"
          />
        </div>

        <p>
          Archive floor is now <strong>{data.archive_floor ?? '—'}</strong>
          {data.previous_archive_floor ? <> , previously {data.previous_archive_floor}.</> : '.'}{' '}
          Where both providers report the same artist, platform, variable and date, the
          Chartmetric figure is kept — it is the already-delivered number, and a merge must not
          silently restate figures NBS has already seen.
        </p>

        <DataTable<SupersedeRow>
          rows={data.supersedes}
          rowKey={(row) => row.panel}
          filename="superseded-findings"
          pageSize={null}
          caption="Findings this console published that the second provider overturns."
          columns={[
            { key: 'panel', header: 'Panel', value: (row) => row.panel },
            { key: 'was', header: 'Published finding', value: (row) => row.was },
            { key: 'now', header: 'Now', value: (row) => row.now },
          ]}
        />
      </Section>

      <Section title="Providers">
        <DataTable<ProviderRow>
          rows={data.providers}
          rowKey={(row) => row.name}
          filename="providers"
          pageSize={null}
          columns={[
            { key: 'name', header: 'Provider', value: (row) => row.name },
            { key: 'role', header: 'Role', value: (row) => row.role },
            { key: 'archive_floor', header: 'Archive floor', value: (row) => row.archive_floor },
            { key: 'auth', header: 'Auth', value: (row) => row.auth },
            {
              key: 'quota_total',
              header: 'Quota',
              numeric: true,
              value: (row) => row.quota_total ?? null,
              render: (row) =>
                row.quota_total ? (
                  <Figure value={row.quota_total} status="observed" unit="count" />
                ) : (
                  <NotCollected reason="Quota was never recorded for this provider." short />
                ),
            },
            {
              key: 'rate_limit_per_minute',
              header: 'Rate limit/min',
              numeric: true,
              value: (row) => row.rate_limit_per_minute ?? null,
              render: (row) =>
                row.rate_limit_per_minute ? (
                  <Figure value={row.rate_limit_per_minute} status="observed" unit="count" />
                ) : (
                  <NotCollected reason="Rate limit was never recorded." short />
                ),
            },
            { key: 'notes', header: 'Notes', value: (row) => row.notes },
          ]}
        />
      </Section>

      <Section
        title="New capability — unavailable from the incumbent"
        subtitle="Denied by the Chartmetric subscription (HTTP 401) or absent from it"
      >
        <p>
          Boomplay and Audiomack are primary Nigerian DSPs, and radio airplay was requested
          directly by NBS. Each series starts when the provider's own history starts, which is
          later than 2019 for several of them — that limitation travels with the row.
        </p>
        <DataTable<VariableRow>
          rows={newCapabilities}
          rowKey={(row) => row.variable_name}
          filename="new-capability-variables"
          pageSize={null}
          initialSort={{ key: 'observations', dir: 'desc' }}
          columns={[
            { key: 'variable_name', header: 'Variable', value: (row) => row.variable_name },
            { key: 'platform', header: 'Platform', value: (row) => row.platform ?? '' },
            { key: 'unit', header: 'Unit', value: (row) => row.unit ?? '' },
            { key: 'first_quarter', header: 'From', value: (row) => row.first_quarter ?? '' },
            { key: 'last_quarter', header: 'To', value: (row) => row.last_quarter ?? '' },
            {
              key: 'artists',
              header: 'Artists',
              numeric: true,
              value: (row) => row.artists,
              render: (row) => <Figure value={row.artists} status="observed" unit="count" />,
            },
            {
              key: 'observations',
              header: 'Observations',
              numeric: true,
              value: (row) => row.observations,
              render: (row) => <Figure value={row.observations} status="observed" unit="count" />,
            },
            {
              key: 'coverage_limitations',
              header: 'Limitation',
              value: (row) => row.coverage_limitations ?? '',
              render: (row) =>
                row.coverage_limitations ? (
                  <>{row.coverage_limitations}</>
                ) : (
                  <NotCollected reason="No limitation recorded for this variable." short />
                ),
            },
          ]}
        />
      </Section>

      <Section title="Domestic and export listeners">
        <p>
          Domestic is the sum of Nigerian city listeners the provider reports, so it is a lower
          bound and the export share is correspondingly an upper bound. It replaces five
          hardcoded market percentages with an observation.
        </p>
        <DataTable<ExportRow>
          rows={data.domestic_vs_export}
          rowKey={(row) => row.period}
          filename="domestic-vs-export"
          pageSize={null}
          emptyMessage="No city-level observations in the merged series yet."
          columns={[
            { key: 'period', header: 'Quarter', value: (row) => row.period },
            {
              key: 'domestic_listeners',
              header: 'Domestic (NG)',
              numeric: true,
              value: (row) => row.domestic_listeners,
              render: (row) => (
                <Figure
                  value={row.domestic_listeners}
                  status="observed"
                  unit="count"
                  reason="Sum of Nigerian city listeners reported by Soundcharts."
                />
              ),
            },
            {
              key: 'total_listeners',
              header: 'Total',
              numeric: true,
              value: (row) => row.total_listeners,
              render: (row) => <Figure value={row.total_listeners} status="observed" unit="count" />,
            },
            {
              key: 'export_share_pct',
              header: 'Export share',
              numeric: true,
              value: (row) => row.export_share_pct,
              render: (row) => (
                <Figure
                  value={row.export_share_pct}
                  status="derived"
                  unit="pct"
                  precision={2}
                  reason="Total less domestic, over total. Upper bound, because domestic is a lower bound."
                />
              ),
            },
            {
              key: 'artists_reporting',
              header: 'Artists reporting',
              numeric: true,
              value: (row) => row.artists_reporting,
              render: (row) => (
                <Figure value={row.artists_reporting} status="observed" unit="count" />
              ),
            },
          ]}
        />
      </Section>

      <Section title="Nigerian cities observed" subtitle={data.city_geography.note}>
        <DataTable<CityRow>
          rows={data.city_geography.top_cities}
          rowKey={(row) => row.city}
          filename="nigerian-cities"
          initialSort={{ key: 'listener_days', dir: 'desc' }}
          columns={[
            { key: 'city', header: 'City', value: (row) => row.city },
            {
              key: 'listener_days',
              header: 'Listener-days',
              numeric: true,
              value: (row) => row.listener_days,
              render: (row) => (
                <Figure
                  value={row.listener_days}
                  status="observed"
                  unit="count"
                  reason="Sum of daily listener values, so a listener-day quantity rather than a headcount."
                />
              ),
            },
          ]}
        />
      </Section>

      <Section title="Continued series — both providers">
        <DataTable<VariableRow>
          rows={continued}
          rowKey={(row) => row.variable_name}
          filename="continued-variables"
          initialSort={{ key: 'observations', dir: 'desc' }}
          columns={[
            { key: 'variable_name', header: 'Variable', value: (row) => row.variable_name },
            { key: 'first_quarter', header: 'From', value: (row) => row.first_quarter ?? '' },
            { key: 'last_quarter', header: 'To', value: (row) => row.last_quarter ?? '' },
            {
              key: 'quarters_present',
              header: 'Quarters',
              numeric: true,
              value: (row) => row.quarters_present,
            },
            {
              key: 'providers',
              header: 'Providers',
              value: (row) => row.providers.join(' + '),
            },
            {
              key: 'observations',
              header: 'Observations',
              numeric: true,
              value: (row) => row.observations,
              render: (row) => <Figure value={row.observations} status="observed" unit="count" />,
            },
          ]}
        />
      </Section>

      <Section title="Entity resolution">
        <p>
          Names were matched to provider UUIDs and adjudicated on exact-name agreement and
          country. An exact name match is admitted whatever country the provider reports — it is
          blank for many Nigerian artists and set to a diaspora country for others (Aṣa FR,
          Crayon FR, Nonso Amadi CA, Maleek Berry GB), while the population frame, built from
          Nigerian sources, is the authority on who is in scope. Ambiguous and unmatched names
          are held out of the series rather than guessed: a wrong artist is worse than a missing
          one.
        </p>
        <DataTable<{ confidence: string; count: number; disposition: string }>
          rows={resolution}
          rowKey={(row) => row.confidence}
          filename="entity-resolution-summary"
          pageSize={null}
          initialSort={{ key: 'count', dir: 'desc' }}
          columns={[
            { key: 'confidence', header: 'Confidence class', value: (row) => row.confidence },
            {
              key: 'count',
              header: 'Artists',
              numeric: true,
              value: (row) => row.count,
              render: (row) => <Figure value={row.count} status="observed" unit="count" />,
            },
            { key: 'disposition', header: 'Disposition', value: (row) => row.disposition },
          ]}
        />
      </Section>
    </>
  );
}
