import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Server, ServerCredentials, credentials, Metadata, type ServiceError } from '@grpc/grpc-js';
import { create } from '@bufbuild/protobuf';

import type { RunnerConfig } from '../src/service/config';
import { ContainerService, NonceCache } from '../src';
import { buildAuthHeaders } from '../src/contracts/auth';
import { createRunnerGrpcServer } from '../src/service/grpc/server';
import {
  RUNNER_SERVICE_INSPECT_WORKLOAD_PATH,
  RUNNER_SERVICE_READY_PATH,
  RUNNER_SERVICE_REMOVE_WORKLOAD_PATH,
  RUNNER_SERVICE_START_WORKLOAD_PATH,
  RUNNER_SERVICE_STOP_WORKLOAD_PATH,
  RunnerServiceGrpcClient,
} from '../src/proto/grpc.js';
import {
  InspectWorkloadRequestSchema,
  ReadyRequestSchema,
  RemoveWorkloadRequestSchema,
  StopWorkloadRequestSchema,
  type InspectWorkloadResponse,
  type StartWorkloadResponse,
} from '../src/proto/gen/agynio/api/runner/v1/runner_pb.js';
import { containerOptsToStartWorkloadRequest } from '../src/contracts/workload.grpc';

const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const hasSocket = fs.existsSync(DEFAULT_SOCKET);
const hasDockerHost = Boolean(process.env.DOCKER_HOST);
const shouldSkip = process.env.SKIP_DOCKER_RUNNER_E2E === '1' || (!hasSocket && !hasDockerHost);

const describeOrSkip = shouldSkip ? describe.skip : describe;

if (shouldSkip) {
  const reason = process.env.SKIP_DOCKER_RUNNER_E2E === '1'
    ? 'SKIP_DOCKER_RUNNER_E2E was explicitly set'
    : 'No Docker socket found and DOCKER_HOST is not defined';
  console.warn(`Skipping docker-runner docker-backed integration tests: ${reason}`);
}

const RUNNER_SECRET = 'docker-runner-integration-secret';

