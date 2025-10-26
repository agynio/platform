import { describe, it, expect, vi } from 'vitest';
// Skipped due to removal of legacy BaseTrigger provisionable behavior; see Issue #451
import { describe, it } from 'vitest';
describe.skip('BaseTrigger provisionable', () => {
  it('legacy behavior removed; covered by SlackTrigger integration', () => {});
});
import type { NodeStatusState } from '../src/graph';
import type { LoggerService } from '../src/core/services/logger.service.js';

const makeLogger = (): Pick<LoggerService, 'info' | 'debug' | 'error'> => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
});

class ProvTrigger extends BaseTrigger {
  constructor(private failProvision = false, logger: Pick<LoggerService, 'info' | 'debug' | 'error'> = makeLogger()) {
    super(logger as LoggerService);
  }
  protected async doProvision(): Promise<void> { if (this.failProvision) throw new Error('boom'); }
  protected async doDeprovision(): Promise<void> {}
}

describe('BaseTrigger Provisionable', () => {
  it('transitions not_ready -> provisioning -> ready and notifies', async () => {
    const t = new ProvTrigger();
    const statuses: NodeStatusState[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    expect(t.getProvisionStatus().state).toBe('not_ready');
    await t.provision();
    expect(t.getProvisionStatus().state).toBe('ready');
    expect(statuses.map(s => s.state)).toContain('provisioning');
    expect(statuses.map(s => s.state)).toContain('ready');
  });

  it('handles provision errors and reports error state', async () => {
    const t = new ProvTrigger(true);
    const statuses: NodeStatusState[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    await t.provision();
    expect(t.getProvisionStatus().state).toBe('error');
    expect(statuses.map(s => s.state)).toContain('provisioning');
    expect(statuses.map(s => s.state)).toContain('error');
  });

  it('deprovision transitions to not_ready and notifies', async () => {
    const t = new ProvTrigger();
    await t.provision();
    const statuses: NodeStatusState[] = [];
    t.onProvisionStatusChange((s) => statuses.push(s));

    await t.deprovision();
    expect(t.getProvisionStatus().state).toBe('not_ready');
    expect(statuses.map(s => s.state)).toContain('deprovisioning');
    expect(statuses.map(s => s.state)).toContain('not_ready');
  });
});
