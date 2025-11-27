import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { FinishNode, FinishToolStaticConfigSchema } from '../../src/nodes/tools/finish/finish.node';

describe('FinishNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(FinishNode);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});

describe('FinishToolStaticConfigSchema', () => {
  it('accepts valid name override', () => {
    expect(FinishToolStaticConfigSchema.safeParse({ name: 'finish_override' }).success).toBe(true);
  });

  it('rejects invalid name override', () => {
    expect(FinishToolStaticConfigSchema.safeParse({ name: 'Finish-Override' }).success).toBe(false);
  });
});
