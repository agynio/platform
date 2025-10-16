import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Deterministic URL builder and fixed upstream base
const NIX_BASE = 'https://search.nixos.org/packages';
function buildUrl(params: Record<string, string | number | undefined>): string {
  const url = new URL(NIX_BASE);
  const keys = Object.keys(params).filter((k) => params[k] !== undefined).sort();
  for (const k of keys) url.searchParams.set(k, String(params[k]!));
  return url.toString();
}

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

// Minimal schemas
const NixItemSchema = z.object({
  attr: z.string(),
  pname: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});
const NixSearchResponseSchema = z.object({ items: z.array(NixItemSchema) });

// Security: only allow safe characters in attr/pname to avoid query injection
const SAFE_IDENT = /^[A-Za-z0-9_.+\-]+$/;

export function registerNixRoutes(
  fastify: FastifyInstance,
  opts: { allowedChannels: string[]; timeoutMs: number; cacheTtlMs: number; cacheMax: number },
) {
  const cache = new LruCache<any>(opts.cacheMax, opts.cacheTtlMs);

  const channelSchema = z.string().refine((v) => opts.allowedChannels.includes(v), { message: 'channel_not_allowed' });

  const searchQuerySchema = z.object({
    q: z.string().optional(),
    query: z.string().optional(),
    channel: channelSchema,
    size: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => (v == null ? 20 : Number(v)))
      .refine((n) => Number.isFinite(n) && n > 0 && n <= 50, 'invalid_size'),
    from: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => (v == null ? 0 : Number(v)))
      .refine((n) => Number.isFinite(n) && n >= 0 && n <= 500, 'invalid_from'),
    sort: z.enum(['relevance', 'name']).default('relevance'),
    order: z.enum(['asc', 'desc']).default('desc'),
  });

  const showQuerySchema = z
    .object({ attr: z.string().regex(SAFE_IDENT).optional(), pname: z.string().regex(SAFE_IDENT).optional(), channel: channelSchema })
    .refine((o) => !!o.attr || !!o.pname, { message: 'attr_or_pname_required' });

  async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
    const cached = cache.get(url);
    if (cached) return cached;
    const maxAttempts = 3; // 1 + 2 retries
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Do not forward inbound auth/cookies; send only Accept header
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if ([502, 503, 504].includes(res.status)) throw new Error(`upstream_${res.status}`);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw Object.assign(new Error(`upstream_${res.status}`), { status: res.status, body: txt });
        }
        const json = await res.json();
        cache.set(url, json);
        return json;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || '');
        const retriable = msg.includes('upstream_502') || msg.includes('upstream_503') || msg.includes('upstream_504') || e?.name === 'FetchError' || e?.code === 'ECONNRESET';
        if (attempt >= maxAttempts || !retriable) break;
        // Retry quickly; keep delay below typical route timeout to allow success within deadline
        await new Promise((r) => setTimeout(r, Math.min(50 * attempt, 200)));
      }
    }
    throw lastErr;
  }

  // GET /api/nix/search
  fastify.get('/api/nix/search', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = searchQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const q = (parsed.data.q || parsed.data.query || '').trim();
      if (q.length < 2) return { items: [] };
      const url = buildUrl({
        type: 'packages',
        channel: parsed.data.channel,
        query: q,
        format: 'json',
        size: parsed.data.size ?? 20,
        from: parsed.data.from ?? 0,
        sort: parsed.data.sort || 'relevance',
        order: parsed.data.order || 'desc',
      });
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = await fetchJson(url, ac.signal);
        const items = Array.isArray(json?.items) ? json.items : Array.isArray(json?.results) ? json.results : [];
        const normalized = items
          .map((it: any) => ({ attr: it.attr, pname: it.pname ?? null, version: it.version ?? null, description: it.description ?? null }))
          .filter((x: any) => typeof x.attr === 'string');
        const body = NixSearchResponseSchema.parse({ items: normalized });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      if ((err as any)?.name === 'AbortError') {
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

  // GET /api/nix/show
  fastify.get('/api/nix/show', async (req, reply) => {
    try {
      const raw = (req.query || {}) as Record<string, unknown>;
      const parsed = showQuerySchema.safeParse(raw);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const { channel, attr, pname } = parsed.data;
      const query = attr ? `attr:${attr}` : String(pname);
      const url = buildUrl({ type: 'packages', channel, query, format: 'json', size: 1, sort: 'relevance', order: 'desc' });
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), opts.timeoutMs);
      try {
        const json = await fetchJson(url, ac.signal);
        const items = Array.isArray(json?.items) ? json.items : Array.isArray(json?.results) ? json.results : [];
        const first = items[0];
        if (!first) {
          reply.code(404);
          return { error: 'not_found' };
        }
        const body = NixItemSchema.parse({ attr: first.attr, pname: first.pname ?? null, version: first.version ?? null, description: first.description ?? null });
        reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return body;
      } finally {
        clearTimeout(tid);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      if ((err as any)?.name === 'AbortError') {
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
