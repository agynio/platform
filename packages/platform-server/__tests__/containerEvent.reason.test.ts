import { describe, it, expect } from 'vitest';
import { mapContainerEventReason, statusForEvent } from '../src/infra/container/containerEvent.reason';
import type { ContainerEventType } from '@prisma/client';

describe('containerEvent.reason mapping', () => {
  it('maps oom events to OOMKilled and failed status', () => {
    const reason = mapContainerEventReason({ eventType: 'oom' });
    expect(reason).toBe('OOMKilled');
    expect(statusForEvent('oom', reason)).toBe('failed');
  });

  it('maps die exitCode 0 to ExitedNormally and stopped status', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 0 });
    expect(reason).toBe('ExitedNormally');
    expect(statusForEvent('die', reason)).toBe('stopped');
  });

  it('maps die exitCode 137 with recent oom to OOMKilled', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 137, hadRecentOom: true });
    expect(reason).toBe('OOMKilled');
    expect(statusForEvent('die', reason)).toBe('failed');
  });

  it('maps die exitCode 137 without oom to SIGKILL', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 137 });
    expect(reason).toBe('SIGKILL');
  });

  it('maps die exitCode 143 to SIGTERM and stopped status', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 143 });
    expect(reason).toBe('SIGTERM');
    expect(statusForEvent('die', reason)).toBe('stopped');
  });

  it('maps die exitCode 130 to SIGINT', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 130 });
    expect(reason).toBe('SIGINT');
  });

  it('maps die unknown exitCode to ExitedWithError', () => {
    const reason = mapContainerEventReason({ eventType: 'die', exitCode: 2 });
    expect(reason).toBe('ExitedWithError');
  });

  it.each([
    ['SIGTERM', 'SIGTERM'],
    ['TERM', 'SIGTERM'],
    ['15', 'SIGTERM'],
    ['SIGKILL', 'SIGKILL'],
    ['9', 'SIGKILL'],
    ['SIGINT', 'SIGINT'],
  ])('maps kill signal %s correctly', (signal, expected) => {
    const reason = mapContainerEventReason({ eventType: 'kill', signal });
    expect(reason).toBe(expected);
    expect(statusForEvent('kill', reason as ReturnType<typeof mapContainerEventReason>)).toBe('terminating');
  });
});

