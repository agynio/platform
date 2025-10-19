// Running spans store and hook
// - Tracks realtime running span counts per node and kind (agent/tool)
// - Uses obsRealtime span_upsert events and seeds from /v1/spans
// - Memory is bounded via mapping GC to avoid unbounded growth

import { useSyncExternalStore } from 'react';
import { obsRealtime } from './socket';
import type { SpanDoc } from '../tracing/api';
import { fetchRunningSpansFromTo } from '../tracing/api';

type Bucket = 'agent' | 'tool';

// Helper to detect bucket from span attributes/label
function detectBucket(span: SpanDoc): Bucket | undefined {
  const attrs = (span.attributes || {}) as Record<string, unknown>;
  const label = span.label || '';
  const isTool = attrs['kind'] === 'tool_call' || (label.startsWith('tool:') === true);
  // Detect agent spans for completeness (not used here)
  // treat explicit agent labels as agent bucket
  if (attrs['kind'] === 'agent' || label === 'agent') return 'agent';
  if (isTool) return 'tool';
  return undefined;
}

function getNodeIdFromSpan(span: SpanDoc): string | undefined {
  // Determine kind explicitly to avoid precedence bugs
  const attrs = (span.attributes || {}) as Record<string, unknown>;
  const label = span.label || '';
  const isTool = attrs['kind'] === 'tool_call' || (label.startsWith('tool:') === true);

  // For tool spans, use ONLY top-level nodeId (Tool id). No fallback to legacy attributes.toolNodeId
  if (isTool) {
    const nodeIdNew = span.nodeId || (attrs['nodeId'] as string | undefined) || undefined;
    if (nodeIdNew && typeof nodeIdNew === 'string' && nodeIdNew.length > 0) return nodeIdNew;
    // If absent, do not attribute tool activity to any node (surfacing missing instrumentation)
    return undefined;
  }

  // For non-tool, use the standard nodeId
  const nodeId = span.nodeId || (attrs['nodeId'] as string | undefined) || undefined;
  if (typeof nodeId === 'string' && nodeId.length > 0) return nodeId;
  return undefined;
}

function isRunningSpan(span: SpanDoc): boolean {
  // Define running as status == 'running' OR completed == false
  return span.status === 'running' || span.completed === false;
}

// Note: capacity is controlled indirectly via TTL-based GC of mappings.

class RunningStoreImpl {
  private initialized = false;
  private subscribers = new Set<() => void>();
  // key = `${nodeId}|${bucket}`
  // Maintain only counts per key and mapping spanId -> key set to support accurate decrements.
  private counts = new Map<string, number>();
  private spanToKeys = new Map<string, Set<string>>();
  // Optional TTL for orphaned span mappings (defensive)
  private spanFirstSeen = new Map<string, number>();
  private static readonly MAPPING_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  private emit() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        /* no-op */
      }
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
      .catch(() => {
        /* no-op */
      })
      .finally(() => this.emit());
  }

  private addSpanToKey(spanId: string, key: string) {
    const keysExisting = this.spanToKeys.get(spanId);
    const alreadyCounted = !!keysExisting && keysExisting.has(key);
    if (alreadyCounted) return;
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
    let keys = this.spanToKeys.get(spanId);
    if (!keys) {
      keys = new Set<string>();
      this.spanToKeys.set(spanId, keys);
      this.spanFirstSeen.set(spanId, Date.now());
    }
    keys.add(key);
    this.gcMappings();
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
    // membership set removed; counts and spanToKeys are the source of truth
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

  private gcMappings() {
    // Opportunistic GC: drop mappings older than TTL if span is not running (best-effort)
    const now = Date.now();
    for (const [spanId, first] of this.spanFirstSeen.entries()) {
      if (now - first < RunningStoreImpl.MAPPING_TTL_MS) continue;
      const keys = this.spanToKeys.get(spanId);
      if (!keys || keys.size === 0) {
        this.spanFirstSeen.delete(spanId);
        this.spanToKeys.delete(spanId);
      }
    }
  }

  // Test-only: reset internal counters/mappings to isolate tests
  resetForTest() {
    this.counts.clear();
    this.spanToKeys.clear();
    this.spanFirstSeen.clear();
  }
}

const store = new RunningStoreImpl();

export function useRunningCount(nodeId: string | undefined, kind: Bucket | undefined): number {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => (nodeId && kind ? store.getCount(nodeId, kind) : 0),
  );
}

// Exported only for tests; do not use in production code.
export function __resetRunningStoreForTest() {
  store.resetForTest();
}
