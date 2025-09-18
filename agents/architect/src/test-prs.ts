import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";
import { GithubService } from "./github.service";
import { PRService } from "./pr.service";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const githubService = new GithubService(configService);
const prService = new PRService(githubService);

const owner = "HautechAI";
const repo = "liana";

const myPrs = await githubService.listAssignedOpenPullRequestsForRepo(owner, repo);
const prInfo = await prService.getPRInfo(owner, repo, myPrs[0].number);

console.log("PR Info:", prInfo);