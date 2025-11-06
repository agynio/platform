import { useQuery } from '@tanstack/react-query';
import * as nix from '@/api/modules/nix';

export function useNixPackages(query: string) {
  return useQuery({
    queryKey: ['nix', 'packages', query],
    enabled: (query || '').trim().length >= 2,
    queryFn: ({ signal }) => nix.fetchPackages(query, signal),
  });
}

export function useNixVersions(name: string) {
  return useQuery({
    queryKey: ['nix', 'versions', name],
    enabled: !!name,
    queryFn: ({ signal }) => nix.fetchVersions(name, signal),
  });
}

