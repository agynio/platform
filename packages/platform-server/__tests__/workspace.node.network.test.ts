import { describe, expect, it } from 'vitest';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import type { ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ConfigService } from '../src/core/services/config.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import type { EnvService } from '../src/env/env.service';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';

type WorkspaceNetworkContext = {
  node: WorkspaceNode;
  provider: WorkspaceProviderStub;
  configService: ConfigService;
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
};

async function createWorkspaceNodeWithNetwork(
  config: Partial<ContainerProviderStaticConfig>,
): Promise<WorkspaceNetworkContext> {
  const provider = new WorkspaceProviderStub();
  const envService = {
    resolveProviderEnv: vi.fn().mockResolvedValue({}),
  } as unknown as EnvService;

  const configService = {
    dockerMirrorUrl: undefined,
    ncpsEnabled: false,
    ncpsUrl: undefined,
    workspaceNetworkName: 'custom_net',
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

  return { node, provider, configService, logger };
}

describe('WorkspaceNode network configuration', () => {
  it('attaches configured network with sanitized alias', async () => {
    const { node, provider } = await createWorkspaceNodeWithNetwork({});

    await node.provide('Thread ABC/123');

    expect(provider.ensureCalls.length).toBeGreaterThan(0);
    const spec = provider.ensureCalls[0].spec;
    expect(spec.network).toEqual({ name: 'custom_net', aliases: ['thread-abc-123'] });
  });

  it('derives a stable alias when thread id is irregular', async () => {
    const { node, provider } = await createWorkspaceNodeWithNetwork({});

    await node.provide('  **THREAD__!@# ');

    const spec = provider.ensureCalls[0].spec;
    const alias = spec.network?.aliases?.[0];
    expect(alias).toBeDefined();
    expect(alias).toMatch(/^[a-z0-9][a-z0-9_.-]*$/);
  });

  it('falls back to generated alias when sanitized result is empty', async () => {
    const { node, provider } = await createWorkspaceNodeWithNetwork({});

    await node.provide('---');

    const spec = provider.ensureCalls[0].spec;
    const alias = spec.network?.aliases?.[0];
    expect(alias).toBeDefined();
    expect(alias?.startsWith('ws-')).toBe(true);
  });
});
