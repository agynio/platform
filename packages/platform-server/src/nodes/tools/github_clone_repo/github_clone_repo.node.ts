import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ContainerProviderEntity } from '../../../entities/containerProvider.entity';
import { ConfigService } from '../../../core/services/config.service';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../core/services/vault.service';
import { GithubCloneRepoFunctionTool } from './github_clone_repo.tool';

const TokenRefSchema = z
  .object({ value: z.string(), source: z.enum(['static', 'vault']).optional().default('static') })
  .strict()
  .describe("GitHub token reference. When source=vault, value is '<MOUNT>/<PATH>/<KEY>'.");

export const GithubCloneRepoToolStaticConfigSchema = z
  .object({
    token: TokenRefSchema.optional(),
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

export const GithubCloneRepoToolExposedStaticConfigSchema = z
  .object({ token: TokenRefSchema.optional().meta({ 'ui:field': 'ReferenceField' }) })
  .strict();

export class GithubCloneRepoNode extends BaseToolNode {
  private _containerProvider?: ContainerProviderEntity;
  private _config?: z.infer<typeof GithubCloneRepoToolStaticConfigSchema>;
  private toolInstance?: GithubCloneRepoFunctionTool;
  constructor(
    private configService: ConfigService,
    private vault: VaultService | undefined,
    private logger: LoggerService,
  ) {
    super();
  }
  setContainerProvider(provider: ContainerProviderEntity | undefined) {
    this._containerProvider = provider;
  }
  containerProvider() {
    return this._containerProvider;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    this._config = GithubCloneRepoToolStaticConfigSchema.parse(cfg || {});
  }
  config() {
    return this._config;
  }

  getTool(): GithubCloneRepoFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new GithubCloneRepoFunctionTool(this.logger, this.configService, this.vault, this);
    }
    return this.toolInstance;
  }
}
