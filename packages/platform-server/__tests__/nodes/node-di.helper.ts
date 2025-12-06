import 'reflect-metadata';

import type { Provider, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import { CallAgentLinkingService } from '../../src/agents/call-agent-linking.service';
import { RunSignalsRegistry } from '../../src/agents/run-signals.service';
import { ConfigService } from '../../src/core/services/config.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { RunEventsService } from '../../src/events/run-events.service';
import { LiveGraphRuntime } from '../../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../../src/graph-core/templateRegistry';
import { EnvService } from '../../src/env/env.service';
import { ArchiveService } from '../../src/infra/archive/archive.service';
import { ContainerService } from '../../src/infra/container/container.service';
import { NcpsKeyService } from '../../src/infra/ncps/ncpsKey.service';
import { LLMProvisioner } from '../../src/llm/provisioners/llm.provisioner';
import { SlackAdapter } from '../../src/messaging/slack/slack.adapter';
import { ThreadTransportService } from '../../src/messaging/threadTransport.service';
import { VaultService } from '../../src/vault/vault.service';
import { ReferenceResolverService } from '../../src/utils/reference-resolver.service';
import { createReferenceResolverStub } from '../helpers/reference-resolver.stub';

type InjectionToken = Type<unknown> | string | symbol;

const SKIP_TOKENS = new Set<InjectionToken>([ModuleRef]);

const DEFAULT_TOKEN_FACTORIES = new Map<InjectionToken, () => unknown>([
  [
    EnvService,
    () =>
      createDefaultStub('EnvService', {
        mergeEnv: vi.fn((base: Record<string, string> = {}, overlay: Record<string, string> = {}) => ({
          ...base,
          ...overlay,
        })),
        resolveEnvItems: vi.fn(async (items: Array<{ name: string; value: string }>) => {
          const out: Record<string, string> = {};
          for (const item of items ?? []) {
            if (!item || typeof item.name !== 'string') continue;
            out[item.name] = item.value ?? '';
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
        setThreadChannelNode: vi.fn(async () => undefined),
      }),
  ],
  [RunSignalsRegistry, () => createDefaultStub('RunSignalsRegistry')],
  [SlackAdapter, () => createDefaultStub('SlackAdapter')],
  [CallAgentLinkingService, () => createDefaultStub('CallAgentLinkingService')],
  [LiveGraphRuntime, () => createDefaultStub('LiveGraphRuntime')],
  [TemplateRegistry, () => createDefaultStub('TemplateRegistry', { getMeta: vi.fn(() => undefined) })],
  [
    ThreadTransportService,
    () =>
      createDefaultStub('ThreadTransportService', {
        sendTextToThread: vi.fn(async () => ({ ok: true, threadId: 'thread-1' })),
      }),
  ],
  [
    ReferenceResolverService,
    () => {
      const { stub } = createReferenceResolverStub();
      return stub;
    },
  ],
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

export async function createNodeTestingModule<T>(
  nodeClass: Type<T>,
  extraProviders: Provider[] = [],
): Promise<TestingModule> {
  const moduleBuilder = Test.createTestingModule({
    providers: [nodeClass, ...extraProviders],
  });

  moduleBuilder.useMocker((token) => {
    if (SKIP_TOKENS.has(token as InjectionToken)) return undefined;
    if (process.env.VITEST_NODE_DI_DEBUG === 'true') {
      console.debug(`useMocker -> ${tokenName(token as InjectionToken)}`);
    }
    const factory = DEFAULT_TOKEN_FACTORIES.get(token as InjectionToken);
    if (factory) return factory();
    throw new Error(`No mock available for token ${tokenName(token as InjectionToken)}`);
  });

  const module = await moduleBuilder.compile();
  if (process.env.VITEST_NODE_DI_DEBUG === 'true') {
    console.debug(`createNodeTestingModule: compiled ${tokenName(nodeClass)}`);
  }
  return module;
}
