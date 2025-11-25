import { describe, expect, it, vi } from 'vitest';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import type { ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ContainerService } from '../src/infra/container/container.service';
import type { ConfigService } from '../src/core/services/config.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { EnvService } from '../src/env/env.service';
import type { ContainerHandle } from '../src/infra/container/container.handle';

type WorkspaceNetworkContext = {
  node: WorkspaceNode;
  startMock: ReturnType<typeof vi.fn>;
  configService: ConfigService;
};

async function createWorkspaceNodeWithNetwork(
  config: Partial<ContainerProviderStaticConfig>,
): Promise<WorkspaceNetworkContext> {
  const fakeHandle = {
    id: 'cid123',
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  } as unknown as ContainerHandle;

  const startMock = vi.fn().mockResolvedValue(fakeHandle);

  const containerService = {
    findContainerByLabels: vi.fn().mockResolvedValue(undefined),
    findContainersByLabels: vi.fn().mockResolvedValue([]),
    getContainerLabels: vi.fn(),
    start: startMock,
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
  } as unknown as ContainerService;

  const envService = {
    resolveProviderEnv: vi.fn().mockResolvedValue({}),
  } as unknown as EnvService;

  const configService = {
    dockerMirrorUrl: undefined,
    ncpsEnabled: false,
    ncpsUrl: undefined,
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

  const node = new WorkspaceNode(containerService, configService, ncpsKeyService, logger, envService);
  node.init({ nodeId: 'workspace-node' });
  await node.setConfig(config as ContainerProviderStaticConfig);

  return { node, startMock, configService };
}

describe('WorkspaceNode network configuration', () => {
  it('attaches agents_net with sanitized alias', async () => {
    const { node, startMock } = await createWorkspaceNodeWithNetwork({});

    await node.provide('Thread ABC/123');

    expect(startMock).toHaveBeenCalledTimes(1);
    const startArgs = startMock.mock.calls[0][0];
    expect(startArgs.networkMode).toBeUndefined();
    expect(startArgs.createExtras?.NetworkingConfig?.EndpointsConfig?.agents_net?.Aliases).toEqual([
      'thread-abc-123',
    ]);
  });

  it('derives a stable alias when thread id is irregular', async () => {
    const { node, startMock } = await createWorkspaceNodeWithNetwork({});

    await node.provide('  **THREAD__!@# ');

    expect(startMock).toHaveBeenCalledTimes(1);
    const startArgs = startMock.mock.calls[0][0];
    const alias = startArgs.createExtras?.NetworkingConfig?.EndpointsConfig?.agents_net?.Aliases?.[0];
    expect(alias).toBeDefined();
    expect(alias).toMatch(/^[a-z0-9][a-z0-9_.-]*$/);
  });
});
