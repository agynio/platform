import { describe, expect, it, vi } from 'vitest';
import type { ModuleRef } from '@nestjs/core';

import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LoggerService } from '../src/core/services/logger.service';
import { GraphRepository } from '../src/graph/graph.repository';
import type { GraphDefinition, PersistedGraph } from '../src/shared/types/graph.types';
import { GithubCloneRepoNode } from '../src/nodes/tools/github_clone_repo/github_clone_repo.node';
import { ResolveError } from '../src/utils/references';
import { Signal } from '../src/signal';
import type { WorkspaceNode } from '../src/nodes/workspace/workspace.node';

class TestLogger extends LoggerService {
  records: { level: string; message: string; params: unknown[] }[] = [];

  private capture(level: string, message: string, params: unknown[]): void {
    this.records.push({ level, message, params });
  }

  override info(message: string, ...optionalParams: unknown[]): void {
    this.capture('info', message, optionalParams);
  }

  override debug(message: string, ...optionalParams: unknown[]): void {
    this.capture('debug', message, optionalParams);
  }

  override warn(message: string, ...optionalParams: unknown[]): void {
    this.capture('warn', message, optionalParams);
  }

  override error(message: string, ...optionalParams: unknown[]): void {
    this.capture('error', message, optionalParams);
  }
}

class ModuleRefStub {
  constructor(private readonly logger: LoggerService) {}

  async create<T>(cls: new (...args: any[]) => T): Promise<T> {
    return new cls(this.logger) as T;
  }
}

class StubRepo extends GraphRepository {
  async initIfNeeded(): Promise<void> {}

  async get(_name: string): Promise<PersistedGraph | null> {
    return null;
  }

  async upsert(): Promise<never> {
    throw new Error('not-implemented');
  }

  async upsertNodeState(): Promise<void> {}
}

class ResolvingReferenceStub {
  lastInput?: unknown;

  constructor(private readonly resolvedToken: string) {}

  async resolve<T>(input: T): Promise<{ output: T; report: unknown }> {
    this.lastInput = input;
    const clone = this.replace(input) as T;
    return {
      output: clone,
      report: {
        events: [],
        counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 },
      },
    };
  }

  private replace(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.replace(v));
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.kind === 'vault') return this.resolvedToken;
      if (record.kind === 'var') return `var:${record.name as string}`;
      const next: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) next[key] = this.replace(val);
      return next;
    }
    return value;
  }
}

class RejectingResolver {
  constructor(private readonly error: ResolveError) {}

  async resolve(): Promise<never> {
    throw this.error;
  }
}

class PersistedRepoStub extends GraphRepository {
  constructor(private readonly persisted: PersistedGraph) {
    super();
  }

  async initIfNeeded(): Promise<void> {}

  async get(_name: string): Promise<PersistedGraph | null> {
    return this.persisted;
  }

  async upsert(): Promise<never> {
    throw new Error('not-implemented');
  }

  async upsertNodeState(): Promise<void> {}
}

const buildGraph = (config: Record<string, unknown>): GraphDefinition => ({
  nodes: [
    {
      id: 'clone',
      data: {
        template: 'githubCloneRepoTool',
        config,
      },
    },
  ],
  edges: [],
});

const containsSecret = (records: TestLogger['records'], secret: string): boolean =>
  records.some((entry) => JSON.stringify(entry).includes(secret));

const makeRuntime = (overrides?: {
  resolver?: object;
  repository?: GraphRepository;
  logger?: TestLogger;
}) => {
  const logger = overrides?.logger ?? new TestLogger();
  const moduleRef = new ModuleRefStub(logger) as unknown as ModuleRef;
  const registry = new TemplateRegistry(moduleRef);
  registry.register('githubCloneRepoTool', { title: 'GitHub Clone Repo', kind: 'tool' }, GithubCloneRepoNode);
  const repository = overrides?.repository ?? new StubRepo();
  const resolver = overrides?.resolver ?? new ResolvingReferenceStub('resolved-token');
  const runtime = new LiveGraphRuntime(logger, registry, repository, moduleRef, resolver as any);
  return { runtime, logger, resolver: resolver as ResolvingReferenceStub };
};

