import Fastify, { type FastifyInstance } from 'fastify';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerNixRoutes } from '../routes/nix.route.js';

const BASE = 'https://www.nixhub.io';

describe('nix routes', () => {
  let fastify: FastifyInstance;
  beforeEach(() => {
    fastify = Fastify({ logger: false });
    registerNixRoutes(fastify, {
      timeoutMs: 200,
      cacheTtlMs: 5 * 60_000,
      cacheMax: 500,
    });
  });
  afterEach(async () => {
    await fastify.close();
    nock.cleanAll();
  });

  it('packages: success mapping and strict upstream URL', async () => {
    const scope = nock(BASE)
      .get('/search')
      // Nock provides decoded query values to predicate; ensure decoded match
      .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
      .reply(200, {
        query: 'git',
        total_results: 1,
        results: [{ name: 'git', summary: 'the fast version control system', last_updated: '2024-10-01' }],
      });

    const res = await fastify.inject({ method: 'GET', url: '/api/nix/packages?query=git' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const body = res.json();
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.packages[0].name).toBe('git');
    scope.done();
  });
  
  it('packages: 502 retry then success', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .reply(502, 'bad gateway')
      .get('/search')
      .query(true)
      .reply(200, { query: 'retry', total_results: 1, results: [{ name: 'ret', summary: 'pkg' }] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/packages?query=retry' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.packages[0].name).toBe('ret');
    scope.done();
  });

  it('packages: timeout -> 504', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .delay(500)
      .reply(200, { query: 'long', total_results: 0, results: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/packages?query=long' });
    expect(res.statusCode).toBe(504);
    scope.done();
  });

  it('versions: 404 mapping and strict upstream path/query', async () => {
    const scope = nock(BASE)
      .get('/packages/pkgs.missing')
      // Decoded form from Nock predicate
      .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
      .reply(404, 'not found');
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/versions?name=pkgs.missing' });
    expect(res.statusCode).toBe(404);
    scope.done();
  });

  it('packages: cache hit; strict upstream URL', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'hello' && q._data === 'routes/_nixhub.search')
      .once()
      .reply(200, { query: 'hello', total_results: 1, results: [{ name: 'hello', summary: 'hello pkg' }] });

    const url = '/api/nix/packages?query=hello';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('packages: error is not cached (500 then 200)', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'flip')
      .reply(500, 'oops')
      .get('/search')
      .query((q) => q.q === 'flip')
      .reply(200, { query: 'flip', total_results: 1, results: [{ name: 'flip', summary: 'flip pkg' }] });

    const url = '/api/nix/packages?query=flip';
    const first = await fastify.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(502);
    const second = await fastify.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    scope.done();
  });

  it('packages: short query returns empty without upstream', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/packages?query=g' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ packages: [] });
    expect(res.headers['cache-control']).toContain('max-age=60');
  });

  it('packages: unknown params rejected with 400', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query(true)
      .reply(200, { results: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/packages?query=git&extra=x' });
    expect(res.statusCode).toBe(400);
    // Ensure upstream was not called
    expect(scope.isDone()).toBe(false);
  });

  it('versions: invalid name (unsafe ident) -> 400', async () => {
    const scope = nock(BASE)
      .get('/packages/bad/name')
      .query(true)
      .reply(200, {} as any);
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/versions?name=bad/name' });
    expect(res.statusCode).toBe(400);
    expect(scope.isDone()).toBe(false);
  });

  it('versions: success mapping (unique + sorted) and cache hit', async () => {
    const scope = nock(BASE)
      .get('/packages/git')
      .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
      .once()
      .reply(200, { name: 'git', releases: [{ version: '2.43.1' }, { version: '2.44.0' }, { version: '2.44.0' }, { version: 'v2.45.0' }] });
    const url = '/api/nix/versions?name=git';
    const r1 = await fastify.inject({ method: 'GET', url });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json();
    expect(b1.versions[0]).toBe('v2.45.0');
    const r2 = await fastify.inject({ method: 'GET', url });
    expect(r2.statusCode).toBe(200);
    scope.done();
  });

  it('versions: 502 retry then success', async () => {
    const scope = nock(BASE)
      .get('/packages/htop')
      .query(true)
      .reply(502, 'bad gateway')
      .get('/packages/htop')
      .query(true)
      .reply(200, { name: 'htop', releases: [{ version: '3.0.0' }] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/versions?name=htop' });
    expect(res.statusCode).toBe(200);
    expect(res.json().versions).toEqual(['3.0.0']);
    scope.done();
  });

  it('versions: timeout -> 504', async () => {
    const scope = nock(BASE)
      .get('/packages/curl')
      .query(true)
      .delay(500)
      .reply(200, { name: 'curl', releases: [] });
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/versions?name=curl' });
    expect(res.statusCode).toBe(504);
    scope.done();
  });

  it('package-info: maps releases with attribute_path/commit_hash/platforms and caches', async () => {
    const scope = nock(BASE)
      .get('/packages/git')
      .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
      .once()
      .reply(200, {
        name: 'git',
        releases: [
          { version: '2.44.0', attribute_path: 'pkgs/git', commit_hash: 'abc123', platforms: ['x86_64-linux'] },
          { version: '2.43.1', variants: [{ attribute_path: 'pkgs/git-2_43', commit_hash: 'def456', platforms: ['aarch64-linux'] }] },
          { version: 24200 },
        ],
      });
    const url = '/api/nix/package-info?name=git';
    const r1 = await fastify.inject({ method: 'GET', url });
    expect(r1.statusCode).toBe(200);
    const body = r1.json();
    expect(body.name).toBe('git');
    expect(Array.isArray(body.releases)).toBe(true);
    const r = body.releases.find((x: any) => x.version === '2.44.0');
    expect(r.attribute_path).toBe('pkgs/git');
    expect(r.commit_hash).toBe('abc123');

    // cache hit
    const r2 = await fastify.inject({ method: 'GET', url });
    expect(r2.statusCode).toBe(200);
    scope.done();
  });

  it('package-info: 404 passthrough', async () => {
    const scope = nock(BASE)
      .get('/packages/doesnotexist')
      .query(true)
      .reply(404, 'not found');
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/package-info?name=doesnotexist' });
    expect(res.statusCode).toBe(404);
    scope.done();
  });

  it('package-info: invalid name rejected with 400', async () => {
    const scope = nock(BASE)
      .get('/packages/bad/name')
      .query(true)
      .reply(200, {});
    const res = await fastify.inject({ method: 'GET', url: '/api/nix/package-info?name=bad/name' });
    expect(res.statusCode).toBe(400);
    expect(scope.isDone()).toBe(false);
  });
});
