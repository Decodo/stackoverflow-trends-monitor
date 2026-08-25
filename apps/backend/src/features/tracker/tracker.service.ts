import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { DecodoService } from '../decodo/decodo.service';
import { StackExchangeService } from '../stackexchange/stackexchange.service';
import { QueriesService } from '../queries/queries.service';
import { EVIDENCE_VALIDATION_PROMPT, RELEVANCE_CLASSIFICATION_PROMPT, SUMMARIZATION_PROMPT } from '../llm/llm.constants';
import type { RelevanceLevel, ResearchDepth, ResearchSignals, ScrapingPlan, StackOverflowReport, TrendStat } from '../llm/llm.types';
import type { StackOverflowQuestion, StackOverflowQuestionDetail } from '../decodo/decodo.types';
import type { GeneratePlanDto } from './dto/generate-plan.dto';
import type { AnalyzePlanDto } from './dto/analyze-plan.dto';

const MAX_QUESTIONS_TOTAL = 40;
const TARGET_RELEVANT_QUESTIONS = 20;
const HARD_RETRIEVAL_LIMIT = 100;
const DEFAULT_RESEARCH_DEPTH: ResearchDepth = 'standard';

function researchDepthTarget(depth: ResearchDepth, candidateCount: number): number {
  const config: Record<ResearchDepth, { ratio: number; min: number; max: number }> = {
    focused: { ratio: 0.14, min: 4, max: 6 },
    standard: { ratio: 0.27, min: 6, max: 10 },
    thorough: { ratio: 0.48, min: 10, max: 16 },
    comprehensive: { ratio: 0.8, min: 16, max: 30 },
  };
  const selected = config[depth];
  const adaptive = Math.max(selected.min, Math.min(selected.max, Math.round(candidateCount * selected.ratio)));
  return Math.min(candidateCount, adaptive);
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function rangeDays(range: AnalyzePlanDto['timeRange']): number {
  return { day: 1, week: 7, month: 30, year: 365 }[range];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function makePeriods(range: AnalyzePlanDto['timeRange']) {
  const days = rangeDays(range);
  const currentEnd = new Date();
  const currentStart = new Date(currentEnd.getTime() - days * 86_400_000);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - days * 86_400_000);
  return {
    current: { start: isoDate(currentStart), end: isoDate(currentEnd) },
    previous: { start: isoDate(previousStart), end: isoDate(previousEnd) },
  };
}

function dedupe(questions: StackOverflowQuestion[]): StackOverflowQuestion[] {
  return [...new Map(questions.map((question) => [question.id, question])).values()];
}

function engagementScore(question: StackOverflowQuestion): number {
  return question.answerCount * 4 + question.score * 2 + Math.log10(Math.max(1, question.viewCount));
}

interface RelevanceClassification {
  questionId: string;
  level: RelevanceLevel;
  reason: string;
}

interface RawLongitudinalSignal {
  topic: string;
  direction: StackOverflowReport['longitudinal']['signals'][number]['direction'];
  evidence: string;
  evidenceQuestionIds?: string[];
}

interface EvidenceValidationResult {
  key: string;
  evidenceQuestionIds: string[];
  coherent?: boolean;
  reason?: string;
}

interface RawReport {
  executiveSummary: string;
  themes: Array<{ title: string; description: string; evidenceQuestionIds?: string[] }>;
  developerPainPoints: Array<{ title: string; description: string; evidenceQuestionIds?: string[] }>;
  emergingSignals?: Array<{ title: string; description: string; evidenceQuestionIds?: string[] }>;
  notableQuestions: Array<{ questionId: string; selectionReason?: string }>;
  longitudinal?: { summary: string; signals: RawLongitudinalSignal[] };
}

interface ObservationSnapshot {
  date: string;
  questionIds: string[];
  questions: Array<{ id: string; title: string; tags: string[]; author?: string }>;
  methodology?: ResearchSignals['methodology'];
  trendStats?: TrendStat[];
  executiveSummary?: string;
  themes?: StackOverflowReport['themes'];
  developerPainPoints?: StackOverflowReport['developerPainPoints'];
}

export type ProgressEvent =
  | { type: 'started'; totalTasks: number; queries: number; tags: number }
  | { type: 'task_complete'; completed: number; total: number; label: string }
  | { type: 'deep_diving'; posts: number }
  | { type: 'deep_dive_progress'; completed: number; total: number }
  | { type: 'selecting' }
  | { type: 'summarizing' }
  | { type: 'saving' };

export type OnProgress = (event: ProgressEvent) => void;
export type RunContext = { monitorId?: string; runType?: 'manual' | 'scheduled' | 'manual-monitor' };

export interface TrendingResult {
  id: string;
  generatedAt: string;
  buckets: Array<{
    key: 'hot' | 'week' | 'votes' | 'activity';
    label: string;
    questions: StackOverflowQuestion[];
    status: 'available' | 'unavailable';
  }>;
  frequentTags: Array<{ tag: string; count: number }>;
  researchSignals: ResearchSignals;
  report: StackOverflowReport;
}

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly decodoService: DecodoService,
    private readonly stackExchangeService: StackExchangeService,
    private readonly queriesService: QueriesService,
  ) {}

  async generatePlan(dto: GeneratePlanDto): Promise<ScrapingPlan> {
    const prompt = dto.prompt.trim();
    return {
      keywords: [prompt],
      tags: (dto.tags ?? []).map(normalizeTag).filter(Boolean),
      queries: [prompt],
      timeRange: dto.timeRange ?? 'week',
      rationale: '',
    };
  }

  async analyzePlan(
    dto: AnalyzePlanDto,
    onProgress?: OnProgress,
    signal?: AbortSignal,
    context: RunContext = {},
  ): Promise<{
    id: string;
    generatedAt: string;
    plan: AnalyzePlanDto;
    posts: StackOverflowQuestion[];
    trendStats: TrendStat[];
    researchSignals: ResearchSignals;
    report: StackOverflowReport;
  }> {
    const prompt = dto.prompt.trim();
    const query = prompt;
    const tags = (dto.tags ?? []).map(normalizeTag).filter(Boolean);
    const plan = {
      prompt,
      keywords: [prompt],
      tags,
      queries: [query],
      timeRange: dto.timeRange,
      maxPosts: dto.maxPosts,
      researchDepth: dto.researchDepth ?? DEFAULT_RESEARCH_DEPTH,
    } as AnalyzePlanDto;
    const effectiveContext: RunContext = { ...context, monitorId: context.monitorId ?? dto.monitorId };
    const periods = makePeriods(dto.timeRange);

    onProgress?.({ type: 'started', totalTasks: 2, queries: 1, tags: tags.length });

    let current: StackOverflowQuestion[] = [];
    let previous: StackOverflowQuestion[] = [];
    let currentHasMore = false;
    let previousHasMore = false;
    let currentAvailable = false;
    let previousAvailable = false;
    const failures: unknown[] = [];
    const analysisLimit = dto.maxPosts ?? MAX_QUESTIONS_TOTAL;
    // Retrieve a wider candidate pool than we ultimately analyze. Broad terms such as
    // "AI" can contain many incidental matches, so stopping at the analysis limit can
    // leave the report with only a handful of genuinely relevant questions.
    const retrievalLimit = Math.min(HARD_RETRIEVAL_LIMIT, Math.max(analysisLimit * 3, TARGET_RELEVANT_QUESTIONS * 3));

    for (const [periodName, period] of [['current', periods.current], ['previous', periods.previous]] as const) {
      try {
        const result = await this.stackExchangeService.searchStackOverflow(
          { query, tags, startDate: period.start, endDate: period.end, limit: retrievalLimit },
          signal,
        );
        if (periodName === 'current') {
          current = result.questions;
          currentHasMore = result.hasMore;
          currentAvailable = true;
        } else {
          previous = result.questions;
          previousHasMore = result.hasMore;
          previousAvailable = true;
        }
      } catch (error) {
        failures.push(error);
        this.logger.warn(`Search failed for ${periodName} period · ${query}: ${error instanceof Error ? error.message : String(error)}`);
      }
      onProgress?.({
        type: 'task_complete',
        completed: periodName === 'current' ? 1 : 2,
        total: 2,
        label: periodName === 'current' ? 'Current period collected' : 'Comparison period collected',
      });
    }

    if (!current.length) {
      if (failures.length) throw new HttpException('Could not retrieve Stack Overflow data. Try again shortly.', 502);
      throw new HttpException(
        tags.length
          ? 'No questions matched this topic and tag filter in the selected period. Try disabling the tag filter or using a broader topic.'
          : 'No questions matched this topic in the selected period. Try a broader topic or switch from the past week to the past month.',
        404,
      );
    }

    onProgress?.({ type: 'selecting' });
    const classifications = await this.classifyRelevance(prompt, current, signal);
    const classificationById = new Map(classifications.map((item) => [item.questionId, item]));
    const filtered = current.filter((question) => classificationById.get(question.id)?.level !== 'incidental');
    if (!filtered.length) {
      throw new HttpException('Questions were found, but they only mentioned this topic incidentally. Try a more specific topic or a longer time window.', 404);
    }
    const targetAnalysisCount = Math.min(analysisLimit, Math.max(TARGET_RELEVANT_QUESTIONS, classifications.filter((item) => item.level === 'relevant').length));
    const researchPosts = this.selectDiverseResearchSample(filtered, classificationById, targetAnalysisCount);

    const relevance = { relevant: 0, adjacent: 0, incidental: 0 };
    for (const question of current) {
      const level = classificationById.get(question.id)?.level ?? 'relevant';
      relevance[level] += 1;
    }
    const precisionPercent = current.length ? Math.round((relevance.relevant / current.length) * 100) : 0;
    const relevanceWithPrecision = {
      ...relevance,
      precisionPercent,
      precisionAssessment: precisionPercent < 50 ? 'low' as const : 'adequate' as const,
    };

    const trendStats = [this.buildTrendStat(prompt, current.length, previous.length, currentHasMore, previousHasMore, currentAvailable, previousAvailable)];
    const directlyRelevantPosts = researchPosts.filter((question) => classificationById.get(question.id)?.level === 'relevant');
    const researchSignals = this.buildResearchSignals(researchPosts, current.length, relevanceWithPrecision, {
      timeRange: dto.timeRange,
      query: prompt,
      tags,
      retrievalLimit,
      mode: 'topic',
      periodStart: periods.current.start,
      periodEnd: periods.current.end,
      comparisonStart: periods.previous.start,
      comparisonEnd: periods.previous.end,
      analysisVersion: 'research-method-v18',
      researchDepth: dto.researchDepth ?? DEFAULT_RESEARCH_DEPTH,
    }, directlyRelevantPosts);
    researchSignals.selection = {
      eligibleCount: filtered.length,
      selectedCount: researchPosts.length,
      researchDepth: dto.researchDepth ?? DEFAULT_RESEARCH_DEPTH,
      strategy: filtered.length > researchPosts.length ? 'research-value-plus-diversity' : 'all-eligible',
    };
    researchSignals.relevanceAudit = current.map((question) => ({
      questionId: question.id,
      title: question.title,
      level: classificationById.get(question.id)?.level ?? 'relevant',
      reason: classificationById.get(question.id)?.reason ?? 'No classification reason returned',
      includedInAnalysis: researchPosts.some((post) => post.id === question.id),
      researchValue: researchPosts.some((post) => post.id === question.id)
        ? this.computeResearchValue(question, researchPosts)
        : undefined,
    }));

    const deepDiveResult = await this.deepDive(researchPosts, dto.researchDepth ?? DEFAULT_RESEARCH_DEPTH, onProgress, signal);
    const details = deepDiveResult.details;
    if (researchSignals.selection) {
      researchSignals.selection.deepDiveTarget = deepDiveResult.attempted;
      researchSignals.selection.deepDiveCount = deepDiveResult.succeeded;
      researchSignals.selection.deepDiveAttempted = deepDiveResult.attempted;
      researchSignals.selection.deepDiveSucceeded = deepDiveResult.succeeded;
      researchSignals.selection.deepDiveFailed = deepDiveResult.failed;
      researchSignals.selection.deepDiveEvidenceMode = deepDiveResult.evidenceMode;
    }
    onProgress?.({ type: 'summarizing' });
    const history = await this.queriesService.findRecentHistory(prompt, effectiveContext.monitorId, 30);
    const report = await this.summarize(prompt, researchPosts, details, trendStats, researchSignals, history, signal, undefined, classifications);

    onProgress?.({ type: 'saving' });
    const saved = await this.queriesService.create({
      prompt,
      plan,
      posts: researchPosts,
      trendStats,
      researchSignals,
      report,
      monitorId: effectiveContext.monitorId,
      runType: effectiveContext.runType ?? (effectiveContext.monitorId ? 'manual-monitor' : 'manual'),
    });

    const generatedAt = new Date((saved as any).createdAt ?? Date.now()).toISOString();
    return { id: String(saved._id), generatedAt, plan, posts: researchPosts, trendStats, researchSignals, report };
  }

  async analyzeTrending(researchDepth: ResearchDepth = DEFAULT_RESEARCH_DEPTH, onProgress?: OnProgress, signal?: AbortSignal): Promise<TrendingResult> {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);
    const startDate = isoDate(sevenDaysAgo);
    const endDate = isoDate(today);

    onProgress?.({ type: 'started', totalTasks: 4, queries: 0, tags: 0 });

    const loadBucket = async (
      sort: 'hot' | 'week' | 'votes' | 'activity',
      options: { limit?: number; startDate?: string; endDate?: string },
      completed: number,
      successLabel: string,
    ): Promise<{ questions: StackOverflowQuestion[]; status: 'available' | 'unavailable' }> => {
      try {
        const questions = await this.stackExchangeService.getQuestions(sort, options, signal);
        onProgress?.({ type: 'task_complete', completed, total: 4, label: successLabel });
        return { questions, status: 'available' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Trending bucket ${sort} failed: ${message}`);
        onProgress?.({ type: 'task_complete', completed, total: 4, label: `${successLabel} (temporarily unavailable)` });
        return { questions: [], status: 'unavailable' };
      }
    };

    const hotResult = await loadBucket('hot', { limit: 10 }, 1, 'Hot questions collected');
    const weekResult = await loadBucket('week', { limit: 50 }, 2, 'Weekly ranking collected');
    const votesResult = await loadBucket('votes', { limit: 10, startDate, endDate }, 3, 'Highest-scored questions collected');
    const activityResult = await loadBucket('activity', { limit: 10, startDate, endDate }, 4, 'Most active questions collected');
    const hot = hotResult.questions;
    const weekSample = weekResult.questions;
    const votes = votesResult.questions;
    const activity = activityResult.questions;

    if (![hotResult, weekResult, votesResult, activityResult].some((bucket) => bucket.status === 'available')) {
      throw new ServiceUnavailableException('Stack Exchange API is temporarily unavailable for all trend rankings. Please try again shortly.');
    }

    const tagCounts = new Map<string, number>();
    for (const question of weekSample) {
      for (const tag of question.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const frequentTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));

    const buckets: TrendingResult['buckets'] = [
      { key: 'hot', label: 'Hot now', questions: hot.slice(0, 8), status: hotResult.status },
      { key: 'week', label: 'Week ranking', questions: weekSample.slice(0, 8), status: weekResult.status },
      { key: 'votes', label: 'Highest score this week', questions: votes.slice(0, 8), status: votesResult.status },
      { key: 'activity', label: 'Most active this week', questions: activity.slice(0, 8), status: activityResult.status },
    ];

    const posts = dedupe([...hot, ...weekSample.slice(0, 15), ...votes, ...activity])
      .sort((a, b) => engagementScore(b) - engagementScore(a))
      .slice(0, 40);
    const rankingsAvailable = buckets.filter((bucket) => bucket.status === 'available').length;
    const researchSignals = this.buildResearchSignals(posts, posts.length, undefined, { timeRange: 'week', query: 'Stack Overflow trends', tags: [], retrievalLimit: 40, mode: 'site-wide', rankingsAvailable, rankingsTotal: 4, periodStart: startDate, periodEnd: endDate, analysisVersion: 'research-method-v18', researchDepth });
    const deepDiveResult = await this.deepDive(posts, researchDepth, onProgress, signal);
    const details = deepDiveResult.details;
    researchSignals.selection = {
      eligibleCount: posts.length,
      selectedCount: posts.length,
      researchDepth,
      deepDiveTarget: deepDiveResult.attempted,
      deepDiveCount: deepDiveResult.succeeded,
      deepDiveAttempted: deepDiveResult.attempted,
      deepDiveSucceeded: deepDiveResult.succeeded,
      deepDiveFailed: deepDiveResult.failed,
      deepDiveEvidenceMode: deepDiveResult.evidenceMode,
      strategy: 'all-eligible',
    };
    onProgress?.({ type: 'summarizing' });
    const history = await this.queriesService.findRecentHistory('Stack Overflow trends', undefined, 30);
    const report = await this.summarize(
      'Stack Overflow trends',
      posts,
      details,
      [],
      researchSignals,
      history,
      signal,
      { frequentTags, buckets: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, questions: bucket.questions })) },
    );

    onProgress?.({ type: 'saving' });
    const saved = await this.queriesService.create({
      prompt: 'Stack Overflow trends',
      plan: { prompt: 'Stack Overflow trends', keywords: [], tags: [], queries: ['site-wide'], timeRange: 'week', researchDepth },
      posts,
      trendStats: [],
      researchSignals,
      report,
      runType: 'manual',
    });

    const generatedAt = new Date((saved as any).createdAt ?? Date.now()).toISOString();
    return { id: String(saved._id), generatedAt, buckets, frequentTags, researchSignals, report };
  }

  private buildTrendStat(
    query: string,
    currentCount: number,
    previousCount: number,
    currentIsLowerBound: boolean,
    previousIsLowerBound: boolean,
    currentAvailable = true,
    previousAvailable = true,
  ): TrendStat {
    if (!currentAvailable || !previousAvailable) {
      return { query, currentCount, previousCount, currentIsLowerBound, previousIsLowerBound, comparisonStatus: 'unavailable', changePercent: null, comparisonBasis: 'retrieved-sample', comparisonNote: 'One comparison period could not be retrieved.' };
    }
    if (currentIsLowerBound || previousIsLowerBound) {
      return { query, currentCount, previousCount, currentIsLowerBound, previousIsLowerBound, comparisonStatus: 'lower-bound', changePercent: null, comparisonBasis: 'retrieved-sample', comparisonNote: 'At least one period reached the retrieval limit.' };
    }
    if (previousCount === 0 && currentCount > 0) {
      return { query, currentCount, previousCount, currentIsLowerBound, previousIsLowerBound, comparisonStatus: 'new-activity', changePercent: null, comparisonBasis: 'retrieved-sample', comparisonNote: 'No matching questions were retrieved in the preceding equivalent period.' };
    }
    if (currentCount < 20 || previousCount < 20) {
      return { query, currentCount, previousCount, currentIsLowerBound, previousIsLowerBound, comparisonStatus: 'low-volume', changePercent: previousCount === 0 ? null : Math.round(((currentCount - previousCount) / previousCount) * 100), comparisonBasis: 'retrieved-sample', comparisonNote: 'Low-volume comparison: at least one period contains fewer than 20 retrieved questions, so the percentage is not treated as a strong activity signal.' };
    }
    return {
      query,
      currentCount,
      previousCount,
      currentIsLowerBound,
      previousIsLowerBound,
      comparisonStatus: 'comparable',
      changePercent: previousCount === 0 ? 0 : Math.round(((currentCount - previousCount) / previousCount) * 100),
      comparisonBasis: 'retrieved-sample',
      comparisonNote: 'Change in questions retrieved from equivalent current and preceding periods; not a site-wide volume estimate.',
    };
  }

  private computeResearchValue(question: StackOverflowQuestion, sample: StackOverflowQuestion[]): number {
    const rankedViews = [...sample].map((q) => q.viewCount).sort((a, b) => a - b);
    const viewRank = rankedViews.length <= 1 ? 1 : rankedViews.filter((v) => v <= question.viewCount).length / rankedViews.length;
    const scoreSignal = Math.max(-4, Math.min(8, question.score));
    const unresolved = question.answerCount === 0 ? 2 : 0;
    return Math.max(0, Math.min(100, Math.round(35 * viewRank + 7 * Math.min(question.answerCount, 4) + 3 * scoreSignal + unresolved + 25)));
  }


  private selectDiverseResearchSample(
    candidates: StackOverflowQuestion[],
    classificationById: Map<string, RelevanceClassification>,
    limit: number,
  ): StackOverflowQuestion[] {
    if (candidates.length <= limit) return [...candidates].sort((a, b) => this.computeResearchValue(b, candidates) - this.computeResearchValue(a, candidates));

    const tokenSet = (question: StackOverflowQuestion): Set<string> => {
      const titleTokens = question.title.toLowerCase().match(/[a-z0-9+#.]{3,}/g) ?? [];
      const stop = new Set(['with', 'from', 'this', 'that', 'what', 'when', 'where', 'which', 'does', 'have', 'using', 'into', 'about', 'after', 'before', 'error']);
      return new Set([...question.tags.map((tag) => `tag:${tag.toLowerCase()}`), ...titleTokens.filter((token) => !stop.has(token))]);
    };
    const sets = new Map(candidates.map((question) => [question.id, tokenSet(question)]));
    const similarity = (a: StackOverflowQuestion, b: StackOverflowQuestion): number => {
      const aa = sets.get(a.id) ?? new Set<string>();
      const bb = sets.get(b.id) ?? new Set<string>();
      if (!aa.size || !bb.size) return 0;
      let intersection = 0;
      for (const token of aa) if (bb.has(token)) intersection += 1;
      return intersection / (aa.size + bb.size - intersection);
    };
    const researchValues = new Map(candidates.map((question) => [question.id, this.computeResearchValue(question, candidates)]));
    const remaining = [...candidates];
    const selected: StackOverflowQuestion[] = [];

    while (remaining.length && selected.length < limit) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let index = 0; index < remaining.length; index += 1) {
        const question = remaining[index];
        const relevance = classificationById.get(question.id)?.level ?? 'relevant';
        const maxSimilarity = selected.length ? Math.max(...selected.map((picked) => similarity(question, picked))) : 0;
        const novelty = 1 - maxSimilarity;
        const score = (researchValues.get(question.id) ?? 0) + (relevance === 'relevant' ? 15 : 0) + novelty * 28 - maxSimilarity * 16;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      selected.push(remaining.splice(bestIndex, 1)[0]);
    }
    return selected;
  }

  private buildResearchSignals(
    posts: StackOverflowQuestion[],
    sampleSize: number,
    relevance?: ResearchSignals['relevance'],
    methodology?: ResearchSignals['methodology'],
    engagementPosts: StackOverflowQuestion[] = posts,
  ): ResearchSignals {
    const tagCounts = new Map<string, number>();
    for (const question of posts) {
      for (const tag of question.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const engagementSample = engagementPosts;
    const rankedViews = [...engagementSample].map((q) => q.viewCount).sort((a, b) => a - b);
    const researchValue = (question: StackOverflowQuestion) => this.computeResearchValue(question, engagementSample);
    const values = new Map(engagementSample.map((question) => [question.id, researchValue(question)]));
    const maxScore = engagementSample.length ? Math.max(...engagementSample.map((question) => question.score)) : 0;
    const maxViews = engagementSample.length ? Math.max(...engagementSample.map((question) => question.viewCount)) : 0;
    const maxAnswers = engagementSample.length ? Math.max(...engagementSample.map((question) => question.answerCount)) : 0;
    const maxResearchValue = engagementSample.length ? Math.max(...engagementSample.map((question) => values.get(question.id) ?? 0)) : 0;
    const highlightsFor = (question: StackOverflowQuestion): NonNullable<ResearchSignals['highestEngagement'][number]['highlights']> => {
      const highlights: NonNullable<ResearchSignals['highestEngagement'][number]['highlights']> = [];
      if (question.score === maxScore) highlights.push('highest-score');
      if (question.viewCount === maxViews) highlights.push('highest-views');
      if (question.answerCount === maxAnswers) highlights.push('most-answers');
      if ((values.get(question.id) ?? 0) === maxResearchValue) highlights.push('highest-research-value');
      return highlights;
    };
    return {
      sampleSize,
      analyzedCount: posts.length,
      relevance,
      methodology,
      topTags: [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count })),
      highestEngagement: [...engagementSample]
        .sort((a, b) => engagementScore(b) - engagementScore(a))
        .slice(0, 5)
        .map((question) => ({
          id: question.id,
          title: question.title,
          url: question.url,
          score: question.score,
          answerCount: question.answerCount,
          viewCount: question.viewCount,
          researchValue: values.get(question.id),
          viewPercentile: rankedViews.length ? Math.round(100 * rankedViews.filter((v) => v <= question.viewCount).length / rankedViews.length) : 0,
          highlights: highlightsFor(question),
        })),
    };
  }

  private async classifyRelevance(prompt: string, questions: StackOverflowQuestion[], signal?: AbortSignal): Promise<RelevanceClassification[]> {
    if (!questions.length) return [];
    try {
      const response = await this.llmService.complete(
        {
          messages: [
            { role: 'user', content: RELEVANCE_CLASSIFICATION_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                researchTopic: prompt,
                questions: questions.map((question) => ({
                  id: question.id,
                  title: question.title,
                  tags: question.tags,
                  excerpt: question.excerpt,
                })),
              }),
            },
          ],
          responseFormat: 'json',
        },
        signal,
      );
      const parsed = this.llmService.parseJsonResponse<{ classifications?: RelevanceClassification[] }>(response.content);
      const validLevels = new Set<RelevanceLevel>(['relevant', 'adjacent', 'incidental']);
      const byId = new Set(questions.map((question) => question.id));
      return (parsed.classifications ?? []).filter((item) => byId.has(String(item.questionId)) && validLevels.has(item.level));
    } catch (error) {
      this.logger.warn(`Relevance classification failed; keeping the broad result set: ${error instanceof Error ? error.message : String(error)}`);
      return questions.map((question) => ({ questionId: question.id, level: 'relevant', reason: 'Classification unavailable' }));
    }
  }

  private async deepDive(
    posts: StackOverflowQuestion[],
    researchDepth: ResearchDepth,
    onProgress?: OnProgress,
    signal?: AbortSignal,
  ): Promise<{ details: StackOverflowQuestionDetail[]; attempted: number; succeeded: number; failed: number; evidenceMode: 'full-thread' | 'partial-thread' | 'api-only' }> {
    const target = researchDepthTarget(researchDepth, posts.length);
    const candidates = posts.slice(0, target);
    onProgress?.({ type: 'deep_diving', posts: candidates.length });
    const details: StackOverflowQuestionDetail[] = [];

    const fetchDetail = async (question: StackOverflowQuestion): Promise<StackOverflowQuestionDetail> => {
      const detail = await this.decodoService.scrapeQuestion(question.url, signal);
      return {
        ...detail,
        ...question,
        body: detail.body,
        answers: detail.answers,
        comments: detail.comments,
        excerpt: detail.excerpt || question.excerpt,
      };
    };

    // Keep browser concurrency modest. Cloudflare challenge resolution proved more
    // reliable in sequential/small-batch tests than in large request bursts.
    for (let i = 0; i < candidates.length; i += 2) {
      const batch = candidates.slice(i, i + 2);
      const settled = await Promise.allSettled(batch.map(fetchDetail));
      settled.forEach((result, index) => {
        const question = batch[index];
        if (result.status === 'fulfilled') {
          details.push(result.value);
        } else {
          this.logger.warn(`Deep dive unavailable for ${question?.id} after Playwright residential retries: ${String(result.reason)}`);
        }
      });
      onProgress?.({ type: 'deep_dive_progress', completed: Math.min(i + batch.length, candidates.length), total: candidates.length });
    }

    const succeeded = details.length;
    const attempted = candidates.length;
    const failed = Math.max(0, attempted - succeeded);
    this.logger.log(`Deep dive summary · Playwright + Decodo residential · ${succeeded}/${attempted} succeeded · ${failed} failed`);

    return {
      details,
      attempted,
      succeeded,
      failed,
      evidenceMode: succeeded === 0 ? 'api-only' : succeeded === attempted ? 'full-thread' : 'partial-thread',
    };
  }

  private buildObservationHistory(history: any[]): ObservationSnapshot[] {
    const currentDate = isoDate(new Date());
    const byDate = new Map<string, any>();
    // History arrives newest first. Keep only the newest execution from each prior calendar day.
    for (const run of history) {
      const date = isoDate(new Date(run.createdAt));
      if (date === currentDate || byDate.has(date)) continue;
      byDate.set(date, run);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, run]) => ({
        date,
        questionIds: (run.posts ?? []).map((post: StackOverflowQuestion) => String(post.id)),
        questions: (run.posts ?? []).map((post: StackOverflowQuestion) => ({ id: String(post.id), title: post.title, tags: post.tags ?? [], author: post.author })),
        methodology: run.researchSignals?.methodology,
        trendStats: run.trendStats,
        executiveSummary: run.report?.executiveSummary,
        themes: run.report?.themes,
        developerPainPoints: run.report?.developerPainPoints,
      }));
  }

  private async summarize(
    prompt: string,
    posts: StackOverflowQuestion[],
    details: StackOverflowQuestionDetail[],
    trendStats: TrendStat[],
    researchSignals: ResearchSignals,
    history: any[],
    signal?: AbortSignal,
    discoveryContext?: unknown,
    classifications: RelevanceClassification[] = [],
  ): Promise<StackOverflowReport> {
    const classificationById = new Map(classifications.map((item) => [String(item.questionId), item]));
    const researchValueFor = (question: StackOverflowQuestion) => this.computeResearchValue(question, posts);
    const observations = this.buildObservationHistory(history);
    const currentDate = isoDate(new Date());
    const observationDates = [...observations.map((item) => item.date), currentDate].sort();
    const firstObservation = observationDates[0] ? new Date(`${observationDates[0]}T00:00:00Z`) : new Date();
    const lastObservation = observationDates.at(-1) ? new Date(`${observationDates.at(-1)}T00:00:00Z`) : new Date();
    const observationSpanDays = Math.max(0, Math.round((lastObservation.getTime() - firstObservation.getTime()) / 86_400_000));
    const requiredSpanDays = rangeDays((researchSignals.methodology?.timeRange as AnalyzePlanDto['timeRange']) ?? 'week');
    const currentMethodology = researchSignals.methodology;
    const normalizedTags = (tags?: string[]) => [...(tags ?? [])].sort().join('|');
    const methodologyComparable = observations.every((observation) => {
      const prior = observation.methodology;
      if (!prior || !currentMethodology) return false;
      const sameCore = prior.mode === currentMethodology.mode
        && prior.timeRange === currentMethodology.timeRange
        && prior.query === currentMethodology.query
        && normalizedTags(prior.tags) === normalizedTags(currentMethodology.tags);
      const sameRankingCoverage = currentMethodology.mode !== 'site-wide'
        || typeof prior.rankingsAvailable !== 'number'
        || typeof currentMethodology.rankingsAvailable !== 'number'
        || prior.rankingsAvailable === currentMethodology.rankingsAvailable;
      return sameCore && sameRankingCoverage;
    });
    const directionIneligibleReasons: Array<'insufficient-history' | 'insufficient-span' | 'methodology-mismatch'> = [];
    if (observationDates.length < 3) directionIneligibleReasons.push('insufficient-history');
    if (observationSpanDays < requiredSpanDays) directionIneligibleReasons.push('insufficient-span');
    if (!methodologyComparable) directionIneligibleReasons.push('methodology-mismatch');
    const directionEligible = directionIneligibleReasons.length === 0;
    const payload = {
      researchTopic: prompt,
      measuredTrendStats: trendStats,
      quantitativeResearchSignals: researchSignals,
      discoveryContext,
      observationContext: {
        currentDate,
        priorObservationWindows: observations.length,
        observationDates,
        observationSpanDays,
        requiredSpanDaysForDirection: requiredSpanDays,
        directionEligible,
        methodologyComparable,
        directionIneligibleReasons,
        note: 'Multiple executions on the same calendar day are collapsed into one longitudinal observation window. Observation windows one or two days apart substantially overlap for weekly/monthly research: use them for persistence or recurrence only, not directional movement. Current-period activity stats are separate from stored-run longitudinal analysis.',
      },
      currentQuestions: posts.map((question) => ({
        ...question,
        relevance: classificationById.get(question.id)?.level ?? 'relevant',
        researchValue: researchValueFor(question),
      })),
      deepDiveQuestions: details.map((question) => ({
        ...question,
        acceptedAnswerCount: question.acceptedAnswerCount,
        acceptedAnswerId: question.acceptedAnswerId,
        uniqueAnswerAuthorCount: question.uniqueAnswerAuthorCount,
        answers: question.answers.slice(0, 6),
        comments: question.comments.slice(0, 10),
      })),
      storedHistory: observations,
    };

    const response = await this.llmService.complete(
      {
        messages: [
          { role: 'user', content: SUMMARIZATION_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        responseFormat: 'json',
      },
      signal,
    );

    const raw = this.llmService.parseJsonResponse<RawReport>(response.content);
    const validated = await this.validateEvidence(raw, posts, classifications, signal);
    return this.enrichReport(validated, posts, details, observations, currentDate, classifications, directionEligible, observationSpanDays, requiredSpanDays, methodologyComparable, directionIneligibleReasons);
  }

  private async validateEvidence(
    raw: RawReport,
    posts: StackOverflowQuestion[],
    classifications: RelevanceClassification[],
    signal?: AbortSignal,
  ): Promise<RawReport> {
    const findings = [
      ...(raw.themes ?? []).map((item, index) => ({ key: `theme:${index}`, title: item.title, description: item.description, proposedEvidenceQuestionIds: item.evidenceQuestionIds ?? [] })),
      ...(raw.developerPainPoints ?? []).map((item, index) => ({ key: `pain:${index}`, title: item.title, description: item.description, proposedEvidenceQuestionIds: item.evidenceQuestionIds ?? [] })),
      ...(raw.emergingSignals ?? []).map((item, index) => ({ key: `emerging:${index}`, title: item.title, description: item.description, proposedEvidenceQuestionIds: item.evidenceQuestionIds ?? [] })),
    ];
    if (!findings.length || !posts.length) return raw;
    const classificationById = new Map(classifications.map((item) => [String(item.questionId), item]));
    try {
      const response = await this.llmService.complete(
        {
          messages: [
            { role: 'user', content: EVIDENCE_VALIDATION_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                findings,
                questions: posts.map((question) => ({
                  id: question.id,
                  title: question.title,
                  tags: question.tags,
                  excerpt: question.excerpt,
                  relevance: classificationById.get(question.id)?.level ?? 'relevant',
                })),
              }),
            },
          ],
          responseFormat: 'json',
        },
        signal,
      );
      const parsed = this.llmService.parseJsonResponse<{ validations?: EvidenceValidationResult[] }>(response.content);
      const validIds = new Set(posts.map((question) => question.id));
      const byKey = new Map((parsed.validations ?? []).map((item) => {
        const ids = item.coherent === false ? [] : [...new Set((item.evidenceQuestionIds ?? []).map(String).filter((id) => validIds.has(id)))].slice(0, 3);
        return [item.key, ids] as const;
      }));
      const apply = <T extends { evidenceQuestionIds?: string[] }>(items: T[] = [], prefix: string): T[] => items.map((item, index) => ({ ...item, evidenceQuestionIds: byKey.get(`${prefix}:${index}`) ?? [] }));
      return {
        ...raw,
        themes: apply(raw.themes ?? [], 'theme'),
        developerPainPoints: apply(raw.developerPainPoints ?? [], 'pain'),
        emergingSignals: apply(raw.emergingSignals ?? [], 'emerging'),
      };
    } catch (error) {
      this.logger.warn(`Evidence validation failed; falling back to generated evidence IDs: ${error instanceof Error ? error.message : String(error)}`);
      return raw;
    }
  }

  private enrichReport(
    raw: RawReport,
    posts: StackOverflowQuestion[],
    details: StackOverflowQuestionDetail[],
    observations: ObservationSnapshot[],
    currentDate: string,
    classifications: RelevanceClassification[] = [],
    directionEligible = false,
    observationSpanDays = 0,
    requiredSpanDays = 7,
    methodologyComparable = false,
    directionIneligibleReasons: Array<'insufficient-history' | 'insufficient-span' | 'methodology-mismatch'> = [],
  ): StackOverflowReport {
    const byId = new Map(posts.map((question) => [question.id, question]));
    const detailById = new Map(details.map((question) => [question.id, question]));
    const relevanceById = new Map(classifications.map((item) => [String(item.questionId), item.level]));
    const evidenceFor = (ids: string[] = []) => ids
      .map((id) => byId.get(String(id)))
      .filter((question): question is StackOverflowQuestion => Boolean(question))
      .slice(0, 3)
      .map((question) => ({
        questionId: question.id,
        title: question.title,
        url: question.url,
        excerpt: question.excerpt.slice(0, 260),
        relevance: relevanceById.get(question.id),
      }));

    const researchValueFor = (question: StackOverflowQuestion) => this.computeResearchValue(question, posts);
    const values = new Map(posts.map((question) => [question.id, researchValueFor(question)]));
    const maxScore = posts.length ? Math.max(...posts.map((question) => question.score)) : 0;
    const maxViews = posts.length ? Math.max(...posts.map((question) => question.viewCount)) : 0;
    const maxAnswers = posts.length ? Math.max(...posts.map((question) => question.answerCount)) : 0;
    const maxResearchValue = posts.length ? Math.max(...posts.map((question) => values.get(question.id) ?? 0)) : 0;
    const highlightsFor = (question: StackOverflowQuestion): NonNullable<StackOverflowReport['notableQuestions'][number]['highlights']> => {
      const highlights: NonNullable<StackOverflowReport['notableQuestions'][number]['highlights']> = [];
      if (question.score === maxScore) highlights.push('highest-score');
      if (question.viewCount === maxViews) highlights.push('highest-views');
      if (question.answerCount === maxAnswers) highlights.push('most-answers');
      if ((values.get(question.id) ?? 0) === maxResearchValue) highlights.push('highest-research-value');
      return highlights;
    };
    const cleanReason = (reason?: string) => {
      if (!reason) return 'Research relevance';
      const parts = reason.split(/;|\.(?=\s|$)/).map((part) => part.trim()).filter(Boolean);
      const filtered = parts.filter((part) => !/\b(highest|most viewed|most answers|top research|highest research|highest view|highest score)\b/i.test(part));
      return filtered.join('; ') || 'Research relevance';
    };

    const notableQuestions = (raw.notableQuestions ?? [])
      .map((item) => {
        const question = byId.get(String(item.questionId));
        if (!question) return null;
        const resolutionStatus = detailById.has(question.id)
          ? (detailById.get(question.id)?.acceptedAnswerCount ?? 0) > 0
            ? 'accepted-answer' as const
            : question.answerCount === 0
              ? 'unanswered' as const
              : 'answered-no-accepted' as const
          : question.answerCount === 0
            ? 'unanswered' as const
            : 'not-deep-dived' as const;
        let selectionReason = cleanReason(item.selectionReason);
        if (resolutionStatus === 'accepted-answer') {
          selectionReason = selectionReason
            .replace(/\bunresolved\s+(pain point|question|thread|issue)\b/gi, 'resolved thread')
            .replace(/\bunanswered\s+(question|thread|issue)\b/gi, 'resolved thread');
        }
        selectionReason = selectionReason
          .replace(/\bemerging issue\b/gi, 'isolated new report')
          .replace(/\bemerging trend\b/gi, 'newly observed question');
        return {
          title: question.title,
          score: question.score,
          answerCount: question.answerCount,
          viewCount: question.viewCount,
          tags: question.tags,
          url: question.url,
          selectionReason,
          researchValue: values.get(question.id),
          highlights: highlightsFor(question),
          resolutionStatus,
          acceptedAnswerCount: detailById.get(question.id)?.acceptedAnswerCount,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const occurrenceDates = new Map<string, Set<string>>();
    const addOccurrence = (id: string, date: string) => {
      if (!occurrenceDates.has(id)) occurrenceDates.set(id, new Set());
      occurrenceDates.get(id)?.add(date);
    };
    for (const question of posts) addOccurrence(question.id, currentDate);
    for (const observation of observations) for (const id of observation.questionIds) addOccurrence(String(id), observation.date);

    const authorByQuestionId = new Map<string, string>();
    for (const question of posts) if (question.author) authorByQuestionId.set(question.id, question.author);
    for (const observation of observations) {
      for (const question of observation.questions) if (question.author) authorByQuestionId.set(question.id, question.author);
    }

    const currentQuestionIds = new Set(posts.map((question) => String(question.id)));
    const priorQuestionIds = new Set(observations.flatMap((observation) => observation.questionIds.map(String)));

    const longitudinalSignals = (raw.longitudinal?.signals ?? []).map((signal) => {
      const ids = [...new Set((signal.evidenceQuestionIds ?? []).map(String))];
      const dates = new Set<string>();
      for (const id of ids) for (const date of occurrenceDates.get(id) ?? []) dates.add(date);
      const independentQuestionCount = ids.length;
      const observationCount = dates.size;
      const independentAuthorCount = new Set(ids.map((id) => authorByQuestionId.get(id)).filter((author): author is string => Boolean(author) && author !== 'unknown')).size;
      const currentSupportingIds = ids.filter((id) => currentQuestionIds.has(id));
      const priorSupportingIds = ids.filter((id) => priorQuestionIds.has(id));
      const observedInCurrent = currentSupportingIds.length > 0;
      const observedInPrior = priorSupportingIds.length > 0;
      const spansCurrentAndPrior = observedInCurrent && observedInPrior;

      // Derive first-seen dates from the actual stored observations. This is the
      // canonical source of truth for longitudinal labels and is applied after
      // the LLM response so a generated label cannot override observed history.
      const firstSeenDateById = new Map<string, string>();
      for (const id of ids) {
        const seen = [...(occurrenceDates.get(id) ?? [])].sort();
        if (seen[0]) firstSeenDateById.set(id, seen[0]);
      }
      const firstSeenDates = new Set(firstSeenDateById.values());
      const firstSeenBeforeCurrentIds = ids.filter((id) => {
        const date = firstSeenDateById.get(id);
        return Boolean(date && date < currentDate);
      });
      const firstSeenCurrentIds = ids.filter((id) => firstSeenDateById.get(id) === currentDate);
      const evidenceBroadenedAcrossDates = firstSeenDates.size >= 2;

      // A recurring topic requires independent question evidence to broaden on
      // different observation dates. Re-reading the same one or several posts
      // across rolling windows is post persistence, not topic recurrence.
      const evidenceType: NonNullable<StackOverflowReport['longitudinal']['signals'][number]['evidenceType']> =
        !observedInCurrent && observedInPrior
          ? 'historical-absence'
          : !observedInPrior
            ? 'new-signal'
            : spansCurrentAndPrior && independentQuestionCount >= 2 && evidenceBroadenedAcrossDates
              ? 'recurring-topic'
              : spansCurrentAndPrior
                ? 'post-persistence'
                : 'new-signal';

      let direction: StackOverflowReport['longitudinal']['signals'][number]['direction'];
      if (evidenceType === 'historical-absence') direction = 'not-observed';
      else if (evidenceType === 'post-persistence') direction = 'persistent';
      else if (evidenceType === 'new-signal') direction = 'new';
      else if (!directionEligible || observationCount < 3 || ['new', 'emerging', 'fading'].includes(signal.direction)) direction = 'recurring';
      else direction = ['growing', 'stable', 'declining'].includes(signal.direction) ? signal.direction : 'recurring';

      let confidence: 'low' | 'medium' | 'high' = 'low';
      if (evidenceType === 'post-persistence') confidence = observationCount >= 3 ? 'medium' : 'low';
      else if (evidenceType === 'recurring-topic') {
        if (independentAuthorCount <= 1) confidence = 'low';
        else confidence = independentQuestionCount >= 3 && independentAuthorCount >= 2 && observationCount >= 3 && observationSpanDays >= requiredSpanDays ? 'high' : 'medium';
      }
      else if (evidenceType === 'historical-absence') confidence = 'low';

      // Replace potentially contradictory generated longitudinal evidence with
      // a deterministic observation-basis sentence built from actual run data.
      let evidence = signal.evidence;
      if (evidenceType === 'new-signal') {
        evidence = `Questions ${ids.join(', ')} are first observed in the current ${currentDate} window and have no earlier stored observations in the supplied history.`;
      } else if (evidenceType === 'post-persistence') {
        evidence = `The same supporting question ${ids.length === 1 ? 'ID' : 'IDs'} (${ids.join(', ')}) ${ids.length === 1 ? 'remains' : 'remain'} present across ${observationCount} stored observation ${observationCount === 1 ? 'date' : 'dates'}. No later distinct question broadened the topic evidence, so this is treated as post persistence rather than topic recurrence.`;
      } else if (evidenceType === 'recurring-topic') {
        const earlier = firstSeenBeforeCurrentIds.length ? `Earlier supporting question IDs: ${firstSeenBeforeCurrentIds.join(', ')}.` : '';
        const current = firstSeenCurrentIds.length ? ` Newly first-observed in the current window: ${firstSeenCurrentIds.join(', ')}.` : '';
        evidence = `Distinct supporting questions were first observed on multiple stored dates, so the topic evidence broadened over time rather than only repeating the same posts. ${earlier}${current}`.trim();
      } else if (evidenceType === 'historical-absence') {
        evidence = `Supporting question ${ids.length === 1 ? 'ID' : 'IDs'} (${ids.join(', ')}) were observed in prior stored windows but are not present in the current ${currentDate} sample. Absence is noted neutrally because directional analysis is handled separately.`;
      }

      return { ...signal, evidence, direction, confidence, evidenceType, independentQuestionCount, independentAuthorCount, observationCount };
    });

    const enrichedFinding = (item: { title: string; description: string; evidenceQuestionIds?: string[] }) => {
      const evidence = evidenceFor(item.evidenceQuestionIds);
      const questionIds = [...new Set(evidence.map((entry) => entry.questionId))];
      const authors = new Set(
        questionIds
          .map((id) => byId.get(id)?.author)
          .filter((author): author is string => Boolean(author) && author !== 'unknown'),
      );
      const distinctQuestionCount = questionIds.length;
      const distinctAuthorCount = authors.size;
      const evidenceStrength: 'low' | 'medium' | 'high' = distinctAuthorCount <= 1
        ? 'low'
        : distinctQuestionCount >= 3 && distinctAuthorCount >= 2
          ? 'high'
          : 'medium';
      return {
        title: item.title,
        description: item.description,
        evidence,
        distinctQuestionCount,
        distinctAuthorCount,
        evidenceStrength,
      };
    };
    const themes = (raw.themes ?? []).map(enrichedFinding).filter((item) => {
      const relevantCount = item.evidence.filter((evidence) => evidence.relevance !== 'adjacent' && evidence.relevance !== 'incidental').length;
      return item.evidence.length >= 2 && relevantCount >= 2; // coherence is separately audited by the LLM validator
    });
    const themeEvidenceKeys = new Map(themes.map((theme) => [
      theme.evidence.map((entry) => entry.questionId).sort().join('|'),
      theme,
    ]));
    const titleTokens = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9+#.]+/).filter((token) => token.length > 2));
    const titleSimilarity = (a: string, b: string) => {
      const left = titleTokens(a);
      const right = titleTokens(b);
      if (!left.size || !right.size) return 0;
      const intersection = [...left].filter((token) => right.has(token)).length;
      return intersection / Math.min(left.size, right.size);
    };
    const developerPainPoints = (raw.developerPainPoints ?? []).map(enrichedFinding).filter((item) => {
      const relevantCount = item.evidence.filter((evidence) => evidence.relevance !== 'adjacent' && evidence.relevance !== 'incidental').length;
      if (item.evidence.length < 2 || relevantCount < 2) return false;
      const evidenceKey = item.evidence.map((entry) => entry.questionId).sort().join('|');
      const overlappingTheme = themeEvidenceKeys.get(evidenceKey);
      // If the exact same evidence produces essentially the same title, keep the stronger theme
      // instead of rendering a near-duplicate pain point. Distinct analytical framings may remain.
      if (overlappingTheme && titleSimilarity(overlappingTheme.title, item.title) >= 0.45) return false;
      return true;
    });
    const emergingSignals = (raw.emergingSignals ?? []).map(enrichedFinding).filter((item) => {
      const relevantIds = new Set(item.evidence.filter((evidence) => evidence.relevance !== 'adjacent' && evidence.relevance !== 'incidental').map((evidence) => evidence.questionId));
      return relevantIds.size >= 2;
    });

    return {
      executiveSummary: raw.executiveSummary,
      themes,
      developerPainPoints,
      emergingSignals,
      notableQuestions,
      longitudinal: {
        summary: raw.longitudinal?.summary ?? 'No longitudinal analysis available.',
        observationSpanDays,
        requiredSpanDays,
        directionEligible,
        methodologyComparable,
        directionIneligibleReasons,
        signals: longitudinalSignals,
      },
    };
  }

}