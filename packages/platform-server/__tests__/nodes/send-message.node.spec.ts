import { describe, expect, it } from 'vitest';

import { SendMessageNode } from '../../src/nodes/tools/send_message/send_message.node';
import { createNodeTestingModule } from './node-di.helper';

describe('SendMessageNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(SendMessageNode);
    try {
      const node = await moduleRef.resolve(SendMessageNode);
      expect(node).toBeInstanceOf(SendMessageNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
