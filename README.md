# Stack Overflow Scraper

Stack Overflow Scraper is an open-source monitoring tool for researching current Stack Overflow discussions, comparing topic activity over time, and using an LLM to summarize technical themes, developer pain points, and longer-term changes.

The working name is intentionally provisional and can be changed later.

## Features

- **Broad topic monitoring**. Search directly for a topic such as `python`, `javascript`, `docker`, or `api`.
- **Optional tag filters**. Tag filtering is off by default. Enable it only when you deliberately want to narrow results.
- **Fixed trend windows**. Choose the past week or past month. The app compares it with the immediately preceding window of the same length.
- **Site-wide trend discovery**. No query required. Explore Stack Overflow using its Hot, Week, Votes, and Activity rankings, plus frequently occurring tags in the weekly sample.
- **Relevance filtering**. Broad topic retrieval is classified as relevant, adjacent, or incidental before the report is synthesized. Incidental mentions are excluded from analysis.
- **Quantitative research signals**. Reports show analyzed sample size, top tags, and the highest-engagement questions alongside the LLM summary.
- **Adaptive question deep dives**. Playwright opens selected Stack Overflow threads headlessly through Decodo rotating residential proxies, waits for Cloudflare challenges to resolve, and retries failed pages with fresh browser contexts. A user-facing Research depth control adjusts the deep-dive budget from Focused through Comprehensive, with Standard as the default.
- **Evidence-linked findings**. Themes and pain points link back to supporting questions instead of collecting detached excerpts at the bottom of the report.
- **Recurring monitors**. Save a topic and rerun it daily, weekly, or monthly.
- **Stored trend memory**. MongoDB keeps earlier reports. New runs receive up to eight previous reports from the same monitor so the LLM can identify repeated themes, emerging subjects, growth, decline, or fading discussion.
- **History and export**. Successful runs are stored and can be exported as Markdown or JSON.

## Topic monitoring flow

1. Enter one broad topic.
2. Choose a weekly or monthly trend window.
3. Optionally enable Stack Overflow tag filters. Tags narrow the search and are never auto-applied.
4. Optionally save the topic as a recurring monitor.
5. The app searches the current and immediately preceding comparison periods through the Stack Exchange API.
6. The LLM classifies retrieved questions as relevant, adjacent, or incidental. Incidental mentions are excluded from synthesis.
7. The app calculates quantitative signals from the retained questions, including top tags and engagement.
8. Playwright opens a research-depth-dependent selection of current question threads through Decodo rotating residential proxies. Focused uses a smaller adaptive budget, Standard preserves the usual roughly eight-thread behavior, Thorough expands secondary evidence, and Comprehensive can investigate much more of the useful sample. A deep dive succeeds only when the actual `#question` DOM is available and the Cloudflare challenge is no longer active. Failed pages retry up to three times with fresh browser contexts.
9. The LLM generates findings, selects notable questions with an explicit reason, links findings to supporting questions, and compares the run with stored history when earlier runs exist.

There is no AI-generated scraping-plan step. Internally the user's topic is the search query. Tags are a separate, explicit filter rather than AI-selected query constraints.

## Site-wide trend discovery

Choose **Explore trends** without entering a keyword. The tool combines four official Stack Exchange question rankings:

- `hot` for questions currently ranked by Stack Overflow's Hot formula
- `week` for the Week ranking
- `votes` constrained to questions created in the past seven days
- `activity` constrained to questions created in the past seven days

It also counts the most frequent tags in the sampled Week-ranked questions, then deep-dives into selected threads and summarizes the broader discussion themes.

## Local testing

### Prerequisites

- Bun 1.2.5 or newer
- Docker Desktop or another Docker-compatible runtime
- Decodo residential proxy credentials
- At least one supported LLM API key: Anthropic, OpenAI, or Google Gemini

No Stack Exchange API key is required for the current test setup.

### Setup

```bash
bun install
cp .env.example .env
```

Add Decodo residential proxy credentials and at least one LLM key to `.env`, for example:

```env
DECODO_PROXY_USERNAME=your_proxy_username
DECODO_PROXY_PASSWORD=your_proxy_password
DECODO_PROXY_HOST=gate.decodo.com
DECODO_PROXY_PORT=7000
PLAYWRIGHT_CHANNEL=chrome
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your_anthropic_key
```

Then start Docker and the application:

