import { describe, it, expect } from 'vitest';
import { computeSecretsUnion } from '@/api/modules/graph';
import type { SecretKey } from '@/api/modules/graph';

describe('unionWithPresence', () => {
  it('marks present and required correctly and computes union', () => {
    const required: SecretKey[] = [
      { mount: 'secret', path: 'github', key: 'GH_TOKEN' },
      { mount: 'secret', path: 'slack', key: 'BOT_TOKEN' },
    ];
    const available: SecretKey[] = [
      { mount: 'secret', path: 'github', key: 'GH_TOKEN' },
      { mount: 'secret', path: 'openai', key: 'API_KEY' },
    ];

    const out = computeSecretsUnion(required, available);
    const by = (m: string, p: string, k: string) => out.find((e) => e.mount === m && e.path === p && e.key === k)!;

    expect(by('secret', 'github', 'GH_TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN', required: true, present: true });
    expect(by('secret', 'slack', 'BOT_TOKEN')).toEqual({ mount: 'secret', path: 'slack', key: 'BOT_TOKEN', required: true, present: false });
    expect(by('secret', 'openai', 'API_KEY')).toEqual({ mount: 'secret', path: 'openai', key: 'API_KEY', required: false, present: true });
    expect(out.length).toBe(3);
  });
});
