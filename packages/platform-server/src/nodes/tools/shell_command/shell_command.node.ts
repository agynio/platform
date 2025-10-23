import { z } from 'zod';
import { WorkspaceNode } from '../../workspace/workspace.node';
import { EnvService, type EnvItem } from '../../../services/env.service';
import { BaseToolNode } from '../baseToolNode';
import { ShellCommandTool } from './shell_command.tool';

// NOTE: ANSI stripping now handled in ShellCommandTool; keep schema exports here only.

// Static config schema for ShellTool: per-node env overlay (supports Vault refs) and optional workdir
const EnvItemSchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    source: z.enum(['static', 'vault']).optional().default('static'),
  })
  .strict()
  .describe('Environment variable entry. When source=vault, value is "<MOUNT>/<PATH>/<KEY>".');
export const ShellToolStaticConfigSchema = z
  .object({
    env: z
      .array(EnvItemSchema)
      .optional()
      .describe('Environment variables (static or vault references).')
      .meta({ 'ui:field': 'ReferenceEnvField' }),
    workdir: z.string().optional().describe('Working directory to use for each exec.'),
    executionTimeoutMs: z
      .union([z.literal(0), z.number().int().min(1000).max(86_400_000)])
      .default(60 * 60 * 1000)
      .describe('Maximum wall time for the command in milliseconds. 0 disables. Range: 1000-86400000 when enabled.'),
    idleTimeoutMs: z
      .union([z.literal(0), z.number().int().min(1000).max(86_400_000)])
      .default(60 * 1000)
      .describe('Maximum idle time (no output) in milliseconds. 0 disables. Range: 1000-86400000 when enabled.'),
  })
  .strict();

export class ShellCommandNode extends BaseToolNode {
  private containerProvider?: WorkspaceNode;
  private cfg?: z.infer<typeof ShellToolStaticConfigSchema>;
  private toolInstance?: ShellCommandTool;

  constructor(private envService: EnvService) {
    super();
  }

  setContainerProvider(provider: WorkspaceNode | undefined): void {
    this.containerProvider = provider;
  }

  getTool(): ShellCommandTool {
    if (!this.toolInstance) {
      this.toolInstance = new ShellCommandTool(this);
    }
    return this.toolInstance;
  }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    const parsed = ShellToolStaticConfigSchema.safeParse(_cfg);
    if (!parsed.success) throw new Error(`Invalid Shell tool config: ${parsed.error.message}`);
    this.cfg = parsed.data;
  }

  async resolveEnv(): Promise<Record<string, string> | undefined> {
    const items: EnvItem[] = (this.cfg?.env || []) as EnvItem[];
    if (!items.length) return undefined;
    try {
      const r = await this.envService.resolveEnvItems(items);
      return Object.keys(r).length ? r : undefined;
    } catch {
      return undefined;
    }
  }

  async getContainerForThread(threadId: string) {
    if (!this.containerProvider) return undefined;
    try {
      return await this.containerProvider.provide(threadId);
    } catch {
      return undefined;
    }
  }

  // Expose config for tool
  get config() {
    return this.cfg;
  }
  get provider() {
    return this.containerProvider;
  }
}
