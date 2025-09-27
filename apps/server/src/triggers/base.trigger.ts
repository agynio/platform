import type { Pausable, ProvisionStatus, Provisionable } from '../graph/capabilities';

export type TriggerMessage = { content: string; info: Record<string, unknown> };

export interface TriggerListener {
  invoke(thread: string, messages: TriggerMessage[]): Promise<any>;
}

export abstract class BaseTrigger implements Pausable, Provisionable {
  private listeners: TriggerListener[] = [];

  // Pausable implementation
  private _paused = false;

  // Provisionable implementation
  private _provStatus: ProvisionStatus = { state: 'not_ready' };
  private _provListeners: Array<(s: ProvisionStatus) => void> = [];
  private _provInFlight: Promise<void> | null = null;

  async subscribe(listener: TriggerListener): Promise<void> {
    this.listeners.push(listener);
  }

  async unsubscribe(listener: TriggerListener): Promise<void> {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // Pausable
  pause(): void {
    this._paused = true;
  }
  resume(): void {
    this._paused = false;
  }
  isPaused(): boolean {
    return this._paused;
  }

  // Provisionable
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

  async provision(): Promise<void> {
    // Idempotent: if already ready, no-op
    if (this._provStatus.state === 'ready') return;
    if (this._provInFlight) return this._provInFlight;
    this.setProvisionStatus({ state: 'provisioning' });
    this._provInFlight = (async () => {
      try {
        await this.doProvision();
        this.setProvisionStatus({ state: 'ready' });
      } catch (err) {
        this.setProvisionStatus({ state: 'error', details: err });
      } finally {
        this._provInFlight = null;
      }
    })();
    return this._provInFlight;
  }

  async deprovision(): Promise<void> {
    if (this._provStatus.state === 'not_ready') return;
    this.setProvisionStatus({ state: 'deprovisioning' });
    try {
      await this.doDeprovision();
    } finally {
      // Regardless of outcome, transition to not_ready as per spec
      this.setProvisionStatus({ state: 'not_ready' });
    }
  }

  /** Hooks for subclasses to implement actual resource lifecycle */
  protected async doProvision(): Promise<void> { /* no-op by default */ }
  protected async doDeprovision(): Promise<void> { /* no-op by default */ }

  /**
   * External triggers call this to notify all listeners immediately.
   * No buffering - this is now handled by MessagesBuffer in the Agent layer.
   */
  protected async notify(thread: string, messages: TriggerMessage[]): Promise<void> {
    if (this._paused) return; // drop events while paused
    if (messages.length === 0) return;

    // Immediately notify all listeners
    await Promise.all(this.listeners.map(async (listener) => listener.invoke(thread, messages)));
  }

  // Universal teardown method for runtime disposal
  async destroy(): Promise<void> {
    // Clear listeners
    this.listeners = [];
  }
}
