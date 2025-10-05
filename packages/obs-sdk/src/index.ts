import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// Minimal types for Stage 1
export type ObsMode = 'extended' | 'otlp';

export interface InitConfig {
  mode: ObsMode;
  endpoints: {
    extended?: string; // base URL for extended server
    otlp?: string; // base URL for OTLP HTTP
  };
  batching?: { maxBatchSize?: number; flushIntervalMs?: number };
  sampling?: { rate?: number };
  defaultAttributes?: Record<string, unknown>;
  retry?: { maxRetries?: number; baseMs?: number; maxMs?: number; jitter?: boolean };
  debug?: boolean; // enable verbose internal logging
}

export interface SpanInput {
  label: string;
  attributes?: Record<string, unknown>;
  nodeId?: string;
  threadId?: string;
  kind?: string; // added: semantic kind of span (tool_call, llm, thread, agent, summarize, system)
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

// Unified status enum used across spans and tool/LLM responses
export type SpanStatus = 'success' | 'error';

// Log document shape (Stage 1)
export interface LogInput {
  level: 'debug' | 'info' | 'error';
  message: string;
  attributes?: Record<string, unknown>;
}

type InternalConfig = {
  mode: ObsMode;
  endpoints: { extended: string; otlp: string };
  batching: { maxBatchSize: number; flushIntervalMs: number };
  sampling: { rate: number };
  defaultAttributes: Record<string, unknown>;
  retry: { maxRetries: number; baseMs: number; maxMs: number; jitter: boolean };
  debug: boolean;
};

const als = new AsyncLocalStorage<SpanContext>();

let config: InternalConfig | null = null;

// Simple bounded in-memory queue for future batching (Stage 1 immediate send)
type LoggerApi = {
  debug(msg: string, attrs?: Record<string, unknown>): void;
  info(msg: string, attrs?: Record<string, unknown>): void;
  error(msg: string, attrs?: Record<string, unknown>): void;
};

let loggerInstance: LoggerApi | null = null;

export function init(c: InitConfig) {
  const retry: InternalConfig['retry'] = { maxRetries: 3, baseMs: 100, maxMs: 2000, jitter: true, ...(c.retry || {}) };
  const batching: InternalConfig['batching'] = { maxBatchSize: 50, flushIntervalMs: 1000, ...(c.batching || {}) };
  const sampling: InternalConfig['sampling'] = { rate: 1, ...(c.sampling || {}) };
  const endpoints: InternalConfig['endpoints'] = { extended: c.endpoints.extended || '', otlp: c.endpoints.otlp || '' };
  const debug = c.debug ?? !!process.env.OBS_SDK_DEBUG;
  config = { mode: c.mode, endpoints, batching, sampling, defaultAttributes: c.defaultAttributes || {}, retry, debug };
  // Initialize logger instance (idempotent); safe to re-init
  loggerInstance = createLogger();
  return config;
}

function createLogger(): LoggerApi {
  return {
    debug: (msg, attrs) => emitLog('debug', msg, attrs),
    info: (msg, attrs) => emitLog('info', msg, attrs),
    error: (msg, attrs) => emitLog('error', msg, attrs),
  };
}

async function emitLog(level: 'debug' | 'info' | 'error', message: string, attributes?: Record<string, unknown>) {
  try {
    if (!config) return;
    const cfg = config as InternalConfig;
    if (cfg.mode !== 'extended') return; // logging only in extended mode for now
    const ctx = als.getStore();
    const body = {
      level,
      message,
      ts: now(),
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      attributes: attributes || {},
    };
    await retryingPost(cfg.endpoints.extended + '/v1/logs', body, genId(8)).catch(() => {});
  } catch {
    // swallow
  }
}

export function logger(): LoggerApi {
  if (!loggerInstance) loggerInstance = createLogger();
  return loggerInstance;
}

function genId(bytes: number) {
  return randomBytes(bytes).toString('hex');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpPost(url: string, body: unknown, idempotencyKey?: string) {
  if (!url) return; // allow SDK usage without server for tests
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const payload = JSON.stringify(body);
  const r = await fetch(url, { method: 'POST', headers, body: payload });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

function backoff(cfg: InternalConfig, attempt: number) {
  const base = cfg.retry.baseMs * Math.pow(2, attempt);
  const capped = Math.min(base, cfg.retry.maxMs);
  return cfg.retry.jitter ? Math.random() * capped : capped;
}

async function retryingPost(url: string, body: unknown, idempotencyKey: string) {
  let attempt = 0;
  const cfg = config as InternalConfig;
  for (;;) {
    try {
      if ((config as InternalConfig)?.debug) {
        // Safe shallow clone for logging
        const preview = (() => {
          try {
            return JSON.stringify(body).slice(0, 500);
          } catch {
            return '[unserializable body]';
          }
        })();
        // eslint-disable-next-line no-console
        console.debug('[obs-sdk] POST', url, 'attempt', attempt, 'body<=', preview);
      }
      await httpPost(url, body, idempotencyKey);
      return;
    } catch (e) {
      if (attempt >= cfg.retry.maxRetries) throw e;
      await sleep(backoff(cfg, attempt++));
    }
  }
}

function now() {
  return new Date().toISOString();
}

// Internal low-level span creator. Accepts optional computeEndAttrs to add attributes/status at completion.
export async function withSpan<T>(
  input: SpanInput,
  fn: () => Promise<T> | T,
  computeEndAttrs?: (
    result: T | undefined,
    error: unknown | undefined,
  ) => { attributes?: Record<string, unknown>; status?: SpanStatus } | void,
): Promise<T> {
  // If SDK not initialized, execute user function without instrumentation (silent no-op)
  if (!config) {
    return await fn();
  }
  const cfg = config as InternalConfig; // capture for type narrowing
  const parent = als.getStore();
  const traceId = parent?.traceId || genId(16);
  const spanId = genId(8);
  const ctx: SpanContext = { traceId, spanId, parentSpanId: parent?.spanId };

  const baseAttrs = { ...(cfg.defaultAttributes || {}), ...(input.attributes || {}) };
  const startTime = now();

  if (cfg.mode === 'extended') {
    const created = {
      state: 'created',
      seq: 0,
      traceId,
      spanId,
      parentSpanId: ctx.parentSpanId,
      label: input.label,
      startTime,
      status: 'running',
      attributes: baseAttrs,
      nodeId: input.nodeId,
      threadId: input.threadId,
      kind: input.kind,
    };
    const keyCreated = genId(8);
    await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', created, keyCreated).catch(() => {});
  }

  return await new Promise<T>((resolve, reject) => {
    als.run(ctx, async () => {
      try {
        const result = await fn();
        const endExtra = computeEndAttrs?.(result, undefined) || {};
        const statusFinal: SpanStatus = endExtra.status || 'success';
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            seq: 1,
            traceId,
            spanId,
            endTime: now(),
            status: statusFinal,
            label: input.label,
            kind: input.kind,
            attributes: endExtra.attributes ? { ...baseAttrs, ...endExtra.attributes } : baseAttrs,
          };
          await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', completed, genId(8)).catch(() => {});
        } else {
          // otlp mode buffer: send one completed span via OTLP HTTP/protobuf later
          // Stage 1 simplified: send JSON to /v1/traces placeholder; server will map when OTLP implemented
          const otlpLike = [
            {
              traceId,
              spanId,
              parentSpanId: ctx.parentSpanId,
              label: input.label,
              startTime,
              endTime: now(),
              status: statusFinal,
              kind: input.kind,
              attributes: endExtra.attributes ? { ...baseAttrs, ...endExtra.attributes } : baseAttrs,
            },
          ];
          await retryingPost(cfg.endpoints.otlp + '/v1/traces', { spans: otlpLike }, genId(8)).catch(() => {});
        }
        resolve(result);
      } catch (err) {
        const endExtra = computeEndAttrs?.(undefined, err) || {};
        const statusFinal: SpanStatus = endExtra.status || 'error';
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            seq: 1,
            traceId,
            spanId,
            endTime: now(),
            status: statusFinal,
            label: input.label,
            kind: input.kind,
            attributes: endExtra.attributes ? { ...baseAttrs, ...endExtra.attributes } : baseAttrs,
          };
          await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', completed, genId(8)).catch(() => {});
        } else {
          const otlpLike = [
            {
              traceId,
              spanId,
              parentSpanId: ctx.parentSpanId,
              label: input.label,
              startTime,
              endTime: now(),
              status: statusFinal,
              kind: input.kind,
              attributes: endExtra.attributes ? { ...baseAttrs, ...endExtra.attributes } : baseAttrs,
            },
          ];
          await retryingPost(cfg.endpoints.otlp + '/v1/traces', { spans: otlpLike }, genId(8)).catch(() => {});
        }
        reject(err);
      }
    });
  });
}

