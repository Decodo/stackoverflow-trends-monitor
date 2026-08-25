export type LlmProvider = 'claude' | 'openai' | 'gemini';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  provider?: LlmProvider;
  model?: string;
  responseFormat?: 'text' | 'json';
}

export interface LlmResponse {
  content: string;
  provider: LlmProvider;
  model: string;
}

export interface ScrapingPlan {
  keywords: string[];
  tags: string[];
  queries: string[];
  timeRange: 'day' | 'week' | 'month' | 'year';
  rationale: string;
}

export type ResearchDepth = 'focused' | 'standard' | 'thorough' | 'comprehensive';

export type RelevanceLevel = 'relevant' | 'adjacent' | 'incidental';

export interface TrendStat {
  query: string;
  currentCount: number;
  previousCount: number;
  currentIsLowerBound: boolean;
  previousIsLowerBound: boolean;
  comparisonStatus: 'comparable' | 'lower-bound' | 'new-activity' | 'unavailable' | 'low-volume';
  changePercent: number | null;
  comparisonBasis?: 'retrieved-sample';
  comparisonNote?: string;
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
  relevanceAudit?: Array<{ questionId: string; title: string; level: RelevanceLevel; reason: string; includedInAnalysis: boolean; researchValue?: number }>;
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

export interface EvidenceItem {
  questionId: string;
  title: string;
  url: string;
  excerpt: string;
  relevance?: RelevanceLevel;
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
