import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { CallAgentNode } from '../../src/nodes/tools/call_agent/call_agent.node';

describe('CallAgentNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(CallAgentNode);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
