import { describe, expect, it, vi } from 'vitest';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import type { ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ConfigService } from '../src/core/services/config.service';
import type { ContainerService } from '../src/infra/container/container.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { EnvService } from '../src/env/env.service';
import type { ContainerHandle } from '../src/infra/container/container.handle';

type MockedContainerService = {
  findContainerByLabels: ReturnType<typeof vi.fn>;
  findContainersByLabels: ReturnType<typeof vi.fn>;
  getContainerLabels: ReturnType<typeof vi.fn>;
  getContainerNetworks: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  touchLastUsed: ReturnType<typeof vi.fn>;
};

type WorkspaceNetworkContext = {
  node: WorkspaceNode;
  startMock: ReturnType<typeof vi.fn>;
  configService: ConfigService;
  containerService: MockedContainerService;
  logger: LoggerService & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
};

async function createWorkspaceNodeWithNetwork(
  config: Partial<ContainerProviderStaticConfig>,
): Promise<WorkspaceNetworkContext> {
  const fakeHandle = {
    id: 'cid123',
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  } as unknown as ContainerHandle;

  const startMock = vi.fn().mockResolvedValue(fakeHandle);

  const containerService: MockedContainerService = {
    findContainerByLabels: vi.fn().mockResolvedValue(undefined),
    findContainersByLabels: vi.fn().mockResolvedValue([]),
    getContainerLabels: vi.fn(),
    getContainerNetworks: vi.fn(),
    start: startMock,
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
  };

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
  } as unknown as LoggerService;

  const node = new WorkspaceNode(
    containerService as unknown as ContainerService,
    configService,
    ncpsKeyService,
    logger,
    envService,
  );
  node.init({ nodeId: 'workspace-node' });
  await node.setConfig(config as ContainerProviderStaticConfig);

  return { node, startMock, configService, containerService, logger };
}

describe('WorkspaceNode network configuration', () => {
  it('attaches configured network with sanitized alias', async () => {
    const { node, startMock } = await createWorkspaceNodeWithNetwork({});

    await node.provide('Thread ABC/123');

    expect(startMock).toHaveBeenCalledTimes(1);
    const startArgs = startMock.mock.calls[0][0];
    expect(startArgs.networkMode).toBeUndefined();
    expect(startArgs.createExtras?.NetworkingConfig?.EndpointsConfig?.custom_net?.Aliases).toEqual([
      'thread-abc-123',
    ]);
  });

  it('derives a stable alias when thread id is irregular', async () => {
    const { node, startMock } = await createWorkspaceNodeWithNetwork({});

    await node.provide('  **THREAD__!@# ');

    expect(startMock).toHaveBeenCalledTimes(1);
    const startArgs = startMock.mock.calls[0][0];
    const alias = startArgs.createExtras?.NetworkingConfig?.EndpointsConfig?.custom_net?.Aliases?.[0];
    expect(alias).toBeDefined();
    expect(alias).toMatch(/^[a-z0-9][a-z0-9_.-]*$/);
  });

  it('recreates existing workspace when agents_net is missing', async () => {
    const { node, startMock, containerService, logger } = await createWorkspaceNodeWithNetwork({});

    const stop = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const existingHandle = { id: 'reuse1234567890', stop, remove } as unknown as ContainerHandle;

    containerService.findContainerByLabels.mockResolvedValue(existingHandle);
    containerService.getContainerLabels.mockResolvedValue({
      'hautech.ai/platform': 'linux/arm64',
    });
    containerService.getContainerNetworks.mockResolvedValue(['bridge']);

    await node.provide('Thread-REUSE');

    expect(stop).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    const shortId = existingHandle.id.substring(0, 12);
    expect(logger.info).toHaveBeenCalledWith('Recreating workspace to enforce workspace network', {
      containerId: shortId,
      networks: ['bridge'],
      requiredNetwork: 'custom_net',
    });
  });
});
