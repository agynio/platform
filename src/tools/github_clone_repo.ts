import { DynamicStructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import { ContainerProviderEntity } from "../entities/containerProvider.entity";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";
import { BaseTool } from "./base.tool";

// Schema for cloning a GitHub repository inside a running container
const githubCloneSchema = z.object({
  owner: z.string().min(1).describe("GitHub organization or user that owns the repository."),
  repo: z.string().min(1).describe("Repository name (without .git)."),
  path: z.string().min(1).describe("Destination directory path inside the container where the repo will be cloned."),
  branch: z.string().optional().describe("Optional branch or tag to checkout."),
  depth: z.number().int().positive().optional().describe("Shallow clone depth (omit for full clone)."),
});

export class GithubCloneRepoTool extends BaseTool {
  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private containerProvider: ContainerProviderEntity,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (rawInput, config) => {
        const input = githubCloneSchema.parse(rawInput);
        const { thread_id } = config.configurable;
        if (!thread_id) throw new Error("thread_id is required in config.configurable");

        const container = await this.containerProvider.provide(thread_id);

        const { owner, repo, path, branch, depth } = input;
        this.logger.info("Tool called", "github_clone_repo", { owner, repo, path, branch, depth });

        // Prepare auth URL. GitHub allows using just the token as the username segment
        // but we follow the requested pattern: username:token.
        // We'll use "oauth2" as a conventional username placeholder.
        const token = this.config.githubToken;
        const username = "oauth2";
        const encodedUser = encodeURIComponent(username);
        const encodedToken = encodeURIComponent(token);
        const url = `https://${encodedUser}:${encodedToken}@github.com/${owner}/${repo}.git`;

        // Safe quoting for path (basic) - wrap in single quotes and escape existing ones.
        const quote = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;

        const parts: string[] = [];
        parts.push("set -e");
        // Optionally remove existing dir

        // Ensure parent dir exists
        parts.push(`mkdir -p ${quote(path)} && rmdir ${quote(path)} || true`); // remove empty just created to allow clone create

        const cloneArgs: string[] = ["git", "clone"];
        if (depth) cloneArgs.push(`--depth", "${depth}`); // We'll build as string instead for simplicity

        let cloneCmd = "git clone";
        if (depth) cloneCmd += ` --depth ${depth}`;
        if (branch) cloneCmd += ` -b ${branch}`;
        cloneCmd += ` ${quote(url)} ${quote(path)}`;
        parts.push(cloneCmd);

        const fullCommand = parts.join(" && ");
        const result = await container.exec(fullCommand, { timeoutMs: 5 * 60 * 1000 });

        if (result.exitCode !== 0) {
          return {
            success: false,
            message: `Failed to clone ${owner}/${repo} (exit ${result.exitCode})`,
            stderr: result.stderr,
            stdout: result.stdout,
          };
        }
        return {
          success: true,
          message: `Cloned ${owner}/${repo} into ${path}`,
          stdout: result.stdout,
        };
      },
      {
        name: "github_clone_repo",
        description:
          "Clone a GitHub repository into the running container at the specified path using authenticated HTTPS.",
        schema: githubCloneSchema,
      },
    );
  }
}
