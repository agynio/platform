import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { WorkspaceNode } from '../../src/nodes/workspace/workspace.node';

describe('WorkspaceNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(WorkspaceNode);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
