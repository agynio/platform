import { exec } from "child_process";
import { z } from "zod";
import { LoggerService } from "../logger.service";
import { tool } from "@langchain/core/tools";

export function makeWorkWithPrTool(logger: LoggerService) {
  return tool(
    async ({ command }) => {
      logger.info("Tool called", "work_with_pr", { command });
      return "Job is done";
    },
    {
      name: "work_with_pr",
      description: "Work with a pull request.",
      schema: z.object({
        owner: z.string().describe("Repo owner"),
        repo: z.string().describe("Repo name"),
        branch: z.string().describe("Branch name"),
        task: z.string().describe("Task to perform on the PR"),
      }),
    },
  );
}
