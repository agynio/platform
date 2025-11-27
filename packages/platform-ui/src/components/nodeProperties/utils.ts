import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  EnvVar,
  NodeConfig,
  ReferenceConfigValue,
  WorkspaceNixPackage,
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function readString<T extends string>(value: unknown): T | undefined {
  return typeof value === 'string' ? (value as T) : undefined;
}

export function mergeWithDefined(base: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base, ...updates };
  return Object.fromEntries(Object.entries(merged).filter(([, val]) => val !== undefined));
}

export function readReferenceValue(raw: unknown): { value: string; raw: ReferenceConfigValue } {
  if (typeof raw === 'string') return { value: raw, raw };
  if (isRecord(raw)) {
    const value = typeof raw.value === 'string' ? raw.value : '';
    return { value, raw: raw as Record<string, unknown> };
  }
  return { value: '', raw: '' };
}

export function writeReferenceValue(prev: ReferenceConfigValue, nextValue: string): ReferenceConfigValue {
  if (typeof prev === 'string') {
    return nextValue;
  }
  if (isRecord(prev)) {
    return { ...prev, value: nextValue };
  }
  return nextValue;
}

export function readEnvList(raw: unknown): EnvVar[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (!isRecord(item)) return { name: '', value: '', source: 'static' } satisfies EnvVar;
      const name = typeof item.name === 'string' ? item.name : '';
      const value = typeof item.value === 'string' ? item.value : '';
      const source: EnvVar['source'] =
        item.source === 'vault' ? 'vault' : item.source === 'variable' ? 'variable' : 'static';
      return { name, value, source } satisfies EnvVar;
    });
  }
  if (isRecord(raw)) {
    return Object.entries(raw).map(([key, value]) => ({
      name: key,
      value: typeof value === 'string' ? value : '',
      source: 'static' as const,
    }));
  }
  return [];
}

export function serializeEnvVars(list: EnvVar[]): EnvVar[] {
  return list.map((item) => ({
    name: item.name,
    value: item.value,
    source: item.source,
  }));
}

export function toReferenceSourceType(source: EnvVar['source']): 'text' | 'secret' | 'variable' {
  if (source === 'vault') return 'secret';
  if (source === 'variable') return 'variable';
  return 'text';
}

export function fromReferenceSourceType(type: 'text' | 'secret' | 'variable'): EnvVar['source'] {
  if (type === 'secret') return 'vault';
  if (type === 'variable') return 'variable';
  return 'static';
}

export function readQueueConfig(config: NodeConfig): AgentQueueConfig {
  const raw = isRecord(config.queue) ? (config.queue as Record<string, unknown>) : {};
  const debounceMs = readNumber(raw.debounceMs);
  const whenBusy = readString<'wait' | 'injectAfterTools'>(raw.whenBusy);
  const processBuffer = readString<'allTogether' | 'oneByOne'>(raw.processBuffer);
  const result: AgentQueueConfig = {};
  if (debounceMs !== undefined) result.debounceMs = debounceMs;
  if (whenBusy) result.whenBusy = whenBusy;
  if (processBuffer) result.processBuffer = processBuffer;
  return result;
}

export function applyQueueUpdate(config: NodeConfig, partial: Partial<AgentQueueConfig>): Partial<NodeConfig> {
  const current = isRecord(config.queue) ? (config.queue as Record<string, unknown>) : {};
  const next = mergeWithDefined(current, partial);
  return { queue: next } satisfies Partial<NodeConfig>;
}

export function readSummarizationConfig(config: NodeConfig): AgentSummarizationConfig {
  const raw = isRecord(config.summarization) ? (config.summarization as Record<string, unknown>) : {};
  const keepTokens = readNumber(raw.keepTokens);
  const maxTokens = readNumber(raw.maxTokens);
  const prompt = readString<string>(raw.prompt);
  const result: AgentSummarizationConfig = {};
  if (keepTokens !== undefined) result.keepTokens = keepTokens;
  if (maxTokens !== undefined) result.maxTokens = maxTokens;
  if (prompt !== undefined) result.prompt = prompt;
  return result;
}

export function applySummarizationUpdate(
  config: NodeConfig,
  partial: Partial<AgentSummarizationConfig>,
): Partial<NodeConfig> {
  const current = isRecord(config.summarization) ? (config.summarization as Record<string, unknown>) : {};
  const next = mergeWithDefined(current, partial);
  return { summarization: next } satisfies Partial<NodeConfig>;
}

export function readNixPackages(nixConfig: unknown): WorkspaceNixPackage[] {
  if (!Array.isArray(nixConfig)) return [];
  return nixConfig
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const name = typeof entry.name === 'string' ? entry.name : '';
      const version = typeof entry.version === 'string' ? entry.version : '';
      const commitHash = typeof entry.commitHash === 'string' ? entry.commitHash : '';
      const attributePath = typeof entry.attributePath === 'string' ? entry.attributePath : '';
      return { name, version, commitHash, attributePath } satisfies WorkspaceNixPackage;
    })
    .filter((item): item is WorkspaceNixPackage => item !== null);
}

export function applyVolumesUpdate(
  config: NodeConfig,
  partial: Partial<{ enabled: boolean; mountPath: string }>,
): Partial<NodeConfig> {
  const current = isRecord(config.volumes) ? (config.volumes as Record<string, unknown>) : {};
  const next = mergeWithDefined(current, partial);
  return { volumes: next } satisfies Partial<NodeConfig>;
}

export function applyNixUpdate(_config: NodeConfig, packages: WorkspaceNixPackage[]): Partial<NodeConfig> {
  return { nix: packages.map((pkg) => ({ ...pkg })) } satisfies Partial<NodeConfig>;
}

export function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
