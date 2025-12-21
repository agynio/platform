import { describe, expect, it, vi } from 'vitest';
import { WorkspaceNode, type ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ConfigService } from '../src/core/services/config.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import type { EnvService } from '../src/env/env.service';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';

type WorkspaceNodeContext = {
  node: WorkspaceNode;
  provider: WorkspaceProviderStub;
  logger: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn> };
};

async function createWorkspaceNode(config: Partial<ContainerProviderStaticConfig>): Promise<WorkspaceNodeContext> {
  const provider = new WorkspaceProviderStub();
  const envService = {
    resolveProviderEnv: vi.fn().mockResolvedValue({}),
  } as unknown as EnvService;

  const configService = {
    dockerMirrorUrl: undefined,
    ncpsEnabled: false,
    ncpsUrl: undefined,
    workspaceNetworkName: 'agents_net',
  } as unknown as ConfigService;

  const ncpsKeyService = {
    getKeysForInjection: vi.fn().mockReturnValue([]),
  } as unknown as NcpsKeyService;

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  };

  const node = new WorkspaceNode(provider, configService, ncpsKeyService, envService);
  node.init({ nodeId: 'workspace-node' });
  (node as any).logger = logger;
  await node.setConfig(config as ContainerProviderStaticConfig);

  return { node, provider, logger };
}

describe('WorkspaceNode resource limits', () => {
  it('applies numeric cpu_limit and string memory_limit when starting a container', async () => {
    const { node, provider, logger } = await createWorkspaceNode({
      cpu_limit: 0.5,
      memory_limit: '512Mi',
    });

    await node.provide('thread-1');

    expect(provider.ensureCalls.length).toBeGreaterThan(0);
    const spec = provider.ensureCalls[0].spec;
    expect(spec.resources).toEqual({ cpuNano: 500_000_000, memoryBytes: 536_870_912 });
    expect(spec.network).toEqual({ name: 'agents_net', aliases: ['thread-1'] });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('supports millicore strings and numeric byte memory limits', async () => {
    const { node, provider } = await createWorkspaceNode({
      cpu_limit: '750m',
      memory_limit: 1_073_741_824,
    });

    await node.provide('thread-2');

    const spec = provider.ensureCalls[0].spec;
    expect(spec.resources).toEqual({ cpuNano: 750_000_000, memoryBytes: 1_073_741_824 });
    expect(spec.network).toEqual({ name: 'agents_net', aliases: ['thread-2'] });
  });

  it('logs and ignores invalid limits', async () => {
    const { node, provider, logger } = await createWorkspaceNode({
      cpu_limit: 'not-a-value',
      memory_limit: '42XB',
    });

    await node.provide('thread-3');

    const spec = provider.ensureCalls[0].spec;
    expect(spec.resources).toBeUndefined();
    expect(spec.network).toEqual({ name: 'agents_net', aliases: ['thread-3'] });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
