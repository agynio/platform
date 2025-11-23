import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { MemoryNode } from '../../src/nodes/memory/memory.node';

describe('MemoryNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(MemoryNode);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
