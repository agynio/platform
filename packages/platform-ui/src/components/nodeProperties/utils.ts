import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  EnvVar,
  EnvVarMeta,
  NodeConfig,
  ReferenceConfigValue,
  WorkspaceFlakeRepo,
  WorkspaceNixPackage,
} from './types';

export type ReferenceSourceType = 'text' | 'secret' | 'variable';

function formatVaultSegments(value: Record<string, unknown>): string {
  const segments: string[] = [];
  const mount = typeof value.mount === 'string' ? value.mount.trim() : undefined;
  const path = typeof value.path === 'string' ? value.path.trim() : undefined;
  const key = typeof value.key === 'string' ? value.key.trim() : undefined;
  const hasPath = Boolean(path && path.length > 0);
  const hasKey = Boolean(key && key.length > 0);
  if (mount && (hasPath || hasKey)) segments.push(mount);
  if (hasPath) segments.push(path as string);
  if (hasKey) segments.push(key as string);
  if (segments.length === 0 && typeof value.value === 'string') return value.value;
  return segments.join('/');
}

function parseVaultString(
  input: string,
  preferredMount?: string | null,
): { kind: 'vault'; path: string; key: string; mount?: string } {
  const trimmed = input.trim();
  if (!trimmed.length) return { kind: 'vault', path: '', key: '' };

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (!segments.length) return { kind: 'vault', path: '', key: '' };

  const key = segments[segments.length - 1];
  let pathSegments = segments.slice(0, -1);
  let mount: string | undefined;

  if (preferredMount && pathSegments[0] === preferredMount) {
    mount = preferredMount;
    pathSegments = pathSegments.slice(1);
  } else if (pathSegments.length > 0) {
    mount = pathSegments[0];
    pathSegments = pathSegments.slice(1);
  }

  const path = pathSegments.join('/');
  const ref = { kind: 'vault', path, key } as { kind: 'vault'; path: string; key: string; mount?: string };
  if (mount) ref.mount = mount;
  return ref;
}

function parseVariable(input: string): { kind: 'var'; name: string } {
  return { kind: 'var', name: input.trim() };
}

function isVaultReferenceValue(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (value.kind === 'vault') return true;
  if (typeof value.source === 'string' && value.source === 'vault') return true;
  return typeof value.path === 'string' && typeof value.key === 'string';
}

function isVariableReferenceValue(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (value.kind === 'var') return true;
  if (typeof value.source === 'string' && value.source === 'variable') return true;
  return typeof value.name === 'string';
}

const hasStructuredClone = typeof structuredClone === 'function';

function deepClone<T>(value: T): T {
  if (!isRecord(value) && typeof value !== 'string') {
    return value;
  }
  if (hasStructuredClone) {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function generateEnvId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and fall back to Math.random
  }
  return `env-${Math.random().toString(36).slice(2, 10)}`;
}

function extractDisplayValue(source: EnvVar['source'], raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!isRecord(raw)) return '';
  if (source === 'vault') return formatVaultSegments(raw);
  if (source === 'variable') return typeof raw.name === 'string' ? raw.name : '';
  return typeof raw.value === 'string' ? raw.value : '';
}

function cloneValueShape(value: unknown): ReferenceConfigValue | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value)) return deepClone(value);
  return undefined;
}

function buildVaultValue(input: string, previous?: ReferenceConfigValue): Record<string, unknown> {
  const prevMount = isRecord(previous) && typeof previous.mount === 'string' ? previous.mount : undefined;
  const isEmptyInput = input.trim().length === 0;
  const parsed = parseVaultString(input, prevMount);
  const next = isRecord(previous) ? deepClone(previous) : {};
  const record = next as Record<string, unknown>;
  record.kind = 'vault';
  record.path = parsed.path;
  record.key = parsed.key;
  if (parsed.mount) {
    record.mount = parsed.mount;
  } else if (isEmptyInput && prevMount) {
    record.mount = prevMount;
  } else {
    delete record.mount;
  }
  delete record.value;
  delete (record as Record<string, unknown>).name;
  delete (record as Record<string, unknown>).default;
  return record;
}

function buildVariableValue(input: string, previous?: ReferenceConfigValue): Record<string, unknown> {
  const next = isRecord(previous) ? deepClone(previous) : {};
  const record = next as Record<string, unknown>;
  const parsed = parseVariable(input);
  record.kind = 'var';
  record.name = parsed.name;
  delete record.value;
  delete record.path;
  delete record.key;
  delete record.mount;
  return record;
}

