import { describe, expect, it } from 'vitest';

import { MemoryNode } from '../../src/nodes/memory/memory.node';
import { createNodeTestingModule } from './node-di.helper';

describe('MemoryNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(MemoryNode);
    try {
      const node = await moduleRef.resolve(MemoryNode);
      expect(node).toBeInstanceOf(MemoryNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
