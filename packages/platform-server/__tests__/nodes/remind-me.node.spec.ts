import { describe, expect, it } from 'vitest';

import { RemindMeNode } from '../../src/nodes/tools/remind_me/remind_me.node';
import { createNodeTestingModule } from './node-di.helper';

describe('RemindMeNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(RemindMeNode);
    try {
      const node = await moduleRef.resolve(RemindMeNode);
      expect(node).toBeInstanceOf(RemindMeNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
