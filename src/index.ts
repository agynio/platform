import * as fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { ConfigService } from "./services/config.service";
import { ArchitectAgent } from "./agents/architect.agent";
import { LoggerService } from "./services/logger.service";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const __dirname = dirname(fileURLToPath(import.meta.url));

const configService = ConfigService.fromEnv();
const loggerService = new LoggerService();
const architectAgent = new ArchitectAgent(configService, loggerService);

const agent = architectAgent.create();

const Instructions = fs.readFileSync(`${__dirname}/instructions.md`, "utf-8");

const response = await agent.invoke(
  {
    messages: [
      new SystemMessage(Instructions),
      new HumanMessage(
        // "Analyze code of all cloned repos and create documentation. Check every file. Understand logic inside and reason why it was created. Understand and record internal logic of projects and relation between them. Iterate until all repos are fully documented.",
        // "Analyze code of core-api and find how operations are created from the pipeline",
        // "Analyze code of core-api (document all findings on the way). 1. Find what happens when workflow is executed. It should be the following process: workflow->pipeline->operation->resource. 2. Understand how all these entities are created. 3. Find how perrmissions attachment for resources is implemented. 4. Describe task for engineer to implement proper attachment of permissions: resource to operation, operation to pipeline, pipeline to workflow. So when workflow is shared to another user access to all produced resources will be shared automatically.",
        // "Use docs as the first source and analyze code to double check facts and find missing infromation (document all findings on the way). We have multiple instances of Studio running as whitelabel. One of the clients wants specific metrics code to be included in their version on front end. We want to make it configurable so every time they want to change it doesn't involve us and redeployment of the platform. What are the options to implement it?",
        "Use docs as the first source and analyze code to double check facts and find missing infromation (document all findings on the way). We would like to let users to create custom models (ethnicities) and backgrounds in studio available only for them. Describe task for engineers.",
      ),
    ],
  },
  { recursionLimit: 250 },
);

const last = response.messages[response.messages.length - 1];
console.log(last.content);
