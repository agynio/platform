import { Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TemplatePortConfig } from '../src/graph/ports.types';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { TemplateNodeSchema } from '../src/graph/types';
import Node from '../src/nodes/base/Node';

// Define a minimal DummyNode class matching Node contract
@Injectable({ scope: Scope.TRANSIENT })
class DummyNode extends Node<Record<string, unknown>> {
  // Return known port config
  getPortConfig(): TemplatePortConfig {
    return {
      sourcePorts: { out: { kind: 'instance' } },
      targetPorts: { inp: { kind: 'instance' } },
    };
  }
}

describe('TemplateRegistry.toSchema port names via ModuleRef.create', () => {
  it('populates sourcePorts/targetPorts arrays when instantiation succeeds', async () => {
    // Stub ModuleRef that supports create; get is intentionally absent
    const moduleRef: ModuleRef = {
      create: async <T>(cls: new () => T): Promise<T> => new cls(),
    };

    // Construct registry with stub moduleRef
    const registry = new TemplateRegistry(moduleRef);

    // Register DummyNode under a template name
    registry.register('dummy', { title: 'Dummy', kind: 'tool' }, DummyNode);

    // Call toSchema and verify ports
    const schema: TemplateNodeSchema[] = await registry.toSchema();
    const entry = schema.find((s) => s.name === 'dummy');
    expect(entry).toBeTruthy();
    expect(entry?.sourcePorts).toEqual(['out']);
    expect(entry?.targetPorts).toEqual(['inp']);
  });
});
