import nock from 'nock';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';

import { NixRepoController } from '../src/infra/ncps/nixRepo.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const API_BASE = 'https://api.github.com';

const createReply = (): FastifyReply => {
  const reply = {} as FastifyReply;
  Object.assign(reply, {
    code: vi.fn(() => reply),
    header: vi.fn(() => reply),
  });
  return reply;
};

const codeCalls = (reply: FastifyReply) => ((reply.code as unknown as { mock?: { calls: unknown[][] } }).mock?.calls ?? []);

describe('NixRepoController', () => {
  let controller: NixRepoController;
  let reply: FastifyReply;

  beforeEach(() => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'app',
        githubAppPrivateKey: 'key',
        githubInstallationId: 'inst',
        githubToken: 'token',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphRepoPath: './data/graph',
        graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000',
      }),
    );
    controller = new NixRepoController(cfg);
    reply = createReply();
  });

  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  it('resolves repository, default branch, and returns canonical payload', async () => {
    const repoScope = nock(API_BASE)
      .get('/repos/Owner/Repo')
      .reply(200, { full_name: 'Owner/Repo', default_branch: 'main' });
    const commitScope = nock(API_BASE)
      .get('/repos/Owner/Repo/commits/main')
      .reply(200, { sha: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12' });
    const flakeScope = nock(API_BASE)
      .get('/repos/Owner/Repo/contents/flake.nix')
      .query((q) => q.ref === 'abcdef1234567890abcdef1234567890abcdef12')
      .reply(200, 'flake contents');

    const body = await controller.resolveRepo(
      { repository: 'Owner/Repo', attr: 'packages.x86_64-linux.hello' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(200);
    expect(body).toEqual({
      repository: 'github:Owner/Repo',
      ref: 'main',
      commitHash: 'abcdef1234567890abcdef1234567890abcdef12',
      attributePath: 'packages.x86_64-linux.hello',
      flakeUri: 'github:Owner/Repo/abcdef1234567890abcdef1234567890abcdef12#packages.x86_64-linux.hello',
      attrCheck: 'skipped',
    });
    repoScope.done();
    commitScope.done();
    flakeScope.done();
  });

  it('normalizes https repository input and trims ref', async () => {
    const repoScope = nock(API_BASE)
      .get('/repos/owner/example')
      .reply(200, { full_name: 'owner/example', default_branch: 'default' });
    const commitScope = nock(API_BASE)
      .get('/repos/owner/example/commits/v1.2.3')
      .reply(200, { sha: '1234567890abcdef1234567890abcdef12345678' });
    const flakeScope = nock(API_BASE)
      .get('/repos/owner/example/contents/flake.nix')
      .query((q) => q.ref === '1234567890abcdef1234567890abcdef12345678')
      .reply(200, 'flake');

    const body = await controller.resolveRepo(
      { repository: 'https://github.com/owner/example.git', ref: ' v1.2.3 ', attr: 'packages.foo.bar' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(200);
    expect(body.ref).toBe('v1.2.3');
    expect(body.repository).toBe('github:owner/example');
    repoScope.done();
    commitScope.done();
    flakeScope.done();
  });

  it('returns 400 when repository is outside allowlist', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'app',
        githubAppPrivateKey: 'key',
        githubInstallationId: 'inst',
        githubToken: 'token',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphRepoPath: './data/graph',
        graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000',
        nixRepoAllowlist: 'allowed/repo',
      }),
    );
    controller = new NixRepoController(cfg);

    const body = await controller.resolveRepo(
      { repository: 'owner/example', attr: 'packages.ok' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(400);
    expect(body).toEqual({ error: 'repository_not_allowed', repository: 'owner/example' });
  });

  it('returns 404 when ref is missing', async () => {
    const repoScope = nock(API_BASE)
      .get('/repos/owner/example')
      .reply(200, { full_name: 'owner/example', default_branch: 'main' });
    const commitScope = nock(API_BASE)
      .get('/repos/owner/example/commits/missing')
      .reply(404, {});

    const body = await controller.resolveRepo(
      { repository: 'owner/example', ref: 'missing', attr: 'packages.foo' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(404);
    expect(body).toEqual({ error: 'ref_not_found' });
    repoScope.done();
    commitScope.done();
  });

  it('returns 409 when flake.nix is absent', async () => {
    const repoScope = nock(API_BASE)
      .get('/repos/owner/flake-less')
      .reply(200, { full_name: 'owner/flake-less', default_branch: 'main' });
    const commitScope = nock(API_BASE)
      .get('/repos/owner/flake-less/commits/main')
      .reply(200, { sha: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd' });
    const flakeScope = nock(API_BASE)
      .get('/repos/owner/flake-less/contents/flake.nix')
      .query((q) => q.ref === 'abcdefabcdefabcdefabcdefabcdefabcdefabcd')
      .reply(404, {});

    const body = await controller.resolveRepo(
      { repository: 'owner/flake-less', attr: 'packages.x86_64.bar' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(409);
    expect(body).toEqual({ error: 'non_flake_repo' });
    repoScope.done();
    commitScope.done();
    flakeScope.done();
  });

  it('maps GitHub authentication failures to 401 unauthorized_private_repo', async () => {
    const repoScope = nock(API_BASE)
      .get('/repos/owner/private')
      .reply(403, { message: 'Requires authentication' });

    const body = await controller.resolveRepo(
      { repository: 'owner/private', attr: 'packages.foo' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(401);
    expect(body).toEqual({ error: 'unauthorized_private_repo' });
    repoScope.done();
  });
});
