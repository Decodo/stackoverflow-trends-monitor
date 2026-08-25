import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCcw } from 'lucide-react';
import { PromptForm } from '@/features/tracker/components/PromptForm';
import type { TopicSearchOptions } from '@/features/tracker/components/PromptForm';
import { ReportView } from '@/features/tracker/components/ReportView';
import { TrendingView } from '@/features/tracker/components/TrendingView';
import { useAnalyzePlanStream, useTrendingStream } from '@/features/tracker/api/useTrackerApi';
import type { ProgressState } from '@/features/tracker/api/useTrackerApi';
import { exportAsMarkdown, exportAsJson } from '@/features/tracker/utils/export';
import type { AnalyzeResult, ResearchDepth, TrendingResult } from '@/features/tracker/tracker.types';
import { useCreateMonitorMutation } from '@/features/monitors/api/useMonitorsApi';

export const Route = createFileRoute('/_layout/tracker')({ component: TrackerPage });

type Step =
  | { stage: 'input' }
  | { stage: 'topic-done'; result: AnalyzeResult; prompt: string }
  | { stage: 'trending-done'; result: TrendingResult };

const AnalyzingState = ({ progress, onCancel }: { progress: ProgressState | null; onCancel: () => void }) => {
  const showBar = progress !== null && progress.total > 0 && progress.completed < progress.total;
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          <p className="text-sm text-muted-foreground truncate">{progress?.label ?? 'Analyzing Stack Overflow…'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onCancel} className="shrink-0">Cancel</Button>
      </div>
      {showBar && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress?.sublabel ?? ''}</span>
            <span>{progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

const getApiError = (error: unknown): string | undefined =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (error as Error)?.message;

const ErrorMessage = ({ message, error }: { message: string; error?: unknown }) => {
  const apiMessage = getApiError(error);
  return (
    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive space-y-1">
      <p className="font-medium">{apiMessage ?? message}</p>
      {apiMessage && <p className="opacity-80">{message}</p>}
    </div>
  );
};

function TrackerPage() {
  const [step, setStep] = useState<Step>({ stage: 'input' });
  const analyze = useAnalyzePlanStream();
  const trending = useTrendingStream();
  const createMonitor = useCreateMonitorMutation();

  const isLoading = analyze.isPending || trending.isPending || createMonitor.isPending;

  const handleTopicSubmit = async (prompt: string, options: TopicSearchOptions) => {
    let monitorId: string | undefined;
    const analysisPlan = {
      prompt,
      keywords: [prompt],
      tags: options.tags,
      queries: [prompt],
      timeRange: options.timeRange,
      maxPosts: options.maxPosts,
      researchDepth: options.researchDepth,
    };

    if (options.schedule) {
      try {
        const monitor = await createMonitor.mutateAsync({
          name: options.schedule.name,
          prompt,
          keywords: [prompt],
          tags: options.tags,
          queries: [prompt],
          timeRange: options.timeRange,
          maxPosts: options.maxPosts,
          researchDepth: options.researchDepth,
          cadence: options.schedule.cadence,
          intervalHours: options.schedule.intervalHours,
        });
        monitorId = monitor._id;
      } catch {
        return;
      }
    }

    analyze.mutate({ ...analysisPlan, monitorId }, {
      onSuccess: (result) => setStep({ stage: 'topic-done', result, prompt }),
    });
  };

  const handleTrending = (researchDepth: ResearchDepth) => {
    trending.mutate({ researchDepth }, { onSuccess: (result) => setStep({ stage: 'trending-done', result }) });
  };

  const reset = () => {
    setStep({ stage: 'input' });
    analyze.reset();
    trending.reset();
    createMonitor.reset();
  };

  const done = step.stage !== 'input';

  return (
    <div className="py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Stack Overflow Trends</h1>
            <p className="text-sm text-muted-foreground mt-1">{done ? 'Your intelligence report' : 'Research a topic or explore current trends'}</p>
          </div>
          {done && (
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Start over</Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base">{done ? 'Report' : 'Stack Overflow intelligence'}</CardTitle></CardHeader>
          <CardContent>
            {step.stage === 'input' && isLoading ? (
              <AnalyzingState progress={analyze.isPending ? analyze.progress : trending.progress} onCancel={analyze.isPending ? analyze.reset : trending.reset} />
            ) : step.stage === 'input' ? (
              <>
                <PromptForm onSubmit={handleTopicSubmit} onTrending={handleTrending} isLoading={isLoading} />
                {createMonitor.isError && <ErrorMessage message="Could not save the recurring monitor." error={createMonitor.error} />}
                {analyze.isError && <ErrorMessage message="Analysis failed." error={analyze.error} />}
                {trending.isError && <ErrorMessage message="Could not load current Stack Overflow trends." error={trending.error} />}
              </>
            ) : step.stage === 'topic-done' ? (
              <ReportView
                prompt={step.prompt}
                report={step.result.report}
                trendStats={step.result.trendStats}
                researchSignals={step.result.researchSignals}
                generatedAt={step.result.generatedAt}
                onExportMarkdown={() => exportAsMarkdown(step.prompt, step.result.report, step.result.trendStats, step.result.researchSignals, step.result.generatedAt)}
                onExportJson={() => exportAsJson(step.result)}
              />
            ) : (
              <TrendingView result={step.result} />
            )}
          </CardContent>
        </Card>

        {step.stage === 'input' && !isLoading && (
          <p className="text-center text-xs text-muted-foreground">Need to configure API keys? <Link to="/settings" className="underline underline-offset-2">Go to Settings</Link></p>
        )}
      </div>
    </div>
  );
}
