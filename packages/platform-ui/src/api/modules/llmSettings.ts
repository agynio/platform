import axios, { type AxiosError } from 'axios';
import { http } from '@/api/http';

export type LiteLLMProviderField = {
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder?: string | null;
  tooltip?: string | null;
  options?: string[] | null;
  default_value?: string | null;
};

export type LiteLLMProviderInfo = {
  provider: string;
  provider_display_name: string;
  litellm_provider: string;
  credential_fields: LiteLLMProviderField[];
  default_model_placeholder?: string | null;
};

export type LiteLLMCredential = {
  credential_name: string;
  credential_info: Record<string, unknown>;
  credential_values: Record<string, unknown>;
};

export type LiteLLMModel = {
  model_name: string;
  litellm_params: Record<string, unknown>;
  model_info: Record<string, unknown>;
  model_id?: string;
};

export type LiteLLMGenericResponse = {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type LiteLLMHealthResponse = {
  success?: boolean;
  status?: string;
  [key: string]: unknown;
};

export type LiteLLMAdminErrorPayload = {
  error?: string;
  status?: number;
  missing?: string[];
  details?: { error?: string } | Record<string, unknown>;
};

export type LiteLLMAdminStatus = {
  configured: boolean;
  baseUrl?: string;
  hasMasterKey: boolean;
  provider: string;
  adminReachable?: boolean;
  reason?: 'missing_env' | 'unauthorized' | 'unreachable';
};

export function isLiteLLMMissingConfigError(error: unknown): error is AxiosError<LiteLLMAdminErrorPayload> {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response || error.response.status !== 503) return false;
  const payload = error.response.data as LiteLLMAdminErrorPayload | undefined;
  return payload?.error === 'litellm_missing_config';
}

export async function listHealthCheckModes(): Promise<string[]> {
  const res = await http.get<{ modes?: string[] }>('/api/settings/llm/health-check-modes');
  return Array.isArray(res?.modes) ? res.modes : [];
}

export async function listProviders(): Promise<LiteLLMProviderInfo[]> {
  const res = await http.get<LiteLLMProviderInfo[]>('/api/settings/llm/providers');
  return Array.isArray(res) ? res : [];
}

export async function getAdminStatus(): Promise<LiteLLMAdminStatus> {
  return http.get<LiteLLMAdminStatus>('/api/settings/llm/admin-status');
}

export async function listCredentials(): Promise<LiteLLMCredential[]> {
  const res = await http.get<LiteLLMCredential[]>('/api/settings/llm/credentials');
  return Array.isArray(res) ? res : [];
}

export async function createCredential(body: {
  name: string;
  provider: string;
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
}): Promise<LiteLLMGenericResponse> {
  return http.post('/api/settings/llm/credentials', body);
}

export async function updateCredential(name: string, body: {
  provider?: string;
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
}): Promise<LiteLLMGenericResponse> {
  return http.patch(`/api/settings/llm/credentials/${encodeURIComponent(name)}`, body);
}

export async function deleteCredential(name: string): Promise<LiteLLMGenericResponse> {
  return http.delete(`/api/settings/llm/credentials/${encodeURIComponent(name)}`);
}

export async function testCredential(name: string, body: { model: string; mode?: string; input?: string }): Promise<LiteLLMHealthResponse> {
  return http.post(`/api/settings/llm/credentials/${encodeURIComponent(name)}/test`, body);
}

export async function listModels(): Promise<LiteLLMModel[]> {
  const res = await http.get<{ models?: LiteLLMModel[] }>('/api/settings/llm/models');
  return Array.isArray(res?.models) ? res.models : [];
}

export async function createModel(body: {
  name: string;
  provider: string;
  model: string;
  credentialName: string;
  mode?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  rpm?: number;
  tpm?: number;
  metadata?: Record<string, unknown>;
  params?: Record<string, unknown>;
}): Promise<LiteLLMModel> {
  return http.post('/api/settings/llm/models', body);
}

export async function updateModel(id: string, body: {
  name?: string;
  provider?: string;
  model?: string;
  credentialName?: string;
  mode?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  rpm?: number;
  tpm?: number;
  metadata?: Record<string, unknown>;
  params?: Record<string, unknown>;
}): Promise<LiteLLMModel> {
  return http.patch(`/api/settings/llm/models/${encodeURIComponent(id)}`, body);
}

export async function deleteModel(id: string): Promise<LiteLLMGenericResponse> {
  return http.delete(`/api/settings/llm/models/${encodeURIComponent(id)}`);
}

export async function testModel(id: string, body?: { mode?: string; overrideModel?: string; input?: string; credentialName?: string }): Promise<LiteLLMHealthResponse> {
  return http.post(`/api/settings/llm/models/${encodeURIComponent(id)}/test`, body ?? {});
}
