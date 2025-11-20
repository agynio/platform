import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { WorkspaceNode } from '../../workspace/workspace.node';
import { LoggerService } from '../../../core/services/logger.service';
import { GithubCloneRepoFunctionTool } from './github_clone_repo.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { SecretReferenceSchema, VariableReferenceSchema } from '../../../utils/reference-schemas';

const TokenRefSchema = z
  .union([
    z.string().min(1),
    SecretReferenceSchema,
    VariableReferenceSchema,
  ])
  .describe("GitHub token reference. When kind='vault', provide mount/path/key.");

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
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
  }

  async setConfig(cfg: StaticConfigType): Promise<void> {
    if (cfg?.token !== undefined && typeof cfg.token !== 'string') {
      throw new Error('GithubCloneRepoNode config requires resolved token');
    }
    await super.setConfig(cfg);
  }

  setContainerProvider(provider: WorkspaceNode | undefined) {
    this._containerProvider = provider;
  }
  containerProvider() {
    return this._containerProvider;
  }

  getTool(): GithubCloneRepoFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new GithubCloneRepoFunctionTool(this.logger, this);
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
