import { describe, expect, it } from 'vitest';

import { MemoryConnectorNode } from '../../src/nodes/memoryConnector/memoryConnector.node';
import { createNodeTestingModule } from './node-di.helper';

describe('MemoryConnectorNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(MemoryConnectorNode);
    try {
      const node = await moduleRef.resolve(MemoryConnectorNode);
      expect(node).toBeInstanceOf(MemoryConnectorNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
