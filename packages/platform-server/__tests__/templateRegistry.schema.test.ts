import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { TemplateNodeSchema, TemplateKind } from '../src/graph/types';
class DummyNode { getPortConfig() { return { sourcePorts: { out: { kind: 'instance' as const } }, targetPorts: { inp: { kind: 'instance' as const } } }; } }

const noopFactory = () => ({ setConfig: () => {} });

const dummyPorts = {
  sourcePorts: { out: { kind: 'instance' as const } },
  targetPorts: { inp: { kind: 'instance' as const } },
};

describe('TemplateRegistry.toSchema without legacy capabilities/staticConfigSchema', () => {
  it('ignores capabilities/staticConfigSchema even when provided in meta', async () => {
    const reg = new TemplateRegistry();
    reg.register('withMeta', {
      title: 'With Meta',
      kind: 'service' as TemplateKind,
    }, DummyNode as any);

    const schema = await reg.toSchema();
    const entry = schema.find((s) => s.name === 'withMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect((entry as any).capabilities).toBeUndefined();
    expect((entry as any).staticConfigSchema).toBeUndefined();
  });

  it('defaults to undefined when not provided in meta', async () => {
    const reg = new TemplateRegistry();
    reg.register('noMeta', { title: 'No Meta', kind: 'service' as TemplateKind }, DummyNode as any);

    const schema = await reg.toSchema();
    const entry = schema.find((s) => s.name === 'noMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect((entry as any).capabilities).toBeUndefined();
    expect((entry as any).staticConfigSchema).toBeUndefined();
  });
});
