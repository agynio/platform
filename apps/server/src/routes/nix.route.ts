import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import semver from 'semver';

// Upstream base for NixHub
const NIXHUB_BASE = 'https://www.nixhub.io';

// Simple Map-based LRU with TTL
class LruCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(private max: number, private ttlMs: number) {}
  get(key: string): T | undefined {
    const ent = this.map.get(key);
    if (!ent) return undefined;
    if (Date.now() - ent.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU
    this.map.delete(key);
    this.map.set(key, ent);
    return ent.value;
  }
  set(key: string, value: T) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { at: Date.now(), value });
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value as string | undefined;
      if (first) this.map.delete(first);
    }
  }
}

// Security: only allow safe characters in name
const SAFE_IDENT = /^[A-Za-z0-9_.+\-]+$/;

// Outgoing response schemas
const PackagesResponseSchema = z.object({
  packages: z.array(z.object({ name: z.string(), description: z.string().nullable().optional() })),
});
const VersionsResponseSchema = z.object({ versions: z.array(z.string()) });
const PackageInfoResponseSchema = z.object({
  name: z.string(),
  releases: z.array(
    z
      .object({
        version: z.string(),
        attribute_path: z.string().optional(),
        commit_hash: z.string().optional(),
        platforms: z.array(z.string()).optional(),
      })
      .strict(),
  ),
});

