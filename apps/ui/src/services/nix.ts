// Minimal Nix service for simplified endpoints
import { z } from 'zod';
import { buildUrl } from '../lib/apiClient';

export interface NixPackageDTO {
  name: string;
  description?: string | null;
}
export interface PackagesResponse { packages: NixPackageDTO[] }
export interface ReleaseDTO { version: string; attribute_path?: string; commit_hash?: string }
export interface ReleasesResponse { releases: ReleaseDTO[] }

const PackagesResponseSchema = z.object({ packages: z.array(z.object({ name: z.string(), description: z.string().nullable().optional() })) });
const ReleasesResponseSchema = z.object({
  releases: z.array(z.object({
    version: z.string(),
    attribute_path: z.string().optional(),
    commit_hash: z.string().optional(),
  })),
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

export async function fetchReleases(name: string, signal?: AbortSignal): Promise<ReleaseDTO[]> {
  if (!name) return [];
  const url = buildUrl(`/api/nix/versions?name=${encodeURIComponent(name)}`);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return []; // treat not found as no releases for UI purposes
  if (!res.ok) throw new Error(`Nix releases failed: ${res.status}`);
  const json = await res.json();
  const parsed = ReleasesResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix releases: invalid response');
  return parsed.data.releases;
}
