import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ContainerProviderStaticConfigSchema,
  WorkspaceNode,
  type ContainerProviderStaticConfig,
} from '../src/nodes/workspace/workspace.node';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';
import {
  createConfigServiceStub,
  createEnvServiceStub,
  createNcpsKeyServiceStub,
} from './helpers/services.stub';

type WorkspaceNodeContext = {
  node: WorkspaceNode;
  provider: WorkspaceProviderStub;
};

describe('WorkspaceNode platform selection', () => {
  let configService: ReturnType<typeof createConfigServiceStub>;

  beforeEach(() => {
    configService = createConfigServiceStub();
  });

  const createWorkspaceNode = async (
    config: Partial<ContainerProviderStaticConfig> = {},
  ): Promise<WorkspaceNodeContext> => {
    const provider = new WorkspaceProviderStub();
    const envService = createEnvServiceStub();
    const ncpsKeyService = createNcpsKeyServiceStub(configService);
    const node = new WorkspaceNode(provider, configService, ncpsKeyService, envService);
    node.init({ nodeId: 'workspace-node' });
    const parsedConfig = ContainerProviderStaticConfigSchema.parse(config);
    await node.setConfig(parsedConfig);

    return { node, provider };
  };

  it('defaults to linux/arm64 when unset', async () => {
    const { node, provider } = await createWorkspaceNode();

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

  it('rejects invalid platform selections during configuration', () => {
    expect(() => ContainerProviderStaticConfigSchema.parse({ platform: 'windows/amd64' })).toThrowError(
      /Invalid option/,
    );
  });
});
