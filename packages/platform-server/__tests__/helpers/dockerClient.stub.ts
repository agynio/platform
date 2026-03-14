import { PassThrough } from 'node:stream';
import { vi } from 'vitest';

import { ContainerHandle } from '../../src/infra/container/container.handle';
import type { DockerClient, DockerClientPort } from '../../src/infra/container/dockerClient.token';

export const createDockerClientPortStub = (): DockerClientPort => {
  const stub: DockerClientPort = {
    touchLastUsed: vi.fn(async () => undefined),
    ensureImage: vi.fn(async () => undefined),
    start: vi.fn(async () => new ContainerHandle(stub, 'stub')),
    execContainer: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    openInteractiveExec: vi.fn(async () => ({
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      close: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      execId: 'exec-1',
      terminateProcessGroup: vi.fn(async (_reason: 'timeout' | 'idle_timeout') => undefined),
    })),
    streamContainerLogs: vi.fn(async () => ({ stream: new PassThrough(), close: vi.fn(async () => undefined) })),
    resizeExec: vi.fn(async () => undefined),
    stopContainer: vi.fn(async () => undefined),
    removeContainer: vi.fn(async () => undefined),
    getContainerLabels: vi.fn(async () => undefined),
    getContainerNetworks: vi.fn(async () => []),
    findContainersByLabels: vi.fn(async () => []),
    listContainersByVolume: vi.fn(async () => []),
    removeVolume: vi.fn(async () => undefined),
    findContainerByLabels: vi.fn(async () => undefined),
    putArchive: vi.fn(async () => undefined),
    inspectContainer: vi.fn(async () => ({ Id: 'stub' })),
    getEventsStream: vi.fn(async () => new PassThrough()),
  };

  return stub;
};

export const createDockerClientStub = (): DockerClient => {
  const stub = createDockerClientPortStub();
  return Object.assign(stub, {
    checkConnectivity: vi.fn(async () => ({ status: 'ok' })),
  });
};
