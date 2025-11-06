import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import semver from 'semver';
import { ConfigService } from '../../core/services/config.service';

// Upstream base for NixHub
const NIXHUB_BASE = 'https://www.nixhub.io';

// Simple Map-based LRU with TTL
class LruCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(
    private max: number,
    private ttlMs: number,
  ) {}
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
const SAFE_IDENT = /^[A-Za-z0-9_.+-]+$/;

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
  name: z.string(),
  summary: z.string().optional(),
  releases: z
    .array(
      z.object({
        version: z.union([z.string(), z.number()]).optional(),
        last_updated: z.string().optional(),
        platforms_summary: z.string().optional(),
        outputs_summary: z.string().optional(),
        commit_hash: z.string().optional(),
        platforms: z
          .array(
            z.object({
              system: z.string().optional(),
              attribute_path: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
type NixhubPackageJSON = z.infer<typeof NixhubPackageSchema>;

@Controller('api/nix')
export class NixController {
  private cache: LruCache<unknown>;
  private timeoutMs: number;

  // Strict query schemas (unknown params -> 400)
  private packagesQuerySchema = z.object({ query: z.string().optional() }).strict();
  private versionsQuerySchema = z.object({ name: z.string().max(200).regex(SAFE_IDENT) }).strict();
  private resolveQuerySchema = z
    .object({ name: z.string().max(200).regex(SAFE_IDENT), version: z.string().max(100) })
    .strict();

  constructor(@Inject(ConfigService) private cfg: ConfigService) {
    this.timeoutMs = cfg.nixHttpTimeoutMs;
    this.cache = new LruCache<unknown>(cfg.nixCacheMax, cfg.nixCacheTtlMs);
  }

  private async fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const maxAttempts = 3; // 1 + 2 retries on transient errors
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if ([502, 503, 504].includes(res.status)) throw new Error(`upstream_${res.status}`);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw Object.assign(new Error(`upstream_${res.status}`), { status: res.status, body: txt });
        }
        const json = (await res.json()) as unknown;
        this.cache.set(url, json);
        return json;
      } catch (e) {
        lastErr = e;
        const msg = String((e as { message?: string })?.message || '');
        const retriable =
          msg.includes('upstream_502') ||
          msg.includes('upstream_503') ||
          msg.includes('upstream_504') ||
          (e as { name?: string })?.name === 'FetchError' ||
          (e as { code?: string })?.code === 'ECONNRESET';
        if (attempt >= maxAttempts || !retriable) break;
        await new Promise((r) => setTimeout(r, Math.min(50 * attempt, 200)));
      }
    }
    throw lastErr;
  }

  private extractResolvedRelease(
    json: unknown,
    name: string,
    version: string,
  ): { commitHash: string; attributePath: string } {
    const parsed = NixhubPackageSchema.safeParse(json);
    if (!parsed.success || !parsed.data || !Array.isArray(parsed.data.releases))
      throw Object.assign(new Error(`bad_upstream_json ${JSON.stringify(parsed.error)}`), {
        code: 'bad_upstream_json',
      });
    const rel = parsed.data.releases.find((r) => String(r.version ?? '') === version);
    if (!rel) throw Object.assign(new Error('release_not_found'), { code: 'release_not_found' });
    // Prefer x86_64-linux, then aarch64-linux, then first
    const plats = Array.isArray(rel.platforms) ? rel.platforms : [];
    const preferred =
      plats.find((p) => p.system === 'x86_64-linux') ||
      plats.find((p) => p.system === 'aarch64-linux') ||
      plats[0];
    const attributePath = preferred?.attribute_path;
    const commitHash = rel.commit_hash;
    if (!attributePath) throw Object.assign(new Error('missing_attribute_path'), { code: 'missing_attribute_path' });
    if (!commitHash) throw Object.assign(new Error('missing_commit_hash'), { code: 'missing_commit_hash' });
    return { commitHash, attributePath };
  }

  @Get('packages')
  async packages(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const raw = (query || {}) as Record<string, unknown>;
      const parsed = this.packagesQuerySchema.safeParse(raw);
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
      const tid = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const json = (await this.fetchJson(url, ac.signal)) as unknown;
        const upstream = NixhubSearchSchema.safeParse(json);
        const items: NonNullable<NixhubSearchJSON['results']> =
          upstream.success && Array.isArray(upstream.data.results) ? upstream.data.results : [];
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
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as Record<string, unknown>);
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
  }

  @Get('versions')
  async versions(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const raw = (query || {}) as Record<string, unknown>;
      const parsed = this.versionsQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const name = parsed.data.name;
      const url = `${NIXHUB_BASE}/packages/${encodeURIComponent(name)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const json = (await this.fetchJson(url, ac.signal)) as unknown;
        const upstream = NixhubPackageSchema.safeParse(json);
        const rels: NonNullable<NixhubPackageJSON['releases']> =
          upstream.success && Array.isArray(upstream.data.releases) ? upstream.data.releases : [];
        const { withValid, withInvalid } = this.collectVersions(rels);
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
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as Record<string, unknown>);
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
  }

  @Get('resolve')
  async resolve(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const raw = (query || {}) as Record<string, unknown>;
      const parsed = this.resolveQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const { name, version } = parsed.data;
      const url = `${NIXHUB_BASE}/packages/${encodeURIComponent(name)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const json = (await this.fetchJson(url, ac.signal)) as unknown;
        const { commitHash, attributePath } = this.extractResolvedRelease(json, name, version);
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return { name, version, commitHash, attributePath };
      } finally {
        clearTimeout(tid);
      }
    } catch (e: unknown) {
      const err = e as Error & { status?: number; code?: string };
      const isAbort = (x: unknown): x is { name: string } => !!x && typeof x === 'object' && 'name' in (x as Record<string, unknown>);
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
        return { error: err.code, message: err.message };
      }
      if (err.code === 'release_not_found') {
        reply.code(404);
        return { error: err.code };
      }
      reply.code(500);
      return { error: 'server_error' };
    }
  }
  private collectVersions(rels: NonNullable<NixhubPackageJSON['releases']>): { withValid: string[]; withInvalid: string[] } {
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
    return { withValid, withInvalid };
  }
}
