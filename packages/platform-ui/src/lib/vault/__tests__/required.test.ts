import { describe, it, expect } from 'vitest';
import type { PersistedGraph } from '@agyn/shared';
import { computeRequiredKeys } from '@/api/modules/graph';

describe('computeRequiredKeys', () => {
  it('extracts mount/path/key from ReferenceField and env arrays', () => {
    const graph: PersistedGraph = {
      name: 'g',
      version: 1,
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'n1',
          template: 'sendSlackMessageTool',
          config: {
            bot_token: { value: 'secret/slack/BOT_TOKEN', source: 'vault' },
          },
        },
        {
          id: 'n2',
          template: 'workspace',
          config: {
            env: [
              { name: 'GH_TOKEN', value: 'secret/github/GH_TOKEN', source: 'vault' },
              { name: 'STATIC_ONLY', value: 'abc', source: 'static' },
            ],
          },
        },
        {
          id: 'n3',
          template: 'githubCloneRepoTool',
          config: {
            token: { value: 'secret/github/GH_TOKEN', source: 'vault' },
          },
        },
      ],
      edges: [],
    };

    const out = computeRequiredKeys(graph);
    // Unique keys across nodes
    expect(out).toContainEqual({ mount: 'secret', path: 'slack', key: 'BOT_TOKEN' });
    expect(out).toContainEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN' });
    // Ensure no duplicates
    const gh = out.filter((k) => k.mount === 'secret' && k.path === 'github' && k.key === 'GH_TOKEN');
    expect(gh.length).toBe(1);
  });
});
