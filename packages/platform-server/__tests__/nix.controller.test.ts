import { readFileSync } from 'node:fs';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyReply } from 'fastify';

import { NixController } from '../src/infra/ncps/nix.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const BASE = 'https://www.nixhub.io';

const loadFixture = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/nixhub/${file}`, import.meta.url), 'utf-8')) as T;

type SearchFixture = {
  query: string;
  total_results: number;
  results: { name: string; summary: string | null; last_updated: string }[];
};

type PackageFixture = {
  name: string;
  summary?: string;
  releases: {
    version: string | number;
    last_updated?: string;
    outputs_summary?: string;
    platforms_summary?: string;
    commit_hash?: string;
    platforms: { system?: string; attribute_path?: string; commit_hash?: string }[];
  }[];
};

const createReply = (): FastifyReply => {
  const reply = {} as FastifyReply;
  Object.assign(reply, {
    code: vi.fn(() => reply),
    header: vi.fn(() => reply),
  });
  return reply;
};

const codeCalls = (reply: FastifyReply) => ((reply.code as any).mock?.calls ?? []) as unknown[][];
const headerCalls = (reply: FastifyReply) => ((reply.header as any).mock?.calls ?? []) as unknown[][];

const clearReplyMocks = (reply: FastifyReply) => {
  (reply.code as any).mockClear?.();
  (reply.header as any).mockClear?.();
};

const expectStatus = (reply: FastifyReply, status: number) => {
  const calls = codeCalls(reply);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.at(-1)?.[0]).toBe(status);
};

describe.sequential('NixController', () => {
  let controller: NixController;
  let reply: FastifyReply;

  beforeEach(() => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        githubAppId: 'x',
        githubAppPrivateKey: 'x',
        githubInstallationId: 'x',
        githubToken: 'x',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        litellmBaseUrl: 'http://localhost:4000',
        litellmMasterKey: 'sk-test',
        graphRepoPath: './data/graph',
        graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000',
        nixAllowedChannels: 'nixpkgs-unstable',
        nixHttpTimeoutMs: String(200),
        nixCacheTtlMs: String(5 * 60_000),
        nixCacheMax: String(500),
        mcpToolsStaleTimeoutMs: '0',
        ncpsEnabled: 'false',
        ncpsUrl: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      })
    );
    controller = new NixController(cfg);
    reply = createReply();
  });

  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  describe('packages', () => {
    it('returns mapped packages and sets cache header', async () => {
      const search = loadFixture<SearchFixture>('search.git.json');
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
        .reply(200, search);

      const body = await controller.packages({ query: 'git' }, reply);

      expect(body.packages.length).toBeGreaterThan(0);
      expect(body.packages[0].name).toBe(search.results[0].name);
      expect(headerCalls(reply)[0][0]).toBe('Cache-Control');
      expect(codeCalls(reply)).toHaveLength(0);
      scope.done();
    });

    it('returns empty list when query shorter than 2 without upstream call', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'short' && q._data === 'routes/_nixhub.search')
        .reply(200, {});
      const body = await controller.packages({ query: 'a' }, reply);
      expect(body).toEqual({ packages: [] });
      expect(scope.isDone()).toBe(false);
    });

    it('rejects unknown params with 400 and skips upstream', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git-extra' && q._data === 'routes/_nixhub.search')
        .reply(200, {});
      await controller.packages({ query: 'git', extra: '1' } as any, reply);
      expectStatus(reply, 400);
      expect(scope.isDone()).toBe(false);
    });

    it('maps upstream 500 to 502 upstream_error', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git500' && q._data === 'routes/_nixhub.search')
        .reply(500, 'fail');
      const body = await controller.packages({ query: 'git500' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 500 });
      scope.done();
    });

    it('maps repeated 502 responses to upstream_error with status 502', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git502' && q._data === 'routes/_nixhub.search')
        .times(3)
        .reply(502, 'bad gateway');
      const body = await controller.packages({ query: 'git502' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 502 });
      scope.done();
    });

    it('retries single 502 and succeeds', async () => {
      const search = loadFixture<SearchFixture>('search.python.json');
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'python502' && q._data === 'routes/_nixhub.search')
        .reply(502, 'bad gateway')
        .get('/search')
        .query((q) => q.q === 'python502' && q._data === 'routes/_nixhub.search')
        .reply(200, search);

      const body = await controller.packages({ query: 'python502' }, reply);

      expect(body.packages[0].name).toBe(search.results[0].name);
      expect(codeCalls(reply)).toHaveLength(0);
      scope.done();
    });

    it('returns 504 on upstream timeout', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'timeout' && q._data === 'routes/_nixhub.search')
        .delay(500)
        .reply(200, {});
      const body = await controller.packages({ query: 'timeout' }, reply);
      expectStatus(reply, 504);
      expect(body).toEqual({ error: 'timeout' });
      scope.done();
    });

    it('maps invalid JSON payloads to bad_upstream_json', async () => {
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git-badjson' && q._data === 'routes/_nixhub.search')
        .reply(200, '<!doctype html>');
      const body = await controller.packages({ query: 'git-badjson' }, reply);
      expectStatus(reply, 502);
      expect(body).toEqual({ error: 'bad_upstream_json' });
      scope.done();
    });

    it('maps schema violations to bad_upstream_json', async () => {
      const malformed = loadFixture<SearchFixture>('search.git.json');
      const mutated = JSON.parse(JSON.stringify(malformed)) as SearchFixture;
      // Remove last_updated to violate schema
      mutated.results = mutated.results.map(({ last_updated, ...rest }) => rest as any);
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'git-schema' && q._data === 'routes/_nixhub.search')
        .reply(200, mutated);
      const body = await controller.packages({ query: 'git-schema' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'bad_upstream_json' });
      scope.done();
    });

    it('does not cache failures', async () => {
      const search = loadFixture<SearchFixture>('search.nodejs.json');
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'nodejs')
        .reply(500, 'fail')
        .get('/search')
        .query((q) => q.q === 'nodejs')
        .reply(200, search);

      const first = await controller.packages({ query: 'nodejs' }, reply);
      expectStatus(reply, 502);
      expect(first).toMatchObject({ error: 'upstream_error' });

      clearReplyMocks(reply);
      const second = await controller.packages({ query: 'nodejs' }, reply);
      expect(second.packages[0].name).toBe(search.results[0].name);
      scope.done();
    });

    it('caches successful responses', async () => {
      const search = loadFixture<SearchFixture>('search.git.json');
      const scope = nock(BASE)
        .get('/search')
        .query((q) => q.q === 'cacheme' && q._data === 'routes/_nixhub.search')
        .once()
        .reply(200, search);

      const first = await controller.packages({ query: 'cacheme' }, reply);
      expect(first.packages.length).toBeGreaterThan(0);

      clearReplyMocks(reply);
      const second = await controller.packages({ query: 'cacheme' }, reply);
      expect(second.packages.length).toBeGreaterThan(0);
      scope.done();
    });
  });

  describe('versions', () => {
    it('returns sorted unique versions and sets cache header', async () => {
      const pkgGit = loadFixture<PackageFixture>('package.git.json');
      const scope = nock(BASE)
        .get('/packages/git')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkgGit);

      const body = await controller.versions({ name: 'git' }, reply);

      expect(body.versions[0]).toBe(String(pkgGit.releases[0].version));
      expect(new Set(body.versions).size).toBe(body.versions.length);
      expect(headerCalls(reply)[0][0]).toBe('Cache-Control');
      scope.done();
    });

    it('rejects invalid name with 400 without calling upstream', async () => {
      const scope = nock(BASE).get('/packages/bad/name').query(true).reply(200, {});
      await controller.versions({ name: 'bad/name' }, reply);
      expectStatus(reply, 400);
      expect(scope.isDone()).toBe(false);
    });

    it('maps upstream 404 to not_found', async () => {
      const scope = nock(BASE)
        .get('/packages/missing')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(404, 'nope');
      const body = await controller.versions({ name: 'missing' }, reply);
      expectStatus(reply, 404);
      expect(body).toMatchObject({ error: 'not_found', status: 404 });
      scope.done();
    });

    it('maps upstream 500 to upstream_error', async () => {
      const scope = nock(BASE)
        .get('/packages/git-500')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(500, 'fail');
      const body = await controller.versions({ name: 'git-500' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 500 });
      scope.done();
    });

    it('maps repeated 504 responses to upstream_error with status 504', async () => {
      const scope = nock(BASE)
        .get('/packages/git-504')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .times(3)
        .reply(504, 'timeout');
      const body = await controller.versions({ name: 'git-504' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 504 });
      scope.done();
    });

    it('retries single 502 and succeeds', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const scope = nock(BASE)
        .get('/packages/nodejs-502')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(502, 'bad gateway')
        .get('/packages/nodejs-502')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);

      const body = await controller.versions({ name: 'nodejs-502' }, reply);
      expect(body.versions[0]).toBe(String(pkg.releases[0].version));
      expect(codeCalls(reply)).toHaveLength(0);
      scope.done();
    });

    it('returns 504 on upstream timeout', async () => {
      const scope = nock(BASE)
        .get('/packages/git-timeout')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .delay(500)
        .reply(200, {});
      const body = await controller.versions({ name: 'git-timeout' }, reply);
      expectStatus(reply, 504);
      expect(body).toEqual({ error: 'timeout' });
      scope.done();
    });

    it('maps schema violations in releases to bad_upstream_json', async () => {
      const pkg = loadFixture<PackageFixture>('package.git.json');
      const mutated = JSON.parse(JSON.stringify(pkg)) as PackageFixture;
      mutated.releases[0].platforms[0] = {
        system: 'x86_64-linux',
        attribute_path: 'git',
        commit_hash: 'not-a-hash',
      } as any;
      const scope = nock(BASE)
        .get('/packages/git-schema')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, mutated);
      const body = await controller.versions({ name: 'git-schema' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'bad_upstream_json' });
      scope.done();
    });

    it('does not cache failures', async () => {
      const pkg = loadFixture<PackageFixture>('package.git.json');
      const scope = nock(BASE)
        .get('/packages/git-fail')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(500, 'fail')
        .get('/packages/git-fail')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);

      const first = await controller.versions({ name: 'git-fail' }, reply);
      expectStatus(reply, 502);
      expect(first).toMatchObject({ error: 'upstream_error' });

      clearReplyMocks(reply);
      const second = await controller.versions({ name: 'git-fail' }, reply);
      expect(second.versions[0]).toBe(String(pkg.releases[0].version));
      scope.done();
    });

    it('caches successful responses', async () => {
      const pkg = loadFixture<PackageFixture>('package.git.json');
      const scope = nock(BASE)
        .get('/packages/git')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .once()
        .reply(200, pkg);

      await controller.versions({ name: 'git' }, reply);
      clearReplyMocks(reply);
      const second = await controller.versions({ name: 'git' }, reply);
      expect(second.versions.length).toBeGreaterThan(0);
      scope.done();
    });
  });

  describe('resolve', () => {
    it('returns commit hash and attribute path from preferred platform', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const scope = nock(BASE)
        .get('/packages/nodejs')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);

      const body = await controller.resolve({ name: 'nodejs', version: String(pkg.releases[0].version) }, reply);

      expect(body).toMatchObject({
        name: 'nodejs',
        version: String(pkg.releases[0].version),
        attributePath: pkg.releases[0].platforms[0].attribute_path,
        commitHash: pkg.releases[0].platforms[0].commit_hash,
      });
      expect(codeCalls(reply)).toHaveLength(0);
      scope.done();
    });

    it('rejects invalid parameters with 400 and skips upstream', async () => {
      const scope = nock(BASE).get('/packages/bad/name').query((q) => true).reply(200, {});
      await controller.resolve({ name: 'bad/name', version: '1.0.0' }, reply);
      expectStatus(reply, 400);
      expect(scope.isDone()).toBe(false);
    });

    it('maps upstream 404 to not_found', async () => {
      const scope = nock(BASE)
        .get('/packages/nodejs-404')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(404, 'missing');
      const body = await controller.resolve({ name: 'nodejs-404', version: '0.0.0' }, reply);
      expectStatus(reply, 404);
      expect(body).toMatchObject({ error: 'not_found', status: 404 });
      scope.done();
    });

    it('maps upstream 500 to upstream_error', async () => {
      const scope = nock(BASE)
        .get('/packages/nodejs-500')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(500, 'fail');
      const body = await controller.resolve({ name: 'nodejs-500', version: '1.0.0' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 500 });
      scope.done();
    });

    it('maps repeated 503 responses to upstream_error with status 503', async () => {
      const scope = nock(BASE)
        .get('/packages/nodejs-503')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .times(3)
        .reply(503, 'bad gateway');
      const body = await controller.resolve({ name: 'nodejs-503', version: '1.0.0' }, reply);
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'upstream_error', status: 503 });
      scope.done();
    });

    it('retries single 502 and succeeds', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const version = String(pkg.releases[1].version);
      const scope = nock(BASE)
        .get('/packages/nodejs-resolve-502')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(502, 'bad gateway')
        .get('/packages/nodejs-resolve-502')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);

      const body = await controller.resolve({ name: 'nodejs-resolve-502', version }, reply);
      expect(body.commitHash).toBe(pkg.releases[1].platforms[0].commit_hash);
      expect(codeCalls(reply)).toHaveLength(0);
      scope.done();
    });

    it('returns 504 on upstream timeout', async () => {
      const scope = nock(BASE)
        .get('/packages/nodejs-timeout')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .delay(500)
        .reply(200, {});
      const body = await controller.resolve({ name: 'nodejs-timeout', version: '1.0.0' }, reply);
      expectStatus(reply, 504);
      expect(body).toEqual({ error: 'timeout' });
      scope.done();
    });

    it('maps invalid JSON payloads to bad_upstream_json', async () => {
      const scope = nock(BASE)
        .get('/packages/nodejs-badjson')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, 'not-json');
      const body = await controller.resolve({ name: 'nodejs-badjson', version: '1.0.0' }, reply);
      expectStatus(reply, 502);
      expect(body).toEqual({ error: 'bad_upstream_json' });
      scope.done();
    });

    it('maps schema violations to bad_upstream_json', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const mutated = JSON.parse(JSON.stringify(pkg)) as PackageFixture;
      mutated.releases[0].platforms = [
        {
          system: 'x86_64-linux',
          attribute_path: '',
          commit_hash: mutated.releases[0].platforms[0].commit_hash,
        } as any,
      ];
      const scope = nock(BASE)
        .get('/packages/nodejs-schema')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, mutated);
      const body = await controller.resolve(
        { name: 'nodejs-schema', version: String(mutated.releases[0].version) },
        reply,
      );
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'bad_upstream_json' });
      scope.done();
    });

    it('returns 404 when release is not found', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const scope = nock(BASE)
        .get('/packages/nodejs-missing-release')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);
      const body = await controller.resolve({ name: 'nodejs-missing-release', version: '0.0.0' }, reply);
      expectStatus(reply, 404);
      expect(body).toEqual({ error: 'release_not_found' });
      scope.done();
    });

    it('returns 502 when attribute path missing', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const mutated = JSON.parse(JSON.stringify(pkg)) as PackageFixture;
      mutated.releases[0].platforms = [
        {
          commit_hash: mutated.releases[0].platforms[0].commit_hash,
        },
      ];
      const scope = nock(BASE)
        .get('/packages/nodejs-missing-attr')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, mutated);
      const body = await controller.resolve(
        { name: 'nodejs-missing-attr', version: String(mutated.releases[0].version) },
        reply,
      );
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'missing_attribute_path' });
      scope.done();
    });

    it('returns 502 when commit hash missing on release and platform', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const mutated = JSON.parse(JSON.stringify(pkg)) as PackageFixture;
      mutated.releases[0].platforms = [{ attribute_path: 'nodejs_24' }];
      const scope = nock(BASE)
        .get('/packages/nodejs-missing-commit')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, mutated);
      const body = await controller.resolve(
        { name: 'nodejs-missing-commit', version: String(mutated.releases[0].version) },
        reply,
      );
      expectStatus(reply, 502);
      expect(body).toMatchObject({ error: 'missing_commit_hash' });
      scope.done();
    });

    it('does not cache failures', async () => {
      const pkg = loadFixture<PackageFixture>('package.nodejs.json');
      const version = String(pkg.releases[0].version);
      const scope = nock(BASE)
        .get('/packages/nodejs-cache-fail')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(500, 'fail')
        .get('/packages/nodejs-cache-fail')
        .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
        .reply(200, pkg);

      const first = await controller.resolve({ name: 'nodejs-cache-fail', version }, reply);
      expectStatus(reply, 502);
      expect(first).toMatchObject({ error: 'upstream_error' });

      clearReplyMocks(reply);
      const second = await controller.resolve({ name: 'nodejs-cache-fail', version }, reply);
      expect(second.commitHash).toBe(pkg.releases[0].platforms[0].commit_hash);
      scope.done();
    });
  });
});