function buildEnvValue(item: EnvVar): ReferenceConfigValue {
  const previous = item.meta.valueShape;
  if (item.source === 'vault') {
    return buildVaultValue(item.value, previous);
  }
  if (item.source === 'variable') {
    return buildVariableValue(item.value, previous);
  }
  if (isRecord(previous)) {
    const next = deepClone(previous);
    (next as Record<string, unknown>).value = item.value;
    return next as ReferenceConfigValue;
  }
  return item.value;
}

function originalSource(meta: EnvVarMeta): 'static' | 'vault' | 'variable' | undefined {
  if (meta.originalSource === 'static' || meta.originalSource === 'vault' || meta.originalSource === 'variable') {
    return meta.originalSource;
  }
  return undefined;
}

function resolveKeyField(raw: Record<string, unknown>): 'name' | 'key' {
  if (typeof raw.name === 'string') return 'name';
  if (typeof raw.key === 'string') return 'key';
  return 'name';
}

export function createEnvVar(overrides?: Partial<Omit<EnvVar, 'meta'>> & { meta?: Partial<EnvVarMeta> }): EnvVar {
  const base: EnvVar = {
    id: generateEnvId(),
    name: '',
    value: '',
    source: 'static',
    meta: { keyField: 'name' },
  };
  const mergedMeta = { ...base.meta, ...(overrides?.meta ?? {}) } satisfies EnvVarMeta;
  return {
    ...base,
    ...overrides,
    meta: mergedMeta,
  } satisfies EnvVar;
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
  if (isVaultReferenceValue(raw)) {
    return { value: formatVaultSegments(raw), raw: raw as Record<string, unknown> };
  }
  if (isVariableReferenceValue(raw)) {
    const name = typeof raw.name === 'string' ? raw.name : typeof raw.value === 'string' ? raw.value : '';
    return { value: name, raw: raw as Record<string, unknown> };
  }
  if (isRecord(raw)) {
    const value = typeof raw.value === 'string' ? raw.value : '';
    return { value, raw: raw as Record<string, unknown> };
  }
  return { value: '', raw: '' };
}

export function inferReferenceSource(raw: ReferenceConfigValue | undefined): ReferenceSourceType {
  if (typeof raw === 'string') return 'text';
  if (isVaultReferenceValue(raw)) return 'secret';
  if (isVariableReferenceValue(raw)) return 'variable';
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const source = typeof record.source === 'string' ? record.source : undefined;
    if (source === 'vault') return 'secret';
    if (source === 'variable') return 'variable';
  }
  return 'text';
}

export function encodeReferenceValue(
  sourceType: ReferenceSourceType,
  value: string,
  previous?: ReferenceConfigValue,
): ReferenceConfigValue {
  if (sourceType === 'secret') {
    const record = buildVaultValue(value, previous);
    delete record.source;
    return record;
  }
  if (sourceType === 'variable') {
    const record = buildVariableValue(value, previous);
    delete record.source;
    return record;
  }
  return value;
}

export function writeReferenceValue(
  prev: ReferenceConfigValue | undefined,
  nextValue: string,
  sourceType?: ReferenceSourceType,
): ReferenceConfigValue {
  const inferred = sourceType ?? inferReferenceSource(prev);
  return encodeReferenceValue(inferred, nextValue, prev);
}

export function readEnvList(raw: unknown): EnvVar[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    if (!isRecord(item)) {
      return createEnvVar();
    }

    const rawSource = typeof item.source === 'string' ? item.source : undefined;
    const rawValue = item.value as unknown as ReferenceConfigValue;
    const inferredSourceType = inferReferenceSource(rawValue);
    const inferredSource = fromReferenceSourceType(inferredSourceType);
    const source: EnvVar['source'] = rawSource === 'vault' || rawSource === 'variable' || rawSource === 'static'
      ? rawSource
      : inferredSource;
    const keyField = resolveKeyField(item);
    const nameValue = keyField === 'name' ? item.name : item.key;
    const meta: EnvVarMeta = {
      keyField,
      original: deepClone(item),
      originalSource: rawSource === 'vault' || rawSource === 'variable' || rawSource === 'static' ? rawSource : undefined,
      valueShape: cloneValueShape(rawValue),
    } satisfies EnvVarMeta;

    return {
      id: typeof item.id === 'string' ? item.id : generateEnvId(),
      name: typeof nameValue === 'string' ? nameValue : '',
      value: extractDisplayValue(source, rawValue),
      source,
      meta,
    } satisfies EnvVar;
  });
}