describeOrSkip('docker-runner docker-backed container lifecycle', () => {
  let grpcAddress: string;
  let client: InstanceType<typeof RunnerServiceGrpcClient>;
  let shutdown: (() => Promise<void>) | null = null;
  const startedContainers = new Set<string>();

  beforeAll(async () => {
    const config: RunnerConfig = {
      sharedSecret: RUNNER_SECRET,
      signatureTtlMs: 60_000,
      dockerSocket: hasSocket ? DEFAULT_SOCKET : '',
      logLevel: 'error',
      grpcHost: '127.0.0.1',
      grpcPort: 0,
    };
    const nonceCache = new NonceCache({ ttlMs: config.signatureTtlMs });
    const previousSocket = process.env.DOCKER_SOCKET;
    if (config.dockerSocket) {
      process.env.DOCKER_SOCKET = config.dockerSocket;
    }
    const containers = new ContainerService();
    const server = createRunnerGrpcServer({ config, containers, nonceCache });
    const address = await bindServer(server, config.grpcHost);
    grpcAddress = address;
    client = new RunnerServiceGrpcClient(address, credentials.createInsecure());
    await waitForReady();
    shutdown = async () => {
      await new Promise<void>((resolve) => {
        server.tryShutdown((err) => {
          if (err) {
            server.forceShutdown();
          }
          resolve();
        });
      });
      client.close();
      if (previousSocket !== undefined) {
        process.env.DOCKER_SOCKET = previousSocket;
      } else {
        delete process.env.DOCKER_SOCKET;
      }
    };
  }, 30_000);

  afterAll(async () => {
    if (shutdown) {
      await shutdown();
      shutdown = null;
    }
  });

  afterEach(async () => {
    for (const containerId of startedContainers) {
      try {
        await stopContainer(containerId);
      } catch (error) {
        console.warn(`cleanup stop failed for ${containerId}`, error);
      }
      try {
        await removeContainer(containerId, { force: true, removeVolumes: true });
      } catch (error) {
        console.warn(`cleanup remove failed for ${containerId}`, error);
      }
    }
    startedContainers.clear();
  });

  it('starts, inspects, stops, and removes a real container', async () => {
    const containerId = await startAlpineContainer('delete-once');

    const inspect = await inspectContainer(containerId);
    expect(inspect.id).toBe(containerId);
    expect(inspect.configImage).toContain('alpine');

    await deleteContainer(containerId);

    await expect(inspectContainer(containerId)).rejects.toMatchObject({ code: 5 });
  }, 120_000);

  it('allows delete operations to be invoked twice without failing', async () => {
    const containerId = await startAlpineContainer('delete-twice');

    await deleteContainer(containerId);
    await expect(stopContainer(containerId)).resolves.toBeUndefined();
    await expect(removeContainer(containerId, { force: true, removeVolumes: true })).resolves.toBeUndefined();
  }, 120_000);

  async function startAlpineContainer(prefix: string): Promise<string> {
    const name = `${prefix}-${randomUUID().slice(0, 8)}`;
    const response = await startWorkload({ image: 'alpine:3.19', cmd: ['sleep', '30'], name, autoRemove: false });
    if (!response?.containers?.main && !response?.id) {
      throw new Error('runner start did not return containerId');
    }
    const containerId = response.containers?.main ?? response.id;
    startedContainers.add(containerId);
    return containerId;
  }

  async function deleteContainer(containerId: string): Promise<void> {
    await stopContainer(containerId);
    await removeContainer(containerId, { force: true, removeVolumes: true });
    startedContainers.delete(containerId);
  }

  async function startWorkload(opts: { image: string; cmd: string[]; name: string; autoRemove: boolean }): Promise<StartWorkloadResponse> {
    const request = containerOptsToStartWorkloadRequest({
      image: opts.image,
      cmd: opts.cmd,
      name: opts.name,
      autoRemove: opts.autoRemove,
    });
    return unary(RUNNER_SERVICE_START_WORKLOAD_PATH, request, (req, metadata, callback) => {
      client.startWorkload(req, metadata, callback);
    });
  }

  async function stopContainer(containerId: string) {
    const request = create(StopWorkloadRequestSchema, { workloadId: containerId, timeoutSec: 1 });
    await unary(RUNNER_SERVICE_STOP_WORKLOAD_PATH, request, (req, metadata, callback) => {
      client.stopWorkload(req, metadata, callback);
    });
  }

  async function removeContainer(containerId: string, options: { force?: boolean; removeVolumes?: boolean }) {
    const request = create(RemoveWorkloadRequestSchema, {
      workloadId: containerId,
      force: options.force ?? false,
      removeVolumes: options.removeVolumes ?? false,
    });
    await unary(RUNNER_SERVICE_REMOVE_WORKLOAD_PATH, request, (req, metadata, callback) => {
      client.removeWorkload(req, metadata, callback);
    });
  }

  async function inspectContainer(containerId: string): Promise<InspectWorkloadResponse> {
    const request = create(InspectWorkloadRequestSchema, { workloadId: containerId });
    return unary(RUNNER_SERVICE_INSPECT_WORKLOAD_PATH, request, (req, metadata, callback) => {
      client.inspectWorkload(req, metadata, callback);
    });
  }

  function metadataFor(path: string): Metadata {
    const headers = buildAuthHeaders({ method: 'POST', path, body: '', secret: RUNNER_SECRET });
    const metadata = new Metadata();
    for (const [key, value] of Object.entries(headers)) {
      metadata.set(key, value);
    }
    return metadata;
  }

  async function unary<Request, Response>(
    path: string,
    request: Request,
    invoke: (req: Request, metadata: Metadata, callback: (err: ServiceError | null, response?: Response) => void) => void,
  ): Promise<Response> {
    const metadata = metadataFor(path);
    return new Promise<Response>((resolve, reject) => {
      invoke(request, metadata, (err, response) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response as Response);
      });
    });
  }

  async function waitForReady(): Promise<void> {
    const request = create(ReadyRequestSchema, {});
    await unary(RUNNER_SERVICE_READY_PATH, request, (req, metadata, callback) => {
      client.ready(req, metadata, callback);
    });
  }
});

async function bindServer(server: Server, host: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    server.bindAsync(`${host}:0`, ServerCredentials.createInsecure(), (err, port) => {
      if (err) return reject(err);
      resolve(`${host}:${port}`);
    });
  });
}
