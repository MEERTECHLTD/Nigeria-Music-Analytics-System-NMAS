# NMAS Month 1 Target Architecture

## Delivery Goal

Provide a production-grade, Chartmetric-first extraction and reporting system for NBS Month 1 delivery, with strict traceability, resumable jobs, auditable exports, and future provider extensibility.

## Core Modules

### 1. Entity Universe

- artist registry
- track registry
- artist-track links
- platform account mappings
- manual overrides and verification status
- CSV import path for seed entity universe

### 2. Provider Layer

- provider interface with Chartmetric implementation
- token lifecycle management
- endpoint wrappers
- request validation
- request throttling
- retry and backoff
- raw response archiving

### 3. Extraction Orchestration

- extraction job definitions
- job runs
- checkpointed work units
- failure classification
- safe resume and idempotent re-run behavior

### 4. Storage Tiers

- raw API payloads
- normalized metric observations
- coverage gaps
- limitation flags
- methodology entries
- export artifacts
- audit logs

### 5. Reporting

- NBS fact table generation
- artist and track dimensions
- methodology markdown generation
- extraction notes
- coverage reports
- limitations reports
- quarterly rollups with QoQ and YoY comparisons

### 6. Operations Console

- entity upload and review
- job launch and monitoring
- export generation and artifact history
- raw payload inspection
- limitation and gap review

## Domain Tables

- `artists`
- `tracks`
- `artist_track_links`
- `platform_accounts`
- `entity_resolution_overrides`
- `raw_api_payloads`
- `extraction_jobs`
- `job_runs`
- `job_checkpoints`
- `job_failures`
- `normalized_metric_observations`
- `coverage_gaps`
- `limitation_flags`
- `methodology_entries`
- `export_artifacts`
- `audit_logs`

## Job Flow

1. Create a job with provider, period windows, entity scope, variables, and cadence.
2. Resolve entity universe into concrete work units.
3. For each work unit:
   - apply throttle
   - authenticate or refresh token if needed
   - request provider endpoint
   - persist raw payload
   - normalize observations
   - record limitations and gaps
   - write checkpoint
4. Aggregate quarterly outputs using metric-specific rules.
5. Generate export artifacts and notes.

## Aggregation Rules

- sum daily values for volume metrics
- last minus first for reach or balance-style proxies
- reject aggregation for incompatible variables
- compute QoQ and YoY only after metric rule validation

## Month 1 Observed Variable Set

- `Spotify_streams_daily`
- `YouTube_views_daily`
- `Pandora_streams_daily`
- `Shazam_counts_daily`
- `Shazam_chart_position_daily`
- `Spotify_monthly_listeners_daily`
- `Spotify_followers_daily`
- `Where_People_Listen_<city>`
- `YouTube_subscribers_daily`

## Handling Unsupported Economics

Observed Chartmetric data and derived economic indicators must remain separate.

- observed variables live in the fact table
- derived indicators must carry explicit formulas and assumptions
- unsupported GDP inputs remain placeholders or pending-methodology items
- no fabricated revenue, employment, or cost figures enter the observed dataset

## Configurability

- periods are configured per job
- throttling is environment-driven
- endpoint overrides are provider-configurable
- export directories are environment-driven
- future providers plug into the same provider interface
