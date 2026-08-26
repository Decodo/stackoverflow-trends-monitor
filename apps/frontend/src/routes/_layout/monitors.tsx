import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarClock, ExternalLink, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useDeleteMonitorMutation, useMonitorsQuery, useRunMonitorMutation, useUpdateMonitorMutation } from '@/features/monitors/api/useMonitorsApi';

export const Route = createFileRoute('/_layout/monitors')({ component: MonitorsPage });

const timeRangeLabel = (value: string) => ({ day: 'Past day', week: 'Past week', month: 'Past month', year: 'Past year' }[value] ?? value);
const depthLabel = (value?: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Standard';
const cadenceLabel = (cadence: string, intervalHours?: number) => {
  if (cadence === 'custom-hours') return `Every ${intervalHours ?? 1} ${intervalHours === 1 ? 'hour' : 'hours'}`;
  return cadence.charAt(0).toUpperCase() + cadence.slice(1);
};

function MonitorsPage() {
  const { data: monitors, isLoading } = useMonitorsQuery();
  const update = useUpdateMonitorMutation();
  const remove = useDeleteMonitorMutation();
  const run = useRunMonitorMutation();

  return (
    <div className="py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Monitors</h1>
        <p className="text-sm text-muted-foreground mt-1">Recurring Stack Overflow analyses with stored longitudinal history</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : !monitors?.length ? (
        <Card><CardContent className="py-12 text-center"><CalendarClock className="h-9 w-9 mx-auto text-muted-foreground mb-3" /><p className="text-sm font-medium">No recurring monitors yet</p><p className="text-xs text-muted-foreground mt-1">Create one when reviewing a scraping plan.</p><Button asChild variant="outline" size="sm" className="mt-4"><Link to="/tracker">Create a monitor</Link></Button></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {monitors.map((monitor) => (
            <Card key={monitor._id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-medium truncate">{monitor.name}</p><Badge variant={monitor.enabled ? 'secondary' : 'outline'}>{monitor.enabled ? cadenceLabel(monitor.cadence, monitor.intervalHours) : 'Paused'}</Badge></div>
                    <p className="text-xs text-muted-foreground mt-1">{monitor.plan.queries.join(' · ')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeRangeLabel(monitor.plan.timeRange)} · {depthLabel(monitor.plan.researchDepth)} depth · Max {monitor.plan.maxPosts ?? 30}{monitor.plan.tags.length ? ` · tags: ${monitor.plan.tags.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate(monitor._id)}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Run now</Button>
                    <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: monitor._id, enabled: !monitor.enabled })}>{monitor.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(monitor._id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Next run · {new Date(monitor.nextRunAt).toLocaleString()}</span>
                  {monitor.lastRunAt && <span>Last run · {new Date(monitor.lastRunAt).toLocaleString()} · <span className={monitor.lastError ? 'text-destructive' : 'text-emerald-500'}>{monitor.lastError ? 'Failed' : 'Successful'}</span></span>}
                  {monitor.lastQueryId && <Link to="/history/$id" params={{ id: monitor.lastQueryId }} className="inline-flex items-center gap-1 hover:text-foreground">Latest report <ExternalLink className="h-3 w-3" /></Link>}
                </div>
                {monitor.lastError && <p className="text-xs text-destructive">Last run failed · {monitor.lastError}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Local scheduler note · automatic runs occur only while the backend process is running.</p>
    </div>
  );
}
