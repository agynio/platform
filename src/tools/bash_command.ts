import { exec } from "child_process";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";
import { ContainerEntity } from "../services/container.service";

const bashCommandSchema = z.object({
  command: z.string().describe("The bash command to execute."),
});

export class BashCommandTool extends BaseTool {
  constructor(
    private logger: LoggerService,
    private container: ContainerEntity,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { command } = bashCommandSchema.parse(input);
        this.logger.info("Tool called", "bash_command", { command });
        const response = await this.container.exec(command);
        if (response.exitCode !== 0) {
          return `Error (exit code ${response.exitCode}):\n${response.stderr}`;
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
