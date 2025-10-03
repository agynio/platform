import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerService } from '../src/services/container.service.js';
import { LoggerService } from '../src/services/logger.service.js';

function setupDockerStubs() {
  const logger = new LoggerService();
  const service = new ContainerService(logger);
  const docker: any = service.getDocker();
  // pull: accept image and optional opts
  docker.getImage = vi.fn().mockReturnValue({ inspect: vi.fn().mockRejectedValue(new Error('missing')) });
  docker.pull = vi.fn((_image: string, _opts: any, cb: any) => {
    if (typeof _opts === 'function') {
      cb = _opts;
    }
    // simulate stream
    const stream: any = {
      on: vi.fn(),
    };
    cb(undefined, stream);
  });
  docker.modem = docker.modem || {};
  docker.modem.followProgress = vi.fn((_stream: any, done: any) => done(undefined));
  docker.createContainer = vi.fn().mockResolvedValue({
    start: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ Id: 'abcdef1234567890', State: { Status: 'running' } }),
  });
  return { service, docker };
}

describe('ContainerService platform plumbing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes platform to pull and createContainer when set', async () => {
    const { service, docker } = setupDockerStubs();
    await service.start({ image: 'node:20-alpine', cmd: ['sleep', '1'], platform: 'linux/arm64' });
    // pull called with opts having platform
    const pullCall = docker.pull.mock.calls[0];
    expect(pullCall[0]).toBe('node:20-alpine');
    // args: image, opts, cb
    expect(typeof pullCall[1]).toBe('object');
    expect(pullCall[1].platform).toBe('linux/arm64');

    // createContainer received platform as query param passthrough
    const createCall = docker.createContainer.mock.calls[0][0];
    expect(createCall.platform).toBe('linux/arm64');
  });

  it('omits platform when not set', async () => {
    const { service, docker } = setupDockerStubs();
    await service.start({ image: 'node:20-alpine', cmd: ['sleep', '1'] });
    // pull called without platform opts
    const pullCall = docker.pull.mock.calls[0];
    // args: image, cb (no opts) or image, undefined, cb depending on our impl
    // Our impl passes undefined when platform not set, so second arg may be undefined
    expect(pullCall[1] === undefined || typeof pullCall[1] === 'function').toBeTruthy();

    const createCall = docker.createContainer.mock.calls[0][0];
    expect(createCall.platform).toBeUndefined();
  });
});
