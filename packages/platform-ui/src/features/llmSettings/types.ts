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
  catalogId: string;
  label: string;
  litellmProvider: string;
  canonicalProvider?: string | null;
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
  openai_compatible: 'openai-compatible',
  'openai-compatible': 'openai-compatible',
  openai_compatible_endpoints: 'openai-compatible',
  'openai-compatible-endpoints': 'openai-compatible',
};

const CANONICAL_LOOKUP_PREFIX = '__canonical__:';

function normalizeCatalogIdPart(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

function buildProviderCatalogId(
  item: LiteLLMProviderInfo,
  litellmProvider: string,
  label: string,
  index: number,
): string {
  const provided = normalizeCatalogIdPart(item.catalog_id);
  if (provided) return provided;
  const providerPart = normalizeCatalogIdPart(litellmProvider) ?? `provider-${index + 1}`;
  const labelPart = normalizeCatalogIdPart(label) ?? `entry-${index + 1}`;
  return `${providerPart}::${labelPart}`;
}

function sanitizeProviderKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function canonicalizeProviderKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return PROVIDER_ALIAS_MAP[lower] ?? lower;
}

function resolveCredentialProvider(info?: Record<string, unknown>): string {
  if (!info) return '';
  const litellmRaw = sanitizeProviderKey(info['litellm_provider']);
  if (litellmRaw) return litellmRaw;
  const litellmCanonical = canonicalizeProviderKey(info['litellm_provider']);
  if (litellmCanonical) return litellmCanonical;
  const legacyRaw = sanitizeProviderKey(info['custom_llm_provider']);
  if (legacyRaw) return legacyRaw;
  const legacyCanonical = canonicalizeProviderKey(info['custom_llm_provider']);
  if (legacyCanonical) return legacyCanonical;
  return '';
}

export function mapProviders(items: LiteLLMProviderInfo[] | undefined): ProviderOption[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const rawProvider = sanitizeProviderKey(item.provider);
    const rawLitellmProvider = sanitizeProviderKey(item.litellm_provider);
    const labelSource = sanitizeProviderKey(item.provider_display_name) || rawProvider;
    const litellmProvider = rawLitellmProvider || rawProvider || `provider-${index + 1}`;
    const canonicalProvider =
      canonicalizeProviderKey(item.canonical_provider) ||
      canonicalizeProviderKey(rawLitellmProvider) ||
      canonicalizeProviderKey(rawProvider);
    const labelBase = labelSource || litellmProvider;
    const catalogId = buildProviderCatalogId(item, litellmProvider, labelBase, index);
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
      id: catalogId,
      catalogId,
      label: labelBase,
      litellmProvider,
      canonicalProvider,
      fields,
      defaultModelPlaceholder: item.default_model_placeholder ?? null,
    } satisfies ProviderOption;
  });
}

function resolveProviderOption(providerMap: Map<string, ProviderOption>, providerKey: string): ProviderOption | undefined {
  if (!providerKey) return undefined;
  const direct = providerMap.get(providerKey) ?? providerMap.get(providerKey.toLowerCase());
  if (direct) return direct;
  const canonical = canonicalizeProviderKey(providerKey);
  if (!canonical) return undefined;
  return providerMap.get(`${CANONICAL_LOOKUP_PREFIX}${canonical}`);
}

export function mapCredentials(
  items: LiteLLMCredential[] | undefined,
  providers: Map<string, ProviderOption>,
): CredentialRecord[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const info = (item.credential_info ?? {}) as Record<string, unknown>;
    const storedProviderKey = resolveCredentialProvider(info);
    const provider = resolveProviderOption(providers, storedProviderKey);
    const providerKey = provider?.litellmProvider ?? storedProviderKey;
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
      typeof paramsRaw.litellm_provider === 'string'
        ? (paramsRaw.litellm_provider as string)
        : typeof paramsRaw.custom_llm_provider === 'string'
          ? (paramsRaw.custom_llm_provider as string)
          : '';
    const sanitizedProviderKey = sanitizeProviderKey(providerKeySource);
    const provider = resolveProviderOption(providers, sanitizedProviderKey);
    const providerKey = provider?.litellmProvider ?? sanitizedProviderKey;
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
  const register = (key: string | undefined | null, provider: ProviderOption) => {
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    map.set(trimmed, provider);
    const lower = trimmed.toLowerCase();
    if (lower !== trimmed) {
      map.set(lower, provider);
    }
  };

  for (const provider of providers) {
    register(provider.id, provider);
    register(provider.catalogId, provider);
    register(provider.litellmProvider, provider);
    if (provider.canonicalProvider) {
      map.set(`${CANONICAL_LOOKUP_PREFIX}${provider.canonicalProvider}`, provider);
    }
  }

  return map;
}

export function isOpenAIProvider(provider?: string | null): boolean {
  return canonicalizeProviderKey(provider) === 'openai';
}

export function isOpenAICompatibleProvider(provider?: string | null): boolean {
  const canonical = canonicalizeProviderKey(provider);
  if (!canonical) return false;
  if (canonical === 'openai') return false;
  return canonical.includes('openai') && canonical.includes('compatible');
}
