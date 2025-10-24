import { Injectable } from "@nestjs/common";
import { GithubService } from "./github.client";

@Injectable()
export class PRService {
  constructor(private github: GithubService) {
    this.github = github;
  }

  async getPRInfo(owner: string, repo: string, pull_number: number) {
    if (!this.github.isEnabled()) {
      throw new Error('GitHub integration is disabled: PRService getPRInfo cannot proceed');
    }
    const branch = await this.github.getPullRequestBranch(owner, repo, pull_number);
    const prChecks = await this.github.getPullRequestStatus(owner, repo, pull_number);
    const mergeStatus = await this.github.getPullRequestMergeStatus(owner, repo, pull_number);

    type CheckRun = {
      name?: string;
      status?: string;
      conclusion?: string | null;
      output?: { title?: string; summary?: string; text?: string } | null;
      app?: { name?: string } | null;
    };
    type ChecksList = { check_runs: CheckRun[] };

    const filteredChecks = (prChecks as ChecksList).check_runs.map((check) => ({
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      output: check.output
        ? {
            title: check.output.title,
            summary: check.output.summary,
            text: check.output.text,
          }
        : undefined,
      app: check.app ? { name: check.app.name } : undefined,
    }));

    const [events, comments, reviewComments, reviews, commits, requestedReviewers] = await Promise.all([
      this.github.fetchPullRequestEvents(owner, repo, pull_number),
      this.github.fetchPullRequestComments(owner, repo, pull_number),
      this.github.fetchPullRequestReviewComments(owner, repo, pull_number),
      this.github.fetchPullRequestReviews(owner, repo, pull_number),
      this.github.fetchPullRequestCommits(owner, repo, pull_number),
      this.github.fetchRequestedReviewers(owner, repo, pull_number),
    ]);

    type Ev = {
      id: number | string;
      actor?: { login: string; type?: string };
      event?: string;
      created_at: string;
      review_requester?: { login: string };
      requested_reviewer?: { login: string };
    };
    const filteredEvents = (events as Ev[]).map((e) => ({
      id: e.id,
      actor: e.actor ? { login: e.actor.login, type: e.actor.type } : undefined,
      event: e.event,
      created_at: e.created_at,
      review_requester: e.review_requester ? { login: e.review_requester.login } : undefined,
      requested_reviewer: e.requested_reviewer ? { login: e.requested_reviewer.login } : undefined,
      type: "event",
    }));

    type IssueComment = { id: number | string; user?: { login: string; type?: string }; created_at: string; body?: string };
    const filteredComments = (comments as IssueComment[]).map((c) => ({
      id: c.id,
      actor: c.user ? { login: c.user.login, type: c.user.type } : undefined,
      event: "comment",
      created_at: c.created_at,
      body: c.body,
      type: "comment",
    }));

    type ReviewComment = {
      id: number | string;
      user?: { login: string; type?: string };
      created_at: string;
      body?: string;
      path?: string;
      diff_hunk?: string;
      position?: number | null;
      original_position?: number | null;
    };
    const filteredReviewComments = (reviewComments as ReviewComment[]).map((rc) => ({
      id: rc.id,
      actor: rc.user ? { login: rc.user.login, type: rc.user.type } : undefined,
      event: "review_comment",
      created_at: rc.created_at,
      body: rc.body,
      type: "review_comment",
      path: rc.path,
      diff_hunk: rc.diff_hunk,
      position: rc.position,
      original_position: rc.original_position,
    }));

    type Review = { id: number | string; user?: { login: string; type?: string }; state?: string; body?: string | null; submitted_at?: string | null };
    const filteredReviews = (reviews as Review[]).map((r) => ({
      id: r.id,
      actor: r.user ? { login: r.user.login, type: r.user.type } : undefined,
      event: "review",
      state: r.state,
      body: r.body,
      submitted_at: r.submitted_at,
      created_at: r.submitted_at || r.submitted_at,
      type: "review",
    }));

    type Commit = { sha: string; author?: { login?: string; type?: string }; commit: { author: { date: string }; message: string }; html_url: string };
    const filteredCommits = (commits as Commit[]).map((commit) => ({
      id: commit.sha,
      actor: commit.author ? { login: commit.author.login, type: commit.author.type } : undefined,
      event: "commit",
      created_at: commit.commit.author.date,
      message: commit.commit.message,
      type: "commit",
      url: commit.html_url,
    }));

    const combinedEvents = [
      ...filteredEvents,
      ...filteredComments,
      ...filteredReviews,
      ...filteredReviewComments,
      ...filteredCommits,
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Reshape requestedReviewers: [{ login, status }]
    type User = { login: string };
    const requestedReviewersReshaped = (requestedReviewers as User[]).map((user) => {
      const login = user.login;
      // Find the latest review for this login
      const latestReview = ([...filteredReviews] as Array<{ actor?: { login?: string }; state?: string }>).
        reverse().find((r) => r.actor && r.actor.login === login);
      return {
        login,
        status: latestReview ? latestReview.state : null,
      };
    });

    return {
      owner,
      repo,
      branch,
      pull_number,
      events: combinedEvents,
      checks: filteredChecks,
      requestedReviewers: requestedReviewersReshaped,
      mergeable: mergeStatus.mergeable,
      mergeableState: mergeStatus.mergeable_state,
    };
  }
}
