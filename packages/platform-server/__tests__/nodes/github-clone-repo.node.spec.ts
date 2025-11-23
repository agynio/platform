import { describe, expect, it } from 'vitest';

import { GithubCloneRepoNode } from '../../src/nodes/tools/github_clone_repo/github_clone_repo.node';
import { createNodeTestingModule } from './node-di.helper';

describe('GithubCloneRepoNode DI', () => {
  it('resolves via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(GithubCloneRepoNode);
    try {
      const node = await moduleRef.resolve(GithubCloneRepoNode);
      expect(node).toBeInstanceOf(GithubCloneRepoNode);
      expect(node.getPortConfig()).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});
