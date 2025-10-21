import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { ContainerProviderEntity } from '../../../entities/containerProvider.entity';
import { ConfigService } from '../../../services/config.service';
import { LoggerService } from '../../../services/logger.service';
import { VaultService, type VaultRef } from '../../../services/vault.service';
import { parseVaultRef } from '../../../utils/refs';

export const githubCloneSchema = z
  .object({
    owner: z.string().min(1).describe('GitHub organization or user that owns the repository.'),
    repo: z.string().min(1).describe('Repository name (without .git).'),
    path: z.string().min(1).describe('Destination directory path inside the container.'),
    branch: z.string().optional().describe('Optional branch or tag to checkout.'),
    depth: z.number().int().positive().optional().describe('Shallow clone depth (omit for full clone).'),
    thread_id: z.string().min(1).describe('Workspace thread id where clone should run.'),
  })
  .strict();

interface GithubCloneFunctionToolDeps {
  containerProvider?: ContainerProviderEntity;
  logger: LoggerService;
  config: ConfigService;
  vault?: VaultService;
  getStaticConfig: () => any;
}

export class GithubCloneRepoFunctionTool extends FunctionTool<typeof githubCloneSchema> {
  constructor(private deps: GithubCloneFunctionToolDeps) {
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
    const staticCfg = this.deps.getStaticConfig();
    const tokenRef = staticCfg?.token;
    const authRef = staticCfg?.authRef as any; // legacy optional
    // Preferred new token field
    if (tokenRef) {
      if (tokenRef.source === 'vault') {
        const vlt = this.deps.vault;
        if (vlt?.isEnabled()) {
          try {
            const vr = parseVaultRef(tokenRef.value);
            const token = await vlt.getSecret(vr);
            if (token) return token;
          } catch {}
        }
      } else if (tokenRef.value) return tokenRef.value;
    }
    // Legacy path
    if (authRef) {
      if (authRef.source === 'env') {
        const name = authRef.envVar || 'GH_TOKEN';
        const v = process.env[name] || '';
        if (v) return v;
      } else {
        const vlt = this.deps.vault;
        if (vlt?.isEnabled()) {
          const vr: VaultRef = {
            mount: (authRef.mount || 'secret').replace(/\/$/, ''),
            path: authRef.path || 'github',
            key: authRef.key || 'GH_TOKEN',
          };
          try {
            const token = await vlt.getSecret(vr);
            if (token) return token;
          } catch {}
        }
      }
    }
    // Fallback to config service
    return this.deps.config.githubToken;
  }

  async execute(args: z.infer<typeof githubCloneSchema>): Promise<string> {
    const { owner, repo, path, branch, depth, thread_id } = args;
    const provider = this.deps.containerProvider;
    if (!provider)
      throw new Error('GithubCloneRepoTool: containerProvider not set. Connect via graph edge before use.');
    const container = await provider.provide(thread_id);
    this.deps.logger.info('Tool called', 'github_clone_repo', { owner, repo, path, branch, depth });
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
