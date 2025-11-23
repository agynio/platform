import { describe, expect, it } from 'vitest';

import { WorkspaceNode } from '../../src/nodes/workspace/workspace.node';
import { createNodeTestingModule } from './node-di.helper';

describe('WorkspaceNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(WorkspaceNode);
    try {
      const node = await moduleRef.resolve(WorkspaceNode);
      expect(node).toBeInstanceOf(WorkspaceNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