export function currentSpan(): SpanContext | undefined {
  return als.getStore();
}

export async function flush() {
  // Stage 1 minimal stub (no background buffers yet)
}

// Helper creators (per spec) - only the specified parameters and mandatory mapping to attributes/kind.

export function withThread<T>(attributes: { threadId: string; [k: string]: unknown }, fn: () => Promise<T> | T) {
  const { threadId, ...rest } = attributes;
  return withSpan({ label: 'thread', threadId, kind: 'thread', attributes: { kind: 'thread', threadId, ...rest } }, fn);
}

export function withAgent<T>(attributes: Record<string, unknown>, fn: () => Promise<T> | T) {
  return withSpan({ label: 'agent', kind: 'agent', attributes: { kind: 'agent', ...attributes } }, fn);
}

export function withLLM<T>(
  attributes: { context: Array<ChatMessageInput>; [k: string]: unknown },
  fn: () => Promise<LLMResponse<T>> | LLMResponse<T>,
) {
  /**
   * NOTE: The provided callback MUST return an instance of LLMResponse.
   * This keeps instrumentation deterministic and avoids ambiguous provider object shapes.
   * If a non-LLMResponse value is returned, an error attribute (llm.response.missingWrapper) is recorded
   * and the raw value is still passed through (but instrumentation data for content/toolCalls will be absent).
   */
  const { context: rawContext, ...rest } = attributes;
  const context = rawContext.map(BaseMessage.fromLangChain).map((m) => m.toJSON());
  return withSpan({ label: 'llm', kind: 'llm', attributes: { kind: 'llm', context, ...rest } }, fn, (result) => {
    if (!(result instanceof LLMResponse)) {
      return { attributes: { error: 'llm.response.missingWrapper' }, status: 'error' };
    }
    const content = result.content;
    const toolCalls = result.toolCalls;
    const attr: Record<string, unknown> = {};
    if (content !== undefined) {
      attr.output = { ...(attr.output as any), content };
      attr['llm.content'] = content;
    }
    if (toolCalls && toolCalls.length) {
      attr.output = { ...(attr.output as any), toolCalls };
      attr['llm.toolCalls'] = toolCalls;
    }
    return { attributes: attr };
  }).then((res) => (res as LLMResponse<T>).raw);
}

