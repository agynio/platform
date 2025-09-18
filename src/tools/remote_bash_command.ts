import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { CodespaceSSHService } from "../services/codespace-ssh.service";
import { BaseTool } from "./base.tool";

const remoteBashCommandSchema = z.object({
  command: z.string().describe("The bash command to execute."),
});

export class RemoteBashCommandTool extends BaseTool {
  constructor(
    private logger: LoggerService,
    private ssh: CodespaceSSHService,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { command } = remoteBashCommandSchema.parse(input);
        this.logger.info("Tool called", "bash_command", { command });
        const response = await this.ssh.run(command);
        this.logger.info("bash_command result", response.stdout);
        return response;
      },
      {
        name: "bash_command",
        description: "Execute a bash command and return the output.",
        schema: remoteBashCommandSchema,
      },
    );
  }
}
