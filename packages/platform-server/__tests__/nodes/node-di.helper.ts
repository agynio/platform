import 'reflect-metadata';

import type { Provider, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import { CallAgentLinkingService } from '../../src/agents/call-agent-linking.service';
import { RunSignalsRegistry } from '../../src/agents/run-signals.service';
import { ConfigService } from '../../src/core/services/config.service';
import { LoggerService } from '../../src/core/services/logger.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { RunEventsService } from '../../src/events/run-events.service';
import { LiveGraphRuntime } from '../../src/graph-core/liveGraph.manager';
import { EnvService } from '../../src/env/env.service';
import { ArchiveService } from '../../src/infra/archive/archive.service';
import { ContainerService } from '../../src/infra/container/container.service';
import { NcpsKeyService } from '../../src/infra/ncps/ncpsKey.service';
import { LLMProvisioner } from '../../src/llm/provisioners/llm.provisioner';
import { SlackAdapter } from '../../src/messaging/slack/slack.adapter';
import { ManageFunctionTool } from '../../src/nodes/tools/manage/manage.tool';
import { VaultService } from '../../src/vault/vault.service';

type InjectionToken = Type<unknown> | string | symbol;

const SKIP_TOKENS = new Set<InjectionToken>([ModuleRef]);

const USE_CLASS_TOKENS = new Set<InjectionToken>([LoggerService, ManageFunctionTool]);

const DEFAULT_TOKEN_FACTORIES = new Map<InjectionToken, () => unknown>([
  [
    EnvService,
    () =>
      createDefaultStub('EnvService', {
        mergeEnv: vi.fn((base: Record<string, string> = {}, overlay: Record<string, string> = {}) => ({
          ...base,
          ...overlay,
        })),
        resolveEnvItems: vi.fn(async (items: Array<{ key: string; value: string }>) => {
          const out: Record<string, string> = {};
          for (const item of items ?? []) {
            if (!item || typeof item.key !== 'string') continue;
            out[item.key] = item.value ?? '';
          }
          return out;
        }),
        resolveProviderEnv: vi.fn(async (_cfg: unknown, _refs: unknown, base?: Record<string, string>) =>
          base ? { ...base } : undefined,
        ),
      }),
  ],
  [VaultService, () => createDefaultStub('VaultService', { getSecret: vi.fn(async () => 'stub') })],
  [ArchiveService, () => createDefaultStub('ArchiveService')],
  [RunEventsService, () => createDefaultStub('RunEventsService')],
  [EventsBusService, () => createDefaultStub('EventsBusService')],
  [PrismaService, () => createDefaultStub('PrismaService', { getClient: vi.fn(() => ({})) })],
  [
    ContainerService,
    () =>
      createDefaultStub('ContainerService', {
        start: vi.fn(async () => createDefaultStub('ContainerHandle')),
        findContainerByLabels: vi.fn(async () => undefined),
        findContainersByLabels: vi.fn(async () => []),
        getContainerLabels: vi.fn(async () => ({})),
      }),
  ],
  [
    ConfigService,
    () =>
      createDefaultStub('ConfigService', {
        dockerMirrorUrl: 'http://registry-mirror:5000',
        ncpsEnabled: false,
        ncpsUrl: 'http://ncps:8501',
        vaultAddr: undefined,
        vaultToken: undefined,
      }),
  ],
  [NcpsKeyService, () => createDefaultStub('NcpsKeyService', { getKeysForInjection: vi.fn(() => []) })],
  [LLMProvisioner, () => createDefaultStub('LLMProvisioner')],
  [
    AgentsPersistenceService,
    () =>
      createDefaultStub('AgentsPersistenceService', {
        getOrCreateThreadByAlias: vi.fn(async () => 'thread-1'),
        updateThreadChannelDescriptor: vi.fn(async () => undefined),
        getOrCreateSubthreadByAlias: vi.fn(async () => 'child-thread'),
      }),
  ],
  [RunSignalsRegistry, () => createDefaultStub('RunSignalsRegistry')],
  [SlackAdapter, () => createDefaultStub('SlackAdapter')],
  [CallAgentLinkingService, () => createDefaultStub('CallAgentLinkingService')],
  [LiveGraphRuntime, () => createDefaultStub('LiveGraphRuntime')],
]);

function tokenName(token: InjectionToken): string {
  if (typeof token === 'string') return token;
  if (typeof token === 'symbol') return token.description ?? 'Symbol';
  return token?.name ?? 'AnonymousToken';
}

function createDefaultStub(name: string, base: Record<PropertyKey, unknown> = {}): unknown {
  const store: Record<PropertyKey, unknown> = { ...base };
  return new Proxy(store, {
    get(target, prop: PropertyKey, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (typeof prop === 'symbol') return undefined;
      const stubFn = vi.fn();
      Reflect.set(target, prop, stubFn, receiver);
      return stubFn;
    },
  });
}

function providerForToken(token: InjectionToken): Provider | undefined {
  if (SKIP_TOKENS.has(token)) return undefined;
  if (USE_CLASS_TOKENS.has(token)) {
    return { provide: token, useClass: token as Type<unknown> };
  }
  const factory = DEFAULT_TOKEN_FACTORIES.get(token) ?? (() => createDefaultStub(tokenName(token)));
  return {
    provide: token,
    useFactory: factory,
  };
}

export async function createNodeTestingModule<T>(
  nodeClass: Type<T>,
  extraProviders: Provider[] = [],
): Promise<TestingModule> {
  const deps = (Reflect.getMetadata('design:paramtypes', nodeClass) as InjectionToken[] | undefined) ?? [];
  const providers = new Map<InjectionToken, Provider>();

  for (const dep of deps) {
    if (!dep) continue;
    const provider = providerForToken(dep);
    if (provider) providers.set(provider.provide as InjectionToken, provider);
  }

  const moduleBuilder = Test.createTestingModule({
    providers: [nodeClass, ...providers.values(), ...extraProviders],
  });

  return moduleBuilder.compile();
}
