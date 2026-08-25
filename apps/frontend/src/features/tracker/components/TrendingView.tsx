import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import type { TrendingResult } from '../tracker.types';
import { ReportView } from './ReportView';
import { exportAsJson, exportAsMarkdown } from '../utils/export';

export const TrendingView = ({ result }: { result: TrendingResult }) => {
  const available = result.buckets.filter((bucket) => bucket.status !== 'unavailable').length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Leading tags in this week's trend sample</h3>
          <p className="text-xs text-muted-foreground">{available} of {result.buckets.length} rankings retrieved</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.frequentTags.length
            ? result.frequentTags.map((item) => <Badge key={item.tag} variant="secondary">{item.tag} · {item.count}</Badge>)
            : <p className="text-xs text-muted-foreground">Tag frequency is unavailable because the weekly ranking returned no sample.</p>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {result.buckets.map((bucket) => (
          <Card key={bucket.key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{bucket.label}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {bucket.status === 'unavailable' ? (
                <p className="text-xs text-muted-foreground">This ranking could not be retrieved. The report continues with the available sources.</p>
              ) : bucket.questions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No questions were returned for this ranking.</p>
              ) : bucket.questions.slice(0, 5).map((question) => (
                <div key={question.id} className="space-y-1">
                  <a href={question.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline flex items-start gap-1 min-w-0 break-words [overflow-wrap:anywhere]">
                    <span className="min-w-0">{question.title}</span><ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                  </a>
                  <p className="text-[11px] text-muted-foreground">{question.score} score · {question.answerCount} answers · {question.viewCount} views</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <ReportView
        prompt="Stack Overflow trends"
        report={result.report}
        trendStats={[]}
        researchSignals={result.researchSignals}
        generatedAt={result.generatedAt}
        onExportMarkdown={() => exportAsMarkdown('Stack Overflow trends', result.report, [], result.researchSignals, result.generatedAt)}
        onExportJson={() => exportAsJson(result)}
      />
    </div>
  );
};
