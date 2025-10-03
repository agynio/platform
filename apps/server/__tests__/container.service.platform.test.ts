import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerService } from '../src/services/container.service';
import { LoggerService } from '../src/services/logger.service';

function createMockDocker() {
  const modem = {
    followProgress: (_stream: unknown, onFinished: (e?: unknown) => void) => {
      setTimeout(() => onFinished(undefined), 0);
    },
    demuxStream: vi.fn(),
  } as { followProgress: any; demuxStream: any };

  const docker = {
    modem,
    pull: vi.fn((_image: string, _optsOrCb?: unknown, _cb?: unknown) => {}),
    getImage: vi.fn((_image: string) => ({
      inspect: vi.fn(async () => {
        throw new Error('not found');
      }),
    })),
    createContainer: vi.fn(async (_opts: unknown) => ({
      start: vi.fn(async () => {}),
      inspect: vi.fn(async () => ({ Id: '1234567890abcdef', State: { Status: 'running' } })),
    })),
  } as unknown as {
    modem: { followProgress: any; demuxStream: any };
    pull: any;
    getImage: any;
    createContainer: any;
  };
  return docker;
}

describe('ContainerService platform support', () => {
  let svc: ContainerService;
  let docker: any;

  beforeEach(() => {
    svc = new ContainerService(new LoggerService());
    docker = svc.getDocker();
    const mock = createMockDocker();
    // Patch methods on the real docker instance
    (docker as any).modem = mock.modem;
    (docker as any).pull = mock.pull;
    (docker as any).getImage = mock.getImage;
    (docker as any).createContainer = mock.createContainer;
  });

  it('passes platform to pull/create and labels the container when platform is provided', async () => {
    const image = 'node:20-alpine';
    // Arrange pull to call our cb
    (docker.pull as any).mockImplementation((img: string, optsOrCb?: unknown, cb?: unknown) => {
      const cbFn = typeof optsOrCb === 'function' ? (optsOrCb as Function) : (cb as Function);
      setTimeout(() => cbFn(undefined, {} as any), 0);
    });

    await svc.start({ image, cmd: ['sleep', '1'], platform: 'linux/arm64' });

    // docker.pull called with platform option
    expect(docker.pull).toHaveBeenCalled();
    const pullArgs = (docker.pull as any).mock.calls[0];
    expect(pullArgs[0]).toBe(image);
    const pullOpts = typeof pullArgs[1] === 'function' ? undefined : pullArgs[1];
    expect(pullOpts).toBeDefined();
    expect(pullOpts.platform).toBe('linux/arm64');

    // createContainer options include platform and label
    expect(docker.createContainer).toHaveBeenCalled();
    const createOpts = (docker.createContainer as any).mock.calls[0][0];
    expect(createOpts.platform).toBe('linux/arm64');
    expect(createOpts.Labels['hautech.ai/platform']).toBe('linux/arm64');
  });

  it('does not set platform when not provided', async () => {
    const image = 'node:20-alpine';
    (docker.pull as any).mockImplementation((img: string, optsOrCb?: unknown, cb?: unknown) => {
      const cbFn = typeof optsOrCb === 'function' ? (optsOrCb as Function) : (cb as Function);
      setTimeout(() => cbFn(undefined, {} as any), 0);
    });

    await svc.start({ image, cmd: ['sleep', '1'] });

    // docker.pull called without options.platform
    const pullArgs = (docker.pull as any).mock.calls[0];
    const pullOpts = typeof pullArgs[1] === 'function' ? undefined : pullArgs[1];
    if (pullOpts) {
      expect(pullOpts.platform).toBeUndefined();
    } else {
      // If no options were passed, this test is also satisfied
    }

    const createOpts = (docker.createContainer as any).mock.calls[0][0];
    expect(createOpts.platform).toBeUndefined();
    expect(createOpts.Labels?.['hautech.ai/platform']).toBeUndefined();
  });
});
