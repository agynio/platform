import type { SecretKey } from '@/api/modules/graph';
import * as api from '@/api/modules/graph';

async function listAllPathsForMount(mount: string, prefix = ''): Promise<string[]> {
  const response = await api.graph.listVaultPaths(mount, prefix);
  const items = Array.isArray(response.items) ? response.items : [];
  const folders = items.filter((item) => typeof item === 'string' && item.endsWith('/')) as string[];
  const leaves = items.filter((item) => typeof item === 'string' && !item.endsWith('/')) as string[];

  if (folders.length === 0) {
    return leaves;
  }

  const nestedLists = await Promise.all(
    folders.map((folder) => listAllPathsForMount(mount, `${folder}`)),
  );
  return [...leaves, ...nestedLists.flat()];
}

export async function discoverVaultKeys(mounts: string[]): Promise<SecretKey[]> {
  if (!Array.isArray(mounts) || mounts.length === 0) {
    return [];
  }

  const keyLists = await Promise.all(
    mounts.map(async (mount) => {
      if (typeof mount !== 'string' || mount.length === 0) {
        return [] as SecretKey[];
      }

      const paths = await listAllPathsForMount(mount, '');
      const perPath = await Promise.all(
        paths.map(async (path) => {
          const response = await api.graph.listVaultKeys(mount, path, { maskErrors: false });
          const keys = Array.isArray(response.items) ? response.items : [];
          return keys
            .filter((key): key is string => typeof key === 'string' && key.length > 0)
            .map((key) => ({ mount, path, key } satisfies SecretKey));
        }),
      );

      return perPath.flat();
    }),
  );

  return keyLists.flat();
}

export async function listAllSecretPaths(): Promise<string[]> {
  const mountsResponse = await api.graph.listVaultMounts();
  const mounts = Array.isArray(mountsResponse.items)
    ? mountsResponse.items.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

  if (mounts.length === 0) {
    return [];
  }

  const keys = await discoverVaultKeys(mounts);
  const normalized = keys.map(({ mount, path, key }) => {
    const trimmedMount = (mount ?? '').trim();
    const trimmedPath = (path ?? '').trim().replace(/^\/+|\/+$/g, '');
    const trimmedKey = (key ?? '').trim();
    const segments = [trimmedMount];
    if (trimmedPath.length > 0) {
      segments.push(trimmedPath);
    }
    if (trimmedKey.length > 0) {
      segments.push(trimmedKey);
    }
    return segments.filter((segment) => segment.length > 0).join('/');
  });

  return Array.from(new Set(normalized.filter((entry) => entry.length > 0))).sort((a, b) => a.localeCompare(b));
}
