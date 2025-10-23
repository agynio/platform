import type { LiveGraphRuntime } from '../graph/liveGraph.manager';
import type { LoggerService } from '../core/services/logger.service';

// Polls a node until it's ready and triggers a status emit once.
// Debounces per-node to avoid concurrent watchers.
export type EmitFn = (nodeId: string) => void;

export interface ReadinessWatcherOptions {
  pollIntervalMs?: number; // default 500
  timeoutMs?: number; // default 30000
}

interface ActiveWatcher {
  timer?: NodeJS.Timeout;
  startedAt: number;
  cancelled?: boolean;
}

export class ReadinessWatcher {
  private active = new Map<string, ActiveWatcher>();
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly runtime: LiveGraphRuntime,
    private readonly emit: EmitFn,
    private readonly logger: LoggerService,
    opts?: ReadinessWatcherOptions,
  ) {
    this.pollIntervalMs = opts?.pollIntervalMs ?? 500;
    this.timeoutMs = opts?.timeoutMs ?? 30_000;
  }

  // Start a fire-and-forget watcher for nodeId; coalesces if already running
  start(nodeId: string) {
    // If a watcher is already active, don't start another
    if (this.active.has(nodeId)) return;

    const startedAt = Date.now();
    const state: ActiveWatcher = { startedAt };
    this.active.set(nodeId, state);

    const tick = () => {
      if (state.cancelled) return;
      const status = this.runtime.getNodeStatus(nodeId);

      const isReady =
        (status?.provisionStatus && status.provisionStatus.state === 'ready') ||
        status?.dynamicConfigReady === true;

      // If node disappeared (deprovisioned) we should cancel
      const stillExists = !!(this.runtime as any).getNodeInstance?.(nodeId);

      if (isReady && stillExists) {
        try {
          this.emit(nodeId);
        } catch (e) {
          // swallow
          this.logger?.error?.('Readiness emit failed', nodeId, e as any);
        }
        this.stop(nodeId);
        return;
      }

      if (!stillExists) {
        this.stop(nodeId);
        return;
      }

      if (Date.now() - startedAt >= this.timeoutMs) {
        // timeout: do not emit; just stop
        this.stop(nodeId);
        return;
      }

      state.timer = setTimeout(tick, this.pollIntervalMs);
    };

    state.timer = setTimeout(tick, this.pollIntervalMs);
  }

  // Stop a watcher for a node (cleanup timer)
  stop(nodeId: string) {
    const state = this.active.get(nodeId);
    if (!state) return;
    state.cancelled = true;
    if (state.timer) clearTimeout(state.timer);
    this.active.delete(nodeId);
  }

  // Stop all watchers (e.g., on shutdown)
  stopAll() {
    for (const nodeId of Array.from(this.active.keys())) this.stop(nodeId);
  }
}
