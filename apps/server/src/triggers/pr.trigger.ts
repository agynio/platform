import { BaseTrigger, TriggerMessage } from "./base.trigger";
import { LoggerService } from "../services/logger.service";
import { PRService } from "../services/pr.service";
import { GithubService } from "../services/github.service";
import md5 from "md5";

export interface PRTriggerOptions {
  /** Poll interval in ms (default 60000) */
  intervalMs?: number;
  /** List of repositories to watch (names only) */
  repos: string[];
  /** GitHub organization / owner */
  owner: string;
  /** If true, include PRs authored by the user in addition to those assigned (default false maps to only assigned) */
  includeAuthored?: boolean;
}

interface PRSnapshotMinimal {
  number: number;
  repo: string;
  updated_at?: string;
  mergeable?: boolean | null;
  mergeableState?: string | null;
  compositeHash: string; // unified hash of relevant state facets
}

// (Removed quickHash helper; using md5(JSON.stringify(...)) inline for clarity.)

export class PRTrigger extends BaseTrigger {
  private timer?: NodeJS.Timeout;
  private stopped = true;
  private previous: Map<string, PRSnapshotMinimal> = new Map(); // key: repo#number

  constructor(
    private github: GithubService,
    private prService: PRService,
    private logger: LoggerService,
    private opts: PRTriggerOptions,
  ) {
    super();
    if (!opts.intervalMs) opts.intervalMs = 60_000;
  }

  // Backward-compatible start delegates to provision()
  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.provision();
    this.logger.info(`[PRTrigger] Starting polling (interval=${this.opts.intervalMs}ms, repos=${this.opts.repos.join(",")})`);
    await this.pollOnce();
    this.schedule();
  }

  // Backward-compatible stop delegates to deprovision()
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.deprovision();
    this.logger.info(`[PRTrigger] Stopped.`);
  }

  // Provision hooks don't need to do anything for PRTrigger beyond timer lifecycle, which is managed by start/stop
  protected async doProvision(): Promise<void> { /* no-op */ }
  protected async doDeprovision(): Promise<void> { /* no-op */ }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.logger.debug(`[PRTrigger] Poll tick at ${new Date().toISOString()}`);
      this.pollOnce()
        .catch((e) => this.logger.error("[PRTrigger] poll error", e))
        .finally(() => this.schedule());
    }, this.opts.intervalMs);
  }

  private prKey(repo: string, number: number) {
    return `${repo}#${number}`;
  }

  /** Perform one polling cycle */
  private async pollOnce(): Promise<void> {
    const { owner, repos, includeAuthored } = this.opts;
    try {
      // We fetch assigned PRs; if includeAuthored we will filter less strictly
      const login = await this.github.getAuthenticatedUserLogin();
      const changedMessages: TriggerMessage[] = [];
      let scannedPRs = 0;
      let candidatePRs = 0;

      for (const repo of repos) {
        // Get open PRs in repo where user is assignee (GitHubService currently only returns isAssignee variant)
        const assigned = await this.github.listAssignedOpenPullRequestsForRepo(owner, repo);
        const candidates = includeAuthored ? assigned.filter((p) => p.isAssignee || p.isAuthor) : assigned;
        scannedPRs += assigned.length;
        candidatePRs += candidates.length;
        this.logger.debug(`[PRTrigger] Repo ${repo}: assigned=${assigned.length}, candidates=${candidates.length}`);

        for (const pr of candidates) {
          const key = this.prKey(repo, pr.number);
          const detailed = await this.prService.getPRInfo(owner, repo, pr.number);
          const updated_at = detailed.events[detailed.events.length - 1]?.created_at || new Date().toISOString();
          const checksMinimal = detailed.checks.map((c: any) => ({ name: c.name, status: c.status, conclusion: c.conclusion }));
          const eventsIds = detailed.events.map((e: any) => e.id);
          const compositeHash = md5(JSON.stringify({
            updated_at,
            mergeable: detailed.mergeable,
            mergeableState: detailed.mergeableState,
            checks: checksMinimal,
            events: eventsIds,
          }));
          const snapshot: PRSnapshotMinimal = {
            number: pr.number,
            repo,
            updated_at,
            mergeable: detailed.mergeable,
            mergeableState: detailed.mergeableState,
            compositeHash,
          };

          const prev = this.previous.get(key);
          const changed = !prev || prev.compositeHash !== snapshot.compositeHash;
          if (changed) {
            this.logger.info(
              `[PRTrigger] Change detected ${repo}#${pr.number}: mergeable=${detailed.mergeable} state=${detailed.mergeableState} events=${detailed.events.length} checks=${detailed.checks.length}`,
            );
            // Prepare a message summarizing change. Provide diff info in 'info'.
            changedMessages.push({
              content: `PR ${repo}#${pr.number} updated (${pr.title})`,
              info: { key, ...detailed },
            });
            this.previous.set(key, snapshot);
          } else {
            this.logger.debug(`[PRTrigger] No change for ${repo}#${pr.number}`);
          }
        }
      }

      if (changedMessages.length) {
        this.logger.info(`[PRTrigger] Emitting ${changedMessages.length} change message(s) (scanned=${scannedPRs}, candidates=${candidatePRs}).`);
        // Use a single thread for PR updates, or per-PR? We'll choose per-PR thread so downstream agents isolate context.
        for (const msg of changedMessages) {
          const key = (msg.info as any).key as string;
          await this.notify(key, [msg]);
        }
      } else {
        this.logger.debug(`[PRTrigger] No changes detected this cycle (scanned=${scannedPRs}, candidates=${candidatePRs}).`);
      }
    } catch (err) {
      this.logger.error("[PRTrigger] pollOnce error", err);
    }
  }
}

// Usage Example:
// const trigger = new PRTrigger(githubService, prService, loggerService, { owner: 'my-org', repos: ['repo1'], repos, intervalMs: 60000 });
// await trigger.start();
