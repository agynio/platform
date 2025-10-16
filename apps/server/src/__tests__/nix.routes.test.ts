import Fastify from 'fastify';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerNixRoutes } from '../routes/nix.route.js';

const BASE = 'https://search.nixos.org';

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
      .get('/packages')
      .query((q) => q.type === 'packages' && q.channel === 'nixpkgs-unstable' && q.query === 'git' && q.format === 'json')
      .reply(200, { items: [{ attr: 'pkgs.git', pname: 'git', version: '2.44', description: 'git' }] });

    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=git' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].attr).toBe('pkgs.git');
    scope.done();
  });

  it('validation error on bad channel', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=bad&query=ab' });
    expect(res.statusCode).toBe(400);
  });

  it('upstream 500 mapped to 502', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query(true)
      .reply(500, 'oops');
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=tool' });
    expect(res.statusCode).toBe(502);
    scope.done();
  });

  it('retries on 502 then succeeds', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query(true)
      .reply(502, 'bad gateway')
      .get('/packages')
      .query(true)
      .reply(200, { items: [{ attr: 'ret', pname: 'ret', version: '1' }] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=retry' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items[0].attr).toBe('ret');
    scope.done();
  });

  it('timeout mapped to 504', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query(true)
      .delay(500)
      .reply(200, { items: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&query=long' });
    expect(res.statusCode).toBe(504);
    scope.done();
  });

  it('show not found -> 404', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query((q) => (q.query as string)?.startsWith('attr:'))
      .reply(200, { items: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/show?channel=nixpkgs-unstable&attr=pkgs.missing' });
    expect(res.statusCode).toBe(404);
    scope.done();
  });

  it('cache hit returns quickly', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query((q) => q.query === 'hello')
      .once()
      .reply(200, { items: [{ attr: 'hello', pname: 'hello', version: '1.0' }] });

    const url = '/api/nix/search?channel=nixpkgs-unstable&query=hello';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('error is not cached (500 then 200)', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query((q) => q.query === 'flip')
      .reply(500, 'oops')
      .get('/packages')
      .query((q) => q.query === 'flip')
      .reply(200, { items: [{ attr: 'flip', pname: 'flip', version: '1.2' }] });

    const url = '/api/nix/search?channel=nixpkgs-unstable&query=flip';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(502);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('forwards size/from and accepts alias q', async () => {
    const scope = nock(BASE)
      .get('/packages')
      .query((q) => q.query === 'alias' && q.size === '10' && q.from === '5' && q.format === 'json')
      .reply(200, { items: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/search?channel=nixpkgs-unstable&q=alias&size=10&from=5' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    scope.done();
  });
});
