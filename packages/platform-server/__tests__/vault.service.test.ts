import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../src/core/services/config.service';
import { VaultService } from '../src/vault/vault.service';

type VaultHttp = {
  http: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const createService = (): VaultService => {
  const config = {
    vaultAddr: 'http://vault.test',
    vaultToken: 'test-token',
  } as ConfigService;
  return new VaultService(config);
};

describe('VaultService', () => {
  it('listKvV2Mounts extracts kv v2 mounts from envelope', async () => {
    const service = createService();
    const envelope = {
      data: {
        'secret/': { type: 'kv', options: { version: '2' } },
        'kv2/': { type: 'kv', options: { version: 2 } },
        'kv1/': { type: 'kv', options: { version: '1' } },
        'sys/': { type: 'system' },
      },
    };

    const httpSpy = vi
      .spyOn(service as unknown as VaultHttp, 'http')
      .mockResolvedValue(envelope);

    const mounts = await service.listKvV2Mounts();

    expect(httpSpy).toHaveBeenCalledWith('/v1/sys/mounts', { method: 'GET' });
    expect(mounts).toEqual(['kv2', 'secret']);
  });
});
