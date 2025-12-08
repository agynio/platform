const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
};

const normalizeArguments = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    return parseMaybeJson(value);
  }
  return value;
};

const cloneRecord = (value: Record<string, unknown>): Record<string, unknown> => ({
  ...value,
});

const normalizeFunctionRecord = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null;
  const normalized = cloneRecord(value);
  if ('arguments' in normalized) {
    normalized.arguments = normalizeArguments(normalized.arguments);
  }
  return normalized;
};

const normalizeToolCallRecord = (value: unknown): Record<string, unknown> | null => {
  const record = isRecord(value) ? value : normalizeFunctionRecord(value);
  if (!record) return null;

  const typeValue = typeof record.type === 'string' ? record.type.toLowerCase() : undefined;
  const normalizedType = typeValue === 'function' ? 'function_call' : typeValue;
  const functionCandidate = normalizeFunctionRecord(
    record.function ?? record.function_call ?? record.functionCall,
  );
  const argumentsCandidate = normalizeArguments(record.arguments);

  const shouldInclude = Boolean(
    functionCandidate ||
    argumentsCandidate !== undefined ||
    normalizedType === 'function_call' ||
    normalizedType === 'tool_call'
  );

  if (!shouldInclude) return null;

  const normalized = cloneRecord(record);

  if (functionCandidate) {
    normalized.function = functionCandidate;
    if (typeof normalized.name !== 'string' && typeof functionCandidate.name === 'string') {
      normalized.name = functionCandidate.name;
    }
    if (normalized.arguments === undefined && functionCandidate.arguments !== undefined) {
      normalized.arguments = functionCandidate.arguments;
    }
  }

  if (normalized.arguments !== undefined) {
    normalized.arguments = normalizeArguments(normalized.arguments);
  }

  const toolCallId = typeof normalized.tool_call_id === 'string' ? normalized.tool_call_id : undefined;
  if (toolCallId && typeof normalized.id !== 'string') {
    normalized.id = toolCallId;
  }

  if (normalizedType) {
    normalized.type = normalizedType;
  } else {
    normalized.type = functionCandidate ? 'function_call' : 'tool_call';
  }

  delete normalized.function_call;
  delete normalized.functionCall;

  return normalized;
};

type SeenKeyState = {
  seenKeys: Set<string>;
};

const collectToolCallKeys = (normalized: Record<string, unknown>): string[] => {
  const keys: string[] = [];
  const id = typeof normalized.id === 'string' && normalized.id.length > 0 ? normalized.id : null;
  if (id) keys.push(`id:${id}`);

  const functionRecord = isRecord(normalized.function) ? normalized.function : undefined;
  const functionName = typeof normalized.name === 'string' && normalized.name.length > 0
    ? normalized.name
    : typeof functionRecord?.name === 'string' && functionRecord.name.length > 0
      ? functionRecord.name
      : null;

  const argumentSource = normalized.arguments ?? functionRecord?.arguments;
  if (argumentSource !== undefined) {
    const comparable = parseMaybeJson(argumentSource);
    try {
      const argumentsKey = JSON.stringify(comparable);
      keys.push(`args:${argumentsKey}`);
      if (functionName) {
        keys.push(`fn:${functionName}|args:${argumentsKey}`);
      }
    } catch (_error) {
      // Ignore serialization failure
    }
  }

  if (functionName) {
    keys.push(`fn:${functionName}`);
  }

  try {
    keys.push(`json:${JSON.stringify(normalized)}`);
  } catch (_error) {
    // Ignore fallback failure
  }

  return keys;
};

const addToolCall = (
  value: unknown,
  accumulator: Record<string, unknown>[],
  { seenKeys }: SeenKeyState,
) => {
  const normalized = normalizeToolCallRecord(value);
  if (!normalized) return;
  const keys = collectToolCallKeys(normalized);
  if (keys.some((key) => seenKeys.has(key))) return;
  for (const key of keys) {
    seenKeys.add(key);
  }
  accumulator.push(normalized);
};

const visit = (
  value: unknown,
  accumulator: Record<string, unknown>[],
  state: SeenKeyState,
  visited: WeakSet<object>,
) => {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    if (parsed !== value) {
      visit(parsed, accumulator, state, visited);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      visit(entry, accumulator, state, visited);
    }
    return;
  }
  if (!isRecord(value)) return;
  if (visited.has(value)) return;
  visited.add(value);

  addToolCall(value, accumulator, state);

  if ('tool_calls' in value) visit(value['tool_calls'], accumulator, state, visited);
  if ('toolCalls' in value) visit(value['toolCalls'], accumulator, state, visited);
  if ('additional_kwargs' in value) visit(value['additional_kwargs'], accumulator, state, visited);
  if ('additionalKwargs' in value) visit(value['additionalKwargs'], accumulator, state, visited);
  if ('content' in value) visit(value['content'], accumulator, state, visited);
};

export function gatherToolCalls(...sources: unknown[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const state: SeenKeyState = { seenKeys: new Set<string>() };
  const visited = new WeakSet<object>();

  for (const source of sources) {
    visit(source, result, state, visited);
  }

  return result;
}
