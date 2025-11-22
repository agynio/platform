import { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { TemplateKind, TemplateNodeSchema } from '../src/shared/types/graph.types';
class DummyNode {
  getPortConfig() {
    return { sourcePorts: { out: { kind: 'instance' as const } }, targetPorts: { inp: { kind: 'instance' as const } } };
  }
}

describe('TemplateRegistry.toSchema without legacy capabilities/staticConfigSchema', () => {
  it('ignores capabilities/staticConfigSchema even when provided in meta', async () => {
    const moduleRef: ModuleRef = { create: <T>(cls: new () => T): T => new cls() };
    const reg = new TemplateRegistry(moduleRef);
    reg.register(
      'withMeta',
      {
        title: 'With Meta',
        kind: 'service' as TemplateKind,
      },
      DummyNode as any,
    );

    const schema = await reg.toSchema();
    const entry = schema.find((s) => s.name === 'withMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect((entry as any).capabilities).toBeUndefined();
    expect((entry as any).staticConfigSchema).toBeUndefined();
  });

  it('defaults to undefined when not provided in meta', async () => {
    const moduleRef: ModuleRef = { create: <T>(cls: new () => T): T => new cls() };
    const reg = new TemplateRegistry(moduleRef);
    reg.register('noMeta', { title: 'No Meta', kind: 'service' as TemplateKind }, DummyNode as any);

    const schema = await reg.toSchema();
    const entry = schema.find((s) => s.name === 'noMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect((entry as any).capabilities).toBeUndefined();
    expect((entry as any).staticConfigSchema).toBeUndefined();
  });
});