export function withToolCall<TOutput = unknown, TRaw = any>(
  attributes: { toolCallId: string; name: string; input: unknown; [k: string]: unknown },
  fn: () => Promise<ToolCallResponse<TRaw, TOutput>> | ToolCallResponse<TRaw, TOutput>,
): Promise<TRaw> {
  const { toolCallId, name, input, ...rest } = attributes;
  return withSpan(
    { label: `tool:${name}`, kind: 'tool_call', attributes: { kind: 'tool_call', toolCallId, name, input, ...rest } },
    fn,
    (result, err) => {
      if (err) return { attributes: { status: 'error' }, status: 'error' };
      if (!(result instanceof ToolCallResponse)) {
        return { attributes: { status: 'error', error: 'tool.response.missingWrapper' }, status: 'error' };
      }
      // Propagate declared ToolCallResponse.status so spans reflect explicit error payloads
      // without requiring the tool function to throw. This enables UI to display failed tool calls
      // (e.g. validation failures) based solely on structured ToolCallResponse metadata.
      return { attributes: { output: result.output }, status: result.status };
    },
  ).then((res) => (res as ToolCallResponse<TRaw, TOutput>).raw);
}

export function withSummarize<TRaw = any>(
  attributes: { oldContext: Array<ChatMessageInput>; [k: string]: unknown },
  fn: () => Promise<SummarizeResponse<TRaw>> | SummarizeResponse<TRaw>,
) {
  /**
   * NOTE: The provided callback MUST return an instance of SummarizeResponse.
   * This mirrors withLLM to keep instrumentation deterministic.
   */
  const { oldContext: rawOldContext, ...rest } = attributes;
  const oldContext = rawOldContext.map(BaseMessage.fromLangChain).map((m) => m.toJSON());
  return withSpan(
    { label: 'summarize', kind: 'summarize', attributes: { kind: 'summarize', oldContext, ...rest } },
    fn,
    (result) => {
      if (!(result instanceof SummarizeResponse)) {
        return { attributes: { error: 'summarize.response.missingWrapper' }, status: 'error' };
      }
      const attr: Record<string, unknown> = {};
      if (result.summary !== undefined) attr.summary = result.summary;
      if (result.newContext !== undefined) attr.newContext = result.newContext;
      return { attributes: Object.keys(attr).length ? attr : undefined };
    },
  ).then((res) => (res as SummarizeResponse<TRaw>).raw);
}

