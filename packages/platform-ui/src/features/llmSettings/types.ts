import type {
  LiteLLMCredential,
  LiteLLMModel,
  LiteLLMProviderInfo,
} from '@/api/modules/llmSettings';

export type ProviderFieldType = 'text' | 'password' | 'select' | 'textarea';

export type ProviderField = {
  key: string;
  label: string;
  type: ProviderFieldType;
  required: boolean;
  placeholder?: string | null;
  tooltip?: string | null;
  options?: string[];
  defaultValue?: string | null;
};

export type ProviderOption = {
  id: string;
  label: string;
  litellmProvider: string;
  fields: ProviderField[];
  defaultModelPlaceholder?: string | null;
};

export type CredentialRecord = {
  name: string;
  providerKey: string;
  providerLabel: string;
  values: Record<string, string>;
  maskedFields: Set<string>;
  metadata: Record<string, unknown>;
};

export type ModelRecord = {
  id: string;
  identifier: string;
  litellmId?: string;
  modelInfoId?: string;
  providerKey: string;
  providerLabel: string;
  model: string;
  credentialName: string;
  mode: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  maxTokens?: number;
  rpm?: number;
  tpm?: number;
  params: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const FIELD_TYPE_MAP: Record<string, ProviderFieldType> = {
  text: 'text',
  password: 'password',
  select: 'select',
  upload: 'textarea',
};

const PROVIDER_ALIAS_MAP: Record<string, string> = {
  azure_openai: 'azure',
  'azure-openai': 'azure',
  azureopenai: 'azure',
  azure_openai_chat: 'azure',
  azure_openai_completion: 'azure',
  azure_openai_responses: 'azure',
  azure_openai_embeddings: 'azure',
  azure_ai_studio: 'azure_ai',
  'azure-ai-studio': 'azure_ai',
  azure_ai_foundry: 'azure_ai',
  'azure-ai-foundry': 'azure_ai',
  azure_ad: 'azure',
  'azure-ad': 'azure',
  openai_chat: 'openai',
  openai_chat_completion: 'openai',
  openai_chatcompletions: 'openai',
  openai_text: 'text-completion-openai',
  openai_text_completion: 'text-completion-openai',
  text_completion_openai: 'text-completion-openai',
  'text-completion-openai': 'text-completion-openai',
};

function canonicalizeProviderKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return PROVIDER_ALIAS_MAP[lower] ?? lower;
}

function fallbackProviderKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : '';
}

const PROVIDER_LOOKUP_BY_CANONICAL = (() => {
  const entries = Object.entries(PROVIDER_ALIAS_MAP);
  const map = new Map<string, Set<string>>();
  for (const [alias, canonical] of entries) {
    const normalizedCanonical = canonicalizeProviderKey(canonical);
    const current = map.get(normalizedCanonical) ?? new Set<string>();
    current.add(normalizedCanonical);
    current.add(alias);
    map.set(normalizedCanonical, current);
  }
  return new Map(Array.from(map.entries(), ([canonical, set]) => [canonical, Array.from(set)]));
})();

export function getProviderLookupKeys(provider: string): string[] {
  const canonical = canonicalizeProviderKey(provider);
  if (!canonical) return [];
  return PROVIDER_LOOKUP_BY_CANONICAL.get(canonical) ?? [canonical];
}

function resolveCredentialProvider(info?: Record<string, unknown>): string {
  if (!info) return '';
  const litellm = canonicalizeProviderKey(info['litellm_provider']);
  if (litellm) return litellm;
  const legacy = canonicalizeProviderKey(info['custom_llm_provider']);
  if (legacy) return legacy;
  return '';
}

export function mapProviders(items: LiteLLMProviderInfo[] | undefined): ProviderOption[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const rawProvider = typeof item.provider === 'string' ? item.provider : '';
    const rawProviderTrimmed = rawProvider.trim();
    const normalizedProvider = canonicalizeProviderKey(rawProviderTrimmed);
    const rawLitellmProvider = typeof item.litellm_provider === 'string' ? item.litellm_provider : '';
    const rawLitellmTrimmed = rawLitellmProvider.trim();
    const normalizedLitellmProvider = canonicalizeProviderKey(rawLitellmTrimmed);
    const fallbackProvider = fallbackProviderKey(rawProviderTrimmed);
    const fallbackLitellmProvider = fallbackProviderKey(rawLitellmTrimmed);

    const canonicalProviderId =
      normalizedProvider ||
      normalizedLitellmProvider ||
      fallbackProvider ||
      fallbackLitellmProvider ||
      rawProviderTrimmed ||
      'unknown';
    const litellmProvider = normalizedLitellmProvider || canonicalProviderId;
    const labelBase =
      typeof item.provider_display_name === 'string' && item.provider_display_name.trim().length > 0
        ? item.provider_display_name.trim()
        : rawProviderTrimmed || canonicalProviderId;
    const fields: ProviderField[] = Array.isArray(item.credential_fields)
      ? item.credential_fields.map((field) => ({
          key: field.key,
          label: field.label ?? field.key,
          type: FIELD_TYPE_MAP[field.field_type] ?? 'text',
          required: !!field.required,
          placeholder: field.placeholder ?? null,
          tooltip: field.tooltip ?? null,
          options: Array.isArray(field.options) ? field.options : undefined,
          defaultValue: field.default_value ?? null,
        }))
      : [];
    return {
      id: canonicalProviderId,
      label: labelBase,
      litellmProvider,
      fields,
      defaultModelPlaceholder: item.default_model_placeholder ?? null,
    } satisfies ProviderOption;
  });
}

