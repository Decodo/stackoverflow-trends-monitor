import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MonitorCadence, ResearchDepth, SavedMonitor, TimeRange } from '@/features/tracker/tracker.types';

const MONITORS_KEY = ['monitors'] as const;

export interface CreateMonitorInput {
  name: string;
  prompt: string;
  keywords: string[];
  tags: string[];
  queries: string[];
  timeRange: TimeRange;
  maxPosts?: number;
  researchDepth?: ResearchDepth;
  cadence: MonitorCadence;
  intervalHours?: number;
}

const fetchMonitors = async (): Promise<SavedMonitor[]> => (await api.get<SavedMonitor[]>('/monitors')).data;
const createMonitor = async (input: CreateMonitorInput): Promise<SavedMonitor> => (await api.post<SavedMonitor>('/monitors', input)).data;
const updateMonitor = async ({ id, ...data }: { id: string; enabled?: boolean; cadence?: MonitorCadence; intervalHours?: number }): Promise<SavedMonitor> => (await api.patch<SavedMonitor>(`/monitors/${id}`, data)).data;
const deleteMonitor = async (id: string): Promise<void> => { await api.delete(`/monitors/${id}`); };
const runMonitor = async (id: string): Promise<unknown> => (await api.post(`/monitors/${id}/run`)).data;

export const useMonitorsQuery = () => useQuery({ queryKey: MONITORS_KEY, queryFn: fetchMonitors });

export const useCreateMonitorMutation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: createMonitor, onSuccess: () => client.invalidateQueries({ queryKey: MONITORS_KEY }) });
};

export const useUpdateMonitorMutation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: updateMonitor, onSuccess: () => client.invalidateQueries({ queryKey: MONITORS_KEY }) });
};

export const useDeleteMonitorMutation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteMonitor, onSuccess: () => client.invalidateQueries({ queryKey: MONITORS_KEY }) });
};

export const useRunMonitorMutation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: runMonitor, onSuccess: () => { void client.invalidateQueries({ queryKey: MONITORS_KEY }); void client.invalidateQueries({ queryKey: ['queries'] }); } });
};
