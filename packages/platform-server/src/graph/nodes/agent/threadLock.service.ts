import { Injectable } from @nestjs/common;
import type { ResponseMessage, ToolCallOutputMessage } from @agyn/llm;

export type AgentResult = ResponseMessage | ToolCallOutputMessage;

export type LockLease = {
  threadId: string;
  runId: string;
  released: boolean;
};

export type JoinHandle = { processed: Promise<void> };

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ThreadEntry = {
  held: boolean;
  currentRunId: string | null;
  completion?: Deferred<void>;
  result?: Deferred<AgentResult>;
  queue: Array<{ runId: string; resolve: (lease: LockLease) => void }>;
};

@Injectable()
export class ThreadLockService {
  private threads = new Map<string, ThreadEntry>();

  private getEntry(threadId: string): ThreadEntry {
    let e = this.threads.get(threadId);
    if (!e) {
      e = { held: false, currentRunId: null, queue: [] };
      this.threads.set(threadId, e);
    }
    return e;
  }

  isHeld(threadId: string): boolean {
    return this.getEntry(threadId).held;
  }

  currentRun(threadId: string): string | null {
    return this.getEntry(threadId).currentRunId;
  }

  async acquire(threadId: string, runId: string): Promise<LockLease> {
    const e = this.getEntry(threadId);
    if (!e.held) {
      e.held = true;
      e.currentRunId = runId;
      e.completion = deferred<void>();
      e.result = deferred<AgentResult>();
      return { threadId, runId, released: false };
    }
    return new Promise<LockLease>((resolve) => {
      e.queue.push({ runId, resolve });
    });
  }

  join(threadId: string, _messageIds: readonly string[]): JoinHandle {
    const e = this.getEntry(threadId);
    const p = e.completion ? e.completion.promise : Promise.resolve();
    return { processed: p };
  }

  currentResult(threadId: string): Promise<AgentResult> | null {
    const e = this.getEntry(threadId);
    return e.result ? e.result.promise : null;
  }

  setResult(threadId: string, value: AgentResult): void {
    const e = this.getEntry(threadId);
    if (e.result) e.result.resolve(value);
  }

  release(lease: LockLease): void {
    const e = this.getEntry(lease.threadId);
    if (!e.held || e.currentRunId !== lease.runId) {
      // Ignore stale or mismatched lease
      return;
    }
    // resolve completion and clear current
    if (e.completion) e.completion.resolve();
    e.held = false;
    e.currentRunId = null;
    e.completion = undefined;
    e.result = undefined;

    // grant next queued acquirer if any
    const next = e.queue.shift();
    if (next) {
      e.held = true;
      e.currentRunId = next.runId;
      e.completion = deferred<void>();
      e.result = deferred<AgentResult>();
      next.resolve({ threadId: lease.threadId, runId: next.runId, released: false });
    }
  }
}
