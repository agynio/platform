import { describe, expect, it } from 'vitest';

import { FinishNode } from '../../src/nodes/tools/finish/finish.node';
import { createNodeTestingModule } from './node-di.helper';

describe('FinishNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(FinishNode);
    try {
      const node = await moduleRef.resolve(FinishNode);
      expect(node).toBeInstanceOf(FinishNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
