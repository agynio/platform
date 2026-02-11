import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { fetch as nodeFetch, Response } from 'node-fetch-native';
import { execFile } from 'node:child_process';
import { ConfigService } from '../../core/services/config.service';

const ATTRIBUTE_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
const ATTRIBUTE_PATH = new RegExp(`^(?:${ATTRIBUTE_SEGMENT.source})(?:\\.(?:${ATTRIBUTE_SEGMENT.source}))*$`);
const OWNER_REPO_IDENT = /^[A-Za-z0-9_.-]+$/;

type NormalizedRepository = { owner: string; repo: string; input: string };
type ResolveRepoPayload = {
  repository: string;
  ref: string;
  commitHash: string;
  attributePath: string;
  flakeUri: string;
  attrCheck: 'skipped';
};

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
  private readonly repoAllowlist: string[];
  private fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.timeoutMs = config.nixHttpTimeoutMs;
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

      const resolution = await this.performRepositoryResolution(normalized, attr, rawRef);
      reply.code(200);
      return resolution;
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

  private async performRepositoryResolution(
    normalized: NormalizedRepository,
    attr: string,
    rawRef: string | undefined,
  ): Promise<ResolveRepoPayload> {
    const effectiveRef = typeof rawRef === 'string' ? rawRef.trim() : '';
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const targetRef = await this.resolveTargetRef(normalized, effectiveRef, ac.signal);
      const commitSha = await this.resolveCommitSha(normalized, targetRef, ac.signal);
      await this.ensureFlakePresent(normalized, commitSha, ac.signal);
      const canonicalRepository = `github:${normalized.owner}/${normalized.repo}`;
      return {
        repository: canonicalRepository,
        ref: targetRef,
        commitHash: commitSha,
        attributePath: attr,
        flakeUri: `${canonicalRepository}/${commitSha}#${attr}`,
        attrCheck: 'skipped',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveTargetRef(
    normalized: NormalizedRepository,
    effectiveRef: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (effectiveRef) {
      return effectiveRef;
    }
    const defaultBranch = await this.determineDefaultBranch(normalized, signal);
    return defaultBranch;
  }

  private async resolveCommitSha(
    normalized: NormalizedRepository,
    targetRef: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (/^[0-9a-f]{40}$/i.test(targetRef)) {
      return targetRef.toLowerCase();
    }
    return this.resolveGitReference(normalized, targetRef, signal);
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

  private async determineDefaultBranch(repo: NormalizedRepository, signal: AbortSignal): Promise<string> {
    try {
      const stdout = await this.execGit(['ls-remote', '--symref', this.buildGitRemote(repo), 'HEAD'], signal);
      const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('ref:')) continue;
        const [refPart, headPart] = line.split('\t');
        if (headPart !== 'HEAD') continue;
        const match = /^ref:\s+refs\/heads\/(.+)$/.exec(refPart);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
      const headLine = lines.find((line) => /\bHEAD$/.test(line));
      if (headLine) {
        const inferred = headLine.split('\t')[1];
        if (inferred) return inferred.trim();
      }
    } catch (error) {
      if (error instanceof GitCommandError) {
        this.handleGitRepositoryError(error);
      }
      throw error;
    }
    return 'main';
  }

  private async resolveGitReference(repo: NormalizedRepository, ref: string, signal: AbortSignal): Promise<string> {
    const patterns = this.buildRefPatterns(ref);
    for (const pattern of patterns) {
      const sha = await this.resolvePatternSha(repo, pattern, signal);
      if (sha) {
        return sha;
      }
    }
    throw new FetchErrorResponse(404, { error: 'ref_not_found' });
  }

  private async resolvePatternSha(
    repo: NormalizedRepository,
    pattern: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      const stdout = await this.execGit(['ls-remote', this.buildGitRemote(repo), pattern], signal);
      const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) {
        return null;
      }
      const parsed = lines
        .map((line) => {
          const [sha, ref] = line.split(/\s+/);
          if (!sha || !ref || !/^[0-9a-fA-F]{40}$/.test(sha)) {
            return null;
          }
          return { sha: sha.toLowerCase(), ref };
        })
        .filter((entry): entry is { sha: string; ref: string } => entry !== null);

      if (parsed.length === 0) {
        return null;
      }

      const peeled = parsed.find((entry) => entry.ref.endsWith('^{}'));
      if (peeled) {
        return peeled.sha;
      }

      return parsed[0]?.sha ?? null;
    } catch (error) {
      if (error instanceof GitCommandError) {
        this.handleGitRepositoryError(error);
      }
      throw error;
    }
  }

  private buildRefPatterns(ref: string): string[] {
    const trimmed = ref.trim();
    if (!trimmed) return ['HEAD'];
    if (trimmed.startsWith('refs/')) return [trimmed];
    const annotatedTag = `refs/tags/${trimmed}` + '^{}';
    const patterns = [
      trimmed,
      `refs/heads/${trimmed}`,
      `refs/tags/${trimmed}`,
      annotatedTag,
    ];
    return patterns;
  }

  private buildGitRemote(repo: NormalizedRepository): string {
    return `https://github.com/${repo.owner}/${repo.repo}.git`;
  }

  private async ensureFlakePresent(repo: NormalizedRepository, commitSha: string, signal: AbortSignal): Promise<void> {
    const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${commitSha}/flake.nix`;
    const res = await this.fetchImpl(rawUrl, {
      headers: {
        'User-Agent': 'hautech-agents',
      },
      signal,
    });
    if (res.status === 404) {
      throw new FetchErrorResponse(409, { error: 'non_flake_repo' });
    }
    if (res.status === 401 || res.status === 403) {
      throw new FetchErrorResponse(401, { error: 'unauthorized_private_repo' });
    }
    if (res.status >= 500) {
      throw new FetchErrorResponse(502, { error: 'github_error', status: res.status });
    }
    if (!res.ok) {
      throw new FetchErrorResponse(500, { error: 'github_error', status: res.status });
    }
    // Fully consume body to allow caller reuse of socket pool.
    await res.arrayBuffer();
  }

  private async execGit(args: string[], signal: AbortSignal): Promise<string> {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    return new Promise((resolve, reject) => {
      execFile('git', args, { signal, env, windowsHide: true, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const abortName = (error as Error).name;
          const abortCode = (error as NodeJS.ErrnoException).code;
          if (abortName === 'AbortError' || abortCode === 'ABORT_ERR') {
            reject(error);
            return;
          }
          const execError = error as NodeJS.ErrnoException;
          const exitCode = typeof execError.code === 'number' ? execError.code : null;
          reject(new GitCommandError(exitCode, stdout, stderr));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private handleGitRepositoryError(error: GitCommandError): never {
    const stderr = error.stderr?.toLowerCase() ?? '';
    if (/repository\s+not\s+found/.test(stderr) || /not\s+found/.test(stderr)) {
      throw new FetchErrorResponse(404, { error: 'repo_not_found' });
    }
    if (/access\s+denied/.test(stderr) || /authentication\s+failed/.test(stderr) || /could\s+not\s+read\s+Username/.test(stderr)) {
      throw new FetchErrorResponse(401, { error: 'unauthorized_private_repo' });
    }
    throw new FetchErrorResponse(502, { error: 'github_error', status: 502 });
  }
}

class GitCommandError extends Error {
  constructor(
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super('git_command_failed');
  }
}

class FetchErrorResponse extends Error {
  constructor(public readonly statusCode: number, public readonly payload: Record<string, unknown>) {
    super(payload?.error ? String(payload.error) : 'fetch_error');
  }
}
