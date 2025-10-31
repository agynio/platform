import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NixController } from '../src/infra/ncps/nix.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const BASE = 'https://www.nixhub.io';

describe('NixController E2E (Fastify)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', githubToken: 'x', mongodbUrl: 'x',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable',
        nixHttpTimeoutMs: String(200), nixCacheTtlMs: String(5 * 60_000), nixCacheMax: String(500),
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      })
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [NixController],
      providers: [{ provide: ConfigService, useValue: cfg }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => nock.cleanAll());
  afterEach(() => nock.cleanAll());

  it('GET /api/nix/packages returns 200 and sets cache-control', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
      .reply(200, { query: 'git', total_results: 1, results: [{ name: 'git', summary: 'the fast version control system' }] });

    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/api/nix/packages?query=git' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.packages)).toBe(true);
    scope.done();
  });

  it('GET /api/nix/packages timeout returns 504', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'long')
      .delay(500)
      .reply(200, { query: 'long', total_results: 0, results: [] });

    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/api/nix/packages?query=long' });
    expect(res.statusCode).toBe(504);
    scope.done();
  });

  it('Invalid query params return 400', async () => {
    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/api/nix/packages?query=git&extra=x' });
    expect(res.statusCode).toBe(400);
  });
});