```bash
bun db:up
bun dev
```

Open `http://localhost:5274`. The backend runs at `http://localhost:5002`.

### Suggested tests

For a topic monitor, start with `python`, `javascript`, or `docker`, use **Past week**, leave tag filters off, and run the analysis.

For broad discovery, click **Explore trends**. This requires no keyword.

## Scheduling behavior in this local version

Recurring schedules are persisted in MongoDB. The NestJS backend checks once per minute for monitors whose `nextRunAt` has passed.

Automatic runs therefore occur only while the backend and its database are running. This is suitable for local testing, but it is not an offline scheduler.

For a production version, the monitor runner should live in an always-on environment such as a cloud worker, cron service, or deployed backend. The complete workflow includes Stack Exchange API discovery, Playwright deep dives, history persistence, and LLM analysis, so the backend must be running for scheduled monitors to execute.

A later architecture could split collection from analysis: an always-on scheduled collector stores raw snapshots, while the LLM analyzes those snapshots when the user next opens the application.

## Historical analysis

For a recurring monitor, the report generator retrieves recent stored history tied to the same monitor ID. For unscheduled manual searches, it can compare earlier observations with the exact same topic. Multiple executions on the same calendar day are collapsed into one longitudinal observation window so repeated testing does not artificially strengthen a trend.

Question IDs are preserved in historical context. The analysis distinguishes a **persistent question** (the same post remains visible across observation dates) from a **recurring topic** (independent questions about the same problem appear across dates). Confidence is limited by the number of independent questions and observation dates.

Historical LLM conclusions are grounded only in stored data supplied by the application. They are not hidden model memory.

## Data retrieval

The tool uses the official Stack Exchange API for topic discovery, period comparison, and site-wide rankings. Selected question threads are then opened by headless Playwright through Decodo rotating residential proxies. Stack Overflow may initially return Cloudflare HTTP 403 / `Just a moment...`; the application waits for the real question DOM instead of treating that initial status as failure. Each failed thread gets up to three fresh-context attempts. Reports disclose how many deep dives were attempted and succeeded, and explicitly mark API-only analysis when none succeed.

The Stack Exchange client honors API-requested backoff periods, caches identical requests for one minute, retries transient throttling/unavailability errors, and lets site-wide trend discovery continue when an individual ranking is temporarily unavailable. The UI shows how many of the four ranking sources were successfully retrieved and explicitly marks unavailable panels.

Topic activity counts use the Stack Exchange response to detect when the configured collection cap has been reached. Capped counts are displayed as lower bounds such as `30+`, and the app suppresses percentage-change claims when either comparison period is capped.

## Scripts

| Command | Description |
| --- | --- |
| `bun dev` | Start frontend and backend development servers |
| `bun run build` | Build all packages |
| `bun lint` | Run linting |
| `bun db:up` | Start local databases |
| `bun db:down` | Stop local databases |

## Project structure

```text
apps/
  backend/src/features/
    stackexchange/ Stack Exchange API discovery and rankings
    decodo/        Stack Overflow thread retrieval and parsing
    tracker/       Comparison, trend discovery, deep dives, LLM reporting
    monitors/      Saved schedules and recurring execution
    queries/       Run history and historical retrieval
    llm/           Provider abstraction and prompts
    settings/      API and model configuration
  frontend/src/features/
    tracker/       Topic analysis, site-wide trends, and reports
    monitors/      Recurring monitor API hooks
    queries/       History API hooks
    settings/      Configuration
```

## Working repository name

The project currently uses `stackoverflow-scraper` as the working name until the final repository and SEO naming are decided.

## Research methodology notes

Topic reports classify retrieved questions as relevant, adjacent, or incidental before synthesis. Incidental matches are excluded. Established discussion themes should be supported by multiple directly relevant questions. Single novel posts may appear as neutral notable questions, while emerging signals require at least two directly relevant questions supporting the same pattern. Low-precision topic searches are flagged when fewer than half of retrieved questions are directly relevant, and the UI can reveal sample excluded questions with their classification reasons.

Site-wide metrics are explicitly described as properties of the retrieved trend sample rather than the whole Stack Overflow population. Ranking superlatives such as highest score, highest views, most answers, and highest research value are computed deterministically by the application instead of being invented by the LLM. Longitudinal evidence is deduplicated by question ID and same-day executions are collapsed before trend interpretation.

