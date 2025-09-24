import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { LoggerService } from '../services/logger.service';

import { BaseTool } from './base.tool';

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX =
   
  /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

const bashCommandSchema = z.object({
  command: z.string().describe('The bash command to execute.'),
});

export class ShellTool extends BaseTool {
  private containerProvider?: ContainerProviderEntity;

  constructor(private logger: LoggerService) {
    super();
  }

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
        const container = await this.containerProvider.provide(thread_id);
        const { command } = bashCommandSchema.parse(input);
        this.logger.info('Tool called', 'shell_command', { command });
        const response = await container.exec(command);

        const cleanedStdout = this.stripAnsi(response.stdout);
        const cleanedStderr = this.stripAnsi(response.stderr);

        if (response.exitCode !== 0) {
          return `Error (exit code ${response.exitCode}):\n${cleanedStderr}`;
        }
        return cleanedStdout;
      },
      {
        name: 'shell_command',
        description: 'Execute a shell command and return the output.',
        schema: bashCommandSchema,
      },
    );
  }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    /* tool currently has no configurable runtime settings */
  }
}
