// Simple client for NixOS Search API (UI-only; no persistence)
// Note: Public search API may have CORS restrictions in browsers.
// Phase 1 intentionally avoids adding a proxy. Tests mock network via MSW.

export type NixChannel = 'nixpkgs-unstable' | 'nixos-24.11';

export interface NixSearchItem {
  // Nix attribute/path, typically unique across channels
  attr: string;
  pname?: string;
  version?: string;
  description?: string;
}

export interface NixSearchResponse {
  items: NixSearchItem[];
}

const BASE_URL = 'https://search.nixos.org/packages';

// Constructs a URL for the public search endpoint.
function buildSearchUrl(query: string, channel: NixChannel): string {
  const u = new URL(BASE_URL);
  u.searchParams.set('type', 'packages');
  u.searchParams.set('channel', channel);
  u.searchParams.set('query', query);
  // Keep results small for UI autocomplete.
  u.searchParams.set('size', '20');
  return u.toString();
}

export async function searchPackages(query: string, channel: NixChannel, signal?: AbortSignal): Promise<NixSearchItem[]> {
  if (!query || query.trim().length < 2) return [];
  const url = buildSearchUrl(query.trim(), channel);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nix search failed: ${res.status}`);
  const data = (await res.json()) as NixSearchResponse | { items?: unknown };
  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  // Normalize minimal fields we need.
  return items
    .map((it: any) => ({
      attr: it.attr ?? it.attribute ?? it.attr_name ?? '',
      pname: it.pname ?? it.name ?? it.pkgName,
      version: it.version,
      description: it.description ?? it.desc,
    }))
    .filter((it: NixSearchItem) => !!it.attr);
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
  const data = (await res.json()) as NixSearchResponse | { items?: unknown };
  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  if (!items.length) return null;
  const hit = (items as any[])[0];
  const version = (hit as any).version ?? null;
  return version ?? null;
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

