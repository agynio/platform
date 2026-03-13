import { llmHttp } from '@/api/http';

export type LLMAuthMethod = 'bearer';

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
};

export type LLMProvider = {
  id: string;
  endpoint: string;
  authMethod: LLMAuthMethod;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

export type ListLLMProvidersParams = {
  page?: number;
  perPage?: number;
};

export type ListLLMModelsParams = {
  page?: number;
  perPage?: number;
  providerId?: string;
};

export function listLLMProviders(params: ListLLMProvidersParams = {}): Promise<PaginatedResponse<LLMProvider>> {
  return llmHttp.get<PaginatedResponse<LLMProvider>>('/providers', { params });
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

export function listLLMModels(params: ListLLMModelsParams = {}): Promise<PaginatedResponse<LLMModel>> {
  return llmHttp.get<PaginatedResponse<LLMModel>>('/models', { params });
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