export function serializeEnvVars(list: EnvVar[]): Array<Record<string, unknown>> {
  return list.map((item: EnvVar) => {
    const base = item.meta.original ? deepClone(item.meta.original) : {};
    const record = base as Record<string, unknown>;

    if (item.meta.keyField === 'key') {
      record.key = item.name;
      if (!item.meta.original) delete record.name;
    } else {
      record.name = item.name;
      if (!item.meta.original) delete record.key;
    }

    const origHasSource = item.meta.original ? Object.prototype.hasOwnProperty.call(item.meta.original, 'source') : false;
    const origSource = originalSource(item.meta);
    if (item.source === 'static') {
      if (origSource === 'static' || (origSource === undefined && origHasSource)) {
        record.source = 'static';
      } else {
        delete record.source;
      }
    } else {
      record.source = item.source;
    }

    record.value = buildEnvValue(item);

    return record;
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
  const mapped: WorkspaceNixPackage[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry.kind === 'flakeRepo') continue;
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (!name) continue;
    const version = typeof entry.version === 'string' ? entry.version : '';
    const commitHash = typeof entry.commitHash === 'string' ? entry.commitHash : '';
    const attributePath = typeof entry.attributePath === 'string' ? entry.attributePath : '';
    mapped.push({ kind: 'nixpkgs', name, version, commitHash, attributePath });
  }
  return mapped;
}

export function readNixPackages(nixConfig: unknown): WorkspaceNixPackage[] {
  if (!isRecord(nixConfig)) return [];
  return mapNixArray((nixConfig as Record<string, unknown>).packages);
}

function mapFlakeRepos(entries: unknown): WorkspaceFlakeRepo[] {
  if (!Array.isArray(entries)) return [];
  const mapped: WorkspaceFlakeRepo[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry.kind !== 'flakeRepo') continue;
    const repository = typeof entry.repository === 'string' ? entry.repository : '';
    const commitHash = typeof entry.commitHash === 'string' ? entry.commitHash : '';
    const attributePath = typeof entry.attributePath === 'string' ? entry.attributePath : '';
    if (!repository || !commitHash || !attributePath) continue;
    const ref = typeof entry.ref === 'string' ? entry.ref : undefined;
    mapped.push({ kind: 'flakeRepo', repository, commitHash, attributePath, ...(ref ? { ref } : {}) });
  }
  return mapped;
}

export function readNixFlakeRepos(nixConfig: unknown): WorkspaceFlakeRepo[] {
  if (!isRecord(nixConfig)) return [];
  return mapFlakeRepos((nixConfig as Record<string, unknown>).packages);
}

export function applyVolumesUpdate(
  config: NodeConfig,
  partial: Partial<{ enabled: boolean; mountPath: string }>,
): Partial<NodeConfig> {
  const current = isRecord(config.volumes) ? (config.volumes as Record<string, unknown>) : {};
  const next = mergeWithDefined(current, partial);
  return { volumes: next } satisfies Partial<NodeConfig>;
}

export function applyNixUpdate(
  config: NodeConfig,
  packages: WorkspaceNixPackage[],
  flakeRepos?: WorkspaceFlakeRepo[],
): Partial<NodeConfig> {
  const rawNix = (config as Record<string, unknown>).nix;
  const current = isRecord(rawNix) ? (rawNix as Record<string, unknown>) : {};
  const existing = Array.isArray(current.packages) ? current.packages : [];
  const normalizedFlakes: WorkspaceFlakeRepo[] = Array.isArray(flakeRepos)
    ? flakeRepos.map((entry) => ({ ...entry }))
    : existing
        .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.kind === 'flakeRepo')
        .map((entry) => {
          const repository = typeof entry.repository === 'string' ? entry.repository : '';
          const commitHash = typeof entry.commitHash === 'string' ? entry.commitHash : '';
          const attributePath = typeof entry.attributePath === 'string' ? entry.attributePath : '';
          const ref = typeof entry.ref === 'string' ? entry.ref : undefined;
          if (!repository || !commitHash || !attributePath) {
            return null;
          }
          return {
            kind: 'flakeRepo' as const,
            repository,
            commitHash,
            attributePath,
            ...(ref ? { ref } : {}),
          } satisfies WorkspaceFlakeRepo;
        })
        .filter((entry): entry is WorkspaceFlakeRepo => entry !== null);
  return {
    nix: {
      ...current,
      packages: [
        ...normalizedFlakes.map((entry) => ({
          kind: 'flakeRepo',
          repository: entry.repository,
          commitHash: entry.commitHash,
          attributePath: entry.attributePath,
          ...(entry.ref ? { ref: entry.ref } : {}),
        })),
        ...packages.map((pkg) => ({
          kind: 'nixpkgs',
          name: pkg.name,
          version: pkg.version,
          commitHash: pkg.commitHash,
          attributePath: pkg.attributePath,
        })),
      ],
    },
  } satisfies Partial<NodeConfig>;
}

export function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const TOOL_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

export function isValidToolName(value: string): boolean {
  if (typeof value !== 'string') return false;
  return TOOL_NAME_PATTERN.test(value);
}
