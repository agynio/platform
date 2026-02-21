import 'reflect-metadata';

import { vi } from 'vitest';

process.env.LITELLM_BASE_URL ||= 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY ||= 'sk-dev-master-1234';
process.env.CONTEXT_ITEM_NULL_GUARD ||= '1';
process.env.DOCKER_RUNNER_SHARED_SECRET ||= 'test-shared-secret';

vi.mock('../src/infra/ziti/ziti.bootstrap.service', () => {
  class ZitiBootstrapServiceMock {
    ensureReady = vi.fn(async () => {
      /* noop for tests */
    });

    async onModuleDestroy(): Promise<void> {
      /* noop */
    }
  }

  return { ZitiBootstrapService: ZitiBootstrapServiceMock };
});
