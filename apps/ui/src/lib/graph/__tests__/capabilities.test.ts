import { describe, it, expect } from 'vitest';
import { canPause, canProvision, hasStaticConfig, hasDynamicConfig, canPauseByName } from '../../graph/capabilities';

const a = { name: 'a', title: 'A', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { pausable: true } } as any;
const b = { name: 'b', title: 'B', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { provisionable: true } } as any;
const c = { name: 'c', title: 'C', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { staticConfigurable: true }, staticConfigSchema: {} } as any;
const d = { name: 'd', title: 'D', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { dynamicConfigurable: true } } as any;

describe('capabilities helpers', () => {
  it('capability checks on template object', () => {
    expect(canPause(a)).toBe(true);
    expect(canProvision(b)).toBe(true);
    expect(hasStaticConfig(c)).toBe(true);
    expect(hasDynamicConfig(d)).toBe(true);
  });
  it('canPauseByName via resolver', () => {
    const map = new Map([['a', a]]);
    const get = (n: string) => map.get(n);
    expect(canPauseByName('a', get)).toBe(true);
    expect(canPauseByName('z', get)).toBe(false);
  });
});
