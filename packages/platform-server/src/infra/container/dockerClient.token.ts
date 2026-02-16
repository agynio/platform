import type { DockerClientPort } from '@agyn/docker-runner';

export const DOCKER_CLIENT = Symbol('DOCKER_CLIENT');

export type DockerClient = DockerClientPort;
