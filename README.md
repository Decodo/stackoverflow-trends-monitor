# Stack Overflow Trends Monitor

[![](https://dcbadge.vercel.app/api/server/Ja8dqKgvbZ)](https://discord.gg/Ja8dqKgvbZ)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.2.5-black)
![License](https://img.shields.io/badge/license-MIT-green)

<p align="center">
<a href="https://dashboard.decodo.com/?page=residential-proxies&utm_source=socialorganic&utm_medium=social&utm_campaign=resi_trial_GITHUB"><img src="https://github.com/user-attachments/assets/60bb48bd-8dcc-48b2-82c9-a218e1e4449c"></a>
</p>

Stack Overflow Trends Monitor is an open-source research tool for discovering current Stack Overflow discussions, tracking technical topics over time, and turning question data into AI-powered reports on developer trends and pain points.

Research a specific topic or use **Explore trends** for a site-wide overview, then save research as a recurring monitor to track changes over time.

The tool combines the Stack Exchange API for broad discovery with headless Playwright and Decodo rotating [residential proxies](https://decodo.com/proxies/residential-proxies) for deeper thread research, keeping findings tied to the Stack Overflow questions that support them.

## Quick navigation

- [Key features](#key-features)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Site-wide trend discovery](#site-wide-stack-overflow-trend-discovery)
- [Tracking trends over time](#tracking-stack-overflow-trends-over-time)
- [Recurring monitoring](#recurring-stack-overflow-monitoring)
- [Research methodology](#research-methodology)
- [FAQ](#faq)

## Key features

- **Discover what developers are discussing now**. Explore current Stack Overflow trends across the platform without needing to know what to search for first.
- **Research specific technical topics**. Enter a keyword to uncover related discussions, recurring questions, developer pain points, and emerging signals.
- **Go beyond question metadata**. Selected questions are researched as full Stack Overflow threads, including answers and discussion.
- **Track topics over time**. Save recurring monitors to identify persistent questions, recurring themes, emerging signals, and topics that disappear from later samples.
- **Keep findings verifiable**. Reports link themes and insights back to the Stack Overflow questions that support them.
- **Export your research**. Download completed reports as Markdown or JSON for further analysis or use elsewhere.

## How it works

<img width="650" height="523" alt="Stack Overflow Trends Monitor demo" src="https://github.com/user-attachments/assets/6b8d6780-817d-48e7-8683-ff865e6e3d3f" />

1.  **Choose a research mode**. Enter a Stack Overflow topic or use
    **Explore trends** for site-wide discovery.
2.  **Configure the analysis**. Select a trend window, research depth,
   maximum question count, optional tag filters, and, if needed, a recurring schedule.
3.  **Retrieve Stack Overflow data**. The Stack Exchange API collects
    questions for the current and comparison periods or the selected
    site-wide rankings.
4.  **Filter for relevance**. The LLM separates directly relevant
    questions from adjacent and incidental matches.
5.  **Research selected threads**. Playwright opens promising questions
    through Decodo rotating residential proxies and retrieves the full
    thread for deeper analysis.
6.  **Generate the report**. The LLM combines quantitative signals with
    thread evidence to identify themes, pain points, emerging signals,
    and notable questions.
7.  **Track changes over time**. Save the configuration as a recurring
    monitor to build longitudinal history across later runs.
8.  **Export the results**. Download a completed report as Markdown or
    JSON.

### Example research output

Reports can be exported as Markdown or JSON. The example below is a shortened excerpt from a **Current trends** research run using **Thorough** research depth.

<details>
<summary>View example Markdown report</summary>

```markdown
# Stack Overflow Trends Report

**Topic:** Stack Overflow trends
**Run:** 2026-08-25

## Research basis

- 31 analyzed from 31 retrieved
- Scope · site-wide · week · rankings: 4/4
- Current sample · 2026-08-18 to 2026-08-25
- Analysis selection · 31 eligible · 31 selected for analysis · thorough research depth · deep dives: 15/15 successful
- Evidence depth · selected deep dives retrieved as full Stack Overflow threads through Playwright
- Top tags · c++ (7), python (4), android (2), c (2), css (2), dataframe (2), java (2), javascript (2)

### Highest engagement

- [Removing an unused class member slows down program?](https://stackoverflow.com/questions/79996455/removing-an-unused-class-member-slows-down-program) · 19 score · 1 answer · 538 views
- [Should (double)(std::float16_t(1024) + std::float16_t(1025)) be 2048.0 or 2049.0?](https://stackoverflow.com/questions/79996927/should-doublestdfloat16-t1024-stdfloat16-t1025-be-2048-0-or-2049-0) · 12 score · 3 answers · 877 views
- [How can I find a specific consecutive sequence of rows in SQL without MATCH_RECOGNIZE?](https://stackoverflow.com/questions/79997241/how-can-i-find-a-specific-consecutive-sequence-of-rows-in-sql-without-match-reco) · 5 score · 5 answers · 231 views

## Current trend summary

This week's retrieved Stack Overflow sample is dominated by C++ questions covering low-level performance behavior, floating-point precision with C++23 extended types, and compiler divergence on language-standard edge cases. Several C++ questions are the highest-engagement posts in the sample and have been present across multiple prior observation windows.

## Across previous runs

Six observation windows span August 14–25, 2026. Three C++ questions covering struct layout and 4K aliasing, `std::float16_t` precision, and `std::pair` trivial copyability first appeared in the August 21 window and remain present in the current August 25 window, representing recurrence across two overlapping windows from distinct authors.

- **C++ low-level performance and standard-library semantics** · recurring · recurring topic · high confidence · 3 distinct questions · 3 authors · observed on 4 dates
- **C++ compiler divergence on conversion function overload resolution** · recurring · recurring topic · single-author evidence · low confidence · 2 distinct questions · 1 author · observed on 3 dates
- **Java Gatherers API type inference and documentation friction** · not-observed · historical absence · low confidence · 2 distinct questions · 1 author · observed on 4 dates

## Discussion themes

### C++ language-lawyer: compiler divergence on conversion function overload resolution

Two questions from the same author investigate cases where MSVC, GCC, Clang, and EDG disagree on which conversion function to select when templated and non-templated overloads coexist. The evidence comes from a single author, which limits its strength as a signal of broad developer recurrence.

- Evidence strength · 2 distinct questions · 1 author · low evidence
- Evidence · [Better match conversion function when a templated member function is available](https://stackoverflow.com/questions/79997133/better-match-conversion-function-when-a-templated-member-function-is-available)
- Evidence · [Explicit call to conversion function treated differently than implicit call when using explicit object parameter](https://stackoverflow.com/questions/79997361/explicit-call-to-conversion-function-treated-differently-than-implicit-call-when)

...
```

</details>

## Prerequisites

Before installing the project, make sure you have:

- [Bun](https://bun.sh) 1.2.5 or newer
- [Docker](https://docker.com) or another Docker-compatible runtime
- Google Chrome, used by Playwright for full-thread research
- Decodo [residential proxy](https://decodo.com/proxies/residential-proxies) credentials
- At least one supported LLM provider API key:
  - Anthropic
  - OpenAI
  - Google Gemini

A Stack Exchange API key is not required for the current setup.

## Installation

### 1. Clone the repository

In your terminal, run:

``` bash
git clone https://github.com/Decodo/stackoverflow-trends-monitor.git
cd stackoverflow-trends-monitor
```

### 2. Install dependencies

``` bash
bun install
```

### 3. Set up Decodo residential proxies

The full-thread research stage requires Decodo residential proxy credentials. To set them up:

1. Register or log in to the [Decodo dashboard](https://dashboard.decodo.com/).
2. Go to [Residential proxies](https://dashboard.decodo.com/residential-proxies/pricing) and choose a plan or start a 3-day free trial.
3. Open **Proxy setup**.
4. Select a location or choose **Random**.
5. Select **Rotating** as the session type and choose **HTTP(S)** as the protocol.
6. Choose your authentication method.
7. Copy the generated proxy username and password. You'll add these credentials to the `.env` file in the next step.

### 4. Configure environment variables

Run this command in your terminal to create a local `.env` file from the provided example:

``` bash
cp .env.example .env
```

Open the newly created `.env` file in a text editor. Add your Decodo residential proxy username and password, then select an LLM provider and add its API key:

``` env
# Backend
PORT=5002
PUBLIC_API_BASE_URL=http://localhost:5002
PUBLIC_FRONTEND_URL=http://localhost:5274

# Database
MONGO_PORT=27018
REDIS_PORT=6378
MONGODB_URI=mongodb://localhost:27018/platform

# Decodo residential proxy
DECODO_PROXY_USERNAME=
DECODO_PROXY_PASSWORD=
DECODO_PROXY_HOST=gate.decodo.com
DECODO_PROXY_PORT=7000

# Playwright
PLAYWRIGHT_CHANNEL=chrome

# LLM provider: claude | openai | gemini
LLM_PROVIDER=claude
LLM_MODEL=

# API keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Only the API key for your selected `LLM_PROVIDER` is required. For example, if you use `LLM_PROVIDER=claude`, add your `ANTHROPIC_API_KEY` and leave the OpenAI and Gemini keys empty.

### 5. Start local databases

Make sure Docker Desktop (or another Docker-compatible runtime) is running, then start MongoDB and Redis with this command in your terminal:

```bash
bun db:up
```

### 6. Build the application

``` bash
bun run build
```

### 7. Start the application

``` bash
bun dev
```

Keep this terminal window open while using the application. Closing it stops the local frontend and backend.

To reach the frontend, open your browser and go to:

``` text
http://localhost:5274
```

The backend API runs at:

``` text
http://localhost:5002
```

## Configuration

### Research depth

| Setting       | Best for                                           |
|---------------|----------------------------------------------------|
| Focused       | Faster research with fewer full-thread deep dives  |
| Standard      | Balanced everyday analysis and the default setting |
| Thorough      | Broader secondary evidence                         |
| Comprehensive | Maximum useful coverage for deeper research        |

Higher research depth can increase analysis time, proxy usage, and LLM
usage.

### Stack Overflow tag filters

Tag filtering is disabled by default. Enable it when a broad topic needs
to be constrained to one or more Stack Overflow tags.

For example, researching `python` with the tags `python` and `django`
returns a much narrower sample than researching the keyword alone. Tags
are explicit user filters and are not automatically selected by the LLM.

## Site-wide Stack Overflow trend discovery

**Explore trends** requires no keyword. It combines four Stack Exchange
question rankings:

| Ranking  | Purpose                                                    |
|----------|------------------------------------------------------------|
| Hot      | Questions currently ranked by Stack Overflow's Hot formula |
| Week     | Questions in the weekly ranking                            |
| Votes    | Highest-voted questions created during the current week    |
| Activity | Recently active questions created during the current week  |

The tool also identifies frequently occurring tags in the weekly sample,
deep-dives into selected threads, and generates a broader report from
the retrieved trend sample.

The resulting metrics describe the retrieved sample rather than total
Stack Overflow activity.

## Tracking Stack Overflow trends over time

Topic research compares two equivalent periods. A **Past week** analysis
compares the current seven-day window with the preceding seven days,
while **Past month** uses equivalent monthly windows.

The report separates retrieved-sample activity from broader Stack
Overflow traffic. If collection reaches the configured cap, counts are
shown as lower bounds and percentage-change claims are suppressed rather
than extrapolated from incomplete data.

Recurring monitors add a second layer of analysis. Stored reports from
earlier observation dates let the tool distinguish between:

- **Persistent questions**, where the same Stack Overflow post remains
  visible across multiple runs.
- **Recurring topics**, where independent questions about the same issue
  appear across different observation dates.
- **Emerging signals**, where a coherent issue appears in the current
  sample but does not yet have enough history to establish recurrence.
- **Historical absence**, where a previously observed topic is not
  present in the current sample.

Repeated runs on the same calendar day are collapsed into one
longitudinal observation window so testing does not artificially
strengthen a trend.

## Recurring Stack Overflow monitoring

Any topic analysis can be saved as a recurring monitor. A monitor stores
its research configuration, including the topic, trend window, research
depth, question limit, tag filters, and cadence.

Supported schedules include:

- Custom intervals in hours
- Daily
- Weekly
- Monthly

The local NestJS backend checks for due monitors once per minute.
Automatic runs occur only while the backend and MongoDB are running, so
the included scheduler is intended for local or always-on deployments
rather than offline execution.

The **Monitors** view shows the saved configuration, next and previous
run times, and the status of the latest run. Monitors can also be run
manually, paused, or deleted.

## Research methodology

Broad Stack Overflow searches can contain incidental keyword matches, so
retrieved questions are classified before the report is synthesized.
Incidental matches are excluded from the main analysis, and
low-precision searches are flagged when fewer than half of retrieved
questions are directly relevant.

Established discussion themes and developer pain points require evidence
from multiple directly relevant questions. A single unusual question can
still appear as a notable question, but it is not promoted into a
recurring theme without supporting evidence.

For deeper research, the tool ranks useful questions by research value
and topical diversity. Playwright then opens a research-depth-dependent
selection of full Stack Overflow threads. A deep dive succeeds only
after the actual question DOM is available and any Cloudflare challenge
has cleared. Failed pages are retried with fresh browser contexts.

Reports disclose how many deep dives were attempted and completed. If no
full-thread retrieval succeeds, the report explicitly falls back to
API-only evidence.

## How this compares to Stack Overflow Trends and Data Explorer

| | Decodo Stack Overflow Trends Monitor | Official Stack Overflow Trends | Stack Exchange Data Explorer |
| --- | --- | --- | --- |
| **Current status** | Open-source and self-hosted | Retired in March 2026 | Available |
| **Topic monitoring** | Yes | Historical tag trends | Requires custom queries |
| **Recurring monitoring** | Yes | No | No built-in monitor workflow |
| **AI analysis** | Yes | No | No |
| **Full-thread research** | Yes | No | Query-dependent |
| **Longitudinal reports** | Yes | No | Requires custom analysis |
| **Markdown and JSON export** | Yes | No | Query results |

Stack Overflow Trends Monitor is not a replacement for every Data
Explorer use case. Data Explorer remains better suited to custom
SQL-style analysis of Stack Exchange data, while this project focuses on
repeatable topic research, monitoring, and evidence-based report
generation.

## Data retrieval and residential proxies

The tool uses a hybrid retrieval strategy.

The **Stack Exchange API** handles broad question discovery, comparison
periods, and site-wide rankings. The client honors API-requested backoff
periods, caches identical requests briefly, and retries transient
throttling or availability errors.

For deeper evidence, **Playwright** opens selected Stack Overflow
question pages through **Decodo rotating residential proxies**. Stack
Overflow pages may initially present a Cloudflare challenge. The scraper
waits for the real question DOM and retries failed pages with fresh
browser contexts rather than treating the initial response as usable
thread content.

This approach keeps broad discovery efficient while allowing the report
generator to analyze selected answers, comments, and full question
context.

## Tech stack

| Layer               | Technology                                                           |
|---------------------|----------------------------------------------------------------------|
| Frontend            | React 19, TanStack Router, TanStack Query, Tailwind CSS v4, Radix UI |
| Backend             | NestJS 11, MongoDB, Mongoose                                         |
| Discovery           | Stack Exchange API                                                   |
| Deep-dive retrieval | Playwright, Decodo rotating residential proxies                      |
| LLMs                | Anthropic Claude, OpenAI GPT, Google Gemini                          |
| Runtime             | Bun                                                                  |
| Local services      | Docker Compose, MongoDB, Redis                                       |

## Project structure

``` text
apps/
  backend/src/features/
    stackexchange/  Stack Exchange API discovery and rankings
    decodo/         Playwright thread retrieval through Decodo proxies
    tracker/        Topic comparison, trend discovery, deep dives, and reporting
    monitors/       Saved schedules and recurring execution
    queries/        Run history and longitudinal retrieval
    llm/            LLM provider abstraction and prompts
    settings/       API and model configuration

  frontend/src/features/
    tracker/        Topic analysis, site-wide trends, and reports
    monitors/       Recurring monitor controls
    queries/        History
    settings/       Runtime configuration
```

## Scripts

| Command         | Description                                    |
|-----------------|------------------------------------------------|
| `bun dev`       | Start frontend and backend development servers |
| `bun run build` | Build all application packages                 |
| `bun lint`      | Run linting across all packages                |
| `bun db:up`     | Start MongoDB and Redis through Docker Compose |
| `bun db:down`   | Stop local database containers                 |

## FAQ

### Is Stack Overflow Trends still available?

No. Stack Overflow retired its official Trends tool in March 2026. The Decodo Stack Overflow Trends Monitor is an open-source alternative focused on current topic research, recurring monitoring, question-volume comparisons, AI-generated analysis, and developer pain point detection rather than reproducing the retired interface exactly.

### How can I track Stack Overflow tag trends now that the official tool is retired?

Enter a broad topic, optionally constrain it with Stack Overflow tags,
and choose a weekly or monthly comparison window. Stack Overflow Trends
Monitor retrieves equivalent current and previous samples, reports
activity and tag signals, and can save the configuration as a recurring
monitor to build longitudinal history across later runs.

### Does this use the Stack Exchange API or web scraping?

Both. The Stack Exchange API handles broad question discovery, period
comparisons, and site-wide rankings. Selected questions are then opened
with a custom Playwright scraper through Decodo rotating residential
proxies so the analysis can use full thread context, including answers
and discussion that are not represented by basic question metadata
alone.

### What happens when the Stack Exchange API rate-limits a request?

The Stack Exchange API can request a backoff period or otherwise
throttle requests. The client honors requested backoff periods, caches
identical requests for one minute, and retries transient throttling or
availability failures. Site-wide discovery can continue when an
individual ranking source is temporarily unavailable, and the report
shows how many ranking sources were retrieved.

### Do I need a Decodo account?

Yes, for full-thread deep dives. The application uses Decodo residential
proxy credentials when Playwright opens selected Stack Overflow question
pages. Broad discovery comes from the Stack Exchange API, but the deeper
research stage depends on the configured residential proxy connection.

### How does this compare with the Stack Overflow Developer Survey?

The Developer Survey is a periodic survey of developers and their tools,
preferences, and demographics. Stack Overflow Trends Monitor instead
researches questions appearing on Stack Overflow during user-selected
time windows, making it useful for monitoring current technical
discussions and recurring developer problems rather than survey
responses.

## Related repositories

- [Forum Scraper](https://github.com/Decodo/Forum-scraper)
- [Decodo SDK for TypeScript](https://github.com/Decodo/sdk-ts)
- [Decodo MCP Server](https://github.com/Decodo/mcp-server)
- [Decodo OpenClaw
  Skill](https://github.com/Decodo/decodo-openclaw-skill)

## License

MIT – see [LICENSE](LICENSE).
