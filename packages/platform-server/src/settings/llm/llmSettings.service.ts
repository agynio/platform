import { Injectable, Logger, BadRequestException, HttpException, Inject } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';
import {
  LiteLLMCredentialDetail,
  LiteLLMCredentialSummary,
  LiteLLMGenericResponse,
  LiteLLMHealthResponse,
  LiteLLMModelRecord,
  LiteLLMProviderInfo,
  LiteLLMAdminStatus,
} from './types';

type LiteLLMAdminErrorCode = 'litellm_admin_request_failed' | 'litellm_admin_unauthorized' | 'litellm_unreachable';

type CreateCredentialInput = {
  name: string;
  provider: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
};

type UpdateCredentialInput = {
  name: string;
  provider?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
};

type TestCredentialInput = {
  name: string;
  model?: string;
  mode?: string;
  input?: string;
};

type CreateModelInput = {
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
};

type UpdateModelInput = Partial<Omit<CreateModelInput, 'provider' | 'model' | 'credentialName'>> & {
  id: string;
  provider?: string;
  model?: string;
  credentialName?: string;
};

type TestModelInput = {
  id: string;
  mode?: string;
  overrideModel?: string;
  input?: string;
  credentialName?: string;
};

class LiteLLMAdminError extends HttpException {
  constructor(
    status: number,
    readonly code: LiteLLMAdminErrorCode,
    readonly payload: unknown,
  ) {
    super(
      {
        error: code,
        status,
        details: payload,
      },
      status,
    );
    this.name = 'LiteLLMAdminError';
  }

  get responseBody(): unknown {
    return this.payload;
  }
}

class LiteLLMAdminAuthRequiredError extends HttpException {
  constructor(readonly reason: 'missing_env' | 'unauthorized' | 'unreachable' = 'missing_env') {
    super(
      {
        error: 'litellm_admin_auth_required',
        reason,
      },
      503,
    );
    this.name = 'LiteLLMAdminAuthRequiredError';
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sanitizeRecord(input?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed.length) continue;
      out[key] = trimmed;
      continue;
    }
    if (raw === null) {
      out[key] = null;
      continue;
    }
    out[key] = raw;
  }
  return Object.keys(out).length ? out : {};
}

function sanitizeTags(tags?: string[]): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const cleaned = Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => tag.length > 0),
    ),
  );
  return cleaned.length ? cleaned : undefined;
}

function ensureNoSecretKeys(params?: Record<string, unknown>): void {
  if (!params) return;
  for (const key of Object.keys(params)) {
    if (/api[_-]?key/i.test(key) || /secret/i.test(key)) {
      throw new BadRequestException('model parameters must not include credential secrets');
    }
  }
}

function redactBaseUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.port ? `${parsed.protocol}//${parsed.hostname}:${parsed.port}` : `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return value;
  }
}

function extractCredentialProvider(info?: Record<string, unknown>): string | undefined {
  if (!info) return undefined;
  const litellm = info['litellm_provider'];
  if (typeof litellm === 'string' && litellm.trim().length > 0) {
    return litellm.trim();
  }
  const legacy = info['custom_llm_provider'];
  if (typeof legacy === 'string' && legacy.trim().length > 0) {
    return legacy.trim();
  }
  return undefined;
}

@Injectable()
export class LLMSettingsService {
  private readonly logger = new Logger(LLMSettingsService.name);
  private readonly timeoutMs = 10_000;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    ConfigService.assertInitialized(config);
  }

  async listProviders(): Promise<LiteLLMProviderInfo[]> {
    return this.fetchProviders();
  }

  async listCredentials(): Promise<LiteLLMCredentialSummary[]> {
    return this.fetchCredentials();
  }

  async createCredential(input: CreateCredentialInput): Promise<LiteLLMGenericResponse> {
    const info: Record<string, unknown> = {
      litellm_provider: input.provider,
      ...(input.metadata || {}),
    };
    const tags = sanitizeTags(input.tags);
    if (tags) info.tags = tags;
    const payload = {
      credential_name: input.name,
      credential_info: info,
      credential_values: sanitizeRecord(input.values) ?? {},
    };
    return this.request<LiteLLMGenericResponse>('POST', '/credentials', payload, { classifyWrite: true });
  }

  async updateCredential(input: UpdateCredentialInput): Promise<LiteLLMGenericResponse> {
    const info: Record<string, unknown> = {};
    if (input.provider) info.litellm_provider = input.provider;
    if (input.metadata) Object.assign(info, input.metadata);
    const tags = sanitizeTags(input.tags);
    if (tags) info.tags = tags;
    const sanitizedValues = sanitizeRecord(input.values);
    const payload = {
      credential_name: input.name,
      credential_info: info,
    };
    if (sanitizedValues && Object.keys(sanitizedValues).length > 0) {
      Object.assign(payload, { credential_values: sanitizedValues });
    }
    return this.request<LiteLLMGenericResponse>(
      'PATCH',
      `/credentials/${encodeURIComponent(input.name)}`,
      payload,
      { classifyWrite: true },
    );
  }

  async deleteCredential(name: string): Promise<LiteLLMGenericResponse> {
    const referencingModels = await this.findModelsReferencingCredential(name);
    if (referencingModels.length > 0) {
      throw new BadRequestException({
        error: 'credential_in_use',
        message: `Credential ${name} cannot be deleted while models (${referencingModels.join(', ')}) reference it`,
        models: referencingModels,
      });
    }
    return this.request<LiteLLMGenericResponse>('DELETE', `/credentials/${encodeURIComponent(name)}`, undefined, {
      classifyWrite: true,
    });
  }

  async testCredential(input: TestCredentialInput): Promise<LiteLLMHealthResponse> {
    if (!input.model) {
      throw new BadRequestException('model is required to test credential');
    }
    const detail = await this.getCredentialDetail(input.name);
    const provider = extractCredentialProvider(detail?.credential_info as Record<string, unknown> | undefined);
    if (!provider) {
      throw new BadRequestException('credential is missing provider metadata');
    }
    const litellmParams: Record<string, unknown> = {
      model: input.model,
      custom_llm_provider: provider,
      litellm_credential_name: input.name,
    };
    const modelInfo: Record<string, unknown> = {};
    if (input.input) modelInfo.test_prompt = input.input;
    const payload = {
      mode: input.mode ?? 'chat',
      litellm_params: litellmParams,
      model_info: modelInfo,
    };
    return this.request<LiteLLMHealthResponse>('POST', '/health/test_connection', payload, { classifyWrite: true });
  }

  async listModels(): Promise<LiteLLMModelRecord[]> {
    const body = await this.request<unknown>('GET', '/model/info');
    const models = extractLiteLLMArray(body, ['data', 'models']);
    return models.filter((item): item is LiteLLMModelRecord => isModelRecord(item));
  }

  async createModel(input: CreateModelInput): Promise<LiteLLMModelRecord> {
    ensureNoSecretKeys(input.params);
    const litellmParams = this.buildModelParams(input);
    const modelInfo = this.buildModelInfo(input);
    const payload = {
      model_name: input.name,
      litellm_params: litellmParams,
      model_info: modelInfo,
    };
    return this.request<LiteLLMModelRecord>('POST', '/model/new', payload, { classifyWrite: true });
  }

  async updateModel(input: UpdateModelInput): Promise<LiteLLMModelRecord> {
    ensureNoSecretKeys(input.params);
    const current = await this.findModel(input.id);
    if (!current) {
      throw new BadRequestException(`model ${input.id} not found`);
    }
    const nextParams = this.mergeModelParams(current.litellm_params, input);
    const nextInfo = this.mergeModelInfo(current.model_info, input);
    const name = input.name ?? current.model_name ?? input.id;
    const payload = {
      model_name: name,
      litellm_params: nextParams,
      model_info: nextInfo,
    };
    return this.request<LiteLLMModelRecord>('POST', '/model/update', payload, { classifyWrite: true });
  }

  async deleteModel(id: string): Promise<LiteLLMGenericResponse> {
    return this.request<LiteLLMGenericResponse>('POST', '/model/delete', { id }, { classifyWrite: true });
  }

  async testModel(input: TestModelInput): Promise<LiteLLMHealthResponse> {
    const current = await this.findModel(input.id);
    if (!current) {
      throw new BadRequestException(`model ${input.id} not found`);
    }
    const params = { ...current.litellm_params } as Record<string, unknown>;
    if (input.overrideModel) params.model = input.overrideModel;
    if (input.credentialName) params.litellm_credential_name = input.credentialName;
    const modelInfo: Record<string, unknown> = { ...(current.model_info ?? {}) };
    if (input.input) modelInfo.test_prompt = input.input;
    const payload = {
      mode: input.mode ?? (typeof current.model_info?.mode === 'string' ? current.model_info.mode : 'chat'),
      litellm_params: params,
      model_info: modelInfo,
    };
    return this.request<LiteLLMHealthResponse>('POST', '/health/test_connection', payload, { classifyWrite: true });
  }

  async getAdminStatus(): Promise<LiteLLMAdminStatus> {
    const provider = this.config.llmProvider;
    const baseUrlRaw = this.config.litellmBaseUrl;
    const masterKey = this.config.litellmMasterKey;
    const hasMasterKey = Boolean(masterKey);
    const sanitizedBaseUrl = baseUrlRaw ? redactBaseUrl(baseUrlRaw) : undefined;
    const configured = Boolean(provider === 'litellm' && baseUrlRaw && masterKey);
    const status: LiteLLMAdminStatus = {
      configured,
      baseUrl: sanitizedBaseUrl,
      hasMasterKey,
      provider,
    };

    if (provider !== 'litellm') {
      status.configured = false;
      status.reason = 'provider_mismatch';
      return status;
    }

    if (!baseUrlRaw || !masterKey) {
      status.configured = false;
      status.reason = 'missing_env';
      return status;
    }

    const probe = await this.checkAdminHealth(baseUrlRaw, masterKey);
    if (probe.adminReachable !== undefined) {
      status.adminReachable = probe.adminReachable;
    }
    if (probe.reason) {
      status.reason = probe.reason;
    }
    return status;
  }

  private async getCredentialDetail(name: string): Promise<LiteLLMCredentialDetail> {
    return this.request<LiteLLMCredentialDetail>(
      'GET',
      `/credentials/by_name/${encodeURIComponent(name)}`,
    );
  }

  private async checkAdminHealth(
    baseUrl: string,
    masterKey: string,
  ): Promise<{ adminReachable: boolean; reason?: 'unauthorized' | 'unreachable' }> {
    const target = `${baseUrl.replace(/\/$/, '')}/public/providers/fields`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(target, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${masterKey}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        return { adminReachable: false, reason: 'unauthorized' };
      }
      if (!res.ok) {
        return { adminReachable: false, reason: 'unreachable' };
      }
      return { adminReachable: true };
    } catch (err) {
      this.logger.debug(`LiteLLM admin probe failed: ${(err as Error).message}`);
      return { adminReachable: false, reason: 'unreachable' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildModelParams(input: CreateModelInput): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model: input.model,
      custom_llm_provider: input.provider,
      litellm_credential_name: input.credentialName,
      ...(input.params || {}),
    };
    if (input.temperature !== undefined) params.temperature = input.temperature;
    if (input.maxTokens !== undefined) params.max_tokens = input.maxTokens;
    if (input.topP !== undefined) params.top_p = input.topP;
    if (input.frequencyPenalty !== undefined) params.frequency_penalty = input.frequencyPenalty;
    if (input.presencePenalty !== undefined) params.presence_penalty = input.presencePenalty;
    if (input.stream !== undefined) params.stream = input.stream;
    return params;
  }

  private buildModelInfo(input: CreateModelInput): Record<string, unknown> {
    const info: Record<string, unknown> = {
      id: input.name,
      ...(input.metadata || {}),
    };
    info.mode = input.mode ?? 'chat';
    if (input.rpm !== undefined) info.rpm = input.rpm;
    if (input.tpm !== undefined) info.tpm = input.tpm;
    return info;
  }

  private mergeModelParams(existing: Record<string, unknown>, input: UpdateModelInput): Record<string, unknown> {
    const next = { ...(existing || {}) };
    if (input.provider) next.custom_llm_provider = input.provider;
    if (input.model) next.model = input.model;
    if (input.credentialName) next.litellm_credential_name = input.credentialName;
    if (input.temperature !== undefined) next.temperature = input.temperature;
    if (input.maxTokens !== undefined) next.max_tokens = input.maxTokens;
    if (input.topP !== undefined) next.top_p = input.topP;
    if (input.frequencyPenalty !== undefined) next.frequency_penalty = input.frequencyPenalty;
    if (input.presencePenalty !== undefined) next.presence_penalty = input.presencePenalty;
    if (input.stream !== undefined) next.stream = input.stream;
    if (input.params) {
      for (const [key, value] of Object.entries(input.params)) {
        if (value === undefined) continue;
        next[key] = value;
      }
    }
    return next;
  }

  private mergeModelInfo(existing: Record<string, unknown>, input: UpdateModelInput): Record<string, unknown> {
    const next = { ...(existing || {}) };
    if (input.name) next.id = input.name;
    if (input.mode) next.mode = input.mode;
    if (input.metadata) Object.assign(next, input.metadata);
    if (input.rpm !== undefined) next.rpm = input.rpm;
    if (input.tpm !== undefined) next.tpm = input.tpm;
    return next;
  }

  private async findModel(id: string): Promise<LiteLLMModelRecord | undefined> {
    const models = await this.listModels();
    return models.find((item) => item.model_name === id || item.model_info?.id === id);
  }

  private async findModelsReferencingCredential(name: string): Promise<string[]> {
    const models = await this.listModels();
    return models
      .filter((model) => {
        const credentialName = (model.litellm_params as Record<string, unknown> | undefined)?.litellm_credential_name;
        return typeof credentialName === 'string' && credentialName === name;
      })
      .map((model) => {
        if (model.model_name) {
          return model.model_name;
        }
        const infoId = typeof model.model_info?.id === 'string' ? (model.model_info.id as string) : null;
        return infoId ?? 'unknown-model';
      });
  }

  private async fetchProviders(): Promise<LiteLLMProviderInfo[]> {
    try {
      const body = await this.request<unknown>('GET', '/public/providers/fields');
      const rows = extractLiteLLMArray(body, ['data', 'providers']);
      return rows.filter((item): item is LiteLLMProviderInfo => isProviderInfo(item));
    } catch (err) {
      this.rethrowMissingConfig(err);
      throw err;
    }
  }

  private async fetchCredentials(): Promise<LiteLLMCredentialSummary[]> {
    try {
      const body = await this.request<unknown>('GET', '/credentials');
      const rows = extractLiteLLMArray(body, ['data', 'credentials']);
      return rows.filter((item): item is LiteLLMCredentialSummary => isCredentialSummary(item));
    } catch (err) {
      this.rethrowMissingConfig(err);
      throw err;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { classifyWrite?: boolean },
  ): Promise<T> {
    const { baseUrl, masterKey } = this.requireLiteLLMConfig();
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${masterKey}`,
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      const parsed = text ? safeParseJson(text) : undefined;
      if (!res.ok) {
        if (options?.classifyWrite && (res.status === 401 || res.status === 403)) {
          throw new LiteLLMAdminError(503, 'litellm_admin_unauthorized', {
            status: res.status,
            body: parsed ?? {},
          });
        }
        throw new LiteLLMAdminError(res.status, 'litellm_admin_request_failed', parsed ?? {});
      }
      return (parsed as T) ?? ({} as T);
    } catch (err) {
      if (err instanceof LiteLLMAdminError || err instanceof HttpException) {
        throw err;
      }
      if ((err as { name?: string }).name === 'AbortError') {
        const payload = { error: 'upstream_timeout' };
        if (options?.classifyWrite) {
          throw new LiteLLMAdminError(503, 'litellm_unreachable', payload);
        }
        throw new LiteLLMAdminError(504, 'litellm_admin_request_failed', payload);
      }
      this.logger.debug(`LiteLLM admin request failed: ${(err as Error).message}`);
      if (options?.classifyWrite) {
        throw new LiteLLMAdminError(503, 'litellm_unreachable', { error: (err as Error).message });
      }
      throw new LiteLLMAdminError(500, 'litellm_admin_request_failed', { error: (err as Error).message });
    } finally {
      clearTimeout(timeout);
    }
  }

  private requireLiteLLMConfig(): { baseUrl: string; masterKey: string } {
    const baseUrl = this.config.litellmBaseUrl;
    const masterKey = this.config.litellmMasterKey;
    const missing: string[] = [];
    if (!baseUrl) missing.push('LITELLM_BASE_URL');
    if (!masterKey) missing.push('LITELLM_MASTER_KEY');
    if (missing.length > 0) {
      throw new HttpException({ error: 'litellm_missing_config', missing }, 503);
    }
    return { baseUrl: baseUrl.replace(/\/$/, ''), masterKey };
  }

  private rethrowMissingConfig(err: unknown): never {
    if (err instanceof HttpException) {
      const payload = err.getResponse();
      if (payload && typeof payload === 'object' && (payload as { error?: string }).error === 'litellm_missing_config') {
        throw new LiteLLMAdminAuthRequiredError('missing_env');
      }
    }
    throw err;
  }
}

function isProviderInfo(value: unknown): value is LiteLLMProviderInfo {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === 'string' &&
    typeof v.provider_display_name === 'string' &&
    typeof v.litellm_provider === 'string' &&
    Array.isArray(v.credential_fields)
  );
}

function isCredentialSummary(value: unknown): value is LiteLLMCredentialSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.credential_name === 'string' &&
    typeof v.credential_info === 'object' &&
    typeof v.credential_values === 'object'
  );
}

function isModelRecord(value: unknown): value is LiteLLMModelRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.model_name === 'string' && typeof v.litellm_params === 'object';
}

function extractLiteLLMArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}
