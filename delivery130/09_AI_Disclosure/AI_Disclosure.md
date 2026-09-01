# AI Disclosure — DELIVERY130

Generated 2026-08-31.

## What AI was used for

This package was assembled with substantial assistance from an AI coding assistant (Anthropic Claude, via Claude Code). Its role was to write and run the extraction, aggregation, revenue and verification code, and to audit that code's output.

## What AI did NOT do

- **No figure in this package was written by a language model.** Every number is computed by deterministic Python from provider data. Re-running the scripts on the same inputs reproduces the same output exactly.
- No value was estimated by a model's judgement. Where a figure is not observed it is derived by a stated arithmetic rule, and the row says so in `youtube_views_source` or `spotify_listeners_source`.
- No missing record was imagined. Absent data is left blank.

## Why this matters for the statistics

The pipeline is deterministic. The AI wrote the pipeline; the pipeline produced the numbers. That distinction is what makes the output auditable: a reviewer checks the arithmetic, not the assistant.

## Known limitation of this approach

Code written with AI assistance can carry defects like any other code. This package is therefore accompanied by an independent verification report (`07_Quality_Checks/`), and several defects found that way are documented there rather than being quietly corrected.
