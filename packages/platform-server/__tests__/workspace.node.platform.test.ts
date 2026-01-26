import { describe, expect, it, vi } from 'vitest';

import { WorkspaceNode, type ContainerProviderStaticConfig, isSupportedPlatform } from '../src/nodes/workspace/workspace.node';
import type { ConfigService } from '../src/core/services/config.service';
import type { EnvService } from '../src/env/env.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';

type WorkspaceTestConfig = Omit<ContainerProviderStaticConfig, 'platform'> & {
  platform?: string;
};

type WorkspaceNodeContext = {
  node: WorkspaceNode;
  provider: WorkspaceProviderStub;
};

const normalizePlatformForConfig = (selection?: string): ContainerProviderStaticConfig['platform'] | undefined => {
  if (!selection || selection === 'auto') {
    return undefined;
  }
  return isSupportedPlatform(selection) ? selection : undefined;
};

async function createWorkspaceNode(config: WorkspaceTestConfig = {}): Promise<WorkspaceNodeContext> {
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
  const { platform: rawPlatform, ...rest } = config;
  const normalizedPlatform = normalizePlatformForConfig(rawPlatform);

  const canonicalConfig: ContainerProviderStaticConfig = {
    ...rest,
    ...(normalizedPlatform ? { platform: normalizedPlatform } : {}),
  };

  await node.setConfig(canonicalConfig);

  if (rawPlatform !== undefined) {
    const rawConfig: Record<string, unknown> = { ...canonicalConfig };
    rawConfig.platform = rawPlatform;
    Reflect.set(node as Record<string, unknown>, '_config', rawConfig);
  }

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
    const { node, provider } = await createWorkspaceNode({ platform: 'auto' });

    await node.provide('thread-auto');

    expect(provider.ensureCalls).toHaveLength(1);
    expect(provider.ensureCalls[0]?.key.platform).toBeUndefined();
  });

  it('omits platform override when selection is invalid', async () => {
    const { node, provider } = await createWorkspaceNode({ platform: 'windows/amd64' });

    await node.provide('thread-invalid');

    expect(provider.ensureCalls).toHaveLength(1);
    expect(provider.ensureCalls[0]?.key.platform).toBeUndefined();
  });
});
