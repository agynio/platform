import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { fetch as nodeFetch, Response } from 'node-fetch-native';
import { ConfigService } from '../../core/services/config.service';

const ATTRIBUTE_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
const ATTRIBUTE_PATH = new RegExp(`^(?:${ATTRIBUTE_SEGMENT.source})(?:\\.(?:${ATTRIBUTE_SEGMENT.source}))*$`);
const OWNER_REPO_IDENT = /^[A-Za-z0-9_.-]+$/;

type NormalizedRepository = { owner: string; repo: string; input: string };

@Controller('api/nix')
export class NixRepoController {
  private readonly resolveRepoQuerySchema = z
    .object({
      repository: z.string().min(1).max(400),
      ref: z.string().max(200).optional(),
      attr: z.string().min(1).max(400).regex(ATTRIBUTE_PATH),
    })
    .strict();

  private readonly timeoutMs: number;
  private readonly githubToken?: string;
  private readonly repoAllowlist: string[];
  private fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.timeoutMs = config.nixHttpTimeoutMs;
    this.githubToken = config.githubToken;
    this.repoAllowlist = (config.nixRepoAllowlist ?? []).map((entry) => entry.toLowerCase());
    this.fetchImpl = nodeFetch as unknown as typeof fetch;
  }

  setFetchImpl(fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
    this.fetchImpl = fn;
  }

  @Get('resolve-repo')
  async resolveRepo(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const parsed = this.resolveRepoQuerySchema.safeParse(query ?? {});
      if (!parsed.success) {
        reply.code(400);
        return { error: 'validation_error', details: parsed.error.issues };
      }
      const { repository, ref: rawRef, attr } = parsed.data;
      const normalized = this.normalizeRepository(repository);
      if (!normalized) {
        reply.code(400);
        return { error: 'invalid_repository' };
      }

      const repoKey = `${normalized.owner.toLowerCase()}/${normalized.repo.toLowerCase()}`;
      if (this.repoAllowlist.length > 0 && !this.repoAllowlist.includes(repoKey)) {
        reply.code(400);
        return { error: 'repository_not_allowed', repository: normalized.input };
      }

      const effectiveRef = typeof rawRef === 'string' ? rawRef.trim() : '';
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const repoInfo = await this.fetchRepo(normalized, ac.signal);
        const defaultBranch = repoInfo.default_branch || 'main';
        const targetRef = effectiveRef.length > 0 ? effectiveRef : defaultBranch;
        const commitSha = await this.resolveCommit(normalized, targetRef, ac.signal);
        await this.ensureFlakePresent(normalized, commitSha, ac.signal);

        const canonicalRepository = `github:${repoInfo.full_name}`;
        reply.code(200);
        return {
          repository: canonicalRepository,
          ref: targetRef,
          commitHash: commitSha,
          attributePath: attr,
          flakeUri: `${canonicalRepository}/${commitSha}#${attr}`,
          attrCheck: 'skipped' as const,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400);
        return { error: 'validation_error', details: err.issues };
      }
      if (err instanceof FetchErrorResponse) {
        reply.code(err.statusCode);
        return err.payload;
      }
      const isAbort = err instanceof Error && err.name === 'AbortError';
      reply.code(isAbort ? 504 : 500);
      return { error: isAbort ? 'timeout' : 'server_error' };
    }
  }

  private normalizeRepository(input: string): NormalizedRepository | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    let remainder = trimmed;
    if (remainder.startsWith('github:')) remainder = remainder.slice('github:'.length);
    else if (remainder.startsWith('https://github.com/')) remainder = remainder.slice('https://github.com/'.length);
    else if (remainder.startsWith('http://github.com/')) remainder = remainder.slice('http://github.com/'.length);
    else if (remainder.startsWith('https://www.github.com/')) remainder = remainder.slice('https://www.github.com/'.length);
    else if (remainder.startsWith('http://www.github.com/')) remainder = remainder.slice('http://www.github.com/'.length);
    else if (remainder.startsWith('github.com/')) remainder = remainder.slice('github.com/'.length);

    remainder = remainder.replace(/\.git$/i, '');
    remainder = remainder.replace(/^\/+/, '').replace(/\/+$/, '');

    const segments = remainder.split('/');
    if (segments.length !== 2) return null;
    const [owner, repo] = segments;
    if (!OWNER_REPO_IDENT.test(owner) || !OWNER_REPO_IDENT.test(repo)) return null;
    return { owner, repo, input };
  }

  private async fetchRepo(repo: NormalizedRepository, signal: AbortSignal): Promise<{ full_name: string; default_branch: string }> {
    const path = `/repos/${repo.owner}/${repo.repo}`;
    const res = await this.githubRequest(path, signal);
    if (res.status === 404) throw new FetchErrorResponse(404, { error: 'repo_not_found' });
    if (!res.ok) {
      throw new FetchErrorResponse(this.mapGithubErrorStatus(res.status), { error: 'github_error', status: res.status });
    }
    const body = await this.parseGithubJson(res);
    const fullName = typeof body?.full_name === 'string' ? body.full_name : `${repo.owner}/${repo.repo}`;
    const defaultBranch = typeof body?.default_branch === 'string' && body.default_branch.trim().length > 0 ? body.default_branch : 'main';
    return { full_name: fullName, default_branch: defaultBranch };
  }

  private async resolveCommit(repo: NormalizedRepository, ref: string, signal: AbortSignal): Promise<string> {
    const path = `/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(ref)}`;
    const res = await this.githubRequest(path, signal);
    if (res.status === 404 || res.status === 422) {
      throw new FetchErrorResponse(404, { error: 'ref_not_found' });
    }
    if (!res.ok) {
      throw new FetchErrorResponse(this.mapGithubErrorStatus(res.status), { error: 'github_error', status: res.status });
    }
    const body = await this.parseGithubJson(res);
    const sha = typeof body?.sha === 'string' ? body.sha.trim() : '';
    if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
      throw new FetchErrorResponse(502, { error: 'invalid_commit_hash' });
    }
    return sha.toLowerCase();
  }

  private async ensureFlakePresent(repo: NormalizedRepository, commitSha: string, signal: AbortSignal): Promise<void> {
    const path = `/repos/${repo.owner}/${repo.repo}/contents/flake.nix?ref=${commitSha}`;
    const res = await this.githubRequest(path, signal, true);
    if (res.status === 404) throw new FetchErrorResponse(409, { error: 'non_flake_repo' });
    if (!res.ok) {
      throw new FetchErrorResponse(this.mapGithubErrorStatus(res.status), { error: 'github_error', status: res.status });
    }
  }

  private async githubRequest(path: string, signal: AbortSignal, allowRaw = false): Promise<Response> {
    const url = new URL(path, 'https://api.github.com');
    const headers: Record<string, string> = {
      Accept: allowRaw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'User-Agent': 'hautech-agents',
    };
    if (this.githubToken) headers.Authorization = `Bearer ${this.githubToken}`;
    const res = await this.fetchImpl(url, { headers, signal });
    if ([401, 403].includes(res.status)) {
      throw new FetchErrorResponse(401, { error: 'unauthorized_private_repo' });
    }
    if (res.status >= 500) {
      throw new FetchErrorResponse(502, { error: 'github_error', status: res.status });
    }
    return res;
  }

  private async parseGithubJson(res: Response): Promise<Record<string, unknown>> {
    try {
      const json = (await res.json()) as Record<string, unknown>;
      return json ?? {};
    } catch (_err) {
      throw new FetchErrorResponse(502, { error: 'bad_github_json' });
    }
  }

  private mapGithubErrorStatus(status: number): number {
    if (status >= 500) return 502;
    if (status === 401 || status === 403) return 401;
    if (status === 404) return 404;
    return 500;
  }
}

class FetchErrorResponse extends Error {
  constructor(public readonly statusCode: number, public readonly payload: Record<string, unknown>) {
    super(payload?.error ? String(payload.error) : 'fetch_error');
  }
}
