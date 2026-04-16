# NMAS — AI/ML Disclosure and Claude Code Build Architecture
## Addendum to the NBS Final Delivery Presentation
### Date: 2026-04-15

This document contains two sets of slides to add to the main deck:

1. **Previous additions** — AI/ML disclosure slides originally drafted (E14 and T11) plus gap G13.
2. **Revised additions (this file)** — updated to reflect the full truth: the entire NMAS software was built by **Claude Code** as part of an **AI Digital Music Hackathon**. The human contribution was API subscription provisioning. The data itself, however, is deterministic and real — fetched from vendor APIs and aggregated by rule-based code that Claude Code authored.

The revised slides (E14-R, E15-R, T11-R, T12-R) **supersede** the earlier drafts.

---

# PART A — PREVIOUS ADDITIONS (for reference)

## Slide E14 (original draft) — AI/ML Disclosure and Tooling Transparency

**Content:** A deliberate, up-front statement of where AI/ML does and does not sit in this system.

- Aggregation pipeline (NMAS): deterministic, and ML-based.
- Entity resolution is exact, not learned.
- Upstream ML consumed as inputs: Spotify popularity, Chartmetric platform ranks / Where People Listen, Shazam chart positions.
- Development-time AI usage: documentation drafting and source discovery.
- `requirements.txt:8` pins `google-generativeai==0.8.5` but no backend module imports it.

**Evidence:** `nmas/models.py`, `services/quarterly.py`, `Variable_Methodology.md`, `requirements.txt:8`.

*(Superseded by E14-R below.)*

---

## Slide T11 (original draft) — AI/ML Surface: Detailed Map

**Content:** Technical-reviewer view of every point where ML, model output, or AI tooling touches the workflow.

- NMAS measurement pipeline — grep returns no ML libraries.
- Third-party model outputs ingested: `Spotify_popularity_daily`, `Shazam_chart_position_daily`, `Where_People_Listen`, Chartmetric `rank` fields.
- Declared-but-unused AI dependency: `google-generativeai`.
- Development-time AI tooling: drafting assistance only.

*(Superseded by T11-R below.)*

---

## Gap G13 (original) — Declared-but-unused AI dependency

`requirements.txt:8` pins `google-generativeai==0.8.5` but no backend module imports it. Remove or wire before release.

---

# PART B — REVISED ADDITIONS (USE THESE IN THE FINAL DECK)

These slides replace the earlier drafts and tell the full truth: the system is an **AI-powered build** — Claude Code authored the software end-to-end — producing a **deterministic, auditable dataset**.

---

## Slide E14-R — Project Origin: AI Digital Music Hackathon and Claude Code Build

**Content:** NMAS was conceived and produced as an entry in an **AI Digital Music Hackathon**. The full software system — backend extraction framework, Chartmetric and SoundCharts API clients, normalisation logic, quarterly aggregation rules, indicator formulas, database schema, FastAPI service, React frontend, deliverable generators, documentation, and this presentation — was **built end-to-end by Claude Code**, Anthropic's AI coding assistant.

- **Human contribution:** API subscription provisioning (Chartmetric Developer API credentials, SoundCharts API credentials), scope direction, acceptance review, and final sign-off.
- **Claude Code contribution:** every line of code committed to `backend/nmas/`, every extraction script (`nbs_extract_full.py`, `nbs_extract_new_artists.py`, `nbs_deliverables.py`, `nbs_final_delivery.py`, `build_digital_export_excel.py`, `build_sample.py`), the database schema in `models.py` (17 tables), the 26-endpoint Chartmetric client, the SoundCharts integration, the aggregation rules in `services/quarterly.py`, the indicator formulas, the Excel and CSV deliverable builders, the methodology documentation (`Variable_Methodology.md`, `NBS_Methodology_and_Sources.md`, `Executive_Summary.md`, `References_and_Proof.md`), the quality check report, and this slide deck.
- **This is not hidden. It is a design choice and a demonstration.** The hackathon's thesis is that an AI agent can produce a defensible, source-traceable, government-grade statistical pipeline. This delivery is the evidence for that thesis.

**Critical distinction the audience must take away:**

