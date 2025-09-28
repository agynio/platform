import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { BaseTool } from './base.tool';

const githubCloneSchema = z.object({
  owner: z.string().min(1).describe('GitHub organization or user that owns the repository.'),
  repo: z.string().min(1).describe('Repository name (without .git).'),
  path: z.string().min(1).describe('Destination directory path inside the container where the repo will be cloned.'),
  branch: z.string().optional().describe('Optional branch or tag to checkout.'),
  depth: z.number().int().positive().optional().describe('Shallow clone depth (omit for full clone).'),
});

export const GithubCloneRepoToolStaticConfigSchema = z.object({}).strict();

export class GithubCloneRepoTool extends BaseTool {
  private containerProvider?: ContainerProviderEntity;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
  }

  private maskToken(s: string, token: string): string {
    if (!token) return s;
    const safe = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(safe, 'g');
    return s.replace(re, '***');
  }

  init(): DynamicStructuredTool {
    return tool(
      async (rawInput, config) => {
        const input = githubCloneSchema.parse(rawInput);
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error('thread_id is required in config.configurable');

        if (!this.containerProvider) {
          throw new Error('GithubCloneRepoTool: containerProvider not set. Connect via graph edge before use.');
        }
        const container = await this.containerProvider.provide(thread_id);

        const { owner, repo, path, branch, depth } = input;
        this.logger.info('Tool called', 'github_clone_repo', { owner, repo, path, branch, depth });

        const token = this.config.githubToken;
        const username = 'oauth2';
        const encodedUser = encodeURIComponent(username);
        const encodedToken = encodeURIComponent(token);
        const authUrl = `https://${encodedUser}:${encodedToken}@github.com/${owner}/${repo}.git`;

        const q = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;

        const parts: string[] = [];
        parts.push('set -e');
        parts.push(`mkdir -p ${q(path)} && rmdir ${q(path)} || true`);

        let cloneCmd = 'git clone';
        if (depth) cloneCmd += ` --depth ${depth}`;
        if (branch) cloneCmd += ` -b ${q(branch)}`;
        cloneCmd += ` ${q(authUrl)} ${q(path)}`;
        parts.push(cloneCmd);

        const fullCommand = parts.join(' && ');
        const result = await container.exec(fullCommand, { timeoutMs: 5 * 60 * 1000 });

        const maskedStdout = this.maskToken(result.stdout || '', token);
        const maskedStderr = this.maskToken(result.stderr || '', token);

        if (result.exitCode !== 0) {
          return {
            success: false,
            message: `Failed to clone ${owner}/${repo} (exit ${result.exitCode})`,
            stderr: maskedStderr,
            stdout: maskedStdout,
          };
        }
        return {
          success: true,
          message: `Cloned ${owner}/${repo} into ${path}`,
          stdout: maskedStdout,
        };
      },
      {
        name: 'github_clone_repo',
        description:
          'Clone a GitHub repository into the running container at the specified path using authenticated HTTPS.',
        schema: githubCloneSchema,
      },
    );
  }
}
