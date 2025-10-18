// Minimal Nix service for simplified endpoints
import { z } from 'zod';
import { buildUrl } from '../lib/apiClient';

export interface NixPackageDTO {
  name: string;
  description?: string | null;
}
export interface PackagesResponse { packages: NixPackageDTO[] }
export interface VersionsResponse { versions: string[] }
export interface PackageInfoResponse {
  name: string;
  releases: Array<{ version: string; attribute_path?: string; commit_hash?: string; platforms?: string[] }>;
}

const PackagesResponseSchema = z.object({ packages: z.array(z.object({ name: z.string(), description: z.string().nullable().optional() })) });
const VersionsResponseSchema = z.object({ versions: z.array(z.string()) });
export const PackageInfoSchema = z.object({
  name: z.string(),
  releases: z.array(z.object({ version: z.string(), attribute_path: z.string().optional(), commit_hash: z.string().optional(), platforms: z.array(z.string()).optional() })),
});

export async function fetchPackages(query: string, signal?: AbortSignal): Promise<NixPackageDTO[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const url = buildUrl(`/api/nix/packages?query=${encodeURIComponent(q)}`);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nix packages failed: ${res.status}`);
  const json = await res.json();
  const parsed = PackagesResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix packages: invalid response');
  return parsed.data.packages;
}

export async function fetchVersions(name: string, signal?: AbortSignal): Promise<string[]> {
  if (!name) return [];
  const url = buildUrl(`/api/nix/versions?name=${encodeURIComponent(name)}`);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return []; // treat not found as no versions for UI purposes
  if (!res.ok) throw new Error(`Nix versions failed: ${res.status}`);
  const json = await res.json();
  const parsed = VersionsResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix versions: invalid response');
  return parsed.data.versions;
}

export async function fetchPackageInfo(name: string, signal?: AbortSignal): Promise<PackageInfoResponse> {
  if (!name) throw new Error('name required');
  const url = buildUrl(`/api/nix/package-info?name=${encodeURIComponent(name)}`);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return { name, releases: [] };
  if (!res.ok) throw new Error(`Nix package-info failed: ${res.status}`);
  const json = await res.json();
  const parsed = PackageInfoSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix package-info: invalid response');
  return parsed.data;
}
