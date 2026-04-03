# NMAS Month 1 Audit

## Source Of Truth Reviewed

- [`NBS Extraction Brief.pdf`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/NBS%20Extraction%20Brief.pdf)
- [`NMAS_Technical_Response_v2.pdf`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/NMAS_Technical_Response_v2.pdf)
- [`NMAS_Sample Deliverable.pdf`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/NMAS_Sample%20Deliverable.pdf)
- [`NMAS METHODOLOGY  NBS RESPONSE.docx`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/NMAS%20METHODOLOGY%20%20NBS%20RESPONSE.docx)
- [`Post Hackathon v2.pdf`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/Post%20Hackathon%20v2.pdf)
- [`Structure - Post Hackathon.pdf`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/Structure%20-%20Post%20Hackathon.pdf)

## Current System Summary

The current repository is a demo-oriented analytics prototype. Its active behavior is centered on:

- multi-source scraping and public APIs (`backend/harvesters`, `backend/pipeline.py`)
- placeholder GDP, jobs, and export formulas (`backend/model.py`)
- synthetic KPI/trend endpoints (`backend/main.py`)
- Gemini chat and TurnTable chart routes unrelated to Month 1 delivery (`backend/ai_engine.py`, `backend/main.py`)
- a dashboard-first frontend focused on economic storytelling rather than extraction operations (`frontend/src/pages/*`)
- a minimal snapshot schema with only `PlatformSnapshot` and `Track` tables (`backend/storage.py`)

## What Exists Now

### Backend

- FastAPI app with health, KPI, trend, platform listing, harvest, AI chat, and TurnTable chart endpoints.
- SQLModel persistence for scraped platform snapshots and tracks.
- Basic in-memory HTTP request rate limiting for inbound NMAS API traffic, not provider extraction throttling.
- A pluggable harvester registry for Apple Music, Deezer, Boomplay, Audiomack, and TurnTable.
- No Chartmetric connector, no raw payload archive, no extraction job engine, no checkpoint resume, no methodology generator, and no export package builder.

### Frontend

- React + Tailwind dashboard with tabs for overview, trends, artists, economic impact, sources, data management, settings, and Beats AI.
- Current pages are tied to legacy prototype endpoints and placeholder values.
- No operator workflow for entity upload, mapping review, extraction launch, checkpoint monitoring, raw payload inspection, or export generation.

### Data Model

- Two tables only:
  - `platformsnapshot`
  - `track`
- No first-class artists, entity mappings, raw API payloads, observations, job runs, failures, limitations, or export artifacts.

### Infrastructure

- Current deployment assets target Render and Render Postgres.
- Current source docs say Month 1 is `Chartmetric + DigitalOcean`, with SoundCharts deferred.
- Existing env templates expose YouTube, Spotify, and Gemini keys rather than Chartmetric credentials and export storage settings.

## Reuse Candidates

- FastAPI and React foundations can be reused.
- SQLModel and Alembic remain appropriate for a typed relational core.
- Existing repo structure is serviceable.
- Some utility concepts are reusable in spirit only:
  - central configuration loading
  - health endpoint
  - simple frontend API wrapper pattern

## Prototype-Only Or Invalid For NBS Delivery

- GDP, jobs, and export calculations in [`backend/model.py`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/backend/model.py) are hard-coded assumptions and cannot be treated as observed data.
- KPI and trend endpoints in [`backend/main.py`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/backend/main.py) are synthetic.
- Multi-source scrape orchestration in [`backend/pipeline.py`](/Users/meertech/Documents/0x0/MUSIC%20AI/Nigeria%20Music%20Analytics%20System%20(NMAS)/backend/pipeline.py) conflicts with the Month 1 Chartmetric-only constraint.
- AI chat, Gemini integration, and TurnTable chart workflows are outside the Month 1 NBS core path.
- The current frontend emphasizes presentation and speculative economics instead of extraction operations and auditability.

## Mismatches With The NBS / ACET / Payment Documents

- Current live code is multi-source; Month 1 must be Chartmetric-only.
- Current live code estimates GDP/export/jobs directly; the documents require observed metrics first and explicit separation of unsupported derived economics.
- Current schema stores only normalized scrape snapshots; the brief requires raw payload persistence before normalization.
- Current app has no fact table export pipeline matching the 13-column NBS schema.
- Current app has no methodology note generation.
- Current app has no coverage-gap or limitation tracking.
- Current deployment assets are Render-oriented, while the agreed Month 1 budget docs point to DigitalOcean infrastructure.

## Document Conflicts That Must Be Handled In Code

- The extraction brief requires `Q4_2024`, `Q3_2025`, and `Q4_2025`.
- The methodology note includes NBS comments asking for `Q4_2025`, `Q1_2026`, and `Q1_2025`.
- `Post Hackathon v2.pdf` describes a two-month structure with Month 1 focused on `Q1 2025`.
- `Structure - Post Hackathon.pdf` describes an older three-month structure.

### Resolution

The rebuild should not hard-code one fixed quarter set. Period definitions must be configurable at job level, with document conflicts surfaced in extraction notes.

## Delivery Risks In The Current Repo

1. No Chartmetric connector exists at all.
2. No resumable extraction engine exists.
3. No raw payload archive exists, so there is no audit trail.
4. No provenance-preserving observation table exists.
5. No coverage-gap or limitation model exists.
6. No NBS-compliant deliverable generation exists.
7. Existing tests only validate prototype dashboard behavior.
8. Current deployment assumptions do not match the latest operating model.

## Audit Decision

The active NMAS application should be replaced with a Chartmetric-first extraction platform for Month 1. The old prototype code can remain in the repository as inactive historical context, but the active backend and frontend entrypoints must be switched to new operational flows centered on:

- entity universe management
- provider-safe extraction
- raw payload persistence
- normalized observations with provenance
- configurable reference periods
- quarterly aggregation
- methodology and limitation reporting
- export-ready NBS artifacts
