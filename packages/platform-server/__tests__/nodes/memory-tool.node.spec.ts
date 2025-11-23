import { describe, expect, it } from 'vitest';

import { MemoryToolNode } from '../../src/nodes/tools/memory/memory.node';
import { createNodeTestingModule } from './node-di.helper';

describe('MemoryToolNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(MemoryToolNode);
    try {
      const node = await moduleRef.resolve(MemoryToolNode);
      expect(node).toBeInstanceOf(MemoryToolNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
