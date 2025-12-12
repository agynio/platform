export type ContextMessage = {
  role: string;
  name?: string;
  content?: unknown;
  contentText?: unknown;
  response?: unknown;
  tool_calls?: unknown[];
  toolCalls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  reasoning?: unknown;
};

export function computeTailNewIndices(
  prevMessages: ContextMessage[] | undefined,
  currMessages: ContextMessage[] | undefined,
): number[] {
  if (!Array.isArray(currMessages) || currMessages.length === 0) {
    return [];
  }

  if (!Array.isArray(prevMessages) || prevMessages.length === 0) {
    return currMessages.map((_, index) => index);
  }

  const prevSignatures = prevMessages.map(createSignature);
  const currSignatures = currMessages.map(createSignature);

  const maxPrefix = Math.min(prevSignatures.length, currSignatures.length);
  let prefixLength = 0;
  for (; prefixLength < maxPrefix; prefixLength++) {
    if (prevSignatures[prefixLength] !== currSignatures[prefixLength]) {
      break;
    }
  }

  const tailStart = Math.max(prefixLength, prevSignatures.length);
  if (tailStart >= currSignatures.length) {
    return [];
  }

  const result: number[] = [];
  for (let index = tailStart; index < currSignatures.length; index++) {
    result.push(index);
  }
  return result;
}

function createSignature(message: ContextMessage): string {
  const canonical = {
    role: normalizeScalar(message.role).toLowerCase(),
    name: normalizeScalar(message.name),
    content: canonicalize(extractPrimaryContent(message)),
    toolCalls: canonicalize(extractToolCalls(message)),
    reasoning: canonicalize(extractReasoning(message)),
  } as const;

  return JSON.stringify(canonical);
}

function normalizeScalar(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function extractPrimaryContent(message: ContextMessage): unknown {
  if (message.content !== undefined) {
    return message.content;
  }
  if (message.contentText !== undefined) {
    return message.contentText;
  }
  if (message.response !== undefined) {
    return message.response;
  }
  return null;
}

function extractToolCalls(message: ContextMessage): unknown {
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return message.tool_calls;
  }
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    return message.toolCalls;
  }
  const additionalToolCalls = message.additional_kwargs?.tool_calls;
  if (Array.isArray(additionalToolCalls) && additionalToolCalls.length > 0) {
    return additionalToolCalls;
  }
  return null;
}

function extractReasoning(message: ContextMessage): unknown {
  if (message.reasoning !== undefined) {
    return message.reasoning;
  }
  const additionalReasoning = message.additional_kwargs?.reasoning;
  if (additionalReasoning !== undefined) {
    return additionalReasoning;
  }
  return null;
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([key, val]) => [key, canonicalize(val)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return entries.reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[key] = val;
      return acc;
    }, {});
  }

  return String(value);
}
