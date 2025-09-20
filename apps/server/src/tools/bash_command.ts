import { exec } from 'child_process';
import { z } from 'zod';
import { LoggerService } from '../services/logger.service';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BaseTool } from './base.tool';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

const bashCommandSchema = z.object({
  command: z.string().describe('The bash command to execute.'),
});

export class BashCommandTool extends BaseTool {
  constructor(
    private logger: LoggerService,
    private containerProvider: ContainerProviderEntity,
  ) {
    super();
  }

  private stripAnsi(input: string): string {
    return input.replace(ANSI_REGEX, '');
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input, config) => {
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error('thread_id is required in configurable to use bash_command tool');

        const container = await this.containerProvider.provide(thread_id!);
        const { command } = bashCommandSchema.parse(input);
        this.logger.info('Tool called', 'bash_command', { command });
        const response = await container.exec(command);

        const cleanedStdout = this.stripAnsi(response.stdout);
        const cleanedStderr = this.stripAnsi(response.stderr);

        if (response.exitCode !== 0) {
          return `Error (exit code ${response.exitCode}):\n${cleanedStderr}`;
        }
        if (cleanedStdout.length > 50000) {
          return `Error (output too long: ${cleanedStdout.length} characters).`;
        }

        return cleanedStdout;
      },
      {
        name: 'bash_command',
        description: 'Execute a bash command and return the output.',
        schema: bashCommandSchema,
      },
    );
  }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    /* tool currently has no configurable runtime settings */
  }
}
