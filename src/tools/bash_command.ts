import { exec } from "child_process";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";
import { ContainerProviderEntity } from "../entities/containerProvider.entity";

const bashCommandSchema = z.object({
  command: z.string().describe("The bash command to execute."),
});

export class BashCommandTool extends BaseTool {
  constructor(
    private logger: LoggerService,
    private containerProvider: ContainerProviderEntity,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input, config) => {
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error("thread_id is required in configurable to use bash_command tool");

        const container = await this.containerProvider.provide(thread_id!);
        const { command } = bashCommandSchema.parse(input);
        this.logger.info("Tool called", "bash_command", { command });
        const response = await container.exec(command);

        if (response.exitCode !== 0) {
          return `Error (exit code ${response.exitCode}):\n${response.stderr}`;
        }
        if (response.stdout.length > 50000) {
          return `Error (output too long: ${response.stdout.length} characters).`;
        }

        return response.stdout;
      },
      {
        name: "bash_command",
        description: "Execute a bash command and return the output.",
        schema: bashCommandSchema,
      },
    );
  }
}
