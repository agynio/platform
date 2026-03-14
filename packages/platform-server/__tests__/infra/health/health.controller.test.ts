import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { HealthController } from '../../../src/infra/health/health.controller';
import {
  DockerRunnerStatusService,
  DockerRunnerStatusSnapshot,
} from '../../../src/infra/container/dockerRunnerStatus.service';

type DockerRunnerStub = {
  getSnapshot: () => DockerRunnerStatusSnapshot;
};

const createApp = async (service?: DockerRunnerStub) => {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      {
        provide: DockerRunnerStatusService,
        useFactory: () => service as unknown as DockerRunnerStatusService | undefined,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
};

describe('HealthController', () => {
  it('returns docker runner snapshot when dependency is present', async () => {
    const snapshot: DockerRunnerStatusSnapshot = {
      status: 'up',
      optional: false,
      endpoint: 'grpc://runner:50051',
      lastCheckedAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      consecutiveFailures: 0,
    };

    const app = await createApp({
      getSnapshot: () => snapshot,
    });

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');

      const payload = JSON.parse(response.payload) as {
        status: string;
        timestamp: string;
        checks: { dockerRunner: DockerRunnerStatusSnapshot };
      };

      expect(payload.status).toBe('ok');
      expect(new Date(payload.timestamp).toString()).not.toBe('Invalid Date');
      expect(payload.checks.dockerRunner).toEqual(snapshot);
    } finally {
      await app.close();
    }
  });

  it('marks docker runner check as skipped when dependency is missing', async () => {
    const app = await createApp();

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const payload = JSON.parse(response.payload) as {
        checks: {
          dockerRunner: {
            status: string;
            optional: boolean;
            error?: { name?: string; message: string };
          };
        };
      };

      expect(payload.checks.dockerRunner.status).toBe('skipped');
      expect(payload.checks.dockerRunner.optional).toBe(true);
      expect(payload.checks.dockerRunner.error?.message).toContain('not registered');
    } finally {
      await app.close();
    }
  });

  it('degrades docker runner check when dependency throws', async () => {
    const app = await createApp({
      getSnapshot: () => {
        throw new Error('boom');
      },
    });

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const payload = JSON.parse(response.payload) as {
        checks: {
          dockerRunner: {
            status: string;
            optional: boolean;
            error?: { name?: string; message: string };
          };
        };
      };

      expect(payload.checks.dockerRunner.status).toBe('error');
      expect(payload.checks.dockerRunner.optional).toBe(true);
      expect(payload.checks.dockerRunner.error?.message).toBe('boom');
    } finally {
      await app.close();
    }
  });
});
