import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { createNodeTestingModule } from './node-di.helper';
import { GithubCloneRepoNode, GithubCloneRepoToolStaticConfigSchema } from '../../src/nodes/tools/github_clone_repo/github_clone_repo.node';

describe('GithubCloneRepoNode DI', () => {
  it('compiles via Nest testing module', async () => {
    const moduleRef = await createNodeTestingModule(GithubCloneRepoNode);
    try {
      expect(moduleRef).toBeTruthy();
    } finally {
      await moduleRef.close();
    }
  });
});

describe('GithubCloneRepoToolStaticConfigSchema', () => {
  it('allows valid name override', () => {
    expect(GithubCloneRepoToolStaticConfigSchema.safeParse({ name: 'repo_clone_1' }).success).toBe(true);
  });

  it('rejects invalid name override', () => {
    expect(GithubCloneRepoToolStaticConfigSchema.safeParse({ name: 'Repo-Clone' }).success).toBe(false);
  });
});
