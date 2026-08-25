import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AnalyzeResult, ResearchDepth, TimeRange, TrendingResult } from '../tracker.types';

interface AnalyzePlanInput {
  prompt: string;
  keywords: string[];
  tags: string[];
  queries: string[];
  timeRange: TimeRange;
  maxPosts?: number;
  researchDepth?: ResearchDepth;
  monitorId?: string;
}

type ProgressEvent =
  | { type: 'started'; totalTasks: number; queries: number; tags: number }
  | { type: 'task_complete'; completed: number; total: number; label: string }
  | { type: 'deep_diving'; posts: number }
  | { type: 'deep_dive_progress'; completed: number; total: number }
  | { type: 'selecting' }
  | { type: 'summarizing' }
  | { type: 'saving' };

export type ProgressState = {
  completed: number;
  total: number;
  label: string;
  sublabel?: string;
};

type AnalyzeSseEvent =
  | ProgressEvent
  | ({ type: 'complete' } & AnalyzeResult)
  | { type: 'error'; message: string };

type TrendingSseEvent =
  | ProgressEvent
  | ({ type: 'complete' } & TrendingResult)
  | { type: 'error'; message: string };

const BASE_URL = ((import.meta.env.PUBLIC_API_BASE_URL as string | undefined) ?? '/api').replace(/\/$/, '');

async function consumeStream<T>(
  path: string,
  body: object,
  onProgress: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) throw new Error(`Request failed: HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(6)) as AnalyzeSseEvent | TrendingSseEvent;
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'complete') return event as T;
      onProgress(event);
    }
  }

  throw new Error('Stream ended without a completion event');
}

function useProgressStream<T>(
  path: string,
  invalidateHistory = true,
) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mutate = useCallback(
    (dto: object, callbacks: { onSuccess?: (result: T) => void } = {}) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsPending(true);
      setIsError(false);
      setError(null);
      setProgress({ completed: 0, total: 0, label: 'Connecting…' });

      consumeStream<T>(
        path,
        dto,
        (event) => {
          if (event.type === 'started') {
            setProgress({ completed: 0, total: event.totalTasks, label: 'Collecting Stack Overflow data…' });
          } else if (event.type === 'task_complete') {
            setProgress({ completed: event.completed, total: event.total, label: event.label });
          } else if (event.type === 'selecting') {
            setProgress({ completed: 0, total: 0, label: 'Selecting the strongest evidence…', sublabel: undefined });
          } else if (event.type === 'deep_diving') {
            setProgress({ completed: 0, total: event.posts, label: 'Reading selected question threads…', sublabel: `0 of ${event.posts}` });
          } else if (event.type === 'deep_dive_progress') {
            setProgress({ completed: event.completed, total: event.total, label: 'Reading selected question threads…', sublabel: `${event.completed} of ${event.total}` });
          } else if (event.type === 'summarizing') {
            setProgress({ completed: 0, total: 0, label: 'Generating trend analysis…', sublabel: undefined });
          } else if (event.type === 'saving') {
            setProgress({ completed: 0, total: 0, label: 'Saving to history…', sublabel: undefined });
          }
        },
        ac.signal,
      )
        .then((result) => {
          setIsPending(false);
          if (invalidateHistory) void queryClient.invalidateQueries({ queryKey: ['queries'] });
          callbacks.onSuccess?.(result);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsError(true);
          setIsPending(false);
        });
    },
    [invalidateHistory, path, queryClient],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsPending(false);
    setIsError(false);
    setError(null);
    setProgress(null);
  }, []);

  return { mutate, isPending, isError, error, progress, reset };
}

export function useAnalyzePlanStream() {
  return useProgressStream<AnalyzeResult>('/tracker/analyze/stream');
}

export function useTrendingStream() {
  return useProgressStream<TrendingResult>('/tracker/trending/stream');
}

export type { AnalyzePlanInput };
