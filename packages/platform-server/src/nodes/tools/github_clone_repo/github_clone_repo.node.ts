import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { WorkspaceNode } from '../../workspace/workspace.node';
import { GithubCloneRepoFunctionTool } from './github_clone_repo.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { SecretReferenceSchema, VariableReferenceSchema } from '../../../utils/reference-schemas';
import { ReferenceResolverService } from '../../../utils/reference-resolver.service';
import { ResolveError } from '../../../utils/references';

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
  private resolvedToken: string = '';
  constructor(@Inject(ReferenceResolverService) private readonly referenceResolver: ReferenceResolverService) {
    super();
  }

  private async resolveTokenValue(token: StaticConfigType['token']): Promise<string> {
    if (token === undefined) return '';
    try {
      const { output } = await this.referenceResolver.resolve({ token }, { basePath: '/github_clone_repo/token' });
      const resolved = output.token;
      if (resolved == null) return '';
      if (typeof resolved !== 'string') throw new Error('GithubCloneRepoNode token unresolved');
      return resolved;
    } catch (err) {
      if (err instanceof ResolveError) {
        throw new Error(`GithubCloneRepo token resolution failed: ${err.message}`);
      }
      throw err;
    }
  }

  async setConfig(cfg: StaticConfigType): Promise<void> {
    this.resolvedToken = await this.resolveTokenValue(cfg.token);
    await super.setConfig(cfg);
  }

  getResolvedToken(): string {
    return this.resolvedToken;
  }

  setContainerProvider(provider: WorkspaceNode | undefined) {
    this._containerProvider = provider;
  }
  containerProvider() {
    return this._containerProvider;
  }

  getTool(): GithubCloneRepoFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new GithubCloneRepoFunctionTool(this);
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
