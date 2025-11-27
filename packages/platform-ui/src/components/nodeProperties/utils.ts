import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  EnvVar,
  NodeConfig,
  ReferenceConfigValue,
  WorkspaceNixPackage,
} from './types';

type RawEnvValue = string | Record<string, unknown> | null | undefined;

function toEnvSource(value: RawEnvValue, fallback: EnvVar['source']): EnvVar['source'] {
  if (!value || typeof value !== 'object') return fallback;
  const kind = typeof value.kind === 'string' ? value.kind : undefined;
  if (kind === 'vault') return 'vault';
  if (kind === 'var') return 'variable';
  return fallback;
}

function formatVaultSegments(value: Record<string, unknown>): string {
  const segments: string[] = [];
  const mount = typeof value.mount === 'string' ? value.mount.trim() : undefined;
  const path = typeof value.path === 'string' ? value.path.trim() : undefined;
  const key = typeof value.key === 'string' ? value.key.trim() : undefined;
  if (mount) segments.push(mount);
  if (path) segments.push(path);
  if (key) segments.push(key);
  if (segments.length === 0 && typeof value.value === 'string') return value.value;
  return segments.join('/');
}

function parseVaultString(input: string): { kind: 'vault'; path: string; key: string; mount?: string } {
  const trimmed = input.trim();
  const segments = trimmed.split('/').map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  if (segments.length >= 3) {
    const mount = segments[0];
    const key = segments[segments.length - 1];
    const path = segments.slice(1, -1).join('/');
    return path.length
      ? { kind: 'vault', mount, path, key }
      : { kind: 'vault', mount, path: '', key };
  }
  if (segments.length === 2) {
    const [first, second] = segments;
    return { kind: 'vault', path: first, key: second };
  }
  if (segments.length === 1) {
    const [only] = segments;
    return { kind: 'vault', path: '', key: only };
  }
  return { kind: 'vault', path: '', key: '' };
}

function parseVariable(input: string): { kind: 'var'; name: string } {
  return { kind: 'var', name: input.trim() };
}

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
      if (!isRecord(item)) return { key: '', value: '', source: 'static' } satisfies EnvVar;
      const key = typeof item.key === 'string' ? item.key : typeof item.name === 'string' ? item.name : '';
      const rawValue: RawEnvValue = item.value as RawEnvValue;
      const defaultSource: EnvVar['source'] =
        item.source === 'vault' ? 'vault' : item.source === 'variable' ? 'variable' : 'static';
      const source = toEnvSource(rawValue, defaultSource);
      let value = '';
      if (typeof rawValue === 'string') {
        value = rawValue;
      } else if (rawValue && typeof rawValue === 'object') {
        if (source === 'vault') {
          value = formatVaultSegments(rawValue);
        } else if (source === 'variable') {
          value = typeof rawValue.name === 'string' ? rawValue.name : '';
        } else if (typeof rawValue.value === 'string') {
          value = rawValue.value;
        }
      }
      return { key, value, source } satisfies EnvVar;
    });
  }
  if (isRecord(raw)) {
    return Object.entries(raw).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : '',
      source: 'static' as const,
    }));
  }
  return [];
}

export function serializeEnvVars(list: EnvVar[]): Array<{ key: string; value: RawEnvValue }> {
  return list.map((item) => {
    if (item.source === 'vault') {
      const ref = parseVaultString(item.value);
      if (!ref.mount) delete (ref as { mount?: string }).mount;
      return { key: item.key, value: ref };
    }
    if (item.source === 'variable') {
      const ref = parseVariable(item.value);
      return { key: item.key, value: ref };
    }
    return { key: item.key, value: item.value };
  });
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

function mapNixArray(entries: unknown): WorkspaceNixPackage[] {
  if (!Array.isArray(entries)) return [];
  return entries
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

export function readNixPackages(nixConfig: unknown): WorkspaceNixPackage[] {
  if (Array.isArray(nixConfig)) return mapNixArray(nixConfig);
  if (isRecord(nixConfig)) return mapNixArray(nixConfig.packages);
  return [];
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
  return { nix: { packages: packages.map((pkg) => ({ ...pkg })) } } satisfies Partial<NodeConfig>;
}

export function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
