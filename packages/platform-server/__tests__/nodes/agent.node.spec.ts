import { describe, expect, it } from 'vitest';

import { AgentNode } from '../../src/nodes/agent/agent.node';
import { createNodeTestingModule } from './node-di.helper';

describe('AgentNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(AgentNode);
    try {
      const node = await moduleRef.resolve(AgentNode);
      expect(node).toBeInstanceOf(AgentNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
