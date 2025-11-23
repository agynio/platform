import { describe, expect, it } from 'vitest';

import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { createNodeTestingModule } from './node-di.helper';

describe('ShellCommandNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(ShellCommandNode);
    try {
      const node = await moduleRef.resolve(ShellCommandNode);
      expect(node).toBeInstanceOf(ShellCommandNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
