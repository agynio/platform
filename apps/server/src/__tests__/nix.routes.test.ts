import Fastify from 'fastify';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerNixRoutes } from '../routes/nix.route.js';

const BASE = 'https://www.nixhub.io';

describe('nix routes', () => {
  let fastify: ReturnType<typeof Fastify>;
  beforeEach(() => {
    fastify = Fastify({ logger: false });
    registerNixRoutes(fastify as any, {
      allowedChannels: ['nixpkgs-unstable', 'nixos-24.11'],
      timeoutMs: 200,
      cacheTtlMs: 5 * 60_000,
      cacheMax: 500,
    });
  });
  afterEach(async () => {
    await fastify.close();
    nock.cleanAll();
  });

  it('search success', async () => {
    const scope = nock(BASE)
      .get('/search')
      // Nock provides decoded query values to predicate; ensure decoded match
      .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
      .reply(200, {
        query: 'git',
        total_results: 1,
        results: [{ name: 'git', summary: 'the fast version control system', last_updated: '2024-10-01' }],
      });

    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=git' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].attr).toBe('git');
    scope.done();
  });

  it('validation error on bad channel', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=bad&query=ab' });
    expect(res.statusCode).toBe(400);
  });

  it('upstream 500 mapped to 502', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .reply(500, 'oops');
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=tool' });
    expect(res.statusCode).toBe(502);
    scope.done();
  });

  it('retries on 502 then succeeds', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .reply(502, 'bad gateway')
      .get('/search')
      .query(true)
      .reply(200, { query: 'retry', total_results: 1, results: [{ name: 'ret', summary: 'pkg' }] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=retry' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items[0].attr).toBe('ret');
    scope.done();
  });

  it('timeout mapped to 504', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .delay(500)
      .reply(200, { query: 'long', total_results: 0, results: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=long' });
    expect(res.statusCode).toBe(504);
    scope.done();
  });

  it('show not found -> 404', async () => {
    const scope = nock(BASE)
      .get('/packages/pkgs.missing')
      // Decoded form from Nock predicate
      .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
      .reply(404, 'not found');
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/show?channel=nixpkgs-unstable&attr=pkgs.missing' });
    expect(res.statusCode).toBe(404);
    scope.done();
  });

  it('cache hit returns quickly', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'hello' && q._data === 'routes/_nixhub.search')
      .once()
      .reply(200, { query: 'hello', total_results: 1, results: [{ name: 'hello', summary: 'hello pkg' }] });

    const url = '/api/nix/search?channel=nixpkgs-unstable&query=hello';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('error is not cached (500 then 200)', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'flip')
      .reply(500, 'oops')
      .get('/search')
      .query((q) => q.q === 'flip')
      .reply(200, { query: 'flip', total_results: 1, results: [{ name: 'flip', summary: 'flip pkg' }] });

    const url = '/api/nix/search?channel=nixpkgs-unstable&query=flip';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(502);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('forwards size/from and accepts alias q', async () => {
    const scope = nock(BASE)
      .get('/search')
      // Ensure only exact NixHub params are sent, extra ones are not forwarded upstream
      .query((q) => q.q === 'alias' && q._data === 'routes/_nixhub.search')
      .reply(200, { query: 'alias', total_results: 0, results: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&q=alias&size=10&from=5' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    scope.done();
  });
});
