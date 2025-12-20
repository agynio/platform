import { http, asData } from '@/api/http';

export type ContainerItem = {
  containerId: string;
  threadId: string | null;
  image: string;
  name: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
  // Derived from metadata.labels['hautech.ai/role']
  role: 'workspace' | 'dind' | string;
  // Optional sidecars attached to this container (e.g., DinD)
  sidecars?: Array<{ containerId: string; role: 'dind'; image: string; status: 'running'|'stopped'|'terminating'|'failed'; name: string }>;
  mounts?: Array<{ source: string; destination: string }>;
};

export type ContainerEventItem = {
  id: string;
  containerId: string;
  eventType: string;
  exitCode: number | null;
  signal: string | null;
  health: string | null;
  reason: string | null;
  message: string | null;
  createdAt: string;
};

export type ContainerEventsResponse = {
  items: ContainerEventItem[];
  page: {
    limit: number;
    order: 'asc' | 'desc';
    nextBefore: string | null;
    nextAfter: string | null;
  };
};

export function listContainers(params: { status?: string; sortBy?: string; sortDir?: string; threadId?: string }) {
  return asData<{ items: ContainerItem[] }>(http.get<{ items: ContainerItem[] }>(`/api/containers`, { params }));
}

export function listContainerEvents(
  containerId: string,
  params: { limit?: number; order?: 'asc' | 'desc'; since?: string; cursor?: string } = {},
) {
  return asData<ContainerEventsResponse>(
    http.get<ContainerEventsResponse>(`/api/containers/${containerId}/events`, { params }),
  );
}

export type ContainerTerminalSessionResponse = {
  sessionId: string;
  token: string;
  wsUrl: string;
  expiresAt: string;
  negotiated: { shell: string; cols: number; rows: number };
};

export type CreateTerminalSessionInput = {
  cols?: number;
  rows?: number;
  shell?: string;
};

export function createContainerTerminalSession(containerId: string, body: CreateTerminalSessionInput = {}) {
  return asData<ContainerTerminalSessionResponse>(
    http.post<ContainerTerminalSessionResponse>(`/api/containers/${containerId}/terminal/sessions`, body),
  );
}
