import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { WorkspaceNode } from '../../workspace/workspace.node';
import { ConfigService } from '../../../core/services/config.service';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../vault/vault.service';
import { GithubCloneRepoFunctionTool } from './github_clone_repo.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

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

type StaticConfigType = z.infer<typeof GithubCloneRepoToolStaticConfigSchema>;

@Injectable({ scope: Scope.TRANSIENT })
export class GithubCloneRepoNode extends BaseToolNode<StaticConfigType> {
  private _containerProvider?: WorkspaceNode;

  private toolInstance?: GithubCloneRepoFunctionTool;
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(VaultService) private vault: VaultService | undefined,
    @Inject(LoggerService) private logger: LoggerService,
  ) {
    super();
  }

  setContainerProvider(provider: WorkspaceNode | undefined) {
    this._containerProvider = provider;
  }
  containerProvider() {
    return this._containerProvider;
  }

  getTool(): GithubCloneRepoFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new GithubCloneRepoFunctionTool(this.logger, this.configService, this.vault, this);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return {
      targetPorts: {
        $self: { kind: 'instance' },
        workspace: { kind: 'method', create: 'setContainerProvider' },
      },
    } as const;
  }
}
