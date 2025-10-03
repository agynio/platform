import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerService } from '../src/services/container.service';
import { LoggerService } from '../src/services/logger.service';

function createMockDocker() {
  const modem = {
    followProgress: (_stream: any, onFinished: any, _onProgress: any) => {
      setTimeout(() => onFinished(undefined), 0);
    },
    demuxStream: vi.fn(),
  } as any;

  const docker: any = {
    modem,
    pull: vi.fn((_image: string, _optsOrCb: any, _cb?: any) => {}),
    getImage: vi.fn((image: string) => ({
      inspect: vi.fn(async () => {
        throw new Error('not found');
      }),
    })),
    createContainer: vi.fn(async (opts: any) => ({
      start: vi.fn(async () => {}),
      inspect: vi.fn(async () => ({ Id: '1234567890abcdef', State: { Status: 'running' } })),
    })),
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
    (docker.pull as any).mockImplementation((img: string, optsOrCb: any, cb?: any) => {
      const cbFn = typeof optsOrCb === 'function' ? optsOrCb : cb;
      setTimeout(() => cbFn(undefined, {} as any), 0);
    });

    await svc.start({ image, cmd: ['sleep', '1'], platform: 'linux/arm64' });

    // docker.pull called with platform option
    expect(docker.pull).toHaveBeenCalled();
    const pullArgs = (docker.pull as any).mock.calls[0];
    expect(pullArgs[0]).toBe(image);
    const pullOpts = typeof pullArgs[1] === 'function' ? undefined : pullArgs[1];
    expect(pullOpts).toMatchObject({ platform: 'linux/arm64' });

    // createContainer options include platform and label
    expect(docker.createContainer).toHaveBeenCalled();
    const createOpts = (docker.createContainer as any).mock.calls[0][0];
    expect(createOpts.platform).toBe('linux/arm64');
    expect(createOpts.Labels['hautech.ai/platform']).toBe('linux/arm64');
  });

  it('does not set platform when not provided', async () => {
    const image = 'node:20-alpine';
    (docker.pull as any).mockImplementation((img: string, optsOrCb: any, cb?: any) => {
      const cbFn = typeof optsOrCb === 'function' ? optsOrCb : cb;
      setTimeout(() => cbFn(undefined, {} as any), 0);
    });

    await svc.start({ image, cmd: ['sleep', '1'] });

    // docker.pull called without options.platform
    const pullArgs = (docker.pull as any).mock.calls[0];
    const pullOpts = typeof pullArgs[1] === 'function' ? undefined : pullArgs[1];
    if (pullOpts) {
      expect(pullOpts.platform).toBeUndefined();
    }

    const createOpts = (docker.createContainer as any).mock.calls[0][0];
    expect(createOpts.platform).toBeUndefined();
    expect(createOpts.Labels?.['hautech.ai/platform']).toBeUndefined();
  });
});
