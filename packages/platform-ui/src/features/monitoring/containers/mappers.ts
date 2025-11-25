import type { ContainerItem } from '@/api/modules/containers';
import type { ContainerRole, ContainerStatus, ContainerViewModel, ContainersQueryResult } from './types';

const STATUS_MAP: Record<ContainerItem['status'], ContainerStatus> = {
  running: 'running',
  stopped: 'stopped',
  terminating: 'stopping',
  failed: 'stopped',
};

function mapStatus(status: ContainerItem['status']): ContainerStatus {
  const mapped = STATUS_MAP[status];
  if (!mapped) {
    throw new Error(`Unsupported container status: ${status}`);
  }
  return mapped;
}

function assertRole(role: ContainerItem['role']): asserts role is ContainerRole {
  if (role === 'workspace' || role === 'dind') {
    return;
  }
  throw new Error(`Unsupported container role: ${role}`);
}

function toVolumes(mounts: ContainerItem['mounts']): string[] {
  if (!Array.isArray(mounts)) return [];
  return mounts
    .filter((mount) => Boolean(mount.source) && Boolean(mount.destination))
    .map((mount) => `${mount.source} → ${mount.destination}`);
}

function toName(container: ContainerItem): string {
  const image = container.image?.trim();
  if (image) return image;
  return container.containerId;
}

function createSidecarSource(parent: ContainerItem, sidecar: NonNullable<ContainerItem['sidecars']>[number]): ContainerItem {
  return {
    containerId: sidecar.containerId,
    threadId: parent.threadId,
    image: sidecar.image,
    status: sidecar.status,
    startedAt: parent.startedAt,
    lastUsedAt: parent.lastUsedAt,
    killAfterAt: parent.killAfterAt,
    role: sidecar.role,
    sidecars: undefined,
    mounts: [],
  } satisfies ContainerItem;
}

export function toContainersView(items: ContainerItem[]): ContainersQueryResult {
  const sorted = [...items].sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
  const result: ContainerViewModel[] = [];
  const itemById = new Map<string, ContainerItem>();

  for (const item of sorted) {
    assertRole(item.role);
    const volumes = toVolumes(item.mounts);
    const base: ContainerViewModel = {
      id: item.containerId,
      name: toName(item),
      containerId: item.containerId,
      image: item.image,
      role: item.role,
      status: mapStatus(item.status),
      startedAt: item.startedAt,
      lastUsedAt: item.lastUsedAt,
      ttl: item.killAfterAt ?? undefined,
      volumes,
      threadId: item.threadId ?? undefined,
    };
    result.push(base);
    itemById.set(item.containerId, item);

    if (Array.isArray(item.sidecars)) {
      for (const sidecar of item.sidecars) {
        assertRole(sidecar.role);
        const sidecarItem = createSidecarSource(item, sidecar);
        itemById.set(sidecarItem.containerId, sidecarItem);
        result.push({
          id: sidecarItem.containerId,
          name: toName(sidecarItem),
          containerId: sidecarItem.containerId,
          image: sidecarItem.image,
          role: sidecar.role,
          status: mapStatus(sidecarItem.status),
          startedAt: sidecarItem.startedAt,
          lastUsedAt: sidecarItem.lastUsedAt,
          ttl: sidecarItem.killAfterAt ?? undefined,
          volumes: [],
          parentId: base.id,
          threadId: sidecarItem.threadId ?? undefined,
        });
      }
    }
  }

  return { containers: result, itemById };
}
