# Architecture

## Overview

Stack Overflow Scraper is a monorepo with a React frontend, NestJS backend, MongoDB history storage, and an LLM abstraction layer.

The existing Forum Scraper infrastructure is retained, but the Reddit-specific discovery model is replaced with Stack Overflow keyword monitoring and period-over-period comparison.

## Request flow

### POST `/tracker/plan`

1. The frontend submits `{ prompt, tags?, timeRange? }`.
2. `TrackerService.generatePlan()` asks the configured LLM for `{ keywords[], tags[], queries[], timeRange, rationale }`.
3. User-specified tags and time range override generated values.
4. The frontend lets the user review and edit the plan.

### POST `/tracker/analyze/stream`

1. The backend converts the selected time range into a current period and an immediately preceding period of equal length.
2. Every search query is run against both periods through `StackExchangeService.searchStackOverflow()` using the official Stack Exchange API.
3. Current-period questions are deduplicated and ranked by engagement.
4. Up to eight questions are opened in headless Playwright through Decodo rotating residential proxies and parsed in detail through `DecodoService.scrapeQuestion()`.
5. The LLM receives activity statistics plus the current questions, answers, and comments.
6. The final report is stored in MongoDB and streamed back to the frontend.

## Backend modules

### `decodo`

Runs headless Playwright through Decodo rotating residential proxies and contains Stack Overflow-specific HTML parsing.

- `scrapeQuestion()` opens a fresh browser context, waits for Cloudflare challenges to resolve, and retries failed pages up to three times.
- Success is determined by usable Stack Overflow question DOM content rather than the initial HTTP status.
- The parser extracts question text, tags, score, answers, and visible comments from the rendered page.

### `tracker`

Orchestrates plan generation, two-period scraping, ranking, deep dives, summarization, progress streaming, and persistence.

### `llm`

Supports Anthropic, OpenAI, and Gemini through the existing strategy abstraction. The Stack Overflow prompts focus on technical themes and developer pain points rather than general sentiment.

### `queries`

Stores the monitoring plan, collected current-period questions, activity statistics, report, and timestamps in MongoDB.

### `settings`

Keeps the existing runtime provider and API-key configuration behavior.

## Frontend flow

The tracker remains a three-step flow:

```text
input → plan review → trend report
```

The Stack Overflow version changes the controls and output:

- Input centers on a keyword or technical topic.
- Advanced settings use Stack Overflow tags rather than subreddits.
- Review shows keywords, tag filters, search variants, and the trend window.
- Report starts with period-over-period activity signals, followed by current themes, developer pain points, notable questions, and representative excerpts.


## Recurring monitors and historical memory

Recurring plans are stored in the `Monitor` MongoDB collection with a cadence, enabled state, `nextRunAt`, and the latest run metadata. `MonitorsService` polls once per minute while the backend is running and executes due monitors through the same `TrackerService` used by manual analysis.

Each successful analysis remains a separate `Query` history record. Scheduled and manual-monitor runs carry a `monitorId`, which gives the longitudinal analysis a stable history boundary. Before summarization, `TrackerService` retrieves up to eight earlier reports for that monitor and supplies their dates, activity statistics, summaries, themes, pain points, and prior longitudinal signals to the LLM.

The LLM does not maintain hidden application memory. Longitudinal conclusions are regenerated from stored MongoDB history on each run.

## Evidence integrity

Current-question synthesis is followed by an LLM evidence audit that maps each generated finding back to directly supporting question IDs. The backend then applies deterministic thresholds: discussion themes require at least two directly relevant current questions, pain points require at least one directly relevant question, and emerging signals require at least two directly relevant independent questions. Relevance classifications for the entire retrieved topic sample are preserved in JSON output for auditing.

Longitudinal analysis collapses same-day executions, deduplicates by Stack Overflow question ID, distinguishes persistent questions from recurring topics, and restricts directional movement to sufficiently spaced comparable observation windows. Weekly reports need at least seven days of observation span before growth or decline is eligible; monthly reports need at least 30 days.
