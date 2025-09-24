import { DynamicStructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

// import { EngineerAgent } from "../agents/engineer.agent"; // TODO: This agent doesn't exist
import { ContainerProviderEntity } from "../entities/containerProvider.entity";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";

import { BaseTool } from "./base.tool";

const schema = z.object({
  owner: z.string().describe("Repo owner"),
  repo: z.string().describe("Repo name"),
  branch: z.string().describe("Branch name"),
  task: z.string().describe("Task to perform on the PR"),
});

export class AskEngineerTool extends BaseTool {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private containerProvider: ContainerProviderEntity,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    // const egineerAgent = new EngineerAgent(this.configService, this.logger, this.containerProvider);
    
    return tool(
      async (rawInput, config) => {
        // TODO: Implement when engineer agent is available
        throw new Error('Engineer agent not implemented yet');
      },
      {
        name: "ask_engineer",
        description: "Ask a software engineer to execute a specific coding task.",
        schema: schema,
      },
    );
  }
}
