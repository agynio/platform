import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { Response } from 'node-fetch-native';

import { NixRepoController } from '../src/infra/ncps/nixRepo.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';

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
  let execGitMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        litellmBaseUrl: 'http://localhost:4000',
        litellmMasterKey: 'sk-test',
        graphRepoPath: './data/graph',
        graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000',
      }),
    );
    controller = new NixRepoController(cfg);
    reply = createReply();
    execGitMock = vi.spyOn(controller as unknown as { execGit: (...args: string[]) => Promise<string> }, 'execGit');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves repository, default branch, and returns canonical payload', async () => {
    mockGitSuccess(execGitMock, 'https://github.com/Owner/Repo.git', 'main', 'ABCDEF1234567890ABCDEF1234567890ABCDEF12');
    controller.setFetchImpl(async () => new Response('flake contents', { status: 200 }));

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
  });

  it('normalizes https repository input and trims ref', async () => {
    mockGitSuccess(execGitMock, 'https://github.com/owner/example.git', 'default', '1234567890ABCDEF1234567890ABCDEF12345678', {
      explicitRef: 'v1.2.3',
    });
    controller.setFetchImpl(async () => new Response('flake', { status: 200 }));

    const body = await controller.resolveRepo(
      { repository: 'https://github.com/owner/example.git', ref: ' v1.2.3 ', attr: 'packages.foo.bar' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(200);
    expect(body.ref).toBe('v1.2.3');
    expect(body.repository).toBe('github:owner/example');
  });

  it('returns 400 when repository is outside allowlist', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        litellmBaseUrl: 'http://localhost:4000',
        litellmMasterKey: 'sk-test',
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
    mockGitMissingRef(execGitMock, 'https://github.com/owner/example.git', 'main', 'missing');
    controller.setFetchImpl(async () => new Response('flake', { status: 200 }));

    const body = await controller.resolveRepo(
      { repository: 'owner/example', ref: 'missing', attr: 'packages.foo' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(404);
    expect(body).toEqual({ error: 'ref_not_found' });
  });

  it('returns 409 when flake.nix is absent', async () => {
    mockGitSuccess(execGitMock, 'https://github.com/owner/flake-less.git', 'main', 'abcdefabcdefabcdefabcdefabcdefabcdefabcd');
    controller.setFetchImpl(async () => new Response('not found', { status: 404 }));

    const body = await controller.resolveRepo(
      { repository: 'owner/flake-less', attr: 'packages.x86_64.bar' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(409);
    expect(body).toEqual({ error: 'non_flake_repo' });
  });

  it('maps GitHub authentication failures to 401 unauthorized_private_repo', async () => {
    mockGitSuccess(execGitMock, 'https://github.com/owner/private.git', 'main', 'abcdefabcdefabcdefabcdefabcdefabcdefabcd');
    controller.setFetchImpl(async () => new Response('unauthorized', { status: 403 }));

    const body = await controller.resolveRepo(
      { repository: 'owner/private', attr: 'packages.foo' },
      reply,
    );

    expect(codeCalls(reply).at(-1)?.[0]).toBe(401);
    expect(body).toEqual({ error: 'unauthorized_private_repo' });
  });
});

function mockGitSuccess(
  mock: ReturnType<typeof vi.spyOn>,
  remote: string,
  defaultBranch: string,
  commitSha: string,
  options: { explicitRef?: string } = {},
): void {
  const normalizedSha = commitSha.toLowerCase();
  const refToResolve = options.explicitRef?.trim() ?? defaultBranch;
  mock.mockImplementation(async (args: string[]) => {
    if (args[0] !== 'ls-remote') {
      throw new Error(`unexpected git command ${args.join(' ')}`);
    }
    if (args[1] === '--symref') {
      const [, , targetRemote, target] = args;
      if (targetRemote !== remote || target !== 'HEAD') {
        throw new Error('unexpected symref invocation');
      }
      return `ref: refs/heads/${defaultBranch}\tHEAD\n${normalizedSha}\tHEAD\n`;
    }
    const targetRemote = args[1];
    const pattern = args[2];
    if (targetRemote !== remote) {
      throw new Error('unexpected remote');
    }
    if (pattern === refToResolve || pattern === `refs/heads/${refToResolve}`) {
      return `${normalizedSha}\trefs/heads/${refToResolve}`;
    }
    if (pattern === `refs/tags/${refToResolve}` || pattern === `refs/tags/${refToResolve}^{}`) {
      return '';
    }
    return '';
  });
}

function mockGitMissingRef(
  mock: ReturnType<typeof vi.spyOn>,
  remote: string,
  defaultBranch: string,
  missingRef: string,
): void {
  mock.mockImplementation(async (args: string[]) => {
    if (args[0] !== 'ls-remote') {
      throw new Error('unexpected command');
    }
    if (args[1] === '--symref') {
      const [, , targetRemote, target] = args;
      if (targetRemote !== remote || target !== 'HEAD') {
        throw new Error('unexpected symref invocation');
      }
      return `ref: refs/heads/${defaultBranch}\tHEAD\n${defaultBranch}\tHEAD\n`;
    }
    const targetRemote = args[1];
    if (targetRemote !== remote) {
      throw new Error('unexpected remote');
    }
    const pattern = args[2];
    if (pattern.includes(missingRef)) {
      return '';
    }
    return '';
  });
}