export function withSystem<T>(attributes: { label: string; [k: string]: unknown }, fn: () => Promise<T> | T) {
  const { label, ...rest } = attributes;
  return withSpan({ label, kind: 'system', attributes: { kind: 'system', ...rest } }, fn);
}

// ---------------------------------------------------------------------------
// New message & response types (Stage 1 API evolution)
// ---------------------------------------------------------------------------

// Tool call descriptor used within AIMessage toolCalls
export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

// Input union accepted by fromLangChain for convenience/backward compat
export type ChatMessageInput =
  | BaseMessage
  | { role: 'system'; content: string }
  | { role: 'human'; content: string }
  | { role: 'ai'; content: string; toolCalls?: ToolCall[]; tool_calls?: any }
  | { role: 'tool'; toolCallId: string; content: string; tool_call_id?: string };

export abstract class BaseMessage {
  abstract role: string;
  abstract content: string;
  toJSON(): Record<string, unknown> {
    return { role: this.role, content: this.content };
  }
  static fromLangChain(msg: LangChainBaseMessage): BaseMessage {
    if (msg instanceof BaseMessage) return msg;
    const role = msg.role || msg._getType?.();
    if (!role) throw new Error('Unrecognized message shape');
    switch (role) {
      case 'system':
        return new SystemMessage(msg.content as string);
      case 'human':
      case 'user':
        return new HumanMessage(msg.content as string);
      case 'ai':
      case 'assistant': {
        const toolCalls: ToolCall[] = (msg.toolCalls || msg.tool_calls || []).map((tc: any, idx: number) => ({
          id: tc.id || `tc_${idx}`,
          name: tc.name,
          arguments: tc.args ?? tc.arguments,
        }));
        return new AIMessage(msg.content as string, toolCalls);
      }
      case 'tool':
        return new ToolMessage((msg as any).toolCallId || (msg as any).tool_call_id, msg.content as string);
      default:
        return new SystemMessage(String(msg.content ?? ''));
    }
  }
}

// Structural interface for LangChain messages (avoids direct dependency)
export interface LangChainBaseMessage {
  role?: string;
  content?: unknown;
  toolCalls?: any[];
  tool_calls?: any[];
  toolCallId?: string;
  tool_call_id?: string;
  _getType?: () => string;
  [k: string]: any;
}

export class SystemMessage extends BaseMessage {
  role: 'system' = 'system';
  constructor(public content: string) {
    super();
  }
}
export class HumanMessage extends BaseMessage {
  role: 'human' = 'human';
  constructor(public content: string) {
    super();
  }
}
export class AIMessage extends BaseMessage {
  role: 'ai' = 'ai';
  constructor(public content: string, public toolCalls: ToolCall[] = []) {
    super();
  }
  override toJSON() {
    return { role: this.role, content: this.content, toolCalls: this.toolCalls };
  }
}
export class ToolMessage extends BaseMessage {
  role: 'tool' = 'tool';
  constructor(public toolCallId: string, public content: string) {
    super();
  }
  override toJSON() {
    return { role: this.role, toolCallId: this.toolCallId, content: this.content };
  }
}

export type ChatMessage = BaseMessage;

// LLMResponse wrapper to extract standardized attributes while returning raw provider output
export class LLMResponse<TRaw = any> {
  readonly raw: TRaw;
  readonly content?: string;
  readonly toolCalls?: ToolCall[];
  constructor(params: { raw: TRaw; content?: string; toolCalls?: ToolCall[] }) {
    this.raw = params.raw;
    this.content = params.content;
    this.toolCalls = params.toolCalls;
  }
}

// ToolCallResponse wrapper for tool execution instrumentation
export class ToolCallResponse<TRaw = any, TOutput = unknown> {
  readonly raw: TRaw;
  readonly output?: TOutput;
  readonly status: SpanStatus;
  constructor(params: { raw: TRaw; output?: TOutput; status: SpanStatus }) {
    this.raw = params.raw;
    this.output = params.output;
    this.status = params.status;
  }
}

// SummarizeResponse wrapper for summarization instrumentation
export class SummarizeResponse<TRaw = any> {
  readonly raw: TRaw;
  readonly summary?: string;
  readonly newContext?: Array<ChatMessageInput>;
  constructor(params: { raw: TRaw; summary?: string; newContext?: Array<ChatMessageInput> }) {
    this.raw = params.raw;
    this.summary = params.summary;
    this.newContext = params.newContext;
  }
}
