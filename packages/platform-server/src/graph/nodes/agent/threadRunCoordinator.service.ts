import { Injectable, Scope } from '@nestjs/common';
import { ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';

export type WhenBusyMode = 'wait' | 'injectAfterTools';
export type RunResult = ResponseMessage | ToolCallOutputMessage;

export interface StartOptions {
  agentNodeId: string;
  threadId: string;
  mode: WhenBusyMode;
}

export interface StartHandle {
  started: boolean;
  result: Promise<RunResult>;
}

export interface RunStarter {
  (): Promise<RunResult>;
}

type ActiveEntry = {
  active: Promise<RunResult> | null;
  queue: RunStarter[];
  waiters: Array<{ resolve: (r: RunResult) => void; reject: (e: unknown) => void }>;
};

@Injectable({ scope: Scope.DEFAULT })
export class ThreadRunCoordinatorService {
  private readonly byAgent: Map<string, Map<string, ActiveEntry>> = new Map();

  private ensure(agentNodeId: string, threadId: string): ActiveEntry {
    let byThread = this.byAgent.get(agentNodeId);
    if (!byThread) {
      byThread = new Map<string, ActiveEntry>();
      this.byAgent.set(agentNodeId, byThread);
    }
    let entry = byThread.get(threadId);
    if (!entry) {
      entry = { active: null, queue: [], waiters: [] };
      byThread.set(threadId, entry);
    }
    return entry;
  }

  acquireOrEnqueue(opts: StartOptions, start: RunStarter): StartHandle {
    const entry = this.ensure(opts.agentNodeId, opts.threadId);

    // If no active run, start immediately
    if (!entry.active) {
      const activePromise = this.runAndDrain(opts.agentNodeId, opts.threadId, start);
      entry.active = activePromise;
      return { started: true, result: activePromise };
    }

    // Active exists: join or enqueue
    if (opts.mode === 'injectAfterTools') {
      return { started: false, result: entry.active };
    }

    // mode === 'wait': enqueue and return waiter promise
    const waiter = new Promise<RunResult>((resolve, reject) => {
      entry.waiters.push({ resolve, reject });
      entry.queue.push(start);
    });
    return { started: false, result: waiter };
  }

  private runAndDrain(agentNodeId: string, threadId: string, starter: RunStarter): Promise<RunResult> {
    const entry = this.ensure(agentNodeId, threadId);
    const runPromise = Promise.resolve().then(() => starter());

    const continueDrain = (): void => {
      const next = entry.queue.shift();
      if (!next) {
        // Nothing left; clear active and optionally cleanup empty containers
        entry.active = null;
        const byThread = this.byAgent.get(agentNodeId);
        if (byThread) {
          if (byThread.get(threadId)?.active === null && (byThread.get(threadId)?.queue.length || 0) === 0) {
            byThread.delete(threadId);
            if (byThread.size === 0) this.byAgent.delete(agentNodeId);
          }
        }
        return;
      }
      const waiter = entry.waiters.shift();
      const nextPromise = Promise.resolve().then(() => next());
      entry.active = nextPromise;
      nextPromise
        .then((r) => {
          if (waiter) waiter.resolve(r);
          continueDrain();
        })
        .catch((e) => {
          if (waiter) waiter.reject(e);
          continueDrain();
        });
    };

    runPromise
      .then(() => continueDrain())
      .catch((e) => {
        // Propagate rejection to the first waiter (if any), then continue drain
        const w = entry.waiters.shift();
        if (w) w.reject(e);
        continueDrain();
      });

    return runPromise;
  }
}
