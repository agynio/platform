import { http, asData } from '@/api/http';

export type ContainerItem = {
  containerId: string;
  threadId: string | null;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
  // Derived from metadata.labels['hautech.ai/role']
  role: 'workspace' | 'dind' | string;
  // Optional sidecars attached to this container (e.g., DinD)
  sidecars?: Array<{ containerId: string; role: 'dind'; image: string; status: 'running'|'stopped'|'terminating'|'failed' }>;
  mounts?: Array<{ source: string; destination: string }>;
};

export function listContainers(params: { status?: string; sortBy?: string; sortDir?: string; threadId?: string }) {
  return asData<{ items: ContainerItem[] }>(http.get<{ items: ContainerItem[] }>(`/api/containers`, { params }));
}
