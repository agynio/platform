import { describe, expect, it } from 'vitest';

import { computeAgentDefaultTitle, resolveAgentDisplayTitle } from '@/utils/agentDisplay';

describe('computeAgentDefaultTitle', () => {
  it('formats name and role when both provided', () => {
    expect(computeAgentDefaultTitle(' Delta ', ' Navigator ', 'Agent')).toBe('Delta (Navigator)');
  });

  it('returns name when only name provided', () => {
    expect(computeAgentDefaultTitle('Echo', null, 'Agent')).toBe('Echo');
  });

  it('returns role when only role provided', () => {
    expect(computeAgentDefaultTitle(undefined, ' Strategist ', 'Agent')).toBe('Strategist');
  });

  it('falls back when profile is missing', () => {
    expect(computeAgentDefaultTitle(undefined, undefined, 'Agent')).toBe('Agent');
  });
});

describe('resolveAgentDisplayTitle', () => {
  it('prefers trimmed config title when present', () => {
    expect(
      resolveAgentDisplayTitle({
        title: '  Field Ops  ',
        name: 'Delta',
        role: 'Navigator',
      }),
    ).toBe('Field Ops');
  });

  it('falls back to combined name and role when title missing', () => {
    expect(
      resolveAgentDisplayTitle({
        title: '',
        name: ' Aurora ',
        role: ' Lead ',
      }),
    ).toBe('Aurora (Lead)');
  });

  it('returns name when only name available', () => {
    expect(resolveAgentDisplayTitle({ title: '', name: 'Atlas', role: '   ' })).toBe('Atlas');
  });

  it('returns role when only role available', () => {
    expect(resolveAgentDisplayTitle({ title: '', name: '   ', role: 'Navigator' })).toBe('Navigator');
  });

  it('uses Agent fallback when profile empty', () => {
    expect(resolveAgentDisplayTitle({ title: ' ', name: null, role: undefined })).toBe('Agent');
  });
});
