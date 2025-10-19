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

export function registerNixRoutes(
  fastify: FastifyInstance,
  opts: { timeoutMs: number; cacheTtlMs: number; cacheMax: number },
) {
  const cache = new LruCache<unknown>(opts.cacheMax, opts.cacheTtlMs);

  // Strict query schemas (unknown params -> 400)
  const packagesQuerySchema = z.object({ query: z.string().optional() }).strict();
  const versionsQuerySchema = z.object({ name: z.string().max(200).regex(SAFE_IDENT) }).strict();
  const resolveQuerySchema = z.object({ name: z.string().max(200).regex(SAFE_IDENT), version: z.string().max(100) }).strict();

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

  // Helper: extract commitHash and attributePath for a given name+version
  const NixhubPackageDetailsSchema = z
    .object({
      name: z.string().optional(),
      releases: z
        .array(
          z
            .object({
              version: z.union([z.string(), z.number()]).optional(),
              commit_hash: z.string().optional(),
              platforms: z
                .array(z.object({ system: z.string().optional(), attribute_path: z.string().optional(), attribute: z.string().optional() }).strict())
                .optional(),
            })
            .strict(),
        )
        .optional(),
    })
    .strict()
    .optional();

  function extractResolvedRelease(json: unknown, name: string, version: string): { commitHash: string; attributePath: string } {
    const parsed = NixhubPackageDetailsSchema.safeParse(json);
    if (!parsed.success || !parsed.data || !Array.isArray(parsed.data.releases)) throw Object.assign(new Error('bad_upstream_json'), { code: 'bad_upstream_json' });
    const rel = parsed.data.releases.find((r) => String(r.version ?? '') === version);
    if (!rel) throw Object.assign(new Error('release_not_found'), { code: 'release_not_found' });
    const commit = rel.commit_hash;
    if (!commit) throw Object.assign(new Error('missing_commit_hash'), { code: 'missing_commit_hash' });
    const preferred = ['x86_64-linux', 'aarch64-linux', 'x86_64-darwin', 'aarch64-darwin'];
    const plats = Array.isArray(rel.platforms) ? rel.platforms : [];
    const chosen = plats.find((p) => p.system && preferred.includes(p.system)) || plats[0];
    const attr = chosen?.attribute_path || chosen?.attribute;
    if (!attr) throw Object.assign(new Error('missing_attribute_path'), { code: 'missing_attribute_path' });
    return { commitHash: commit, attributePath: String(attr) };
  }

  // GET /api/nix/resolve
  fastify.get('/api/nix/resolve', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = resolveQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const { name, version } = parsed.data;
      const url = `${NIXHUB_BASE}/packages/${encodeURIComponent(name)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = (await fetchJson(url, ac.signal)) as unknown;
        const { commitHash, attributePath } = extractResolvedRelease(json, name, version);
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return { name, version, commitHash, attributePath };
      } finally {
        clearTimeout(tid);
      }
    } catch (e: any) {
      const err = e as Error & { status?: number; code?: string };
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as any);
      if (isAbort(err) && err.name === 'AbortError') {
        reply.code(504);
        return { error: 'timeout' };
      }
      if (typeof err.status === 'number') {
        reply.code(err.status === 404 ? 404 : 502);
        return { error: err.status === 404 ? 'not_found' : 'upstream_error', status: err.status };
      }
      // Map known extraction errors to 502/404
      if (err.code && ['bad_upstream_json', 'missing_commit_hash', 'missing_attribute_path'].includes(err.code)) {
        reply.code(502);
        return { error: err.code };
      }
      if (err.code === 'release_not_found') {
        reply.code(404);
        return { error: err.code };
      }
      reply.code(500);
      return { error: 'server_error' };
    }
  });
}
