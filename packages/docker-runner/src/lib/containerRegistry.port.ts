import type { ContainerMount } from './container.mounts';

export type RegisterContainerStartInput = {
  containerId: string;
  nodeId: string;
  threadId: string;
  image: string;
  providerType?: 'docker';
  labels?: Record<string, string>;
  platform?: string;
  ttlSeconds?: number;
  mounts?: ContainerMount[];
  name: string;
};

export interface ContainerRegistryPort {
  updateLastUsed(containerId: string, now: Date, ttlOverrideSeconds?: number): Promise<void>;
  registerStart(input: RegisterContainerStartInput): Promise<void>;
}
