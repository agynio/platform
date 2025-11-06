import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graph as api } from '@/api/modules/graph';

type Status = 'idle' | 'loading' | 'exists' | 'missing' | 'error' | 'disabled';

export function useVaultKeyExistence(mount?: string, path?: string, key?: string) {
  const enabled = !!(mount && path && key);
  const [debounced, setDebounced] = useState<{ mount?: string; path?: string; key?: string }>({ mount, path, key });

  // Debounce inputs by 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ mount, path, key }), 300);
    return () => clearTimeout(t);
  }, [mount, path, key]);

  const q = useQuery({
    queryKey: ['vault', 'keys', debounced.mount, debounced.path],
    queryFn: () => api.listVaultKeys(debounced.mount!, debounced.path!, { maskErrors: false }),
    enabled: enabled && !!debounced.mount && !!debounced.path,
    staleTime: 1000 * 60 * 5,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000),
  });

  const status: Status = useMemo(() => {
    if (!enabled) return 'disabled';
    if (q.status === 'pending') return 'loading';
    if (q.status === 'error') return 'error';
    if (!q.data) return 'idle';
    const items = q.data.items || [];
    return items.includes(key!) ? 'exists' : 'missing';
  }, [enabled, q.status, q.data, key]);

  return { status, query: q };
}
