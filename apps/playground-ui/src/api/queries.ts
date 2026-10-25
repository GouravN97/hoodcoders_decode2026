import type { ManualEvidenceRequest, RunConfig } from '@playground/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  catalog: ['catalog'] as const,
  credentialConfigurations: (issuerId: string) => ['catalog', issuerId, 'credential-configurations'] as const,
  heldCredentials: (walletId: string) => ['catalog', walletId, 'credentials'] as const,
  prediction: (config: RunConfig | null) => ['prediction', config] as const,
  runs: (query: Record<string, string | undefined>) => ['runs', 'list', query] as const,
  matrix: (includeNegative: boolean) => ['matrix', includeNegative] as const,
  run: (id: string) => ['runs', id] as const,
  exchanges: (id: string) => ['runs', id, 'exchanges'] as const,
  report: (id: string) => ['runs', id, 'report'] as const,
};

// Health changes while the page is open (a container restarts), so the catalog refreshes itself.
export const useCatalog = () =>
  useQuery({
    queryKey: queryKeys.catalog,
    queryFn: api.catalog,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

export const useCredentialConfigurations = (issuerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.credentialConfigurations(issuerId ?? ''),
    queryFn: () => api.credentialConfigurations(issuerId!),
    enabled: Boolean(issuerId),
    staleTime: 60_000,
  });

/** What the wallet already holds; only fetched for present-only runs. */
export const useHeldCredentials = (walletId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.heldCredentials(walletId ?? ''),
    queryFn: () => api.heldCredentials(walletId!),
    enabled: enabled && Boolean(walletId),
    staleTime: 5_000,
  });

export const usePrediction = (config: RunConfig | null) =>
  useQuery({
    queryKey: queryKeys.prediction(config),
    queryFn: () => api.predict(config!),
    enabled: config !== null,
    placeholderData: (prev) => prev,
  });

export const useCreateRun = () => useMutation({ mutationFn: api.createRun });

export const useRun = (id: string) =>
  useQuery({ queryKey: queryKeys.run(id), queryFn: () => api.run(id) });

export const useRuns = (query: Record<string, string | undefined>, enabled = true) =>
  useQuery({ queryKey: queryKeys.runs(query), queryFn: () => api.runs(query), enabled, staleTime: 5_000 });

export const useMatrix = (includeNegative: boolean) =>
  useQuery({ queryKey: queryKeys.matrix(includeNegative), queryFn: () => api.matrix(includeNegative), staleTime: 5_000 });

export const useExchanges = (id: string) =>
  useQuery({ queryKey: queryKeys.exchanges(id), queryFn: () => api.exchanges(id) });

export const useReport = (id: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.report(id), queryFn: () => api.report(id), enabled });

export function useManualEvidence(runId: string) {
  return useMutation({
    mutationFn: (body: ManualEvidenceRequest) => api.manualEvidence(runId, body),
  });
}

export function useCancelRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancel(runId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.run(runId) }),
  });
}
