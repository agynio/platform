import { describe, it, expect } from 'vitest';
import { BaseTrigger, BaseTriggerOptions } from '../src/triggers/base.trigger';
import type { ProvisionStatus } from '../src/graph/capabilities';

class ProvTrigger extends BaseTrigger {
  constructor(private failProvision = false, options?: BaseTriggerOptions) { super(options); }
  protected async doProvision(): Promise<void> {
    if (this.failProvision) throw new Error('boom');
  }
  protected async doDeprovision(): Promise<void> { /* no-op */ }
}

describe('BaseTrigger Provisionable', () => {
  it('transitions not_ready -> provisioning -> ready and notifies', async () => {
    const t = new ProvTrigger();
    const statuses: ProvisionStatus[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    expect(t.getProvisionStatus().state).toBe('not_ready');
    await t.provision();
    expect(t.getProvisionStatus().state).toBe('ready');
    expect(statuses.map(s => s.state)).toContain('provisioning');
    expect(statuses.map(s => s.state)).toContain('ready');
  });

  it('handles provision errors and reports error state', async () => {
    const t = new ProvTrigger(true);
    const statuses: ProvisionStatus[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    await t.provision();
    expect(t.getProvisionStatus().state).toBe('error');
    expect(statuses.map(s => s.state)).toContain('provisioning');
    expect(statuses.map(s => s.state)).toContain('error');
  });

  it('deprovision transitions to not_ready and notifies', async () => {
    const t = new ProvTrigger();
    await t.provision();
    const statuses: ProvisionStatus[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    await t.deprovision();
    expect(t.getProvisionStatus().state).toBe('not_ready');
    expect(statuses.map(s => s.state)).toContain('deprovisioning');
    expect(statuses.map(s => s.state)).toContain('not_ready');
  });
});
