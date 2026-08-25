import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Download, ExternalLink, FileJson, FileText, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { EvidenceItem, ResearchSignals, StackOverflowReport, TrendStat } from '../tracker.types';

interface ReportViewProps {
  prompt: string;
  report: StackOverflowReport;
  trendStats?: TrendStat[];
  researchSignals?: ResearchSignals;
  generatedAt?: string;
  onExportMarkdown: () => void;
  onExportJson: () => void;
}

const TrendIcon = ({ value }: { value: number | null }) => {
  if (value === null || value === 0) return <Minus className="h-3.5 w-3.5" />;
  return value > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />;
};

const Evidence = ({ items = [] }: { items?: EvidenceItem[] }) => {
  if (!items.length) return null;
  const relevant = items.filter((item) => item.relevance === 'relevant').length;
  const adjacent = items.filter((item) => item.relevance === 'adjacent').length;
  const hasRelevance = relevant + adjacent > 0;
  return (
    <details className="mt-3 border-t border-border/70 pt-2 group">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
        Evidence · {items.length} {items.length === 1 ? 'question' : 'questions'}{hasRelevance ? ` · ${relevant} relevant${adjacent ? ` · ${adjacent} adjacent` : ''}` : ''}
      </summary>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.questionId} className="rounded-md bg-muted/30 p-2.5">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline inline-flex items-start gap-1">
              {item.title}<ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
            </a>
            {item.excerpt && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.excerpt}{item.excerpt.length >= 260 ? '…' : ''}</p>}
          </div>
        ))}
      </div>
    </details>
  );
};

const countLabel = (count: number, lowerBound?: boolean) => `${count}${lowerBound ? '+' : ''}`;

const formatRunTime = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
};

