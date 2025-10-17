declare global {
  var liveGraphRuntime: import('./graph/liveGraph.manager').LiveGraphRuntime | undefined;
  var __agentRunsService: import('./services/run.service').AgentRunService | undefined;
}
export {};