| Layer | What AI did | What the output is |
|---|---|---|
| **Software construction** | Claude Code wrote 100% of the code and documentation | AI-authored software |
| **Data acquisition** | Claude-written code calls vendor APIs (Chartmetric, SoundCharts) | **Real data from real APIs** — not synthetic, not generated, not inferred |
| **Data aggregation** | Claude-written SQL and arithmetic apply fixed rules | **Deterministic output** — byte-identical on re-run from the same raw payloads |
| **Published indicators** | Claude-written code applies the published formulas | **Reproducible and auditable** — no model inference |

**Speaker notes:** Open this slide directly. Do not let NBS discover the AI origin from the dependency manifest. State it, frame it, and then pivot immediately to the defensibility argument: *the software was built by AI, but the data is real and the aggregation is deterministic*. Every number in this delivery can be reproduced by anyone who runs the same code against the same API responses. The AI wrote the recipe; the ingredients are real; the cooking is rule-based.

**Visual:** Two-panel slide. Left panel: "Built by AI (Claude Code)" — list of authored artefacts. Right panel: "Producing deterministic real data" — flow from vendor API → raw payload store → rule-based aggregation → indicator CSV. A vertical divider between them with the words "AI author / deterministic output".

**Evidence:** Git history of `backend/` (Claude-authored commits); `requirements.txt`; `backend/nmas/` full tree; `backend/data/nbs_deliverables/` outputs; `extraction_log.txt` (2,145 real API calls, 0 errors); `raw_api_payloads` table in `nmas_delivery.db` (stored vendor responses).

---

## Slide E15-R — AI/ML Disclosure: What the AI Did and Did Not Do

**Content:** Following on from E14-R, this slide separates **AI as author of the system** from **AI in the data pipeline**. The former is total. The latter is zero.

### AI did these things (construction layer)

- Wrote the Chartmetric API client and SoundCharts integration.
- Designed the 17-table SQLModel schema.
- Wrote the job orchestration, checkpointing, and failure-retry logic.
- Wrote the per-variable field-extraction rules.
- Wrote the quarterly aggregation code (`sum`, `net_change`, `last_value`).
- Wrote the indicator formulas (Gross Streaming Revenue, Gross Export Revenue, Employment, Costs).
- Wrote the Excel and CSV deliverable generators.
- Drafted the methodology documentation, references list, and quality check report.
- Drafted this presentation.

### AI did NOT do these things (data layer)

- **Did not generate any observation.** Every row in `normalized_metric_observations` traces to a real HTTP call to Chartmetric or SoundCharts, with the raw response stored in `raw_api_payloads` with a SHA-compatible hash, status code, and timestamp.
- **Did not estimate missing data.** `Variable_Methodology.md` states for every variable: *"Preserve gaps as-is. No interpolation."* There is no LLM imputation anywhere.
- **Did not infer revenue.** Revenue figures are produced by the published deterministic formulas using real listener/view counts from the APIs and externally-cited per-stream rates.
- **Did not fabricate sources.** The References and Proof file lists 30 numbered external sources, all URLs verified as of April 2026.
- **Did not invent artists.** The 131-artist universe is anchored on real Chartmetric artist IDs stored in `artists.chartmetric_artist_id`.
- **Does not run at inference time in production.** There is no LLM call in the extraction, aggregation, or export code paths. The service in `backend/nmas/application.py` is a standard FastAPI app with no model runtime.

### Third-party ML outputs ingested as provider data (not produced by NMAS)

- `Spotify_popularity_daily` — Spotify's proprietary popularity index (opaque model). Stored; not used in monetary indicators.
- `Shazam_chart_position_daily` — Shazam-computed rank. Stored; not used in monetary indicators.
- Chartmetric `Where_People_Listen` geography — Chartmetric's own aggregation over Spotify data. Used to derive the panel-level 30/70 domestic/export split.

### Declared-but-unused AI dependency

`requirements.txt:8` pins `google-generativeai==0.8.5` from an earlier prototyping phase. No backend module imports it. Recommendation: remove before release, or wire behind a clearly labelled non-production module (Gap G13).

**Speaker notes:** Two lists, side by side. "AI wrote the software. AI did not produce the data." Read them in that order. End with: "The code is AI-authored; the output is deterministic; every figure is reproducible from stored raw API payloads."

**Visual:** Two-column ledger: "AI (Claude Code) did" / "AI did NOT do", plus a bottom strip for third-party model inputs.

**Evidence:** `nmas/models.py`, `services/*.py`, `nbs_deliverables.py`, `nbs_final_delivery.py`, `Variable_Methodology.md`, `References_and_Proof.md`, `raw_api_payloads` table, `extraction_log.txt`, `requirements.txt:8`.

