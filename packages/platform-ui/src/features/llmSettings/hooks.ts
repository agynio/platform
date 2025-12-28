import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listProviders,
  listCredentials,
  listModels,
  listHealthCheckModes,
  getAdminStatus,
  type LiteLLMProviderInfo,
  type LiteLLMCredential,
  type LiteLLMModel,
  type LiteLLMAdminStatus,
} from '@/api/modules/llmSettings';
import { mapProviders, mapCredentials, mapModels, createProviderOptionMap, type ProviderOption } from './types';
import { HEALTH_CHECK_MODES_FALLBACK } from './constants';

export function useProviderOptions(): {
  providers: ProviderOption[];
  map: Map<string, ProviderOption>;
  isLoading: boolean;
  error: unknown;
} {
  const query = useQuery({ queryKey: ['llm', 'providers'], queryFn: () => listProviders() });
  const providersPayload = query.data as LiteLLMProviderInfo[] | undefined;
  const providers = useMemo(() => mapProviders(providersPayload), [providersPayload]);
  const map = useMemo(() => createProviderOptionMap(providers), [providers]);
  return {
    providers,
    map,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCredentialRecords(providerMap: Map<string, ProviderOption>) {
  const query = useQuery({ queryKey: ['llm', 'credentials'], queryFn: () => listCredentials() });
  const credentialPayload = query.data as LiteLLMCredential[] | undefined;
  const credentials = useMemo(() => mapCredentials(credentialPayload, providerMap), [credentialPayload, providerMap]);
  return {
    credentials,
    query,
  };
}

export function useModelRecords(providerMap: Map<string, ProviderOption>) {
  const query = useQuery({ queryKey: ['llm', 'models'], queryFn: () => listModels() });
  const modelPayload = query.data as LiteLLMModel[] | undefined;
  const models = useMemo(() => mapModels(modelPayload, providerMap), [modelPayload, providerMap]);
  return {
    models,
    query,
  };
}

export function useHealthCheckModes() {
  const query = useQuery({ queryKey: ['llm', 'health-check-modes'], queryFn: () => listHealthCheckModes() });
  const modes = query.data ?? Array.from(HEALTH_CHECK_MODES_FALLBACK);
  return { modes, isLoading: query.isLoading };
}

export function useAdminStatus() {
  return useQuery<LiteLLMAdminStatus>({ queryKey: ['llm', 'admin-status'], queryFn: () => getAdminStatus() });
}
