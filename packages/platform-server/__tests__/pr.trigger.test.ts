import { describe, it, expect, vi } from "vitest";
import { PRTrigger } from "../src/triggers/pr.trigger";

// Simple mock classes
class MockGithubService {
  constructor(public login = "me") {}
  getAuthenticatedUserLogin = vi.fn(async () => this.login);
  listAssignedOpenPullRequestsForRepo = vi.fn(async () => [
    { number: 1, title: "Test PR", html_url: "http://x/pr/1", author: "alice", isAuthor: false, isAssignee: true },
  ]);
}

class MockPRService {
  calls: number = 0;
  stable = true;
  getPRInfo = vi.fn(async () => {
    if (!this.stable) this.calls++; // only increment after we intentionally flip stable flag
    const seq = this.calls;
    return {
      owner: "org",
      repo: "repo",
      branch: "feature",
      pull_number: 1,
      events: [{ id: "e" + seq, created_at: `2024-01-01T00:00:0${seq}Z` }],
      checks: [{ name: "build", status: "completed", conclusion: "success" }],
      requestedReviewers: [],
      mergeable: true,
      mergeableState: "clean",
    };
  });
}

class MockLogger {
  info = vi.fn();
  error = vi.fn();
  warn = vi.fn();
  debug = vi.fn();
}

describe("PRTrigger", () => {
  it("emits message on first poll and on change", async () => {
    const gh = new MockGithubService();
    const prs = new MockPRService();
    const logger = new MockLogger();
    const trigger = new PRTrigger(
      gh as any,
      prs as any,
      logger as any,
      { owner: "org", repos: ["repo"], intervalMs: 10 },
    );

    const received: Array<{ thread: string; messages: any[] }> = [];
    await trigger.subscribe({ invoke: async (thread, messages) => {
      received.push({ thread, messages });
    }});

    // Run two manual polls
    // @ts-expect-error accessing private for test
    await trigger.pollOnce();
    expect(received.length).toBe(1);
    expect(received[0].messages[0].content).toContain("PR repo#1 updated");

    // Second poll without change should not emit (stable still true)
    // @ts-expect-error private
    await trigger.pollOnce();
    expect(received.length).toBe(1);

    // Force change by enabling increment and polling again
    prs.stable = false;
    // @ts-expect-error private
    await trigger.pollOnce();
    expect(received.length).toBe(2);
  });
});
