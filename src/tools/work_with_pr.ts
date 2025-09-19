import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";
import { GithubService } from "../services/github.service";
import { v4 as uuid } from "uuid";
import { EngineerAgent } from "../agents/engineer.agent";
import { ConfigService } from "../services/config.service";
import { readFileSync } from "fs";
import * as Prompts from "../prompts";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

const workWithPrSchema = z.object({
  owner: z.string().describe("Repo owner"),
  repo: z.string().describe("Repo name"),
  branch: z.string().describe("Branch name"),
  task: z.string().describe("Task to perform on the PR"),
});

export class WorkWithPrTool extends BaseTool {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private githubService: GithubService,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { owner, repo, branch, task } = workWithPrSchema.parse(input);
        this.logger.info("Tool called", "work_with_pr", { owner, repo, branch, task });

        const tmpId = uuid();
        await this.githubService.cloneRepo({
          owner,
          repo,
          branch,
          targetDir: `/tmp/${tmpId}`,
        });

        let prInstructions = "";
        try {
          prInstructions = readFileSync(`/tmp/${tmpId}/.github/copilot-instructions.md`, "utf-8");
        } catch {}

        const engineerAgnet = new EngineerAgent(this.configService, this.logger);
        const response = await engineerAgnet.create({ cwd: `/tmp/${tmpId}` }).invoke({
          messages: [
            new SystemMessage(Prompts.Engineer),
            prInstructions ? new SystemMessage(prInstructions) : null,
            new HumanMessage(
              `
              You are working with the ${owner}/${repo} repo, branch ${branch}. 
              Working directory is /tmp/${tmpId}.
              Your task is: ${task}`,
            ),
          ].filter(Boolean) as BaseMessage[],
        });

        const msg = response.messages[response.messages.length - 1].content;
        console.log({ response: msg });

        return msg;
      },
      {
        name: "work_with_pr",
        description: "Work with a pull request.",
        schema: workWithPrSchema,
      },
    );
  }
}
