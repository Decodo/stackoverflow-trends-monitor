export type TimeRange = 'week' | 'month';
export type ResearchDepth = 'focused' | 'standard' | 'thorough' | 'comprehensive';

export interface ScrapingPlan {
  keywords: string[];
  tags: string[];
  queries: string[];
  timeRange: TimeRange;
  researchDepth?: ResearchDepth;
  rationale?: string;
}

export interface StackOverflowQuestion {
  id: string;
  title: string;
  author: string;
  score: number;
  answerCount: number;
  viewCount: number;
  tags: string[];
  url: string;
  excerpt: string;
  createdAt?: number;
}

export interface TrendStat {
  query: string;
  currentCount: number;
  previousCount: number;
  currentIsLowerBound?: boolean;
  previousIsLowerBound?: boolean;
  comparisonStatus?: 'comparable' | 'lower-bound' | 'new-activity' | 'unavailable' | 'low-volume';
  changePercent: number | null;
  comparisonBasis?: 'retrieved-sample';
  comparisonNote?: string;
}

export interface EvidenceItem {
  questionId: string;
  title: string;
  url: string;
  excerpt: string;
  relevance?: 'relevant' | 'adjacent' | 'incidental';
}

export interface StackOverflowReport {
  executiveSummary: string;
  themes: Array<{ title: string; description: string; evidence?: EvidenceItem[]; distinctQuestionCount?: number; distinctAuthorCount?: number; evidenceStrength?: 'low' | 'medium' | 'high' }>;
  developerPainPoints: Array<{ title: string; description: string; evidence?: EvidenceItem[]; distinctQuestionCount?: number; distinctAuthorCount?: number; evidenceStrength?: 'low' | 'medium' | 'high' }>;
  emergingSignals?: Array<{ title: string; description: string; evidence?: EvidenceItem[]; distinctQuestionCount?: number; distinctAuthorCount?: number; evidenceStrength?: 'low' | 'medium' | 'high' }>;
  notableQuestions: Array<{
    title: string;
    score: number;
    answerCount: number;
    viewCount?: number;
    tags: string[];
    url: string;
    selectionReason?: string;
    researchValue?: number;
    highlights?: Array<'highest-score' | 'highest-views' | 'most-answers' | 'highest-research-value'>;
    resolutionStatus?: 'accepted-answer' | 'answered-no-accepted' | 'unanswered' | 'not-deep-dived';
    acceptedAnswerCount?: number;
  }>;
  longitudinal: {
    summary: string;
    observationSpanDays?: number;
    requiredSpanDays?: number;
    directionEligible?: boolean;
    methodologyComparable?: boolean;
    directionIneligibleReasons?: Array<'insufficient-history' | 'insufficient-span' | 'methodology-mismatch'>;
    signals: Array<{
      topic: string;
      direction: 'new' | 'persistent' | 'recurring' | 'not-observed' | 'growing' | 'stable' | 'declining' | 'emerging' | 'fading';
      confidence?: 'low' | 'medium' | 'high';
      evidenceType?: 'post-persistence' | 'recurring-topic' | 'new-signal' | 'historical-absence';
      independentQuestionCount?: number;
      independentAuthorCount?: number;
      observationCount?: number;
      evidence: string;
    }>;
  };
}

export interface ResearchSignals {
  sampleSize: number;
  analyzedCount: number;
  relevance?: {
    relevant: number;
    adjacent: number;
    incidental: number;
    precisionPercent?: number;
    precisionAssessment?: 'low' | 'adequate';
  };
  topTags: Array<{ tag: string; count: number }>;
  methodology?: { timeRange?: string; query?: string; tags?: string[]; retrievalLimit?: number; mode?: 'topic' | 'site-wide'; rankingsAvailable?: number; rankingsTotal?: number; periodStart?: string; periodEnd?: string; comparisonStart?: string; comparisonEnd?: string; analysisVersion?: string; researchDepth?: ResearchDepth };
  relevanceAudit?: Array<{ questionId: string; title: string; level: 'relevant' | 'adjacent' | 'incidental'; reason: string; includedInAnalysis: boolean; researchValue?: number }>;
  selection?: { eligibleCount: number; selectedCount: number; researchDepth?: ResearchDepth; deepDiveTarget?: number; deepDiveCount?: number; deepDiveAttempted?: number; deepDiveSucceeded?: number; deepDiveFailed?: number; deepDiveEvidenceMode?: 'full-thread' | 'partial-thread' | 'api-only'; strategy: 'all-eligible' | 'research-value-plus-diversity' };
  highestEngagement: Array<{
    id: string;
    title: string;
    url: string;
    score: number;
    answerCount: number;
    viewCount: number;
    researchValue?: number;
    viewPercentile?: number;
    highlights?: Array<'highest-score' | 'highest-views' | 'most-answers' | 'highest-research-value'>;
  }>;
}

export interface AnalyzeResult {
  id: string;
  generatedAt: string;
  plan: {
    prompt: string;
    keywords: string[];
    tags: string[];
    queries: string[];
    timeRange: TimeRange;
    maxPosts?: number;
    researchDepth?: ResearchDepth;
  };
  posts: StackOverflowQuestion[];
  trendStats: TrendStat[];
  researchSignals: ResearchSignals;
  report: StackOverflowReport;
}

export interface TrendingBucket {
  key: 'hot' | 'week' | 'votes' | 'activity';
  label: string;
  questions: StackOverflowQuestion[];
  status?: 'available' | 'unavailable';
}

export interface TrendingResult {
  id: string;
  generatedAt: string;
  buckets: TrendingBucket[];
  frequentTags: Array<{ tag: string; count: number }>;
  researchSignals: ResearchSignals;
  report: StackOverflowReport;
}

export interface StoredQuery {
  _id: string;
  prompt: string;
  plan: ScrapingPlan;
  posts?: StackOverflowQuestion[];
  trendStats: TrendStat[];
  researchSignals?: ResearchSignals;
  report: StackOverflowReport;
  monitorId?: string;
  runType?: 'manual' | 'scheduled' | 'manual-monitor';
  createdAt: string;
}

export type MonitorCadence = 'custom-hours' | 'daily' | 'weekly' | 'monthly';

export interface SavedMonitor {
  _id: string;
  name: string;
  prompt: string;
  plan: {
    prompt: string;
    keywords: string[];
    tags: string[];
    queries: string[];
    timeRange: TimeRange;
    maxPosts?: number;
    researchDepth?: ResearchDepth;
  };
  cadence: MonitorCadence;
  intervalHours?: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastQueryId?: string;
  lastError?: string;
  createdAt: string;
}