const FindingMeta = ({ distinctQuestionCount, distinctAuthorCount, evidenceStrength }: { distinctQuestionCount?: number; distinctAuthorCount?: number; evidenceStrength?: 'low' | 'medium' | 'high' }) => {
  if (typeof distinctQuestionCount !== 'number' && typeof distinctAuthorCount !== 'number' && !evidenceStrength) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      {typeof distinctQuestionCount === 'number' && <span>{distinctQuestionCount} distinct {distinctQuestionCount === 1 ? 'question' : 'questions'}</span>}
      {typeof distinctAuthorCount === 'number' && <span>· {distinctAuthorCount} {distinctAuthorCount === 1 ? 'author' : 'authors'}</span>}
      {evidenceStrength && <Badge variant={evidenceStrength === 'high' ? 'success' : evidenceStrength === 'medium' ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">{evidenceStrength} evidence</Badge>}
    </div>
  );
};

const directionStatusText = (report: StackOverflowReport, timeRange?: string) => {
  const longitudinal = report.longitudinal;
  if (longitudinal.directionEligible) {
    return `Directional movement eligible · ${longitudinal.observationSpanDays ?? 0}-day comparable observation span`;
  }
  const reasons = longitudinal.directionIneligibleReasons ?? [];
  if (reasons.includes('methodology-mismatch')) {
    return 'Directional movement unavailable · sampling conditions differ across stored runs';
  }
  if (reasons.includes('insufficient-history')) {
    return 'Directional movement unavailable · needs at least 3 comparable observation dates';
  }
  if (reasons.includes('insufficient-span')) {
    return `Directional movement unavailable · ${longitudinal.observationSpanDays ?? 0} days observed; this ${timeRange ?? 'monitoring'} research needs at least ${longitudinal.requiredSpanDays ?? 0} comparable days`;
  }
  return 'Directional movement unavailable for the current stored-run history';
};

const ResolutionBadge = ({ status }: { status?: 'accepted-answer' | 'answered-no-accepted' | 'unanswered' | 'not-deep-dived' }) => {
  if (!status || status === 'not-deep-dived') return null;
  if (status === 'accepted-answer') return <Badge variant="success" className="text-xs px-1.5 py-0">accepted</Badge>;
  if (status === 'unanswered') return <Badge variant="warning" className="text-xs px-1.5 py-0">unanswered</Badge>;
  return <Badge variant="secondary" className="text-xs px-1.5 py-0">answered</Badge>;
};

export const ReportView = ({ prompt, report, trendStats = [], researchSignals, generatedAt, onExportMarkdown, onExportJson }: ReportViewProps) => (
  <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Monitoring</p>
        <p className="text-sm font-medium">{prompt}</p>
        {generatedAt && <p className="text-xs text-muted-foreground mt-1">Run · {formatRunTime(generatedAt)}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onExportMarkdown}><FileText className="mr-1.5 h-3.5 w-3.5" /><span className="hidden sm:inline">Markdown</span><Download className="h-3 w-3 ml-1" /></Button>
        <Button variant="outline" size="sm" onClick={onExportJson}><FileJson className="mr-1.5 h-3.5 w-3.5" /><span className="hidden sm:inline">JSON</span><Download className="h-3 w-3 ml-1" /></Button>
      </div>
    </div>

    <Separator />

    {trendStats.length > 0 && (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Activity signals</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {trendStats.map((stat) => {
            const status = stat.comparisonStatus ?? (stat.changePercent === null ? 'new-activity' : 'comparable');
            return (
              <Card key={stat.query}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">{stat.query}</p>
                    <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                      <TrendIcon value={status === 'comparable' ? stat.changePercent : null} />
                      {status === 'lower-bound'
                        ? 'comparison unavailable'
                        : status === 'new-activity'
                          ? 'new activity'
                          : status === 'unavailable'
                            ? 'comparison unavailable'
                            : status === 'low-volume'
                              ? 'small sample'
                              : `sample ${(stat.changePercent ?? 0) > 0 ? '+' : ''}${stat.changePercent ?? 0}%`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {countLabel(stat.currentCount, stat.currentIsLowerBound)} current retrieved · {countLabel(stat.previousCount, stat.previousIsLowerBound)} previous retrieved
                  </p>
                  {stat.comparisonNote && <p className="text-[11px] text-muted-foreground">{stat.comparisonNote}</p>}
                  {status === 'lower-bound' && (
                    <p className="text-[11px] text-muted-foreground">At least one period reached the collection limit, so a percentage comparison would be misleading.</p>
                  )}
                  {status === 'low-volume' && typeof stat.changePercent === 'number' && (
                    <p className="text-[11px] text-muted-foreground">Raw retrieved-sample change: {stat.changePercent > 0 ? '+' : ''}{stat.changePercent}%. The sample is too small to present this as a strong activity signal.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    )}

    {researchSignals && (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Research basis</h3>
          <p className="text-xs text-muted-foreground">
            {researchSignals.analyzedCount} analyzed · {researchSignals.sampleSize} retrieved{researchSignals.methodology?.timeRange ? ` · ${researchSignals.methodology.timeRange}` : ""}{typeof researchSignals.methodology?.rankingsAvailable === 'number' && typeof researchSignals.methodology?.rankingsTotal === 'number' ? ` · ${researchSignals.methodology.rankingsAvailable}/${researchSignals.methodology.rankingsTotal} rankings` : ''}
          </p>
        </div>
        {researchSignals.methodology?.periodStart && researchSignals.methodology?.periodEnd && (
          <p className="text-[11px] text-muted-foreground">Current sample · {researchSignals.methodology.periodStart} to {researchSignals.methodology.periodEnd}{researchSignals.methodology.comparisonStart && researchSignals.methodology.comparisonEnd ? ` · comparison · ${researchSignals.methodology.comparisonStart} to ${researchSignals.methodology.comparisonEnd}` : ''}</p>
        )}
        {researchSignals.relevance && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{researchSignals.relevance.relevant} relevant</Badge>
              <Badge variant="secondary">{researchSignals.relevance.adjacent} adjacent</Badge>
              <Badge variant="outline">{researchSignals.relevance.incidental} excluded</Badge>
              {typeof researchSignals.relevance.precisionPercent === 'number' && <Badge variant="outline">sample precision · {researchSignals.relevance.precisionPercent}%</Badge>}
              {(researchSignals.relevance.precisionAssessment === 'low' || (typeof researchSignals.relevance.precisionPercent === 'number' && researchSignals.relevance.precisionPercent < 50)) && (
                <Badge variant="warning">low precision · broad/ambiguous query</Badge>
              )}
            </div>
            {researchSignals.relevanceAudit?.some((item) => item.level === 'incidental') && (
              <details className="rounded-md border border-dashed px-2.5 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  Inspect excluded examples
                </summary>
                <div className="mt-2 space-y-2">
                  {researchSignals.relevanceAudit.filter((item) => item.level === 'incidental').slice(0, 5).map((item) => (
                    <div key={item.questionId} className="border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
                      <p className="text-xs font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Excluded · {item.reason}</p>
                    </div>
                  ))}
                  {researchSignals.relevance.incidental > 5 && (
                    <p className="text-[11px] text-muted-foreground">Showing 5 of {researchSignals.relevance.incidental} excluded questions.</p>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
        {researchSignals.selection && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {researchSignals.selection.eligibleCount} eligible questions · {researchSignals.selection.selectedCount} selected for analysis{researchSignals.selection.strategy === 'research-value-plus-diversity' ? ' using research value and topical diversity' : ''}{researchSignals.selection.researchDepth ? ` · ${researchSignals.selection.researchDepth} research depth` : ''}
              {typeof researchSignals.selection.deepDiveAttempted === 'number' ? ` · ${researchSignals.selection.deepDiveAttempted} deep dives attempted · ${researchSignals.selection.deepDiveSucceeded ?? 0} successful` : typeof researchSignals.selection.deepDiveCount === 'number' ? ` · ${researchSignals.selection.deepDiveCount} threads read in depth` : ''}.
            </p>
            {researchSignals.selection.deepDiveEvidenceMode === 'api-only' && (
              <p className="text-[11px] text-muted-foreground rounded-md border border-dashed px-2.5 py-2">Full-thread scraping was unavailable for this run. Analysis is based on Stack Exchange API question data only.</p>
            )}
            {researchSignals.selection.deepDiveEvidenceMode === 'partial-thread' && (
              <p className="text-[11px] text-muted-foreground rounded-md border border-dashed px-2.5 py-2">Some Playwright deep dives were unavailable. The report combines available full-thread content with Stack Exchange API question data.</p>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top tags in analyzed questions</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {researchSignals.topTags.length
                ? researchSignals.topTags.map((item) => <Badge key={item.tag} variant="secondary">{item.tag} · {item.count}</Badge>)
                : <p className="text-xs text-muted-foreground">No recurring tags in this sample.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Highest engagement</CardTitle><p className="text-[11px] text-muted-foreground">Directly relevant questions only</p></CardHeader>
            <CardContent className="space-y-2.5">
              {researchSignals.highestEngagement.length === 0 && (
                <p className="text-xs text-muted-foreground">No directly relevant questions qualified for this panel.</p>
              )}
              {researchSignals.highestEngagement.slice(0, 4).map((question) => (
                <div key={question.id}>
                  <a href={question.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline inline-flex items-start gap-1">
                    {question.title}<ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                  </a>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[11px] text-muted-foreground">{question.score} score · {question.answerCount} answers · {question.viewCount} views</p>
                    {question.highlights?.map((highlight) => (
                      <Badge key={highlight} variant="outline" className="text-[10px] px-1.5 py-0">{highlight.replace('highest-', 'highest ').replace('most-', 'most ').replace('research-value', 'research value')}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )}

    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Current trend summary</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{report.executiveSummary}</p></CardContent>
    </Card>

    {report.longitudinal && (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Across previous runs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{report.longitudinal.summary}</p>
          {typeof report.longitudinal.observationSpanDays === 'number' && (
            <p className="text-[11px] text-muted-foreground rounded-md bg-muted/30 px-2.5 py-2">
              Observation span · {report.longitudinal.observationSpanDays} days · {directionStatusText(report, researchSignals?.methodology?.timeRange)}
            </p>
          )}
          {report.longitudinal.signals.length > 0 && (
            <div className="space-y-2">
              {report.longitudinal.signals.map((signal, index) => (
                <div key={index} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium min-w-0">{signal.topic}</p>
                    <Badge variant="outline" className="capitalize">{signal.evidenceType === 'post-persistence' ? 'persistent' : signal.direction.replace("not-observed", "not observed")}</Badge>
                    {signal.evidenceType && <Badge variant="secondary" className="capitalize">{signal.evidenceType === 'post-persistence' ? 'post persistence' : signal.evidenceType.replaceAll('-', ' ')}</Badge>}
                    {signal.evidenceType === 'recurring-topic' && signal.independentAuthorCount === 1 && (
                      <Badge variant="secondary" className="capitalize">single-author evidence</Badge>
                    )}
                  </div>
                  {(typeof signal.independentQuestionCount === 'number' || typeof signal.observationCount === 'number') && (
                    <>
                      <p className="text-[11px] text-foreground/75 mt-1 font-medium">Aggregated across stored observation windows · {signal.independentQuestionCount ?? 0} distinct {signal.independentQuestionCount === 1 ? 'question' : 'questions'}{typeof signal.independentAuthorCount === 'number' ? ` · ${signal.independentAuthorCount} ${signal.independentAuthorCount === 1 ? 'author' : 'authors'}` : ''} · observed on {signal.observationCount ?? 0} {signal.observationCount === 1 ? 'date' : 'dates'}{signal.confidence ? ` · ${signal.confidence} confidence` : ''}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{signal.evidenceType === 'post-persistence' ? 'Post persistence · repeat observations of the same supporting posts do not broaden topic evidence.' : signal.evidenceType === 'recurring-topic' ? 'Topic recurrence · distinct questions broaden the evidence; repeat retrieval of the same question is counted only as repeated observation.' : 'Counts combine unique question IDs, known authors, and observation dates from the supplied stored runs.'}</p>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{signal.evidence}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )}

    {(report.emergingSignals?.length ?? 0) > 0 && (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Emerging or newly observed signals</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.emergingSignals?.map((signal, index) => (
            <Card key={index}>
              <CardHeader className="pb-1 pt-4"><CardTitle className="text-sm">{signal.title}</CardTitle></CardHeader>
              <CardContent className="pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{signal.description}</p>
                <FindingMeta distinctQuestionCount={signal.distinctQuestionCount} distinctAuthorCount={signal.distinctAuthorCount} evidenceStrength={signal.evidenceStrength} />
                <Evidence items={signal.evidence} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )}

    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Discussion themes</h3>
      {report.themes.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">No strong discussion themes met the evidence and coherence threshold in this sample.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {report.themes.map((theme, index) => (
            <Card key={index}>
              <CardHeader className="pb-1 pt-4"><CardTitle className="text-sm">{theme.title}</CardTitle></CardHeader>
              <CardContent className="pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{theme.description}</p>
                <FindingMeta distinctQuestionCount={theme.distinctQuestionCount} distinctAuthorCount={theme.distinctAuthorCount} evidenceStrength={theme.evidenceStrength} />
                <Evidence items={theme.evidence} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Developer pain points</h3>
      {report.developerPainPoints.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">No developer pain points met the multi-question evidence threshold in this sample.</p>
      ) : (
        <div className="space-y-2">
          {report.developerPainPoints.map((item, index) => (
            <Card key={index}>
              <CardContent className="py-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                <FindingMeta distinctQuestionCount={item.distinctQuestionCount} distinctAuthorCount={item.distinctAuthorCount} evidenceStrength={item.evidenceStrength} />
                <Evidence items={item.evidence} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>

    {report.notableQuestions.length > 0 && (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Notable questions</h3>
        <div className="divide-y divide-border rounded-md border">
          {report.notableQuestions.map((question, index) => (
            <div key={index} className="p-3 space-y-2">
              <a href={question.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-sm font-medium text-foreground hover:text-primary hover:underline inline-flex items-start gap-1 break-words [overflow-wrap:anywhere]">
                <span className="min-w-0">{question.title}</span><ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
              </a>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
                <span>{question.score} score</span><span>{question.answerCount} answers</span>{typeof question.viewCount === 'number' && <span>{question.viewCount} views</span>}
                <ResolutionBadge status={question.resolutionStatus} />
                {typeof question.researchValue === 'number' && <Badge variant="outline" className="text-xs px-1.5 py-0">research value {question.researchValue}</Badge>}
                {question.highlights?.map((highlight) => <Badge key={highlight} variant="secondary" className="text-xs px-1.5 py-0">{highlight.replace('highest-', 'highest ').replace('most-', 'most ').replace('research-value', 'research value')}</Badge>)}
                {question.tags.slice(0, 4).map((tag) => <Badge key={tag} variant="outline" className="max-w-full text-xs px-1.5 py-0 break-all">{tag}</Badge>)}
                {question.tags.length > 4 && <span>+{question.tags.length - 4} more</span>}
              </div>
              {question.selectionReason && (
                <p className="min-w-0 text-xs text-muted-foreground leading-relaxed break-words [overflow-wrap:anywhere]">
                  <span className="font-medium text-foreground/80">Why notable · </span>{question.selectionReason}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);
