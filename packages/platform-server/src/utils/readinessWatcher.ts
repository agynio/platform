/**
 * Minimal readiness watcher utility used only by tests.
 * Polls a runtime for node status and emits once when a node becomes ready.
 */
export type ReadinessWatcherOptions = {
  pollIntervalMs: number;
  timeoutMs: number;
};

export interface NodeRuntime {
  getNodeStatus(id: string): unknown;
  getNodeInstance(id: string): object | undefined;
}

export type EmitFn = (nodeId: string) => void;

export interface LoggerLike {
  error(message: string, ...args: unknown[]): void;
}

function isReady(status: unknown): boolean {
  const s = status as { provisionStatus?: { state?: string } } | undefined;
  return Boolean(s && s.provisionStatus && s.provisionStatus.state === 'ready');
}

export class ReadinessWatcher {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly runtime: NodeRuntime,
    private readonly emit: EmitFn,
    private readonly logger: LoggerLike,
    private readonly opts: ReadinessWatcherOptions,
  ) {}

  start(nodeId: string): void {
    if (this.timers.has(nodeId)) return; // debounce concurrent starts

    const begin = Date.now();
    const interval = setInterval(() => {
      const inst = this.runtime.getNodeInstance(nodeId);
      if (!inst) {
        // node disappeared; stop
        this.stop(nodeId);
        return;
      }

      const status = this.runtime.getNodeStatus(nodeId);
      if (isReady(status)) {
        try { this.emit(nodeId); } catch (err) { this.logger.error('ReadinessWatcher emit error', err); }
        this.stop(nodeId);
        return;
      }

      if (Date.now() - begin > this.opts.timeoutMs) {
        // timeout reached; stop silently
        this.stop(nodeId);
      }
    }, this.opts.pollIntervalMs);

    this.timers.set(nodeId, interval);
  }

  stop(nodeId: string): void {
    const t = this.timers.get(nodeId);
    if (t) {
      clearInterval(t);
      this.timers.delete(nodeId);
    }
  }

  stopAll(): void {
    for (const [id, t] of this.timers) {
      clearInterval(t);
      this.timers.delete(id);
    }
  }
}

