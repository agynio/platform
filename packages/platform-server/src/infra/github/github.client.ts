import { Inject, Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { ConfigService } from "../../core/services/config.service";

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private octokit?: Octokit;
  private personalOctokit?: Octokit;

  constructor(
    @Inject(ConfigService) private config: ConfigService,
  ) {
    if (!this.isEnabled()) {
      this.logger.log("GithubService: integration disabled (no credentials)");
    }
  }

  isEnabled(): boolean {
    const appOk = !!(this.config.githubAppId && this.config.githubAppPrivateKey && this.config.githubInstallationId);
    const tokenOk = !!this.config.githubToken;
    return appOk || tokenOk;
  }

  private ensureInitialized(kind: 'app' | 'token'): void {
    if (!this.isEnabled()) {
      throw new Error('GitHub integration is disabled: no credentials configured');
    }
    if (kind === 'app') {
      if (!this.octokit) {
        const appId = this.config.githubAppId;
        const privateKey = this.config.githubAppPrivateKey;
        const installationId = this.config.githubInstallationId;
        if (!appId || !privateKey || !installationId) {
          throw new Error('GitHub integration is disabled: missing App credentials');
        }
        this.octokit = new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId,
            privateKey,
            installationId,
          },
        });
        this.logger.log("GithubService: initialized App Octokit");
      }
    } else {
      if (!this.personalOctokit) {
        const token = this.config.githubToken;
        if (!token) throw new Error('GitHub integration is disabled: missing personal access token');
        this.personalOctokit = new Octokit({ auth: token });
        this.logger.log("GithubService: initialized PAT Octokit");
      }
    }
  }

  async fetchPullRequestComments(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: comments } = await this.octokit!.rest.issues.listComments({
      owner,
      repo,
      issue_number: pull_number,
    });
    return comments;
  }

  async fetchPullRequestEvents(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: events } = await this.octokit!.rest.issues.listEvents({
      owner,
      repo,
      issue_number: pull_number,
      per_page: 10000,
    });
    return events;
  }

  async fetchPullRequestReviewComments(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: comments } = await this.octokit!.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number,
    });
    return comments;
  }

  async fetchPullRequestReviews(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: reviews } = await this.octokit!.rest.pulls.listReviews({
      owner,
      repo,
      pull_number,
    });
    return reviews;
  }

  async fetchPullRequestCommits(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: commits } = await this.octokit!.rest.pulls.listCommits({
      owner,
      repo,
      pull_number,
    });
    return commits;
  }

  async getPullRequestBranch(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data: pr } = await this.octokit!.rest.pulls.get({
      owner,
      repo,
      pull_number,
    });
    return pr.head.ref;
  }

  async getPullRequestStatus(owner: string, repo: string, pull_number: number) {
    // Get PR to find head SHA
    this.ensureInitialized('app');
    const { data: pr } = await this.octokit!.rest.pulls.get({
      owner,
      repo,
      pull_number,
    });
    const sha = pr.head.sha;
    // Get all check runs for the commit (includes GitHub Actions)
    const { data: checks } = await this.octokit!.rest.checks.listForRef({
      owner,
      repo,
      ref: sha,
    });
    return checks;
  }

  /**
   * Write a comment to a pull request (issue).
   */
  async writePRComment(owner: string, repo: string, pull_number: number, message: string) {
    this.ensureInitialized('token');
    await this.personalOctokit!.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: message,
    });
    return { status: "commented", pull_number };
  }

  async fetchRequestedReviewers(owner: string, repo: string, pull_number: number) {
    this.ensureInitialized('app');
    const { data } = await this.octokit!.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number,
    });
    // data.users is an array of users requested as reviewers
    return data.users || [];
  }

  /**
   * List open pull requests for a repository.
   */
  async listOpenPullRequests(owner: string, repo: string) {
    this.ensureInitialized('app');
    const { data } = await this.octokit!.rest.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 50,
    });
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      user: pr.user ? { login: pr.user.login } : undefined,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      draft: pr.draft,
      url: pr.html_url,
    }));
  }

  /**
   * Retrieve mergeability information for a pull request.
   * mergeable: true | false | null (null means GitHub is still computing)
   * mergeable_state: e.g. 'clean', 'dirty', 'behind', 'blocked', 'draft', 'unknown', 'unstable'
   */
  async getPullRequestMergeStatus(owner: string, repo: string, pull_number: number) {
    const ok = this.octokit;
    if (!ok) throw new Error('GitHub client not initialized');
    const { data: pr } = await ok.rest.pulls.get({
      owner,
      repo,
      pull_number,
    });
    return {
      mergeable: pr.mergeable ?? null,
      mergeable_state: pr.mergeable_state || null,
    };
  }

  /** Get the login of the user associated with the personal access token */
  async getAuthenticatedUserLogin() {
    this.ensureInitialized('token');
    const { data } = await this.personalOctokit!.rest.users.getAuthenticated();
    return data.login;
  }

  /**
   * List open pull requests in the given repos where the authenticated user is:
   * - The author, OR
   * - Explicitly requested as a reviewer
   * (Can be filtered later if you only want reviewer assignments.)
   */
  async listAssignedOpenPullRequests(owner: string, repos: string[]) {
    const login = await this.getAuthenticatedUserLogin();
    const results: Array<{
      repo: string;
      number: number;
      title: string;
      html_url: string;
      author?: string;
      isAuthor: boolean;
      isAssignee: boolean;
    }> = [];

    for (const repo of repos) {
      // Retrieve open PRs
      this.ensureInitialized('app');
      const { data: pulls } = await this.octokit!.rest.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: 50,
      });

      for (const pr of pulls) {
        const isAuthor = pr.user?.login === login;
        // issues (PRs) have assignees array
        const isAssignee = (pr.assignees || []).some((a) => a?.login === login);
        if (isAssignee) {
          results.push({
            repo,
            number: pr.number,
            title: pr.title,
            html_url: pr.html_url,
            author: pr.user?.login,
            isAuthor,
            isAssignee,
          });
        }
      }
    }
    return results;
  }

  /** Single-repository variant: get open PRs where the authenticated user is author or requested reviewer */
  async listAssignedOpenPullRequestsForRepo(owner: string, repo: string) {
    const login = await this.getAuthenticatedUserLogin();
    this.ensureInitialized('app');
    const { data: pulls } = await this.octokit!.rest.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 50,
    });
    const out: Array<{
      number: number;
      title: string;
      html_url: string;
      author?: string;
      isAuthor: boolean;
      isAssignee: boolean;
    }> = [];
    for (const pr of pulls) {
      const isAuthor = pr.user?.login === login;
      const isAssignee = (pr.assignees || []).some((a) => a?.login === login);
      if (isAssignee) {
        out.push({
          number: pr.number,
          title: pr.title,
          html_url: pr.html_url,
          author: pr.user?.login,
          isAuthor,
          isAssignee,
        });
      }
    }
    return out;
  }

  /**
   * Clone a GitHub repository branch into a specified local directory using HTTPS + token authentication.
   *
   * Equivalent shell command pattern:
   *   git clone -b <branch> https://<username>:<GH_TOKEN>@github.com/<owner>/<repo>.git <targetDir>
   *
   * Username strategy:
   *   If `username` param is omitted we use the authenticated user login; if that fails we fallback to 'x-access-token'.
   *   GitHub accepts either an actual username or 'x-access-token' for PAT-based auth.
   */
  async cloneRepo(params: {
    owner: string;
    repo: string;
    branch: string;
    targetDir: string; // absolute or relative path
    username?: string;
    shallow?: boolean; // if true performs a shallow clone (depth=1)
    singleBranchOnly?: boolean; // default true
  }): Promise<{ path: string; stdout: string; stderr: string } > {
    const { owner, repo, branch, targetDir, shallow, singleBranchOnly = true } = params;
    let { username } = params;


    const absTarget = path.resolve(targetDir);
    // Basic pre-flight checks
    try {
      const stat = await fs.stat(absTarget).catch(() => undefined);
      if (stat) {
        const entries = await fs.readdir(absTarget);
        if (entries.length) {
          throw new Error(`Target directory '${absTarget}' already exists and is not empty`);
        }
      } else {
        await fs.mkdir(absTarget, { recursive: true });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to prepare target directory: ${msg}`);
    }

    if (!username) {
      try {
        username = await this.getAuthenticatedUserLogin();
      } catch {
        username = "x-access-token"; // fallback that works with PATs
      }
    }

    const token = this.config.githubToken;
    if (!token) throw new Error('GitHub integration is disabled: missing personal access token for cloneRepo');
    const remote = `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
    
    const gitArgs = ["clone", "-b", branch];
    if (singleBranchOnly) gitArgs.push("--single-branch");
    if (shallow) gitArgs.push("--depth", "1");
    gitArgs.push(remote, absTarget);

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", gitArgs, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (d: string) => stdoutChunks.push(d));
      child.stderr.on("data", (d: string) => stderrChunks.push(d));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(
            new Error(
              `git clone failed (exit ${code}) for ${owner}/${repo}@${branch}\nSTDOUT:\n${stdoutChunks.join("")}\nSTDERR:\n${stderrChunks.join("")}`,
            ),
          );
        }
        resolve();
      });
    });

    return { path: absTarget, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
  }
}