export function mapCredentials(
  items: LiteLLMCredential[] | undefined,
  providers: Map<string, ProviderOption>,
): CredentialRecord[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const info = (item.credential_info ?? {}) as Record<string, unknown>;
    const providerKey = resolveCredentialProvider(info);
    const provider = providers.get(providerKey);
    const providerLabel = provider?.label ?? (providerKey || 'Unknown');

    const maskedFields = new Set<string>();
    const values: Record<string, string> = {};
    const credentialValues = (item.credential_values ?? {}) as Record<string, unknown>;
    for (const [key, raw] of Object.entries(credentialValues)) {
      if (raw == null) continue;
      const str = typeof raw === 'string' ? raw : String(raw);
      if (str.includes('****')) {
        maskedFields.add(key);
        continue;
      }
      values[key] = str;
    }

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(info)) {
      if (key === 'litellm_provider' || key === 'custom_llm_provider' || key === 'tags') continue;
      metadata[key] = value;
    }

    return {
      name: item.credential_name,
      providerKey,
      providerLabel,
      values,
      maskedFields,
      metadata,
    } satisfies CredentialRecord;
  });
}

const NUMBER_FIELDS = new Set(['temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'max_tokens', 'rpm', 'tpm']);

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function mapModels(
  items: LiteLLMModel[] | undefined,
  providers: Map<string, ProviderOption>,
): ModelRecord[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const paramsRaw = (item.litellm_params ?? {}) as Record<string, unknown>;
    const modelInfo = (item.model_info ?? {}) as Record<string, unknown>;

    const rawModelName = typeof item.model_name === 'string' ? item.model_name : '';
    const modelName = rawModelName.trim();
    const rawLitellmId = typeof item.model_id === 'string' ? item.model_id : '';
    const litellmId = rawLitellmId.trim();
    const rawModelInfoId = typeof modelInfo.id === 'string' ? (modelInfo.id as string) : '';
    const modelInfoId = rawModelInfoId.trim();

    const providerKeySource =
      typeof paramsRaw.custom_llm_provider === 'string'
        ? (paramsRaw.custom_llm_provider as string)
        : typeof paramsRaw.litellm_provider === 'string'
          ? (paramsRaw.litellm_provider as string)
          : '';
    const providerKey =
      canonicalizeProviderKey(providerKeySource) ||
      fallbackProviderKey(providerKeySource) ||
      (typeof providerKeySource === 'string' ? providerKeySource.trim() : '');
    const provider = providers.get(providerKey);
    const providerLabel = provider?.label ?? (providerKey || 'Unknown');

    const model = typeof paramsRaw.model === 'string' ? (paramsRaw.model as string) : '';
    const credentialName = typeof paramsRaw.litellm_credential_name === 'string'
      ? (paramsRaw.litellm_credential_name as string)
      : '';

    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(paramsRaw)) {
      if (key === 'model' || key === 'custom_llm_provider' || key === 'litellm_credential_name') continue;
      if (NUMBER_FIELDS.has(key)) continue;
      params[key] = value;
    }

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(modelInfo)) {
      if (key === 'id' || key === 'mode' || key === 'rpm' || key === 'tpm') continue;
      metadata[key] = value;
    }

    const identifier = litellmId || modelInfoId || (modelName.length > 0 ? modelName : '');
    const displayId = modelName || identifier || 'Unnamed model';

    return {
      id: displayId,
      identifier,
      litellmId: litellmId || undefined,
      modelInfoId: modelInfoId || undefined,
      providerKey,
      providerLabel,
      model,
      credentialName,
      mode: typeof modelInfo.mode === 'string' ? (modelInfo.mode as string) : 'chat',
      temperature: toNumber(paramsRaw.temperature),
      topP: toNumber(paramsRaw.top_p),
      frequencyPenalty: toNumber(paramsRaw.frequency_penalty),
      presencePenalty: toNumber(paramsRaw.presence_penalty),
      stream: typeof paramsRaw.stream === 'boolean' ? paramsRaw.stream : undefined,
      maxTokens: toNumber(paramsRaw.max_tokens),
      rpm: toNumber(modelInfo.rpm),
      tpm: toNumber(modelInfo.tpm),
      params,
      metadata,
    } satisfies ModelRecord;
  });
}

export function createProviderOptionMap(providers: ProviderOption[]): Map<string, ProviderOption> {
  const map = new Map<string, ProviderOption>();
  for (const provider of providers) {
    const keys = new Set<string>();
    keys.add(provider.id);
    keys.add(provider.litellmProvider);
    for (const key of getProviderLookupKeys(provider.id)) {
      keys.add(key);
    }
    for (const key of getProviderLookupKeys(provider.litellmProvider)) {
      keys.add(key);
    }
    for (const key of keys) {
      if (!key) continue;
      map.set(key, provider);
    }
  }
  return map;
}
