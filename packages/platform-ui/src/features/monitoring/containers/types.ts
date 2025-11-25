import type { ContainerItem } from '@/api/modules/containers';

export type ContainersQueryResult = {
  containers: ContainerViewModel[];
  itemById: Map<string, ContainerItem>;
};

export type ContainerViewModel = {
  id: string;
  name: string;
  containerId: string;
  image: string;
  role: ContainerRole;
  status: ContainerStatus;
  startedAt: string;
  lastUsedAt: string;
  ttl?: string;
  volumes: string[];
  parentId?: string;
  threadId?: string;
};

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping';
export type ContainerRole = 'workspace' | 'dind';
