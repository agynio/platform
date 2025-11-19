import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { NodesModule } from '../src/nodes/nodes.module';
import { LoggerService } from '../src/core/services/logger.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { ContainerService } from '../src/infra/container/container.service';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { EnvService } from '../src/env/env.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { GithubService } from '../src/infra/github/github.client';
import { PRService } from '../src/infra/github/pr.usecase';
import { ArchiveService } from '../src/infra/archive/archive.service';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';

const makeStub = <T extends Record<string, unknown>>(overrides: T): T =>
  new Proxy(overrides, {
    get(target, prop: string, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      const fn = vi.fn();
      Reflect.set(target, prop, fn);
      return fn;
    },
  });

const loggerStub = makeStub({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

const containerHandleStub = makeStub({
  id: 'cid-123',
  exec: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' }),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  putArchive: vi.fn().mockResolvedValue(undefined),
});

const containerServiceStub = makeStub({
  findContainerByLabels: vi.fn().mockResolvedValue(undefined),
  findContainersByLabels: vi.fn().mockResolvedValue([]),
  getContainerLabels: vi.fn().mockResolvedValue({}),
  start: vi.fn().mockResolvedValue(containerHandleStub),
  execContainer: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' }),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  putArchive: vi.fn().mockResolvedValue(undefined),
  ensureDinD: vi.fn().mockResolvedValue(undefined),
  cleanupDinDSidecars: vi.fn().mockResolvedValue(undefined),
  touchLastUsed: vi.fn().mockResolvedValue(undefined),
});

const envServiceStub = makeStub({
  resolveProviderEnv: vi.fn().mockResolvedValue({}),
});

const ncpsKeyServiceStub = makeStub({
  getKeysForInjection: vi.fn().mockReturnValue([]),
});

const vaultServiceStub = makeStub({
  getSecret: vi.fn().mockResolvedValue('xoxb-test-token'),
});

const persistenceStub = makeStub({
  getOrCreateThreadByAlias: vi.fn().mockResolvedValue('thread-123'),
  updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined),
});

const transactionClientStub = makeStub({
  $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
  run: makeStub({
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  }),
  reminder: makeStub({
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  }),
});

const prismaClientStub = makeStub({
  container: makeStub({
    upsert: vi.fn().mockResolvedValue(undefined),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findMany: vi.fn().mockResolvedValue([]),
  }),
  conversationState: makeStub({
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
  }),
  $queryRaw: transactionClientStub.$queryRaw,
  $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => cb(transactionClientStub)),
});

const prismaStub = makeStub({
  $on: vi.fn(),
  $use: vi.fn(),
  $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => cb(transactionClientStub)),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  getClient: vi.fn().mockReturnValue(prismaClientStub),
});

const slackAdapterStub = makeStub({
  sendText: vi.fn(),
});

const configServiceStub = new ConfigService().init(
  configSchema.parse({
    llmProvider: 'openai',
    agentsDatabaseUrl: 'postgres://localhost:5432/test',
  }),
);

if (!shouldRunDbTests) {
  describe.skip('NodesModule DI smoke test', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('NodesModule DI smoke test', () => {
    it('resolves SlackTrigger provider when module compiles', async () => {
      vi.spyOn(PrismaService.prototype, 'getClient').mockReturnValue(prismaClientStub);

    const builder = Test.createTestingModule({
      imports: [NodesModule],
    });

    builder.overrideProvider(ConfigService).useFactory(() => configServiceStub);
    builder.overrideProvider(PrismaService).useFactory(() => prismaStub);
    builder.overrideProvider(ContainerService).useFactory(() => containerServiceStub);
    builder.overrideProvider(NcpsKeyService).useFactory(() => ncpsKeyServiceStub);
    builder.overrideProvider(ContainerRegistry).useFactory(() =>
      makeStub({
        ensureIndexes: vi.fn().mockResolvedValue(undefined),
        getExpired: vi.fn().mockResolvedValue([]),
        registerStart: vi.fn().mockResolvedValue(undefined),
        markStopped: vi.fn().mockResolvedValue(undefined),
        claimForTermination: vi.fn().mockResolvedValue(true),
        recordTerminationFailure: vi.fn().mockResolvedValue(undefined),
      }),
    );
    builder.overrideProvider(ContainerCleanupService).useFactory(() => makeStub({ start: vi.fn(), sweep: vi.fn() }));
    builder.overrideProvider(ContainerThreadTerminationService).useFactory(() => makeStub({}));
    builder.overrideProvider(GithubService).useFactory(() => makeStub({}));
    builder.overrideProvider(PRService).useFactory(() => makeStub({}));
    builder.overrideProvider(ArchiveService).useFactory(() => makeStub({}));

    builder.useMocker((token) => {
      if (token === LoggerService) return loggerStub;
      if (token === VaultService) return vaultServiceStub;
      if (token === AgentsPersistenceService) return persistenceStub;
      if (token === SlackAdapter) return slackAdapterStub;
      if (token === EnvService) return envServiceStub;
      return makeStub({});
    });

    const moduleRef = await builder.compile();

    const instance = await moduleRef.resolve(SlackTrigger);
    expect(instance).toBeInstanceOf(SlackTrigger);

    const remindMeInstance = await moduleRef.resolve(RemindMeNode);
    expect(remindMeInstance).toBeInstanceOf(RemindMeNode);

    await moduleRef.close();
    }, 60000);
  });
}
