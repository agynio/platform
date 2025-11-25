import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { ContainerService } from '../src/infra/container/container.service';
import { LoggerService } from '../src/core/services/logger.service.js';
import { PLATFORM_LABEL } from '../src/core/constants.js';

vi.mock('dockerode', () => {
  class MockContainer {
    start = vi.fn(async () => {});
    inspect = vi.fn(async () => ({ Id: 'deadbeefcafebabe', State: { Status: 'running' } }));
  }
  class MockDocker {
    modem: { followProgress: (stream: NodeJS.ReadableStream, onFinished: (err?: Error) => void) => void; demuxStream: (...args: unknown[]) => void };
    constructor() {
      this.modem = {
        followProgress: vi.fn((stream: NodeJS.ReadableStream, cb: (err?: Error) => void) => {
          setTimeout(() => cb(undefined), 0);
        }),
        demuxStream: vi.fn(),
      };
    }
    getImage = vi.fn(() => ({ inspect: vi.fn(async () => { throw new Error('not found'); }) }))
    pull = vi.fn((image: string, optsOrCb?: object | ((err?: Error, stream?: NodeJS.ReadableStream) => void), maybeCb?: (err?: Error, stream?: NodeJS.ReadableStream) => void) => {
      const cb = (typeof optsOrCb === 'function' ? optsOrCb : maybeCb) as (err?: Error, stream?: NodeJS.ReadableStream) => void;
      // Return a dummy PassThrough stream
      const stream = new PassThrough();
      setTimeout(() => {
        stream.end();
        cb(undefined, stream);
      }, 0);
    });
    createContainer = vi.fn(async (_opts: unknown) => new MockContainer());
    listContainers = vi.fn(async () => []);
    getContainer = vi.fn((_id: string) => new MockContainer());
  }
  return { default: MockDocker };
});

const logger = new LoggerService();

describe('ContainerService platform support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('threads platform to pull and createContainer and labels when set', async () => {
    const svc = new ContainerService(logger);
    const docker = (svc as any).docker as Docker;

    const pullSpy = vi.spyOn(docker, 'pull');
    const createSpy = vi.spyOn(docker, 'createContainer');

    const container = await svc.start({ image: 'alpine:3', cmd: ['sleep', '1'], platform: 'linux/arm64', labels: { foo: 'bar' } });
    expect(container.id).toBeDefined();

    // pull should be called with platform option
    expect(pullSpy).toHaveBeenCalled();
    const pullArgs = pullSpy.mock.calls[0];
    // args: image, opts, cb
    expect(pullArgs[0]).toBe('alpine:3');
    expect(typeof pullArgs[1]).toBe('object');
    expect(pullArgs[1].platform).toBe('linux/arm64');

    // createContainer should include platform and labels with hautech.ai/platform and preserve existing
    expect(createSpy).toHaveBeenCalled();
    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.platform).toBe('linux/arm64');
    expect(createOpts.Labels[PLATFORM_LABEL]).toBe('linux/arm64');
    expect(createOpts.Labels.foo).toBe('bar');
  });

  it('omits platform from pull and createContainer when undefined', async () => {
    const svc = new ContainerService(logger);
    const docker = (svc as any).docker as Docker;

    const pullSpy = vi.spyOn(docker, 'pull');
    const createSpy = vi.spyOn(docker, 'createContainer');

    const container = await svc.start({ image: 'alpine:3', cmd: ['sleep', '1'] });
    expect(container.id).toBeDefined();

    // pull without platform
    const pullArgs = pullSpy.mock.calls[0];
    expect(pullArgs[0]).toBe('alpine:3');
    if (typeof pullArgs[1] === 'function') {
      // ok: (image, cb)
    } else if (typeof pullArgs[1] === 'object') {
      expect(pullArgs[1]?.platform).toBeUndefined();
    }

    // createContainer should not include platform and no platform label
    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.platform).toBeUndefined();
    expect(createOpts.Labels?.[PLATFORM_LABEL]).toBeUndefined();
  });

  it('pulls even if image exists when platform is specified', async () => {
    const svc = new ContainerService(logger);
    const docker = (svc as any).docker as Docker;
    // Simulate image already present
    (docker.getImage as any).mockReturnValue({ inspect: vi.fn(async () => ({ Id: 'img' })) });

    const pullSpy = vi.spyOn(docker, 'pull');
    await svc.start({ image: 'alpine:3', cmd: ['true'], platform: 'linux/amd64' });
    expect(pullSpy).toHaveBeenCalled();
    const pullArgs = pullSpy.mock.calls[0];
    expect(pullArgs[0]).toBe('alpine:3');
    expect(typeof pullArgs[1]).toBe('object');
    expect(pullArgs[1].platform).toBe('linux/amd64');
  });

  it('applies networkMode to HostConfig when provided', async () => {
    const svc = new ContainerService(logger);
    const docker = (svc as any).docker as Docker;
    const createSpy = vi.spyOn(docker, 'createContainer');

    const container = await svc.start({ image: 'alpine:3', cmd: ['sleep', '1'], networkMode: 'host' });
    expect(container.id).toBeDefined();

    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.HostConfig?.NetworkMode).toBe('host');
  });

  it('merges NetworkingConfig from createExtras', async () => {
    const svc = new ContainerService(logger);
    const docker = (svc as any).docker as Docker;
    const createSpy = vi.spyOn(docker, 'createContainer');

    const container = await svc.start({
      image: 'alpine:3',
      cmd: ['true'],
      createExtras: {
        HostConfig: { NanoCPUs: 500_000_000 },
        NetworkingConfig: {
          EndpointsConfig: {
            agents_net: {
              Aliases: ['thread-alias'],
            },
          },
        },
      },
    });
    expect(container.id).toBeDefined();

    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.HostConfig?.NanoCPUs).toBe(500_000_000);
    expect(createOpts.NetworkingConfig?.EndpointsConfig?.agents_net?.Aliases).toEqual(['thread-alias']);
  });
});
