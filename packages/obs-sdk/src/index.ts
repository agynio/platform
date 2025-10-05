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
  config = { mode: c.mode, endpoints, batching, sampling, defaultAttributes: c.defaultAttributes || {}, retry };
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
  ) => { attributes?: Record<string, unknown>; status?: 'ok' | 'error' } | void,
): Promise<T> {
  if (!config) throw new Error('obs-sdk not initialized');
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
        const statusFinal = endExtra.status || 'ok';
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            traceId,
            spanId,
            endTime: now(),
            status: statusFinal,
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
        const statusFinal = endExtra.status || 'error';
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            traceId,
            spanId,
            endTime: now(),
            status: statusFinal,
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
  return withSpan({ label: 'thread', threadId, kind: 'thread', attributes: { threadId, ...rest } }, fn);
}

export function withAgent<T>(attributes: Record<string, unknown>, fn: () => Promise<T> | T) {
  return withSpan({ label: 'agent', kind: 'agent', attributes }, fn);
}

export function withLLM<T>(
  attributes: { newMessages: unknown[]; context: unknown; [k: string]: unknown },
  fn: () => Promise<T> | T,
) {
  const { newMessages, context, ...rest } = attributes;
  return withSpan({ label: 'llm', kind: 'llm', attributes: { newMessages, context, ...rest } }, fn, (result) => {
    if (result && typeof result === 'object') {
      const r: any = result as any;
      const output: Record<string, unknown> = {};
      if ('text' in r) output.text = r.text;
      if ('toolCalls' in r) output.toolCalls = r.toolCalls;
      return { attributes: Object.keys(output).length ? { output } : undefined };
    }
    return;
  });
}

export function withToolCall<T>(
  attributes: { name: string; input: unknown; [k: string]: unknown },
  fn: () => Promise<T> | T,
) {
  const { name, input, ...rest } = attributes;
  return withSpan(
    { label: `tool:${name}`, kind: 'tool_call', attributes: { name, input, ...rest } },
    fn,
    (result, err) => {
      if (err) return { attributes: { status: 'error' }, status: 'error' };
      return { attributes: { output: result, status: 'success' }, status: 'ok' };
    },
  );
}

export function withSummarize<T>(attributes: { oldContext: unknown; [k: string]: unknown }, fn: () => Promise<T> | T) {
  const { oldContext, ...rest } = attributes;
  return withSpan({ label: 'summarize', kind: 'summarize', attributes: { oldContext, ...rest } }, fn, (result) => {
    if (result && typeof result === 'object') {
      const r: any = result as any;
      const out: Record<string, unknown> = {};
      if ('summary' in r) out.summary = r.summary;
      if ('newContext' in r) out.newContext = r.newContext;
      return { attributes: Object.keys(out).length ? out : undefined };
    }
    return;
  });
}

export function withSystem<T>(attributes: { label: string; [k: string]: unknown }, fn: () => Promise<T> | T) {
  const { label, ...rest } = attributes;
  return withSpan({ label, kind: 'system', attributes: { ...rest } }, fn);
}
