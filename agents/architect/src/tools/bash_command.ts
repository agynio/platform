import { exec } from "child_process";
import { z } from "zod";
import { LoggerService } from "../logger.service";
import { tool } from "@langchain/core/tools";

export function makeBashCommandTool(logger: LoggerService) {
  return tool(
    async ({ command }) => {
      logger.info("Tool called", "bash_command", { command });
      return await new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            logger.error("bash_command error", stderr || error.message);
            return reject(stderr || error.message);
          }
          logger.info("bash_command result", stdout);
          resolve(stdout);
        });
      });
    },
    {
      name: "bash_command",
      description: "Execute a bash command and return the output.",
      schema: z.object({
        command: z.string().describe("The bash command to execute."),
      }),
    },
  );
}
