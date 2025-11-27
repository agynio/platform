import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { MemoryConnectorNode } from '../../src/nodes/memoryConnector/memoryConnector.node';
import { ConfigService } from '../../src/core/services/config.service';

describe('MemoryConnectorNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(MemoryConnectorNode, [
      { provide: ConfigService, useValue: { llmUseDeveloperRole: false } as unknown as ConfigService },
    ]);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
