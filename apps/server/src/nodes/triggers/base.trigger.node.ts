import type { ProvisionStatus } from '../../graph/capabilities';

// Base trigger message. Backward-compatible: no 'kind' field required.
export interface TriggerMessage {
  content: string;
  info: Record<string, unknown>;
}
// Explicitly-typed variants for clarity/forward-compatibility
export type TriggerHumanMessage = TriggerMessage & { kind: 'human' };
export type TriggerSystemMessage = TriggerMessage & { kind: 'system' };

// Small centralized type guards for trigger messages
export function isSystemTrigger(msg: TriggerMessage): msg is TriggerSystemMessage {
  // Check discriminator without leaking details of other variants
  return (msg as Partial<TriggerSystemMessage>).kind === 'system';
}

export interface TriggerListener {
  invoke(thread: string, messages: TriggerMessage[]): Promise<unknown>;
}

export abstract class BaseTrigger {
  private listeners: TriggerListener[] = [];

  // Legacy provision status retained to feed UI status; managed by subclasses using start/stop
  private _provStatus: ProvisionStatus = { state: 'not_ready' };
  private _provListeners: Array<(s: ProvisionStatus) => void> = [];

  constructor() {}

  async subscribe(listener: TriggerListener): Promise<void> {
    this.listeners.push(listener);
  }

  async unsubscribe(listener: TriggerListener): Promise<void> {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // Status accessors (for UI)
  getProvisionStatus(): ProvisionStatus {
    return this._provStatus;
  }

  onProvisionStatusChange(listener: (s: ProvisionStatus) => void): () => void {
    this._provListeners.push(listener);
    return () => {
      this._provListeners = this._provListeners.filter((l) => l !== listener);
    };
  }

  protected setProvisionStatus(status: ProvisionStatus) {
    this._provStatus = status;
    for (const l of this._provListeners) {
      try {
        l(status);
      } catch {
        // ignore listener errors
      }
    }
  }

  // Convenience helpers for subclasses to update status during start/stop
  protected markProvisioning() { this.setProvisionStatus({ state: 'provisioning' }); }
  protected markReady(details?: unknown) { this.setProvisionStatus({ state: 'ready', details }); }
  protected markError(details?: unknown) { this.setProvisionStatus({ state: 'error', details }); }
  protected markDeprovisioning() { this.setProvisionStatus({ state: 'deprovisioning' }); }
  protected markNotReady() { this.setProvisionStatus({ state: 'not_ready' }); }

  /**
   * External triggers call this to fan-out messages to listeners immediately (agent-side buffering applies).
   */
  protected async notify(thread: string, messages: TriggerMessage[]): Promise<void> {
    if (!messages.length) return;
    await Promise.all(this.listeners.map(async (listener) => listener.invoke(thread, messages)));
  }

  // Universal teardown method for runtime disposal
  async delete(): Promise<void> {
    // default: unsubscribe all listeners by clearing the array
    this.listeners = [];
  }
}
