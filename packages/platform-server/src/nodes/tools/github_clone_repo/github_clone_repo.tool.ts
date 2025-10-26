import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
import { ConfigService } from '../../../core/services/config.service';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService, type VaultRef } from '../../../vault/vault.service';
import { parseVaultRef } from '../../../utils/refs';
import { GithubCloneRepoNode } from './github_clone_repo.node';

export const githubCloneSchema = z
  .object({
    owner: z.string().min(1).describe('GitHub organization or user that owns the repository.'),
    repo: z.string().min(1).describe('Repository name (without .git).'),
    path: z.string().min(1).describe('Destination directory path inside the container.'),
    branch: z.union([z.string(), z.null()]).describe('Optional branch or tag to checkout.'),
    depth: z.union([z.number().int().positive(), z.null()]).describe('Shallow clone depth (omit for full clone).'),
  })
  .strict();

export class GithubCloneRepoFunctionTool extends FunctionTool<typeof githubCloneSchema> {
  constructor(
    private logger: LoggerService,
    private configService: ConfigService,
    private vault: VaultService | undefined,
    private node: GithubCloneRepoNode,
  ) {
    super();
  }
  get name() {
    return 'github_clone_repo';
  }
  get schema() {
    return githubCloneSchema;
  }
  get description() {
    return 'Clone a GitHub repository into the running container at the specified path using authenticated HTTPS.';
  }

  private async resolveToken(): Promise<string> {
    const staticCfg = this.node.config;
    const tokenRef = staticCfg?.token;

    // Preferred new token field
    if (tokenRef) {
      if (tokenRef.source === 'vault') {
        const vlt = this.vault;
        if (vlt?.isEnabled()) {
          try {
            const vr = parseVaultRef(tokenRef.value);
            const token = await vlt.getSecret(vr);
            if (token) return token;
          } catch {}
        }
      } else if (tokenRef.value) return tokenRef.value;
    }
    return '';
  }

  async execute(args: z.infer<typeof githubCloneSchema>, ctx: LLMContext): Promise<string> {
    const { owner, repo, path, branch, depth } = args;
    const provider = this.node.containerProvider();
    if (!provider)
      throw new Error('GithubCloneRepoTool: containerProvider not set. Connect via graph edge before use.');
    const container = await provider.provide(ctx.threadId);
    this.logger.info('Tool called', 'github_clone_repo', { owner, repo, path, branch, depth });
    const token = await this.resolveToken();
    const username = 'oauth2';
    const encodedUser = encodeURIComponent(username);
    const encodedToken = encodeURIComponent(token);
    const url = `https://${encodedUser}:${encodedToken}@github.com/${owner}/${repo}.git`;
    const quote = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;
    const parts: string[] = [];
    parts.push('set -e');
    parts.push(`mkdir -p ${quote(path)} && rmdir ${quote(path)} || true`);
    let cloneCmd = 'git clone';
    if (depth) cloneCmd += ` --depth ${depth}`;
    if (branch) cloneCmd += ` -b ${branch}`;
    cloneCmd += ` ${quote(url)} ${quote(path)}`;
    parts.push(cloneCmd);
    const fullCommand = parts.join(' && ');
    const result = await container.exec(fullCommand, { timeoutMs: 5 * 60 * 1000 });
    if (result.exitCode !== 0) {
      return JSON.stringify({
        success: false,
        message: `Failed to clone ${owner}/${repo} (exit ${result.exitCode})`,
        stderr: result.stderr,
        stdout: result.stdout,
      });
    }
    return JSON.stringify({ success: true, message: `Cloned ${owner}/${repo} into ${path}`, stdout: result.stdout });
  }
}
