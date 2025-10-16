// Simple client for NixOS Search API (UI-only; no persistence)
// Note: Public search API may have CORS restrictions in browsers.
// Phase 1 intentionally avoids adding a proxy. Tests mock network via MSW.
import { z } from 'zod';

export const CHANNELS = ['nixpkgs-unstable', 'nixos-24.11'] as const;
export type NixChannel = typeof CHANNELS[number];

export interface NixSearchItem {
  // Nix attribute/path, typically unique across channels
  attr: string;
  pname?: string;
  version?: string;
  description?: string;
}

export interface NixSearchResponse { items: NixSearchItem[] }

// zod schemas for strict parsing
const NixItemSchema = z.object({
  attr: z.string(),
  pname: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});
const NixSearchResponseSchema = z.object({ items: z.array(NixItemSchema) });

const BASE_URL = 'https://search.nixos.org/packages';

// Constructs a URL for the public search endpoint.
function buildSearchUrl(query: string, channel: NixChannel): string {
  const u = new URL(BASE_URL);
  // Required params per review: format=json, size=20, sort=relevance, order=desc
  u.searchParams.set('type', 'packages');
  u.searchParams.set('channel', channel);
  u.searchParams.set('query', query);
  u.searchParams.set('format', 'json');
  u.searchParams.set('size', '20');
  u.searchParams.set('sort', 'relevance');
  u.searchParams.set('order', 'desc');
  return u.toString();
}

export async function searchPackages(query: string, channel: NixChannel, signal?: AbortSignal): Promise<NixSearchItem[]> {
  if (!query || query.trim().length < 2) return [];
  const url = buildSearchUrl(query.trim(), channel);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nix search failed: ${res.status}`);
  const json = await res.json();
  const parsed = NixSearchResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix search: invalid response shape');
  return parsed.data.items.map((it) => ({
    attr: it.attr,
    pname: it.pname ?? undefined,
    version: it.version ?? undefined,
    description: it.description ?? undefined,
  }));
}

// Fetches a specific package by attribute (preferred) or pname from a given channel to read its version.
export async function fetchPackageVersion(
  ident: { attr?: string; pname?: string },
  channel: NixChannel,
  signal?: AbortSignal,
): Promise<string | null> {
  const q = ident.attr ? `attr:${ident.attr}` : ident.pname ? ident.pname : '';
  if (!q) return null;
  const url = buildSearchUrl(q, channel);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nix package lookup failed: ${res.status}`);
  const json = await res.json();
  const parsed = NixSearchResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Nix details: invalid response shape');
  if (!parsed.data.items.length) return null;
  const hit = parsed.data.items[0];
  return hit.version ?? null;
}

// Utility to merge results from two channels by attr; prefer pname when present.
export function mergeChannelSearchResults(a: NixSearchItem[], b: NixSearchItem[]): NixSearchItem[] {
  const map = new Map<string, NixSearchItem>();
  for (const it of [...a, ...b]) {
    if (!it.attr) continue;
    const existing = map.get(it.attr);
    if (!existing) map.set(it.attr, it);
    else {
      // Keep first, but backfill fields if missing
      map.set(it.attr, {
        attr: existing.attr,
        pname: existing.pname ?? it.pname,
        version: existing.version ?? it.version,
        description: existing.description ?? it.description,
      });
    }
  }
  return Array.from(map.values());
}
