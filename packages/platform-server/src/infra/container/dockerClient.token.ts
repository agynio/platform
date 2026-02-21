import type { DockerClientPort } from '@agyn/docker-runner';

export const DOCKER_CLIENT = Symbol('DOCKER_CLIENT');

export interface DockerClient extends DockerClientPort {
  checkConnectivity(): Promise<{ status: string }>;
}
