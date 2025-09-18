import { ConfigService } from "./services/config.service";
import { LoggerService } from "./services/logger.service";
import { ConflictAgent } from "./agents/conflict.agent";
import { SystemMessage } from "@langchain/core/messages";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const conflictAgent = new ConflictAgent(configService, logger);

const agent = conflictAgent.create();

await agent.invoke(
  {
    messages: [
      new SystemMessage(`You are software engineer. Use bash_command to resolve merge conflicts with the main branch.`),
    ],
  },
  { recursionLimit: 250 },
);