// Minimal upstream shapes for type-safe parsing
const NixhubSearchSchema = z.object({
  query: z.string().optional(),
  total_results: z.number().optional(),
  results: z
    .array(
      z.object({
        name: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
});
type NixhubSearchJSON = z.infer<typeof NixhubSearchSchema>;

const NixhubPackageSchema = z.object({
  name: z.string().optional(),
  releases: z
    .array(
      z.object({
        version: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional(),
});
type NixhubPackageJSON = z.infer<typeof NixhubPackageSchema>;

const NixhubPackageInfoSchema = z.object({
  name: z.string().optional(),
  releases: z
    .array(
      z
        .object({
          version: z.union([z.string(), z.number()]).optional(),
          attribute_path: z.string().optional(),
          attr_path: z.string().optional(),
          commit_hash: z.string().optional(),
          commit: z.string().optional(),
          platforms: z.array(z.string()).optional(),
          variants: z
            .array(
              z.object({
                attribute_path: z.string().optional(),
                commit_hash: z.string().optional(),
                platforms: z.array(z.string()).optional(),
              }),
            )
            .optional(),
        })
        .strict()
        .catchall(z.any()),
    )
    .optional(),
});
type NixhubPackageInfoJSON = z.infer<typeof NixhubPackageInfoSchema>;

export function registerNixRoutes(
  fastify: FastifyInstance,
  opts: { timeoutMs: number; cacheTtlMs: number; cacheMax: number },
) {
  const cache = new LruCache<unknown>(opts.cacheMax, opts.cacheTtlMs);

  // Strict query schemas (unknown params -> 400)
  const packagesQuerySchema = z.object({ query: z.string().optional() }).strict();
  const versionsQuerySchema = z.object({ name: z.string().max(200).regex(SAFE_IDENT) }).strict();
  const infoQuerySchema = z.object({ name: z.string().max(200).regex(SAFE_IDENT) }).strict();

  async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
    const cached = cache.get(url);
    if (cached) return cached;
    const maxAttempts = 3; // 1 + 2 retries on transient errors
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if ([502, 503, 504].includes(res.status)) throw new Error(`upstream_${res.status}`);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw Object.assign(new Error(`upstream_${res.status}`), { status: res.status, body: txt });
        }
        const json = (await res.json()) as unknown;
        cache.set(url, json);
        return json;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || '');
        const retriable = msg.includes('upstream_502') || msg.includes('upstream_503') || msg.includes('upstream_504') || e?.name === 'FetchError' || e?.code === 'ECONNRESET';
        if (attempt >= maxAttempts || !retriable) break;
        await new Promise((r) => setTimeout(r, Math.min(50 * attempt, 200)));
      }
    }
    throw lastErr;
  }

  // GET /api/nix/packages
  fastify.get('/api/nix/packages', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = packagesQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const q = (parsed.data.query || '').trim();
      if (q.length < 2) {
        const body = PackagesResponseSchema.parse({ packages: [] });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      }
      const url = `${NIXHUB_BASE}/search?q=${encodeURIComponent(q)}&_data=routes%2F_nixhub.search`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = (await fetchJson(url, ac.signal)) as unknown;
        const upstream = NixhubSearchSchema.safeParse(json);
        const items: NonNullable<NixhubSearchJSON['results']> = upstream.success && Array.isArray(upstream.data.results) ? upstream.data.results : [];
        const mapped = items
          .map((it) => ({ name: it?.name ?? '', description: it?.summary ?? null }))
          .filter((x) => typeof x.name === 'string' && x.name.length > 0);
        const body = PackagesResponseSchema.parse({ packages: mapped });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as any);
      if (isAbort(err) && err.name === 'AbortError') {
        reply.code(504);
        return { error: 'timeout' };
      }
      if (typeof err.status === 'number') {
        reply.code(502);
        return { error: 'upstream_error', status: err.status };
      }
      reply.code(500);
      return { error: 'server_error' };
    }
  });

  // GET /api/nix/versions
  fastify.get('/api/nix/versions', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = versionsQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const name = parsed.data.name;
      const url = `${NIXHUB_BASE}/packages/${encodeURIComponent(name)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = (await fetchJson(url, ac.signal)) as unknown;
        const upstream = NixhubPackageSchema.safeParse(json);
        const rels: NonNullable<NixhubPackageJSON['releases']> = upstream.success && Array.isArray(upstream.data.releases) ? upstream.data.releases : [];
        const seen = new Set<string>();
        const withValid: string[] = [];
        const withInvalid: string[] = [];
        for (const r of rels) {
          const v = String(r?.version ?? '');
          if (!v || seen.has(v)) continue;
          seen.add(v);
          if (semver.valid(v) || semver.valid(semver.coerce(v) || '')) withValid.push(v);
          else withInvalid.push(v);
        }
        withValid.sort((a, b) => semver.rcompare(semver.coerce(a) || a, semver.coerce(b) || b));
        const versions = [...withValid, ...withInvalid];
        const body = VersionsResponseSchema.parse({ versions });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as any);
      if (isAbort(err) && err.name === 'AbortError') {
        reply.code(504);
        return { error: 'timeout' };
      }
      if (typeof err.status === 'number') {
        reply.code(err.status === 404 ? 404 : 502);
        return { error: err.status === 404 ? 'not_found' : 'upstream_error', status: err.status };
      }
      reply.code(500);
      return { error: 'server_error' };
    }
  });

  // GET /api/nix/package-info
  fastify.get('/api/nix/package-info', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = infoQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const name = parsed.data.name;
      const url = `${NIXHUB_BASE}/packages/${encodeURIComponent(name)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = (await fetchJson(url, ac.signal)) as unknown;
        const upstream = NixhubPackageInfoSchema.safeParse(json);
        const u: NixhubPackageInfoJSON = upstream.success ? upstream.data : {};
        const rels = Array.isArray(u.releases) ? u.releases : [];
        const mapped = rels
          .flatMap((r) => {
            const version = String(r?.version ?? '');
            if (!version) return [];
            if (Array.isArray(r.variants) && r.variants.length > 0) {
              return r.variants.map((v) => ({ version, attribute_path: v.attribute_path, commit_hash: v.commit_hash, platforms: v.platforms }));
            }
            return [
              { version, attribute_path: (r as any).attribute_path || (r as any).attr_path, commit_hash: (r as any).commit_hash || (r as any).commit, platforms: r.platforms },
            ];
          })
          .filter((x) => !!x.version) as Array<{ version: string; attribute_path?: string; commit_hash?: string; platforms?: string[] }>;
        const body = PackageInfoResponseSchema.parse({ name: String(u.name || name), releases: mapped });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as any);
      if (isAbort(err) && err.name === 'AbortError') {
        reply.code(504);
        return { error: 'timeout' };
      }
      if (typeof err.status === 'number') {
        reply.code(err.status === 404 ? 404 : 502);
        return { error: err.status === 404 ? 'not_found' : 'upstream_error', status: err.status };
      }
      reply.code(500);
      return { error: 'server_error' };
    }
  });
}