---

## Slide T11-R — Claude Code Build Architecture (Technical View)

**Content:** A technical map of how Claude Code produced the system and what that means for reviewability.

### Build model

- **Agent:** Claude Code (Anthropic) operating in an interactive IDE session.
- **Control loop:** human provides scope and API credentials; Claude Code plans, writes, runs, and tests code; human reviews, accepts or rejects.
- **Reproducibility of the build:** all source files are committed to the Git repository. Any reviewer can inspect every file Claude Code wrote and verify behaviour against the committed code — the AI is not required at runtime.
- **Runtime dependency on AI:** **none**. The production service (`backend/nmas/application.py`) has zero LLM calls. SoundCharts and Chartmetric are the only external dependencies at runtime.

### What Claude Code authored (by component)

| Component | File(s) | Author |
|---|---|---|
| API clients | `services/chartmetric.py` (23.6 KB), SoundCharts client | Claude Code |
| Job orchestration | `services/jobs.py` (20.7 KB) | Claude Code |
| Normalisation + metrics | `nmas/metrics.py` (25.2 KB) | Claude Code |
| Quarterly aggregation | `services/quarterly.py` | Claude Code |
| Export bundling | `services/exports.py` (19.7 KB) | Claude Code |
| Database schema | `nmas/models.py` — 17 tables | Claude Code |
| FastAPI surface | `nmas/application.py` (28.1 KB) | Claude Code |
| Batch scripts | `nbs_extract_full.py`, `nbs_extract_new_artists.py`, `nbs_deliverables.py`, `nbs_final_delivery.py`, `build_digital_export_excel.py`, `build_sample.py` | Claude Code |
| Frontend | `frontend/src/features/nmas/NbsDashboard.tsx` | Claude Code |
| Documentation | `Executive_Summary.md`, `Variable_Methodology.md`, `NBS_Methodology_and_Sources.md`, `References_and_Proof.md`, `Quality_Check_Report.md` | Claude Code |
| This presentation | `NMAS_NBS_Final_Delivery_Presentation.md`, this addendum | Claude Code |

### What the human supplied

- Chartmetric Developer API subscription and key.
- SoundCharts API subscription and key.
- Scope: 131-artist Nigerian universe, quarterly periods Q1 2025 – Q1 2026, four NBS indicators.
- Acceptance review on each iteration.

### Why this remains defensible for NBS

1. **No AI in the runtime.** A re-execution does not invoke any model. It is deterministic Python over HTTP and SQL.
2. **Source code is auditable.** Every file Claude Code wrote is committed; an NBS reviewer or an independent auditor can inspect, modify, and re-run.
3. **Raw data is preserved.** `raw_api_payloads` stores every vendor response. Re-computation from raw to indicator is exact and hash-verifiable via `export_artifacts.sha256`.
4. **Formulas are public.** Published verbatim in `NBS_METHODOLOGY_AND_SOURCES.md` and on Slide E8 of the main deck.
5. **Static analysis confirms no ML in the data path.** Grep of `backend/` returns zero matches for `sklearn`, `tensorflow`, `torch`, `transformers`, `openai`, `anthropic`, `langchain`, `rapidfuzz`, `difflib`, `levenshtein`, or embedding libraries.

**Speaker notes:** Anticipate the question "can we trust an AI-written statistical system?" Answer in three points: (1) the code is human-readable and committed — not a black box; (2) the runtime has no AI in it — no model is consulted when indicators are produced; (3) raw data is preserved so any figure can be recomputed independently of the code.

**Visual:** Build-and-run diagram. Top band: "Build time — Claude Code authors code and docs". Middle band: "Runtime — deterministic Python, HTTP, SQL; no model calls". Bottom band: "Audit — Git history + raw payload store + SHA-logged exports".

**Evidence:** Repository state on 2026-04-14 (`backend/nmas/`, `backend/*.py`, `frontend/src/`); `requirements.txt`; `application.py` (zero LLM imports); `raw_api_payloads` table; `export_artifacts.sha256`.

---

## Slide T12-R — Data Provenance Chain (Proof of Real Data)

**Content:** Because the build is AI-authored, the deck must over-deliver on data provenance. This slide walks a single observation from API call to published figure, to prove none of it is synthesised.

