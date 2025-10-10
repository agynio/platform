import { exec } from 'child_process';
import { z } from 'zod';
import { LoggerService } from '../services/logger.service';
import { VaultService } from '../services/vault.service';
import { parseVaultRef } from '../utils/refs';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BaseTool } from './base.tool';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

const bashCommandSchema = z.object({
  command: z
    .string()
    .describe(
      'The bash command to execute. It will be wrapped with /bin/sh -lc by the system. Do not open extra shells.',
    ),
});

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
    env: z.array(EnvItemSchema).optional().describe('Environment overlay (static or Vault-backed refs).'),
    workdir: z.string().optional().describe('Working directory to use for each exec.'),
  })
  .strict();

export class ShellTool extends BaseTool {
  private containerProvider?: ContainerProviderEntity;
  private cfg?: z.infer<typeof ShellToolStaticConfigSchema>;

  constructor(private vault: VaultService | undefined, logger: LoggerService) { super(logger); }

  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
  }

  private stripAnsi(input: string): string {
    return input.replace(ANSI_REGEX, '');
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input, config) => {
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error('thread_id is required in configurable to use shell_command tool');

        if (!this.containerProvider) {
          throw new Error('ShellTool: containerProvider not set. Connect via graph edge before use.');
        }
        const container = await this.containerProvider.provide(thread_id!);
        const { command } = bashCommandSchema.parse(input);
        this.logger.info('Tool called', 'shell_command', { command });
        const envOverlay = await this.resolveEnv();
        const response = await container.exec(command, { env: envOverlay, workdir: this.cfg?.workdir });

        const cleanedStdout = this.stripAnsi(response.stdout);
        const cleanedStderr = this.stripAnsi(response.stderr);

        if (response.exitCode !== 0) {
          return `Error (exit code ${response.exitCode}):\n${cleanedStdout}\n${cleanedStderr}`;
        }
        return cleanedStdout;
      },
      {
        name: 'shell_command',
        description: 'Execute a shell command and return the output. There is no TTY/stdin, so avoid commands requiring user inputs or running in watch mode.',
        schema: bashCommandSchema,
      },
    );
  }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    const parsed = ShellToolStaticConfigSchema.safeParse(_cfg);
    if (!parsed.success) throw new Error(`Invalid Shell tool config: ${parsed.error.message}`);
    this.cfg = parsed.data;
  }

  private async resolveEnv(): Promise<Record<string, string> | undefined> {
    const items = this.cfg?.env || [];
    if (!items.length) return undefined;
    const out: Record<string, string> = {};
    for (const it of items) {
      if (!it || !it.key) continue;
      if (it.source === 'vault') {
        try {
          const vlt = this.vault;
          if (vlt?.isEnabled()) {
            const ref = parseVaultRef(it.value);
            const val = await vlt.getSecret(ref);
            if (val != null) out[it.key] = val;
          }
        } catch {
          // ignore missing/failed secrets
        }
      } else {
        out[it.key] = it.value ?? '';
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
}