### Evidence-integrity safeguards

The report pipeline now performs a second evidence-validation pass before rendering discussion themes, developer pain points, or emerging signals. The validator may replace an incorrectly associated question ID with a better current question, and findings without enough directly relevant support are omitted rather than shown with weak evidence.

For topic searches, the JSON export also includes a relevance audit for every retrieved question, including its relevance class, classification reason, inclusion status, and research value when analyzed. Adjacent questions can support context but cannot establish a core-topic finding by themselves. The Highest engagement panel is restricted to directly relevant questions so broad or ambiguous searches do not elevate adjacent matches as representative topic results.

Activity percentages describe changes in the **retrieved sample** between equivalent current and preceding periods. They are not estimates of total Stack Overflow discussion volume. Comparisons are suppressed when either period could not be retrieved or when the collection cap prevents an exact percentage. When either comparison period contains fewer than 20 retrieved questions, the UI treats it as a low-volume comparison and does not present the percentage as a strong activity signal.

Longitudinal research distinguishes persistent questions from recurring topics. Runs on the same day are collapsed, and closely spaced rolling observation windows can support recurrence but not directional claims such as growing or declining. When rolling windows substantially overlap, the report says that evidence remains present across overlapping retrieval windows rather than implying stronger persistence across independent periods. For a weekly monitor, directional movement requires at least seven days of comparable observation coverage; monthly monitoring requires at least 30 days. Differences in query scope, tags, time range, or site-wide ranking coverage can also make directional comparison ineligible. The UI and Markdown export report the actual ineligibility reason instead of always repeating the minimum-day threshold.

Generated research language is instructed to treat Stack Overflow posts as developer reports rather than independent verification of universal product behavior or upstream bug status. Continued visibility of an old question is not evidence that a vendor or library issue remains unfixed outside the collected Stack Overflow material.


### Research run timestamps

Every completed research run stores one canonical timestamp. The UI shows it in the browser's local timezone, Markdown exports preserve the ISO timestamp, and JSON/history keep the same saved run time.

When a topic search retrieves more eligible questions than can be deeply analyzed, the final analysis sample is selected using both research value and topical diversity rather than simply taking the first or highest-engagement results. Empty themes or pain-point sections are valid research outcomes and are stated explicitly.

### Debugging Playwright deep dives

Deep dives use headless Playwright with Decodo residential proxy credentials. Successful challenge resolution is determined from rendered Stack Overflow DOM content, not the initial navigation HTTP status. Terminal logs include the attempt number, successful question ID, rendered HTML size, duration, and a final success/attempt summary.

If Chrome is installed normally on macOS, Windows, or Linux, keep `PLAYWRIGHT_CHANNEL=chrome`. To use Playwright-managed Chromium instead, install the browser separately and clear that setting.


## Structured evidence safeguards

The analysis pipeline passes deterministic accepted-answer metadata from full-thread Playwright deep dives, tracks author diversity across longitudinal evidence, and distinguishes repeat observations of the same question from topic recurrence across distinct questions and authors. Longitudinal evidence counts are explicitly aggregated across stored observation windows. Recurring-topic classification now requires independent supporting questions to first appear on different observation dates; repeated retrieval of the same supporting posts is labeled post persistence instead. These safeguards reduce unsupported LLM inferences while preserving the existing Playwright + Decodo residential retrieval flow. Singular/plural wording in longitudinal evidence is generated from the underlying counts so exported and on-screen report copy remains grammatically correct.

### Evidence and interface refinements

Current-run themes, pain points, and emerging signals now expose distinct-question count, author diversity, and an evidence-strength label. Deep-dived notable questions also expose deterministic resolution state (accepted answer, answered without acceptance, or unanswered). The analysis prompt distinguishes distinct question IDs from cross-developer recurrence and avoids duplicating the same claim as both a theme and a pain point unless the analytical roles are clearly different.

The frontend palette is inspired by Stack Overflow: neutral white/gray surfaces, blue interactive accents, and an orange brand accent, with a corresponding dark theme.

### v13 research refinements

Topic reports now flag low-precision queries below 50%, expose up to five excluded examples with classification reasons, restrict Highest engagement to directly relevant questions, and reserve the longitudinal `new` label for evidence first observed in the current window. A topic already seen in an earlier stored window and observed again is rendered as recurring rather than new.
