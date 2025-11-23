import { describe, expect, it } from 'vitest';

import { ManageToolNode } from '../../src/nodes/tools/manage/manage.node';
import { createNodeTestingModule } from './node-di.helper';

describe('ManageToolNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(ManageToolNode);
    try {
      const node = await moduleRef.resolve(ManageToolNode);
      expect(node).toBeInstanceOf(ManageToolNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