describe('LiveGraphRuntime legacy reference normalization', () => {
  it('normalizes legacy vault refs before resolution and applies resolved config to GithubCloneRepoNode', async () => {
    const resolver = new ResolvingReferenceStub('github-token');
    const { runtime } = makeRuntime({ resolver });

    const graph = buildGraph({ token: { source: 'vault', value: 'secret/github/GH_TOKEN' } });
    await runtime.apply(graph);

    expect(resolver.lastInput).toEqual({
      token: { kind: 'vault', mount: 'secret', path: 'secret/github', key: 'GH_TOKEN' },
    });

    const node = runtime.getNodeInstance('clone') as GithubCloneRepoNode;
    expect(node.config?.token).toBe('github-token');
  });

  it('surfaces provider missing errors with normalized path and without leaking secrets', async () => {
    const logger = new TestLogger();
    const error = new ResolveError('provider_missing', 'Vault provider unavailable', {
      path: '/nodes/clone/config/token',
      source: 'secret',
    });
    const { runtime } = makeRuntime({ resolver: new RejectingResolver(error), logger });

    const graph = buildGraph({ token: { source: 'vault', value: 'secret/github/GH_TOKEN' } });
    await expect(runtime.apply(graph)).rejects.toMatchObject({
      code: 'REFERENCE_RESOLUTION_ERROR',
      message: expect.stringContaining('/nodes/clone/config/token'),
    });

    expect(containsSecret(logger.records, 'GH_TOKEN')).toBe(false);
  });

  it('surfaces permission denied errors with normalized path and without leaking secrets', async () => {
    const logger = new TestLogger();
    const error = new ResolveError('permission_denied', 'Forbidden', {
      path: '/nodes/clone/config/token',
      source: 'secret',
    });
    const { runtime } = makeRuntime({ resolver: new RejectingResolver(error), logger });

    const graph = buildGraph({ token: { source: 'vault', value: 'secret/github/GH_TOKEN' } });
    await expect(runtime.apply(graph)).rejects.toMatchObject({
      code: 'REFERENCE_RESOLUTION_ERROR',
      message: expect.stringContaining('Forbidden'),
    });

    expect(containsSecret(logger.records, 'GH_TOKEN')).toBe(false);
  });

  it('loads persisted graphs with legacy refs and executes GithubCloneRepo tool successfully', async () => {
    const resolver = new ResolvingReferenceStub('resolved-token');
    const persisted: PersistedGraph = {
      version: 1,
      nodes: [
        {
          id: 'clone',
          template: 'githubCloneRepoTool',
          config: { token: { source: 'vault', value: 'secret/github/GH_TOKEN' } },
          state: {},
        },
      ],
      edges: [],
    };
    const repo = new PersistedRepoStub(persisted);
    const { runtime } = makeRuntime({ resolver, repository: repo });

    const loadResult = await runtime.load();
    expect(loadResult.applied).toBe(true);

    const node = runtime.getNodeInstance('clone') as GithubCloneRepoNode;
    expect(node.config?.token).toBe('resolved-token');

    const execMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
    const container = { exec: execMock };
    const provider = { provide: vi.fn().mockResolvedValue(container) };
    node.setContainerProvider(provider as unknown as WorkspaceNode);

    const tool = node.getTool();
    const ctx = {
      threadId: 'thread-1',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { invoke: vi.fn() },
    };

    const result = await tool.execute(
      { owner: 'hautech', repo: 'agents', path: '/tmp/repo', branch: null, depth: null },
      ctx,
    );

    expect(provider.provide).toHaveBeenCalledWith('thread-1');
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock.mock.calls[0][0]).toContain('resolved-token');
    expect(JSON.parse(result)).toMatchObject({ success: true });
  });
});
