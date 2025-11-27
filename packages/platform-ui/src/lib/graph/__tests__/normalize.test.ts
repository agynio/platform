import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';

vi.mock('@/api/http', () => ({
  http: {
    post: vi.fn(),
  },
}));

import { graph } from '@/api/modules/graph';
import { http } from '@/api/http';

describe('graph.saveFullGraph', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts payload without mutating config shapes', async () => {
    const payload = {
      name: 'sample',
      nodes: [
        {
          id: '1',
          template: 'workspace',
          config: {
            env: [
              { key: 'STATIC', value: 'plain' },
              { key: 'SECRET', value: { kind: 'vault', mount: 'secret', path: 'app/db', key: 'PASSWORD' } },
            ],
            workingDir: '/workspace',
            note: 'keep me',
            bot_token: { value: 'xoxb-123', source: 'vault' },
          },
        },
      ],
      edges: [],
    };
    const snapshot = JSON.parse(JSON.stringify(payload));
    (http.post as unknown as Mock).mockResolvedValue({ ok: true });

    await graph.saveFullGraph(payload as any);

    expect(http.post).toHaveBeenCalledWith('/api/graph', payload);
    expect(payload).toEqual(snapshot);
  });
});
