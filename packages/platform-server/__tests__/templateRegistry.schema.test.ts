import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { TemplateNodeSchema, TemplateKind } from '../src/graph/types';

const noopFactory = () => ({ setConfig: () => {} });

const dummyPorts = {
  sourcePorts: { out: { kind: 'instance' as const } },
  targetPorts: { inp: { kind: 'instance' as const } },
};

describe('TemplateRegistry.toSchema with capabilities/staticConfigSchema', () => {
  it('includes capabilities and staticConfigSchema when provided in meta', () => {
    const reg = new TemplateRegistry();
    reg.register(
      'withMeta',
      noopFactory,
      dummyPorts as any,
      {
        title: 'With Meta',
        kind: 'service' as TemplateKind,
        capabilities: {
          pausable: true,
          staticConfigurable: true,
          dynamicConfigurable: false,
          provisionable: true,
        },
        staticConfigSchema: {
          type: 'object',
          properties: {
            foo: { type: 'string' },
          },
          required: ['foo'],
        } as any,
      }
    );

    const schema = reg.toSchema();
    const entry = schema.find((s) => s.name === 'withMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect(entry.capabilities).toEqual({
      pausable: true,
      staticConfigurable: true,
      dynamicConfigurable: false,
      provisionable: true,
    });
    expect(entry.staticConfigSchema).toEqual({
      type: 'object',
      properties: { foo: { type: 'string' } },
      required: ['foo'],
    });
  });

  it('defaults to undefined when not provided in meta', () => {
    const reg = new TemplateRegistry();
    reg.register('noMeta', noopFactory, dummyPorts as any, {
      title: 'No Meta',
      kind: 'service' as TemplateKind,
    });

    const schema = reg.toSchema();
    const entry = schema.find((s) => s.name === 'noMeta') as TemplateNodeSchema;
    expect(entry).toBeTruthy();
    expect(entry.capabilities).toBeUndefined();
    expect(entry.staticConfigSchema).toBeUndefined();
  });
});
