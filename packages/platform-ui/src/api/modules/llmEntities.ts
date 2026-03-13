import { llmHttp } from '@/api/http';

export type LLMAuthMethod = 'bearer';

export type LLMProvider = {
  id: string;
  endpoint: string;
  authMethod: LLMAuthMethod;
};

export type LLMProviderCreateInput = {
  endpoint: string;
  authMethod: LLMAuthMethod;
  token: string;
};

export type LLMProviderUpdateInput = {
  endpoint?: string;
  authMethod?: LLMAuthMethod;
  token?: string;
};

export type LLMModel = {
  id: string;
  name: string;
  llmProviderId: string;
  remoteName: string;
};

export type LLMModelCreateInput = {
  name: string;
  llmProviderId: string;
  remoteName: string;
};

export type LLMModelUpdateInput = {
  name?: string;
  llmProviderId?: string;
  remoteName?: string;
};

type ProviderListResponse = LLMProvider[] | { items?: LLMProvider[] } | null | undefined;
type ModelListResponse = LLMModel[] | { items?: LLMModel[] } | null | undefined;

function normalizeProviderList(payload: ProviderListResponse): LLMProvider[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeModelList(payload: ModelListResponse): LLMModel[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export async function listLLMProviders(): Promise<LLMProvider[]> {
  const res = await llmHttp.get<ProviderListResponse>('/providers');
  return normalizeProviderList(res);
}

export function getLLMProvider(id: string): Promise<LLMProvider> {
  return llmHttp.get<LLMProvider>(`/providers/${encodeURIComponent(id)}`);
}

export function createLLMProvider(payload: LLMProviderCreateInput): Promise<LLMProvider> {
  return llmHttp.post<LLMProvider>('/providers', payload);
}

export function updateLLMProvider(id: string, payload: LLMProviderUpdateInput): Promise<LLMProvider> {
  return llmHttp.patch<LLMProvider>(`/providers/${encodeURIComponent(id)}`, payload);
}

export function deleteLLMProvider(id: string): Promise<void> {
  return llmHttp.delete<void>(`/providers/${encodeURIComponent(id)}`);
}

export async function listLLMModels(): Promise<LLMModel[]> {
  const res = await llmHttp.get<ModelListResponse>('/models');
  return normalizeModelList(res);
}

export function getLLMModel(id: string): Promise<LLMModel> {
  return llmHttp.get<LLMModel>(`/models/${encodeURIComponent(id)}`);
}

export function createLLMModel(payload: LLMModelCreateInput): Promise<LLMModel> {
  return llmHttp.post<LLMModel>('/models', payload);
}

export function updateLLMModel(id: string, payload: LLMModelUpdateInput): Promise<LLMModel> {
  return llmHttp.patch<LLMModel>(`/models/${encodeURIComponent(id)}`, payload);
}

export function deleteLLMModel(id: string): Promise<void> {
  return llmHttp.delete<void>(`/models/${encodeURIComponent(id)}`);
}
