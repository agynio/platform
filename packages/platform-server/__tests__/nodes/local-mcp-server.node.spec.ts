import { describe, expect, it } from 'vitest';

import { LocalMCPServerNode } from '../../src/nodes/mcp/localMcpServer.node';
import { createNodeTestingModule } from './node-di.helper';

describe('LocalMCPServerNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(LocalMCPServerNode);
    try {
      const node = await moduleRef.resolve(LocalMCPServerNode);
      expect(node).toBeInstanceOf(LocalMCPServerNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
