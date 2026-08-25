import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Search, Sparkles } from 'lucide-react';
import type { MonitorCadence, ResearchDepth, TimeRange } from '../tracker.types';

const EXAMPLE_PROMPTS = ['java', 'c#', 'android', 'react'];

export interface TopicSearchOptions {
  tags: string[];
  timeRange: TimeRange;
  maxPosts?: number;
  researchDepth: ResearchDepth;
  schedule?: { cadence: MonitorCadence; name: string; intervalHours?: number };
}

interface PromptFormProps {
  onSubmit: (prompt: string, options: TopicSearchOptions) => void;
  onTrending: (researchDepth: ResearchDepth) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

export const PromptForm = ({ onSubmit, onTrending, onCancel, isLoading }: PromptFormProps) => {
  const [prompt, setPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tagFiltersEnabled, setTagFiltersEnabled] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [maxPostsInput, setMaxPostsInput] = useState('30');
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>('standard');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [cadence, setCadence] = useState<MonitorCadence>('weekly');
  const [intervalHoursInput, setIntervalHoursInput] = useState('6');
  const [monitorName, setMonitorName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;
    const tags = tagFiltersEnabled
      ? tagsInput.split(',').map((tag) => tag.trim().replace(/^\[|\]$/g, '').toLowerCase()).filter(Boolean)
      : [];
    const maxPostsNum = parseInt(maxPostsInput, 10);
    const maxPosts = !isNaN(maxPostsNum) && maxPostsNum >= 5 && maxPostsNum <= 60 ? maxPostsNum : undefined;
    const intervalHoursNum = parseInt(intervalHoursInput, 10);
    const intervalHours = cadence === 'custom-hours' && !isNaN(intervalHoursNum) && intervalHoursNum >= 1 && intervalHoursNum <= 720
      ? intervalHoursNum
      : undefined;
    onSubmit(cleanPrompt, {
      tags,
      timeRange,
      maxPosts,
      researchDepth,
      schedule: scheduleEnabled
        ? { cadence, name: monitorName.trim() || cleanPrompt, intervalHours }
        : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Explore what’s trending</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No keyword required. Combines Stack Overflow’s Hot, Week, Votes, and Activity rankings.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onTrending(researchDepth)} disabled={isLoading} className="shrink-0">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Explore trends
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="researchDepth" className="text-xs">Research depth</Label>
        <Select value={researchDepth} onValueChange={(value) => setResearchDepth(value as ResearchDepth)} disabled={isLoading}>
          <SelectTrigger id="researchDepth" className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="focused">Focused</SelectItem>
            <SelectItem value="standard">Standard · Recommended</SelectItem>
            <SelectItem value="thorough">Thorough</SelectItem>
            <SelectItem value="comprehensive">Comprehensive</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Higher depth reads more promising questions as full threads, increasing analysis time and proxy/LLM resources. Lower depth is faster and uses fewer resources.</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or monitor a topic
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a broad keyword or topic, for example java"
            rows={2}
            disabled={isLoading}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
          {!prompt && !isLoading && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((example) => (
                <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground transition-colors">
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="timeRange" className="text-xs">Trend window</Label>
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)} disabled={isLoading}>
              <SelectTrigger id="timeRange" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Past week</SelectItem>
                <SelectItem value="month">Past month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxPosts" className="text-xs">Max questions</Label>
            <Input id="maxPosts" type="number" min={5} max={60} value={maxPostsInput} onChange={(e) => setMaxPostsInput(e.target.value)} disabled={isLoading} className="h-9 text-sm" />
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Optional filters and scheduling
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 rounded-md border border-border p-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tagFiltersEnabled} onChange={(e) => setTagFiltersEnabled(e.target.checked)} disabled={isLoading} />
                  Filter by Stack Overflow tags
                </label>
                <p className="text-xs text-muted-foreground">Off by default because tags narrow the search. Turn this on only when you want matching questions to contain one of the specified tags.</p>
                {tagFiltersEnabled && (
                  <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="python, pandas" disabled={isLoading} className="h-8 text-sm" />
                )}
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} disabled={isLoading} />
                  Save as recurring monitor
                </label>
                {scheduleEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cadence</Label>
                      <Select value={cadence} onValueChange={(value) => setCadence(value as MonitorCadence)} disabled={isLoading}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom-hours">Every N hours</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {cadence === 'custom-hours' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Interval in hours</Label>
                        <Input
                          type="number"
                          min={1}
                          max={720}
                          step={1}
                          value={intervalHoursInput}
                          onChange={(e) => setIntervalHoursInput(e.target.value)}
                          disabled={isLoading}
                          className="h-8 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">Runs approximately every N hours while the backend is running.</p>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Monitor name</Label>
                      <Input value={monitorName} onChange={(e) => setMonitorName(e.target.value)} placeholder={prompt || 'Monitor name'} disabled={isLoading} className="h-8 text-sm" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={!prompt.trim() || isLoading} className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            {isLoading ? 'Analyzing…' : 'Analyze topic'}
          </Button>
          {isLoading && onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
      </form>
    </div>
  );
};