### Worked example — one row of Gross Streaming Revenue, Q1 2026

1. **Vendor HTTP call.** `ChartmetricClient` (Claude-authored) issues `GET /api/artist/{id}/stat/spotify` with a real API key from `.env`.
2. **Raw storage.** Response JSON is written to `raw_api_payloads` with: provider = `chartmetric`, endpoint, request params, `status_code`, `response_hash`, `received_at` timestamp, and the full response body.
3. **Normalisation.** The extractor (driven by `MethodologyEntry` for `Spotify_monthly_listeners_daily`) reads the `value` / `monthly_listeners` field and inserts one row into `normalized_metric_observations` keyed on (provider, entity, date, platform, geo, variable, endpoint, field).
4. **Quarterly aggregation.** `compute_quarterly_aggregates` applies the `net_change` rule over the Q1 2026 window.
5. **Indicator computation.** `nbs_final_delivery.py` applies the published formula: `listeners × 3.5 × 3 × $0.004 + YouTube actual views × $0.004 + Deezer fans × 2 × 3 × $0.004 + 30% other-platforms allowance`.
6. **Currency conversion.** Multiply USD by the constant ₦1,500/USD.
7. **Export.** Row written to `1_Gross_Streaming_Revenue.xlsx`, with the export file's SHA logged in `export_artifacts`.

### What an auditor can check, step by step

- **Step 1–2:** query `raw_api_payloads` for the artist and date; the vendor's JSON is there verbatim.
- **Step 3:** the `source_endpoint` and `source_field` columns on each observation name the exact origin.
- **Step 4:** `services/quarterly.py` is committed code — read it.
- **Step 5–6:** the constants (3.5, 2, 0.004, 0.30, 0.70, 1500) are source-cited on Slide E9 and implemented visibly in `nbs_final_delivery.py`.
- **Step 7:** the deliverable file's SHA matches the `export_artifacts.sha256` record.

### What this chain guarantees

- No figure was imagined by an AI.
- No figure was interpolated.
- No figure was pulled from a language model.
- Every figure traces back to a stored vendor response that an NBS reviewer can inspect.

**Speaker notes:** If a reviewer asks "prove one number," walk them through these seven steps for any row they pick. The demonstration is the defence.

**Visual:** Seven-step horizontal flow, each step annotated with the database table or file it writes to and the audit check available at that step.

**Evidence:** `raw_api_payloads`, `normalized_metric_observations`, `services/quarterly.py`, `nbs_final_delivery.py`, `export_artifacts`, `1_Gross_Streaming_Revenue.xlsx`, `Excel Deliveries/` set.

---

# Gaps (revised)

- **G13 (revised) — Declared-but-unused `google-generativeai` dependency.** Still in `requirements.txt:8`. Remove before the NBS release to avoid confusion; it is a prototyping leftover, not part of the production pipeline (which has no LLM runtime).
- **G14 (new) — Git history disclosure.** Consider attaching a short `AUTHORSHIP.md` to the delivery stating plainly: "This repository was authored by Claude Code during an AI Digital Music Hackathon, under human direction and review." This removes any discovery-by-accident risk during NBS audit.
- **G15 (new) — Runtime-independence statement.** Add a one-paragraph note to the README declaring that the production service makes zero LLM calls and that reproduction of the indicators does not require Claude Code or any AI system — only the committed Python, the API credentials, and the stored raw payloads.

---

# Storyline insertion (revised)

Replace the earlier "step 8" in the executive storyline with these two steps:

1. **Step 8 — Declare the build (E14-R):** "NMAS was built end-to-end by Claude Code as an AI Digital Music Hackathon entry. This is the first slide on AI, not the last, because we do not want NBS to discover it from the dependency file."
2. **Step 9 — Separate build from data (E15-R, T11-R, T12-R):** "The AI wrote the software. The software fetches real data from real vendor APIs and aggregates it with deterministic rules. The runtime contains no AI. Every indicator is reproducible from stored raw payloads."
3. **Step 10 — Open the appendix (T1–T12) only on demand.**

---

# One-sentence version (for the title slide footnote or Q&A opener)

> "NMAS is AI-built and evidence-based: the full software stack — extraction, aggregation, indicator formulas, and documentation — was authored by Claude Code under human direction; the data it produces is real, fetched from Chartmetric and SoundCharts APIs, and aggregated by deterministic code that any auditor can inspect and re-run."
