import { describe, expect, it } from 'vitest';

import { SendSlackMessageNode } from '../../src/nodes/tools/send_slack_message/send_slack_message.node';
import { createNodeTestingModule } from './node-di.helper';

describe('SendSlackMessageNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(SendSlackMessageNode);
    try {
      const node = await moduleRef.resolve(SendSlackMessageNode);
      expect(node).toBeInstanceOf(SendSlackMessageNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
