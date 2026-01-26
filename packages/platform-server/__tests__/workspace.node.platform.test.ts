import { describe, expect, it, vi } from 'vitest';

import { WorkspaceNode, type ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ConfigService } from '../src/core/services/config.service';
import type { EnvService } from '../src/env/env.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';

type WorkspaceNodeContext = {
  node: WorkspaceNode;
  provider: WorkspaceProviderStub;
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

  const node = new WorkspaceNode(provider, configService, ncpsKeyService, envService);
  node.init({ nodeId: 'workspace-node' });
  await node.setConfig(config as ContainerProviderStaticConfig);

  return { node, provider };
}

describe('WorkspaceNode platform selection', () => {
  it('defaults to linux/arm64 when unset', async () => {
    const { node, provider } = await createWorkspaceNode({});

    await node.provide('thread-default');

    expect(provider.ensureCalls).toHaveLength(1);
    expect(provider.ensureCalls[0]?.key.platform).toBe('linux/arm64');
  });

  it('propagates explicit platform overrides', async () => {
    const { node, provider } = await createWorkspaceNode({ platform: 'linux/amd64' });

    await node.provide('thread-override');

    expect(provider.ensureCalls).toHaveLength(1);
    expect(provider.ensureCalls[0]?.key.platform).toBe('linux/amd64');
  });

  it('omits platform override when auto is selected', async () => {
    const { node, provider } = await createWorkspaceNode({
      platform: 'auto' as unknown as ContainerProviderStaticConfig['platform'],
    });

    await node.provide('thread-auto');

    expect(provider.ensureCalls).toHaveLength(1);
    expect(provider.ensureCalls[0]?.key.platform).toBeUndefined();
  });
});
