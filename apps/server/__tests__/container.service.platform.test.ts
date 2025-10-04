import { describe, it, expect, vi, beforeEach } from 'vitest';
import Docker from 'dockerode';
import { ContainerService } from '../src/services/container.service';
import { LoggerService } from '../src/services/logger.service';

vi.mock('dockerode', () => {
  class MockContainer {
    start = vi.fn(async () => {});
    inspect = vi.fn(async () => ({ Id: 'deadbeefcafebabe', State: { Status: 'running' } }));
  }
  class MockDocker {
    modem: any;
    constructor() {
      this.modem = {
        followProgress: vi.fn((stream: any, cb: any) => {
          setTimeout(() => cb(undefined), 0);
        }),
        demuxStream: vi.fn(),
      };
    }
    getImage = vi.fn(() => ({ inspect: vi.fn(async () => { throw new Error('not found'); }) }))
    pull = vi.fn((image: string, optsOrCb: any, maybeCb?: any) => {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
      // Return a dummy stream object
      setTimeout(() => cb(undefined, {} as any), 0);
    });
    createContainer = vi.fn(async (_opts: any) => new MockContainer());
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

    const container = await svc.start({ image: 'alpine:3', cmd: ['sleep', '1'], platform: 'linux/arm64' });
    expect(container.id).toBeDefined();

    // pull should be called with platform option
    expect(pullSpy).toHaveBeenCalled();
    const pullArgs = pullSpy.mock.calls[0];
    // args: image, opts, cb
    expect(pullArgs[0]).toBe('alpine:3');
    expect(typeof pullArgs[1]).toBe('object');
    expect(pullArgs[1].platform).toBe('linux/arm64');

    // createContainer should include platform and labels with hautech.ai/platform
    expect(createSpy).toHaveBeenCalled();
    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.platform).toBe('linux/arm64');
    expect(createOpts.Labels['hautech.ai/platform']).toBe('linux/arm64');
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
    // args: image, cb
    expect(pullArgs[0]).toBe('alpine:3');
    if (typeof pullArgs[1] === 'object') {
      expect(pullArgs[1].platform).toBeUndefined();
    }

    // createContainer should not include platform and no platform label
    const createOpts = createSpy.mock.calls[0][0];
    expect(createOpts.platform).toBeUndefined();
    expect(createOpts.Labels?.['hautech.ai/platform']).toBeUndefined();
  });
});
