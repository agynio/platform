import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { VaultService, type VaultRef } from '../services/vault.service';
import { BaseTool } from './base.tool';
import { parseVaultRef } from '../utils/refs';

// Schema for cloning a GitHub repository inside a running container
const githubCloneSchema = z.object({
  owner: z.string().min(1).describe('GitHub organization or user that owns the repository.'),
  repo: z.string().min(1).describe('Repository name (without .git).'),
  path: z.string().min(1).describe('Destination directory path inside the container where the repo will be cloned.'),
  branch: z.string().optional().describe('Optional branch or tag to checkout.'),
  depth: z.number().int().positive().optional().describe('Shallow clone depth (omit for full clone).'),
});

// Internal static config schema: supports new token shape and legacy authRef
const TokenRefSchema = z
  .object({ value: z.string(), source: z.enum(['static', 'vault']).optional().default('static') })
  .strict()
  .describe("GitHub token reference. When source=vault, value is '<MOUNT>/<PATH>/<KEY>'.");

export const GithubCloneRepoToolStaticConfigSchema = z
  .object({
    token: TokenRefSchema.optional(),
    // legacy
    authRef: z
      .object({
        source: z.enum(['env', 'vault']).describe('Token source override'),
        envVar: z.string().optional().describe('When source=env, name of env var'),
        mount: z.string().optional().describe('When source=vault, KV mount (default secret)'),
        path: z.string().optional().describe('When source=vault, secret path'),
        key: z.string().optional().describe('When source=vault, key within secret (default GH_TOKEN)'),
      })
      .optional(),
  })
  .strict();

// Exposed schema for UI/templates: advertise only the new token field
export const GithubCloneRepoToolExposedStaticConfigSchema = z
  .object({ token: TokenRefSchema.optional().meta({ 'ui:field': 'ReferenceField' }) })
  .strict();

export class GithubCloneRepoTool extends BaseTool {
  private containerProvider?: ContainerProviderEntity;
  private authRef?: z.infer<typeof GithubCloneRepoToolStaticConfigSchema>['authRef'];
  private token?: z.infer<typeof TokenRefSchema>;

  constructor(
    private config: ConfigService,
    private vault: VaultService | undefined,
    logger: LoggerService,
  ) {
    super(logger);
  }

  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
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
        // Redact sensitive details
        this.logger.info('Tool called', 'github_clone_repo', { owner, repo, path, branch, depth, auth: this.authRef?.source || 'default' });

        // Prepare auth URL. GitHub allows using just the token as the username segment
        // but we follow the requested pattern: username:token.
        // We'll use "oauth2" as a conventional username placeholder.
        const token = await this.resolveToken();
        const username = 'oauth2';
        const encodedUser = encodeURIComponent(username);
        const encodedToken = encodeURIComponent(token);
        const url = `https://${encodedUser}:${encodedToken}@github.com/${owner}/${repo}.git`;

        // Safe quoting for path (basic) - wrap in single quotes and escape existing ones.
        const quote = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;

        const parts: string[] = [];
        parts.push('set -e');
        // Optionally remove existing dir

        // Ensure parent dir exists
        parts.push(`mkdir -p ${quote(path)} && rmdir ${quote(path)} || true`); // remove empty just created to allow clone create

        const cloneArgs: string[] = ['git', 'clone'];
        if (depth) cloneArgs.push(`--depth", "${depth}`); // We'll build as string instead for simplicity

        let cloneCmd = 'git clone';
        if (depth) cloneCmd += ` --depth ${depth}`;
        if (branch) cloneCmd += ` -b ${branch}`;
        cloneCmd += ` ${quote(url)} ${quote(path)}`;
        parts.push(cloneCmd);

        const fullCommand = parts.join(' && ');
        const result = await container.exec(fullCommand, { timeoutMs: 5 * 60 * 1000 });

        if (result.exitCode !== 0) {
          return {
            success: false,
            message: `Failed to clone ${owner}/${repo} (exit ${result.exitCode})`,
            stderr: result.stderr,
            stdout: result.stdout,
          };
        }
        return {
          success: true,
          message: `Cloned ${owner}/${repo} into ${path}`,
          stdout: result.stdout,
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

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    const parsed = GithubCloneRepoToolStaticConfigSchema.parse(_cfg || {});
    this.authRef = parsed.authRef;
    this.token = parsed.token;
  }

  private async resolveToken(): Promise<string> {
    // Preferred: token field
    if (this.token) {
      if (this.token.source === 'vault') {
        const vlt = this.vault;
        if (vlt && vlt.isEnabled()) {
          try {
            const vr = parseVaultRef(this.token.value);
            const token = await vlt.getSecret(vr);
            if (token) return token;
          } catch {
            // ignore and continue fallbacks
          }
        }
      } else if (typeof this.token.value === 'string' && this.token.value) {
        return this.token.value;
      }
    }

    // Legacy: authRef
    const ref = this.authRef;
    if (ref) {
      if (ref.source === 'env') {
        const name = ref.envVar || 'GH_TOKEN';
        const v = process.env[name] || '';
        if (v) return v;
      } else {
        const vlt = this.vault;
        if (vlt && vlt.isEnabled()) {
          const vr: VaultRef = {
            mount: (ref.mount || 'secret').replace(/\/$/, ''),
            path: ref.path || 'github',
            key: ref.key || 'GH_TOKEN',
          };
          try {
            const token = await vlt.getSecret(vr);
            if (token) return token;
          } catch {
            // ignore and continue fallbacks
          }
        }
      }
    }

    // Fallback to ConfigService
    return this.config.githubToken;
  }
}
