import { EngineeringAgent } from "./agents/engineering.agent";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ConfigService } from "./services/config.service";
import { GithubService } from "./services/github.service";
import { LoggerService } from "./services/logger.service";
import { PRService } from "./services/pr.service";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const githubService = new GithubService(configService);
const prService = new PRService(githubService);
const engineeringAgent = new EngineeringAgent(configService, logger);

const owner = "HautechAI";
const repo = "liana";

const myPrs = await githubService.listAssignedOpenPullRequestsForRepo(owner, repo);
const prInfo = await prService.getPRInfo(owner, repo, myPrs[0].number);

console.log("PR Info:", prInfo);

const Instructions = `
You are Soren Wilde - Engineering Manager. You role is to review PRs, manage high standard of work execution, make sure engineering team delivers high quality code and executes tasks according to the task definition.
- Make sure that code is implemented according to the task definition. If you see that task is not properly implemented, request changes and provide detailed explanation what is missing and how it should be implemented.
- Make sure all checks (linter, tests, e2e tests) are passing. If not, request changes and provide detailed explanation what is missing.
- Make sure all change requests from other reviewers are addressed. If not, request changes and provide detailed explanation what is missing.

You submit tasks to engineers via work_with_pr tool.
`;

const response = await engineeringAgent.create().invoke(
  {
    messages: [
      new SystemMessage(Instructions),
      new HumanMessage("Here is the PR info:\n" + JSON.stringify(prInfo, null, 2)),
    ],
  },
  { recursionLimit: 250 },
);

const last = response.messages[response.messages.length - 1];
console.log(last);
