import { exec } from "child_process";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";

const bashCommandSchema = z.object({
  command: z.string().describe("The bash command to execute."),
});

export class BashCommandTool extends BaseTool {
  constructor(
    private logger: LoggerService,
    private cwd: string,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { command } = bashCommandSchema.parse(input);
        this.logger.info("Tool called", "bash_command", { command });
        return await new Promise((resolve, reject) => {
          exec(command, { cwd: this.cwd }, (error, stdout, stderr) => {
            if (error) {
              this.logger.error("bash_command error", stderr || error.message);
              return resolve(stderr || error.message);
            }
            this.logger.info("bash_command result", stdout);
            resolve(stdout);
          });
        });
      },
      {
        name: "bash_command",
        description: "Execute a bash command and return the output.",
        schema: bashCommandSchema,
      },
    );
  }
}
