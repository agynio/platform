import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { collectVaultRefs } from './collect';
import { parseVaultRef, isValidVaultRef } from './parse';

export function useNodeVaultStatus(config?: Record<string, unknown>) {
  const refs = useMemo(() => collectVaultRefs(config || {}), [config]);
  // Unique resource tuples (mount,path) to fetch once
  const uniqueResources = useMemo(() => {
    const set = new Set<string>();
    const out: Array<{ mount: string; path: string }> = [];
    for (const r of refs) {
      if (!isValidVaultRef(r)) continue;
      const p = parseVaultRef(r);
      if (p.mount && p.path) {
        const k = `${p.mount}::${p.path}`;
        if (!set.has(k)) {
          set.add(k);
          out.push({ mount: p.mount, path: p.path });
        }
      }
    }
    return out;
  }, [refs]);

  const queries = useQueries({
    queries: uniqueResources.map(({ mount, path }) => ({
      queryKey: ['vault', 'keys', mount, path],
<<<<<<< HEAD
      queryFn: () => import('../graph/api').then((m) => m.api.listVaultKeys(mount, path, { maskErrors: false })),
=======
      queryFn: () => import('@/api/graph').then((m) => m.api.listVaultKeys(mount, path, { maskErrors: false })),
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
      staleTime: 1000 * 60 * 5,
      retry: 2,
      retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000),
    })),
  });

  const statusByResource = useMemo(() => {
    const map = new Map<string, { status: 'pending' | 'error' | 'success'; items?: string[] }>();
    uniqueResources.forEach(({ mount, path }, idx) => {
      const q = queries[idx];
      const k = `${mount}::${path}`;
      if (!q) return map.set(k, { status: 'pending' });
      if (q.status === 'pending') return map.set(k, { status: 'pending' });
      if (q.status === 'error') return map.set(k, { status: 'error' });
      map.set(k, { status: 'success', items: (q.data?.items || []) as string[] });
    });
    return map;
  }, [queries, uniqueResources]);

  const statuses = useMemo(() => {
    return refs.map((r) => {
      if (!isValidVaultRef(r)) return 'error' as const;
      const p = parseVaultRef(r);
      if (!(p.mount && p.path && p.key)) return 'error' as const;
      const k = `${p.mount}::${p.path}`;
      const entry = statusByResource.get(k);
      if (!entry || entry.status === 'pending') return 'loading' as const;
      if (entry.status === 'error') return 'error' as const;
      return (entry.items || []).includes(p.key) ? ('exists' as const) : ('missing' as const);
    });
  }, [refs, statusByResource]);

  const agg = useMemo(() => {
    const total = refs.length;
    let exists = 0;
    let missing = 0;
    let error = 0;
    let disabled = 0;
    for (const s of statuses) {
      if (s === 'exists') exists++;
      else if (s === 'missing') missing++;
      else if (s === 'error') error++;
      else if (s === 'loading') disabled++;
    }
    return { total, exists, missing, error, disabled };
  }, [statuses, refs.length]);

  return agg;
}
