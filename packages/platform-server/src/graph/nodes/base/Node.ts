import { Inject, Injectable, Scope } from '@nestjs/common';
import { EventEmitter } from 'events';
import { TemplatePortConfig } from '../../../graph';
import { LoggerService } from '../../../core/services/logger.service';

export type NodeStatusState =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

export type StatusChangedEvent = { prev: NodeStatusState; next: NodeStatusState; at: number };
export type ConfigChangedEvent<TConfig = unknown> = { config: TConfig; at: number };

@Injectable({ scope: Scope.TRANSIENT })
export abstract class Node<TConfig = unknown> extends EventEmitter {
  private _status: NodeStatusState = 'not_ready';
  private _pending: 'provision' | 'deprovision' | null = null;
  protected _config: TConfig = {} as TConfig;
  protected _nodeId?: string;

  abstract getPortConfig(): TemplatePortConfig;

  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super();
  }

  init(params: { nodeId: string }) {
    this._nodeId = params.nodeId;
  }

  get nodeId() {
    if (!this._nodeId) throw new Error('Node not initialized');
    return this._nodeId;
  }

  protected emitStatusChanged(prev: NodeStatusState, next: NodeStatusState): void {
    const at = Date.now();
    this.emit('status_changed', { prev, next, at } satisfies StatusChangedEvent);
  }
  protected emitConfigChanged(): void {
    const at = Date.now();
    const cfg = this._config && typeof this._config === 'object' ? { ...(this._config as object) } : this._config;
    this.emit('config_changed', { config: cfg as TConfig, at } satisfies ConfigChangedEvent<TConfig>);
  }

  protected setStatus(next: NodeStatusState): void {
    if (this._status === next) return;
    const prev = this._status;
    this._status = next;
    this.emitStatusChanged(prev, next);
  }
  get status(): NodeStatusState {
    return this._status;
  }

  get config(): TConfig {
    return this._config;
  }
  async setConfig(cfg: TConfig): Promise<void> {
    this._config = cfg ?? ({} as TConfig);
    this.emitConfigChanged();
  }

  async setState(_state: Record<string, unknown>): Promise<void> {
    /* override */
  }

  async provision(): Promise<void> {
    if (this._pending || this._status === 'provisioning' || this._status === 'deprovisioning') return;
    if (this._status === 'ready') return;
    this._pending = 'provision';
    this.setStatus('provisioning');
    try {
      await this.doProvision();
      this.setStatus('ready');
    } catch (err) {
      this.logger.error('Node provision failed', { nodeId: this._nodeId, err });
      this.setStatus('provisioning_error');
    } finally {
      this._pending = null;
    }
  }

  async deprovision(): Promise<void> {
    if (this._pending || this._status === 'provisioning' || this._status === 'deprovisioning') return;
    if (this._status === 'not_ready') return;
    this._pending = 'deprovision';
    this.setStatus('deprovisioning');
    try {
      await this.doDeprovision();
      this.setStatus('not_ready');
    } catch {
      this.setStatus('deprovisioning_error');
    } finally {
      this._pending = null;
    }
  }

  protected async doProvision(): Promise<void> {
    /* override */
  }
  protected async doDeprovision(): Promise<void> {
    /* override */
  }

  static async wait(
    target: {
      on(event: 'status_changed', handler: (ev: StatusChangedEvent) => void): void;
      off(event: 'status_changed', handler: (ev: StatusChangedEvent) => void): void;
      status?: NodeStatusState;
    },
    status: NodeStatusState,
    timeoutMs = 60000,
  ): Promise<void> {
    const get = () => target.status as NodeStatusState | undefined;
    if (get && get() === status) return;
    return await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(to);
        target.off('status_changed', onChange);
      };
      const onChange = (ev: StatusChangedEvent) => {
        if (ev.next === status) {
          cleanup();
          resolve();
        }
      };
      const to = setTimeout(() => {
        cleanup();
        const err = new Error(`wait timeout after ${timeoutMs}ms`) as Error & { code: 'TimeoutError' };
        err.code = 'TimeoutError';
        reject(err);
      }, timeoutMs);
      target.on('status_changed', onChange);
    });
  }

  async reprovision(mutator: (cfg: TConfig) => TConfig | void): Promise<void> {
    if (this._pending || this._status === 'provisioning' || this._status === 'deprovisioning') return;
    await this.deprovision();
    try {
      const next = mutator(this._config as TConfig);
      if (next && typeof next === 'object') this._config = next as TConfig;
      this.emitConfigChanged();
    } catch {}
    await this.provision();
  }
}

export default Node;
