import { z } from 'zod';
import { WorkspaceNode } from '../../workspace/workspace.node';
import { EnvService, type EnvItem } from '../../../../env/env.service';
import { BaseToolNode } from '../baseToolNode';
import { ShellCommandTool } from './shell_command.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../../../../core/services/logger.service';
import { ModuleRef } from '@nestjs/core';

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
    outputLimitChars: z
      .union([z.literal(0), z.number().int().positive().max(500000)])
      .default(50000)
      .describe('Maximum combined cleaned stdout+stderr length. If >0 and exceeded, output is saved to /tmp/<uuid>.txt and a short error message is returned.'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class ShellCommandNode extends BaseToolNode<z.infer<typeof ShellToolStaticConfigSchema>> {
  private containerProvider?: WorkspaceNode;
  private toolInstance?: ShellCommandTool;

  constructor(
    @Inject(EnvService) protected envService: EnvService,
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(ModuleRef) protected readonly moduleRef: ModuleRef,
  ) {
    super(logger);
  }
  getPortConfig() {
    return {
      targetPorts: {
        $self: { kind: 'instance' as const },
        workspace: { kind: 'method' as const, create: 'setContainerProvider' },
      },
    } as const;
  }

  setContainerProvider(provider: WorkspaceNode | undefined): void {
    this.containerProvider = provider;
  }

  getTool(): ShellCommandTool {
    if (!this.toolInstance) {
      const tool = this.moduleRef.create(ShellCommandTool);
      tool.init(this);
      this.toolInstance = tool;
    }
    return this.toolInstance;
  }

  async resolveEnv(base?: Record<string, string>): Promise<Record<string, string> | undefined> {
    const items: EnvItem[] = (this.config?.env || []) as EnvItem[];
    try {
      return await this.envService.resolveProviderEnv(items, undefined, base);
    } catch {
      return base && Object.keys(base).length ? { ...base } : undefined;
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

  get provider(): WorkspaceNode | undefined {
    return this.containerProvider;
  }

}
