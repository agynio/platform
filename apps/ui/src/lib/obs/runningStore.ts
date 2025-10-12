// Running spans store and hook
// - Tracks realtime running span counts per node and kind (agent/tool)
// - Uses obsRealtime span_upsert events and seeds from /v1/spans
// - Memory is capped per node-kind bucket to avoid unbounded growth

import { useSyncExternalStore, useEffect } from 'react';
import { obsRealtime } from './socket';
import type { SpanDoc } from './api';
import { fetchRunningSpansFromTo } from './api';

type Bucket = 'agent' | 'tool';

// Helper to detect bucket from span attributes/label
function detectBucket(span: SpanDoc): Bucket | undefined {
  const kind = (span.attributes?.kind as string | undefined) || undefined;
  const label = span.label || '';
  if (kind === 'agent' || label === 'agent') return 'agent';
  if (kind === 'tool_call' || label.startsWith('tool:')) return 'tool';
  return undefined;
}

function getNodeIdFromSpan(span: SpanDoc): string | undefined {
  const nodeId = span.nodeId || (span.attributes?.nodeId as string | undefined) || undefined;
  if (typeof nodeId === 'string' && nodeId.length > 0) return nodeId;
  return undefined;
}

function isRunningSpan(span: SpanDoc): boolean {
  // Define running as status == 'running' OR completed == false
  return span.status === 'running' || span.completed === false;
}

// Bounded bucket entries per node-kind; if over capacity we evict oldest.
const BUCKET_CAP = 500;

class RunningStoreImpl {
  private initialized = false;
  private subscribers = new Set<() => void>();
  // key = `${nodeId}|${bucket}`
  private bucketSpans = new Map<string, Set<string>>();
  private counts = new Map<string, number>();
  // Track span -> keys it contributes to (normally one)
  private spanToKeys = new Map<string, Set<string>>();

  private emit() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  subscribe(cb: () => void) {
    this.ensureInit();
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  getCount(nodeId?: string, bucket?: Bucket): number {
    if (!nodeId || !bucket) return 0;
    const key = `${nodeId}|${bucket}`;
    return this.counts.get(key) || 0;
  }

  private ensureInit() {
    if (this.initialized) return;
    this.initialized = true;
    // Attach realtime handler
    obsRealtime.onSpanUpsert((span) => this.onSpan(span));
    // Seed initial running spans for last 24h (best-effort)
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    fetchRunningSpansFromTo(from.toISOString(), to.toISOString())
      .then((items) => {
        for (const s of items) this.onSpan(s);
      })
      .catch(() => {})
      .finally(() => this.emit());
  }

  private addSpanToKey(spanId: string, key: string) {
    let set = this.bucketSpans.get(key);
    if (!set) {
      set = new Set<string>();
      this.bucketSpans.set(key, set);
    }
    const keysExisting = this.spanToKeys.get(spanId);
    const alreadyCounted = !!keysExisting && keysExisting.has(key);
    if (!alreadyCounted) {
      set.add(spanId);
      this.counts.set(key, (this.counts.get(key) || 0) + 1);
      // Cap size; evict oldest to keep memory bounded
      if (set.size > BUCKET_CAP) {
        const it = set.values();
        const oldest = it.next().value as string | undefined;
        if (oldest) {
          set.delete(oldest);
          // NOTE: We intentionally do not decrement count on eviction to avoid
          // undercounting while the evicted span may still be running. This implies
          // counts may saturate at cap for very active nodes.
          const keys = this.spanToKeys.get(oldest);
          if (keys) keys.delete(key);
        }
      }
      let keys = this.spanToKeys.get(spanId);
      if (!keys) {
        keys = new Set<string>();
        this.spanToKeys.set(spanId, keys);
      }
      keys.add(key);
    }
  }

  private removeSpanFromKey(spanId: string, key: string) {
    // Decrement count if this span was previously counted for this key,
    // even if membership set evicted it earlier.
    const keys = this.spanToKeys.get(spanId);
    if (keys && keys.has(key)) {
      this.counts.set(key, Math.max(0, (this.counts.get(key) || 0) - 1));
      keys.delete(key);
      if (keys.size === 0) this.spanToKeys.delete(spanId);
    }
    const set = this.bucketSpans.get(key);
    if (set) set.delete(spanId);
  }

  private onSpan(span: SpanDoc) {
    const nodeId = getNodeIdFromSpan(span);
    const bucket = detectBucket(span);
    const running = isRunningSpan(span);

    // Handle transitions: if span moved buckets or nodeId changed, clear old keys
    const prevKeys = this.spanToKeys.get(span.spanId);
    if (prevKeys && prevKeys.size) {
      // determine new key if any
      const newKey = nodeId && bucket ? `${nodeId}|${bucket}` : undefined;
      // Remove from any previous keys that are not the new key or if no longer running
      for (const k of Array.from(prevKeys)) {
        if (!running || (newKey && k !== newKey) || (!newKey && k)) {
          this.removeSpanFromKey(span.spanId, k);
        }
      }
    }

    if (!nodeId || !bucket) {
      // Nothing to index
      this.emit();
      return;
    }

    const key = `${nodeId}|${bucket}`;
    if (running) this.addSpanToKey(span.spanId, key);
    else this.removeSpanFromKey(span.spanId, key);
    this.emit();
  }
}

const store = new RunningStoreImpl();

export function useRunningCount(nodeId: string | undefined, kind: Bucket | undefined): number {
  // Subscribe only when meaningful
  useEffect(() => {
    // ensure init side-effects even if subscribe returns noop due to undefined kinds
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  }, []);
  if (!nodeId || !kind) return 0;
  return useSyncExternalStore((cb) => store.subscribe(cb), () => store.getCount(nodeId, kind));
}
