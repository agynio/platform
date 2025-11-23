import { describe, expect, it } from 'vitest';

import { SlackTrigger } from '../../src/nodes/slackTrigger/slackTrigger.node';
import { createNodeTestingModule } from './node-di.helper';

describe('SlackTrigger DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(SlackTrigger);
    try {
      const node = await moduleRef.resolve(SlackTrigger);
      expect(node).toBeInstanceOf(SlackTrigger);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
