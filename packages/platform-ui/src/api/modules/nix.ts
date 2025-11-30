import { http, asData } from '@/api/http';
import type { NixPackageDTO, ResolvePackageResponse, ResolveRepoResponse } from '@/api/types/nix';

export async function fetchPackages(query: string, signal?: AbortSignal): Promise<NixPackageDTO[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const res = await asData<{ packages: NixPackageDTO[] }>(http.get<{ packages: NixPackageDTO[] }>(`/api/nix/packages`, { signal, params: { query: q } }));
  return res.packages || [];
}

export async function fetchVersions(name: string, signal?: AbortSignal): Promise<string[]> {
  if (!name) return [];
  const res = await asData<{ versions: string[] }>(http.get<{ versions: string[] }>(`/api/nix/versions`, { signal, params: { name } }));
  return res.versions || [];
}

export async function resolvePackage(name: string, version: string, signal?: AbortSignal): Promise<ResolvePackageResponse> {
  if (!name || !version) throw new Error('resolvePackage: name and version required');
  const res = await asData<ResolvePackageResponse>(
    http.get<ResolvePackageResponse>(`/api/nix/resolve`, { signal, params: { name, version } }),
  );
  return res;
}

export async function resolveRepo(
  repository: string,
  attr: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<ResolveRepoResponse> {
  const repo = repository.trim();
  const attributePath = attr.trim();
  if (!repo || !attributePath) throw new Error('resolveRepo: repository and attr required');
  const params: Record<string, string> = { repository: repo, attr: attributePath };
  const trimmedRef = typeof ref === 'string' ? ref.trim() : '';
  if (trimmedRef) params.ref = trimmedRef;
  const res = await asData<ResolveRepoResponse>(
    http.get<ResolveRepoResponse>(`/api/nix/resolve-repo`, { signal, params }),
  );
  return res;
}
