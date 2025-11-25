import { describe, expect, it, vi } from 'vitest';
import { WorkspaceNode, type ContainerProviderStaticConfig } from '../src/nodes/workspace/workspace.node';
import type { ContainerService } from '../src/infra/container/container.service';
import type { ConfigService } from '../src/core/services/config.service';
import type { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { EnvService } from '../src/env/env.service';
import type { ContainerHandle } from '../src/infra/container/container.handle';

type WorkspaceNodeContext = {
  node: WorkspaceNode;
  containerService: ContainerService;
  logger: LoggerService & { warn: ReturnType<typeof vi.fn> };
  startMock: ReturnType<typeof vi.fn>;
};

async function createWorkspaceNode(config: Partial<ContainerProviderStaticConfig>): Promise<WorkspaceNodeContext> {
  const fakeHandle = {
    id: 'cid123',
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  } as unknown as ContainerHandle;

  const startMock = vi.fn().mockResolvedValue(fakeHandle);
  const touchLastUsedMock = vi.fn().mockResolvedValue(undefined);

  const containerService = {
    findContainerByLabels: vi.fn().mockResolvedValue(undefined),
    findContainersByLabels: vi.fn().mockResolvedValue([]),
    getContainerLabels: vi.fn(),
    start: startMock,
    touchLastUsed: touchLastUsedMock,
  } as unknown as ContainerService;

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
  } as unknown as LoggerService & { warn: ReturnType<typeof vi.fn> };

  const node = new WorkspaceNode(containerService, configService, ncpsKeyService, logger, envService);
  node.init({ nodeId: 'workspace-node' });
  await node.setConfig(config as ContainerProviderStaticConfig);

  return { node, containerService, logger, startMock };
}

describe('WorkspaceNode resource limits', () => {
  it('applies numeric cpu_limit and string memory_limit when starting a container', async () => {
    const { node, startMock, logger } = await createWorkspaceNode({
      cpu_limit: 0.5,
      memory_limit: '512Mi',
    });

    await node.provide('thread-1');

    expect(startMock).toHaveBeenCalledTimes(1);
    const startArgs = startMock.mock.calls[0][0];
    expect(startArgs.createExtras).toMatchObject({
      HostConfig: {
        NanoCPUs: 500_000_000,
        Memory: 536_870_912,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          agents_net: {
            Aliases: ['thread-1'],
          },
        },
      },
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('supports millicore strings and numeric byte memory limits', async () => {
    const { node, startMock } = await createWorkspaceNode({
      cpu_limit: '750m',
      memory_limit: 1_073_741_824,
    });

    await node.provide('thread-2');

    const startArgs = startMock.mock.calls[0][0];
    expect(startArgs.createExtras).toMatchObject({
      HostConfig: {
        NanoCPUs: 750_000_000,
        Memory: 1_073_741_824,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          agents_net: {
            Aliases: ['thread-2'],
          },
        },
      },
    });
  });

  it('logs and ignores invalid limits', async () => {
    const { node, startMock, logger } = await createWorkspaceNode({
      cpu_limit: 'not-a-value',
      memory_limit: '42XB',
    });

    await node.provide('thread-3');

    const startArgs = startMock.mock.calls[0][0];
    expect(startArgs.createExtras?.HostConfig).toBeUndefined();
    expect(startArgs.createExtras).toMatchObject({
      NetworkingConfig: {
        EndpointsConfig: {
          agents_net: {
            Aliases: ['thread-3'],
          },
        },
      },
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
