import { describe, expect, it } from 'vitest';

import { CallAgentNode } from '../../src/nodes/tools/call_agent/call_agent.node';
import { createNodeTestingModule } from './node-di.helper';

describe('CallAgentNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(CallAgentNode);
    try {
      const node = await moduleRef.resolve(CallAgentNode);
      expect(node).toBeInstanceOf(CallAgentNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
