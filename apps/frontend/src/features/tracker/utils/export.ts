import type { ResearchSignals, StackOverflowReport, TrendStat } from '../tracker.types';

const countLabel = (count: number, lowerBound?: boolean) => `${count}${lowerBound ? '+' : ''}`;

const findingMeta = (item: { distinctQuestionCount?: number; distinctAuthorCount?: number; evidenceStrength?: string }) => {
  const parts: string[] = [];
  if (typeof item.distinctQuestionCount === 'number') parts.push(`${item.distinctQuestionCount} distinct ${item.distinctQuestionCount === 1 ? 'question' : 'questions'}`);
  if (typeof item.distinctAuthorCount === 'number') parts.push(`${item.distinctAuthorCount} ${item.distinctAuthorCount === 1 ? 'author' : 'authors'}`);
  if (item.evidenceStrength) parts.push(`${item.evidenceStrength} evidence`);
  return parts.length ? `- Evidence strength · ${parts.join(' · ')}` : undefined;
};

const directionStatus = (report: StackOverflowReport, timeRange?: string) => {
  const longitudinal = report.longitudinal;
  if (longitudinal.directionEligible) return `directional movement eligible · ${longitudinal.observationSpanDays ?? 0}-day comparable observation span`;
  const reasons = longitudinal.directionIneligibleReasons ?? [];
  if (reasons.includes('methodology-mismatch')) return 'directional movement unavailable · sampling conditions differ across stored runs';
  if (reasons.includes('insufficient-history')) return 'directional movement unavailable · needs at least 3 comparable observation dates';
  if (reasons.includes('insufficient-span')) return `directional movement unavailable · ${longitudinal.observationSpanDays ?? 0} days observed; ${timeRange ?? 'monitoring'} research needs at least ${longitudinal.requiredSpanDays ?? 0} comparable days`;
  return 'directional movement unavailable for the current stored-run history';
};

