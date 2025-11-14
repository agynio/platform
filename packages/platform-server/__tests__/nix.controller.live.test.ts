import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { NixController } from '../src/infra/ncps/nix.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';

type ResolveErrorBody = { error: string; status?: number };

const NIX_VERSIONS = ['24.11.0', '24.10.0'];

const isResolveError = (value: unknown): value is ResolveErrorBody =>
  !!value && typeof value === 'object' && 'error' in (value as Record<string, unknown>);

const getReplyStatus = (reply: FastifyReply): number | undefined => {
  const mock = reply.code as unknown as { mock?: { calls: unknown[][] } };
  const calls = mock?.mock?.calls ?? [];
  const last = calls[calls.length - 1];
  return Array.isArray(last) ? (last[0] as number | undefined) : undefined;
};

const shouldSkipResponse = (body: unknown, reply: FastifyReply, version: string): boolean => {
  if (!isResolveError(body)) return false;
  const status = typeof body.status === 'number' ? body.status : getReplyStatus(reply);
  if (body.error === 'timeout' || (body.error === 'upstream_error' && [502, 504].includes(status ?? 0))) {
    console.warn(`Skipping nix live test for nodejs@${version}: ${body.error}${status ? ` (status ${status})` : ''}`);
    return true;
  }
  return false;
};

describe('nix controller live', () => {
  let controller: NixController;

  const makeReply = () => {
    const reply = {} as FastifyReply;
    reply.code = vi.fn(() => reply) as any;
    reply.header = vi.fn(() => reply) as any;
    return reply;
  };

  beforeEach(() => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'x',
        githubAppPrivateKey: 'x',
        githubInstallationId: 'x',
        githubToken: 'x',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphStore: 'mongo',
        graphRepoPath: './data/graph',
        graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000',
        nixAllowedChannels: 'nixpkgs-unstable',
        nixHttpTimeoutMs: String(3000),
        nixCacheTtlMs: String(60_000),
        nixCacheMax: String(50),
        mcpToolsStaleTimeoutMs: '0',
        ncpsEnabled: 'false',
        ncpsUrl: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
        mongodbUrl: 'mongodb://localhost:27017',
      }),
    );
    controller = new NixController(cfg);
  });

  for (const version of NIX_VERSIONS) {
    it(`resolves nodejs@${version} from NixHub`, async () => {
      const reply = makeReply();
      let body: unknown;
      try {
        body = await controller.resolve({ name: 'nodejs', version }, reply);
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        if (/upstream_50[24]/.test(message) || message.includes('AbortError')) {
          console.warn(`Skipping nix live test for nodejs@${version}: ${message}`);
          return;
        }
        throw err;
      }
      if (shouldSkipResponse(body, reply, version)) return;
      expect(body).toBeDefined();
      if (!body || typeof body !== 'object') throw new Error('Unexpected resolve body shape');
      const resolved = body as { name: string; version: string; commitHash: string; attributePath: string };
      expect(resolved.name).toBe('nodejs');
      expect(resolved.version).toBe(version);
      expect(resolved.commitHash).toMatch(/^[0-9a-f]{40}$/);
      expect(resolved.attributePath).toContain('nodejs_24');
    });
  }
});
