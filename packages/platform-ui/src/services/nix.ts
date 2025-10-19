// Minimal Nix service for simplified endpoints
import { z } from 'zod';
import { buildUrl } from '../lib/apiClient';

export interface NixPackageDTO {
  name: string;
  description?: string | null;
}
export interface PackagesResponse { packages: NixPackageDTO[] }
export interface VersionsResponse { versions: string[] }
export interface ResolveResponse { name: string; version: string; commitHash: string; attributePath: string }

const PackagesResponseSchema = z.object({ packages: z.array(z.object({ name: z.string(), description: z.string().nullable().optional() })) });
const VersionsResponseSchema = z.object({ versions: z.array(z.string()) });
const ResolveResponseSchema = z.object({ name: z.string(), version: z.string(), commitHash: z.string(), attributePath: z.string() });

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

export async function resolvePackage(name: string, version: string, signal?: AbortSignal): Promise<ResolveResponse> {
  if (!name || !version) throw new Error('resolvePackage: name and version required');
  const url = buildUrl(`/api/nix/resolve?name=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}`);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error('Nix resolve: not found');
  if (!res.ok) throw new Error(`Nix resolve failed: ${res.status}`);
  const json = await res.json();
  const parsed = ResolveResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix resolve: invalid response');
  return parsed.data;
}