export const exportAsMarkdown = (
  prompt: string,
  report: StackOverflowReport,
  trendStats: TrendStat[] = [],
  researchSignals?: ResearchSignals,
  generatedAt?: string,
): void => {
  const lines = [
    '# Stack Overflow Trends Report', '', `**Topic:** ${prompt}`, ...(generatedAt ? [`**Run:** ${generatedAt}`] : []), '',
  ];

  if (trendStats.length) {
    lines.push('## Activity signals', '');
    lines.push(...trendStats.flatMap((stat) => {
      const status = stat.comparisonStatus ?? (stat.changePercent === null ? 'new-activity' : 'comparable');
      const comparison = status === 'lower-bound'
        ? 'comparison unavailable because the retrieval limit was reached'
        : status === 'new-activity'
          ? 'new activity'
          : status === 'unavailable'
            ? 'comparison unavailable'
            : status === 'low-volume'
              ? `low-volume comparison${typeof stat.changePercent === 'number' ? ` (raw change ${stat.changePercent > 0 ? '+' : ''}${stat.changePercent}%)` : ''}`
              : `retrieved-sample change ${(stat.changePercent ?? 0) > 0 ? '+' : ''}${stat.changePercent ?? 0}%`;
      const note = stat.comparisonNote ? ` · ${stat.comparisonNote}` : '';
      return [`- **${stat.query}** · ${countLabel(stat.currentCount, stat.currentIsLowerBound)} current retrieved vs ${countLabel(stat.previousCount, stat.previousIsLowerBound)} previous retrieved · ${comparison}${note}`];
    }));
  }

  if (researchSignals) {
    lines.push('', '## Research basis', '', `- ${researchSignals.analyzedCount} analyzed from ${researchSignals.sampleSize} retrieved`);
    if (researchSignals.methodology) {
      lines.push(`- Scope · ${researchSignals.methodology.mode ?? 'topic'} · ${researchSignals.methodology.timeRange ?? 'unspecified'}${researchSignals.methodology.tags?.length ? ` · tags: ${researchSignals.methodology.tags.join(', ')}` : ''}${typeof researchSignals.methodology.rankingsAvailable === 'number' && typeof researchSignals.methodology.rankingsTotal === 'number' ? ` · rankings: ${researchSignals.methodology.rankingsAvailable}/${researchSignals.methodology.rankingsTotal}` : ''}`);
      if (researchSignals.methodology.periodStart && researchSignals.methodology.periodEnd) lines.push(`- Current sample · ${researchSignals.methodology.periodStart} to ${researchSignals.methodology.periodEnd}${researchSignals.methodology.comparisonStart && researchSignals.methodology.comparisonEnd ? ` · comparison: ${researchSignals.methodology.comparisonStart} to ${researchSignals.methodology.comparisonEnd}` : ''}`);
    }
    if (researchSignals.relevance) {
      lines.push(`- Relevance · ${researchSignals.relevance.relevant} relevant · ${researchSignals.relevance.adjacent} adjacent · ${researchSignals.relevance.incidental} excluded${typeof researchSignals.relevance.precisionPercent === 'number' ? ` · retrieved-sample precision: ${researchSignals.relevance.precisionPercent}%` : ''}`);
      const lowPrecision = researchSignals.relevance.precisionAssessment === 'low' || (typeof researchSignals.relevance.precisionPercent === 'number' && researchSignals.relevance.precisionPercent < 50);
      if (lowPrecision) lines.push('- Precision note · low precision; the query is broad or ambiguous, so most retrieved questions may not be directly about the research topic');
      const excluded = (researchSignals.relevanceAudit ?? []).filter((item) => item.level === 'incidental').slice(0, 5);
      if (excluded.length) {
        lines.push('- Excluded examples ·');
        for (const item of excluded) lines.push(`  - ${item.title} · ${item.reason}`);
        if (researchSignals.relevance.incidental > excluded.length) lines.push(`  - …showing ${excluded.length} of ${researchSignals.relevance.incidental} excluded questions`);
      }
    }
    if (researchSignals.selection) {
      lines.push(`- Analysis selection · ${researchSignals.selection.eligibleCount} eligible · ${researchSignals.selection.selectedCount} selected for analysis${researchSignals.selection.researchDepth ? ` · ${researchSignals.selection.researchDepth} research depth` : ''}${researchSignals.selection.strategy === 'research-value-plus-diversity' ? ' · research value + topical diversity' : ''}${typeof researchSignals.selection.deepDiveAttempted === 'number' ? ` · deep dives: ${researchSignals.selection.deepDiveSucceeded ?? 0}/${researchSignals.selection.deepDiveAttempted} successful` : typeof researchSignals.selection.deepDiveCount === 'number' ? ` · ${researchSignals.selection.deepDiveCount} threads read in depth` : ''}`);
      if (researchSignals.selection.deepDiveEvidenceMode === 'api-only') lines.push('- Evidence depth · full-thread scraping unavailable; analysis based on Stack Exchange API question data only');
      if (researchSignals.selection.deepDiveEvidenceMode === 'partial-thread') lines.push('- Evidence depth · partial full-thread browser coverage; remaining evidence from Stack Exchange API question data');
      if (researchSignals.selection.deepDiveEvidenceMode === 'full-thread') lines.push('- Evidence depth · selected deep dives retrieved as full Stack Overflow threads through Playwright');
    }
    if (researchSignals.topTags.length) {
      lines.push(`- Top tags · ${researchSignals.topTags.map((item) => `${item.tag} (${item.count})`).join(', ')}`);
    }
    if (researchSignals.highestEngagement.length) {
      lines.push('', '### Highest engagement', '', '_Directly relevant questions only._', '');
      for (const question of researchSignals.highestEngagement) {
        lines.push(`- [${question.title}](${question.url}) · ${question.score} score · ${question.answerCount} answers · ${question.viewCount} views`);
      }
    }
  }

  lines.push('', '## Current trend summary', '', report.executiveSummary, '');
  lines.push('## Across previous runs', '', report.longitudinal?.summary ?? 'No longitudinal analysis available.', '');
  if (typeof report.longitudinal?.observationSpanDays === 'number') {
    lines.push(`- Observation span · ${report.longitudinal.observationSpanDays} days · ${directionStatus(report, researchSignals?.methodology?.timeRange)}`, '');
  }
  for (const signal of report.longitudinal?.signals ?? []) {
    const authorScope = signal.evidenceType === 'recurring-topic' && signal.independentAuthorCount === 1 ? ' · single-author evidence' : '';
    lines.push(`- **${signal.topic}** · ${signal.evidenceType === 'post-persistence' ? 'persistent' : signal.direction}${signal.evidenceType ? ` · ${signal.evidenceType === 'post-persistence' ? 'post persistence' : signal.evidenceType.replaceAll('-', ' ')}` : ''}${authorScope}${signal.confidence ? ` · ${signal.confidence} confidence` : ''} · aggregated across stored windows${typeof signal.independentQuestionCount === 'number' ? ` · ${signal.independentQuestionCount} distinct ${signal.independentQuestionCount === 1 ? 'question' : 'questions'}` : ''}${typeof signal.independentAuthorCount === 'number' ? ` · ${signal.independentAuthorCount} ${signal.independentAuthorCount === 1 ? 'author' : 'authors'}` : ''}${typeof signal.observationCount === 'number' ? ` · observed on ${signal.observationCount} ${signal.observationCount === 1 ? 'date' : 'dates'}` : ''} · ${signal.evidence}`);
    if (signal.evidenceType === 'post-persistence') lines.push('  - Evidence note · repeat observations of the same supporting posts show post persistence, not broader topic recurrence.');
    if (signal.evidenceType === 'recurring-topic') lines.push('  - Evidence note · distinct questions broaden topic evidence; repeat retrieval of the same question is counted only as repeated observation.');
  }

  if (report.emergingSignals?.length) {
    lines.push('', '## Emerging or newly observed signals', '');
    for (const item of report.emergingSignals) {
      lines.push(`### ${item.title}`, '', item.description, '');
    const meta = findingMeta(item); if (meta) lines.push(meta);
      for (const evidence of item.evidence ?? []) lines.push(`- Evidence · [${evidence.title}](${evidence.url})`);
      lines.push('');
    }
  }

  lines.push('', '## Discussion themes', '');
  if (!report.themes.length) lines.push('No strong discussion themes met the evidence and coherence threshold in this sample.', '');
  for (const theme of report.themes) {
    lines.push(`### ${theme.title}`, '', theme.description, '');
    const meta = findingMeta(theme); if (meta) lines.push(meta);
    for (const evidence of theme.evidence ?? []) lines.push(`- Evidence · [${evidence.title}](${evidence.url})`);
    lines.push('');
  }

  lines.push('## Developer pain points', '');
  if (!report.developerPainPoints.length) lines.push('No developer pain points met the multi-question evidence threshold in this sample.', '');
  for (const item of report.developerPainPoints) {
    lines.push(`### ${item.title}`, '', item.description, '');
    const meta = findingMeta(item); if (meta) lines.push(meta);
    for (const evidence of item.evidence ?? []) lines.push(`- Evidence · [${evidence.title}](${evidence.url})`);
    lines.push('');
  }

  if (report.notableQuestions.length) {
    lines.push('## Notable questions', '');
    for (const question of report.notableQuestions) {
      const reason = question.selectionReason ? ` · ${question.selectionReason}` : '';
      const views = typeof question.viewCount === 'number' ? ` · ${question.viewCount} views` : '';
      const highlights = question.highlights?.length ? ` · ${question.highlights.join(', ')}` : '';
      const resolution = question.resolutionStatus && question.resolutionStatus !== 'not-deep-dived' ? ` · ${question.resolutionStatus.replaceAll('-', ' ')}` : '';
      lines.push(`- [${question.title}](${question.url}) · ${question.score} score · ${question.answerCount} answers${views}${resolution}${highlights}${reason}`);
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `stackoverflow-trends-monitor-${Date.now()}.md`);
};

export const exportAsJson = (data: unknown): void => {
  const normalized = data && typeof data === 'object' && !Array.isArray(data)
    ? { ...(data as Record<string, unknown>), generatedAt: (data as Record<string, unknown>).generatedAt ?? (data as Record<string, unknown>).createdAt }
    : data;
  const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `stackoverflow-trends-monitor-${Date.now()}.json`);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
