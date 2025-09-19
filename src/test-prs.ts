import { EngineeringAgent } from "./agents/engineering.agent";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ConfigService } from "./services/config.service";
import { GithubService } from "./services/github.service";
import { LoggerService } from "./services/logger.service";
import { PRService } from "./services/pr.service";

import * as Promps from "./prompts";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const githubService = new GithubService(configService);
const prService = new PRService(githubService);
const engineeringAgent = new EngineeringAgent(configService, logger, githubService);

const owner = "HautechAI";
const repo = "liana";

const myPrs = await githubService.listAssignedOpenPullRequestsForRepo(owner, repo);
const prInfo = await prService.getPRInfo(owner, repo, 179);

console.log("PR Info:", prInfo);

const response = await engineeringAgent.create().invoke(
  {
    messages: [
      new SystemMessage(Promps.EngineeringManager),
      new HumanMessage("Here is the PR info:\n" + JSON.stringify(prInfo, null, 2)),
    ],
  },
  { recursionLimit: 250 },
);

const last = response.messages[response.messages.length - 1];
console.log(last);
