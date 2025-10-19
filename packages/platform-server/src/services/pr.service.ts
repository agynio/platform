import { GithubService } from "./github.service";

export class PRService {
  constructor(private github: GithubService) {
    this.github = github;
  }

  async getPRInfo(owner: string, repo: string, pull_number: number) {
    const branch = await this.github.getPullRequestBranch(owner, repo, pull_number);
    const prChecks = await this.github.getPullRequestStatus(owner, repo, pull_number);
    const mergeStatus = await this.github.getPullRequestMergeStatus(owner, repo, pull_number);

    const filteredChecks = prChecks.check_runs.map((check: any) => ({
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

    const filteredEvents = events.map((e: any) => ({
      id: e.id,
      actor: e.actor ? { login: e.actor.login, type: e.actor.type } : undefined,
      event: e.event,
      created_at: e.created_at,
      review_requester: e.review_requester ? { login: e.review_requester.login } : undefined,
      requested_reviewer: e.requested_reviewer ? { login: e.requested_reviewer.login } : undefined,
      type: "event",
    }));

    const filteredComments = comments.map((c: any) => ({
      id: c.id,
      actor: c.user ? { login: c.user.login, type: c.user.type } : undefined,
      event: "comment",
      created_at: c.created_at,
      body: c.body,
      type: "comment",
    }));

    const filteredReviewComments = reviewComments.map((rc: any) => ({
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

    const filteredReviews = reviews.map((r: any) => ({
      id: r.id,
      actor: r.user ? { login: r.user.login, type: r.user.type } : undefined,
      event: "review",
      state: r.state,
      body: r.body,
      submitted_at: r.submitted_at,
      created_at: r.submitted_at || r.submitted_at,
      type: "review",
    }));

    const filteredCommits = commits.map((commit: any) => ({
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
    const requestedReviewersReshaped = requestedReviewers.map((user: any) => {
      const login = user.login;
      // Find the latest review for this login
      const latestReview = [...reviews].reverse().find((r: any) => r.user && r.user.login === login);
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
