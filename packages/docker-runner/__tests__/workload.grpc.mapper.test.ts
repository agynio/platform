import { describe, expect, it } from 'vitest';
import {
  containerOptsToStartWorkloadRequest,
  startWorkloadRequestToContainerOpts,
} from '../src/contracts/workload.grpc';
import type { ContainerOpts } from '../src/lib/types';

describe('workload gRPC mapping', () => {
  it('round-trips container options with mounts and metadata', () => {
    const opts: ContainerOpts = {
      image: 'node:18',
      name: 'worker-main',
      cmd: ['npm', 'run', 'start'],
      entrypoint: '/bin/sh',
      env: {
        NODE_ENV: 'production',
        API_TOKEN: 'secret',
      },
      workingDir: '/workspace',
      autoRemove: true,
      binds: ['ha_ws_123:/workspace', '/var/run/docker.sock:/var/run/docker.sock:ro,z'],
      networkMode: 'container:abc123',
      tty: true,
      labels: {
        'hautech.ai/run-id': 'run-42',
      },
      platform: 'linux/amd64',
      privileged: true,
      anonymousVolumes: ['/var/lib/docker'],
      createExtras: {
        HostConfig: {
          NanoCPUs: 2_000_000_000,
          Memory: 512 * 1024 * 1024,
        },
      },
      ttlSeconds: 1800,
    };

    const request = containerOptsToStartWorkloadRequest(opts);
    expect(request.main?.image).toBe('node:18');
    expect(request.volumes).toHaveLength(3);

    const rebuilt = startWorkloadRequestToContainerOpts(request);
    expect(rebuilt).toEqual(opts);
  });

  it('retains bind option ordering and readonly flags', () => {
    const opts: ContainerOpts = {
      image: 'alpine:3',
      binds: ['data:/data:ro,z'],
    };

    const request = containerOptsToStartWorkloadRequest(opts);
    const rebuilt = startWorkloadRequestToContainerOpts(request);

    expect(rebuilt.binds).toEqual(['data:/data:ro,z']);
  });
});
