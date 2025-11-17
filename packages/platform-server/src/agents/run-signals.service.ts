import { Injectable } from '@nestjs/common';
import { Signal } from '../signal';

type RunSignalEntry = {
  terminateSignal: Signal;
};

@Injectable()
export class RunSignalsRegistry {
  private readonly signals = new Map<string, RunSignalEntry>();

  register(runId: string, signal: Signal): void {
    const existing = this.signals.get(runId);
    if (existing?.terminateSignal.isActive) {
      signal.activate();
    }
    this.signals.set(runId, { terminateSignal: signal });
  }

  activateTerminate(runId: string): void {
    const entry = this.signals.get(runId);
    if (entry) {
      entry.terminateSignal.activate();
      return;
    }
    const terminateSignal = new Signal();
    terminateSignal.activate();
    this.signals.set(runId, { terminateSignal });
  }

  get(runId: string): RunSignalEntry | undefined {
    return this.signals.get(runId);
  }

  clear(runId: string): void {
    this.signals.delete(runId);
  }
}
