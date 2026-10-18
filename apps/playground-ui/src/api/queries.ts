import type { ManualEvidenceRequest, RunConfig } from '@playground/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  catalog: ['catalog'] as const,
  credentialConfigurations: (issuerId: string) => ['catalog', issuerId, 'credential-configurations'] as const,
  prediction: (config: RunConfig | null) => ['prediction', config] as const,
  run: (id: string) => ['runs', id] as const,
  exchanges: (id: string) => ['runs', id, 'exchanges'] as const,
  report: (id: string) => ['runs', id, 'report'] as const,
};

export const useCatalog = () =>
  useQuery({ queryKey: queryKeys.catalog, queryFn: api.catalog, staleTime: 30_000 });

export const useCredentialConfigurations = (issuerId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.credentialConfigurations(issuerId ?? ''),
    queryFn: () => api.credentialConfigurations(issuerId!),
    enabled: Boolean(issuerId),
    staleTime: 60_000,
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
