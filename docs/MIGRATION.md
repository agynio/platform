# Migration Plan to Unified Node Lifecycle

This document outlines the phased migration (0–5) to a simplified lifecycle and unified nodes structure. The goal is to converge all runtime-managed components under a single Node interface and directory layout.

## Phases

- Phase 0: Docs-only (this PR).
- Phase 1: Introduce Node interface types; adjust LiveGraph orchestration spec to only call `configure/start/stop/delete` (no code change yet).
- Phase 2: Remove constructor self-init across components; adopt `start()` for activation.
- Phase 3: Merge `BaseAgent` + `SimpleAgent` into `Agent` conforming to the Node lifecycle; preserve current scheduling/buffering.
- Phase 4: Directory reorg: move all triggers/tools/workspace/mcp under `apps/server/src/nodes/`; normalize naming; keep barrel exports temporarily if needed (note: no back-compat or aliases beyond necessary imports).
- Phase 5: Align runtime orchestration to Node lifecycle; remove any residual alternate verbs. No deprecation windows or fallbacks.

For lifecycle semantics, see docs/LIFECYCLE.md. For structure and conventions, see docs/ARCHITECTURE.md.

## Public API Specifications

### Node Interface (TypeScript)

```ts
export interface Node<C = unknown> {
  configure(cfg: C): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  delete(): Promise<void>;
}
```

Allowed calls per state are defined in docs/LIFECYCLE.md.

### Agent Public API (as a Node)

```ts
// High-level shape; names are illustrative and limited to public surface.
export interface AgentConfig {
  model: string;
  debounceMs?: number;
  whenBusy?: 'wait' | 'injectAfterTools';
  processBuffer?: 'allTogether' | 'oneByOne';
}

export interface Agent extends Node<AgentConfig> {
  // Interacts with the graph runtime; identical to current behavior.
  invoke(input: unknown): Promise<unknown>;
  // Optional: surface for inspection/metrics; no side effects.
  getStatus(): { state: 'created' | 'configured' | 'started' | 'stopped' | 'deleted' };
}
```

Note: The Agent’s scheduling/buffering semantics are preserved; moving activation to `start()` does not change message flow by default.

## Examples

### Slack Trigger Node

```ts
// apps/server/src/nodes/slack-trigger.node.ts
type SlackTriggerConfig = { token: string; appId: string; channelIds?: string[] };

export class SlackTrigger implements Node<SlackTriggerConfig> {
  private cfg?: SlackTriggerConfig;
  private client?: SlackClient; // hypothetical

  async configure(cfg: SlackTriggerConfig) {
    this.cfg = { ...cfg };
  }

  async start() {
    if (!this.cfg) throw new Error('not configured');
    if (this.client) return; // idempotent
    this.client = new SlackClient(this.cfg.token, this.cfg.appId);
    await this.client.connect(this.cfg.channelIds);
  }

  async stop() {
    if (!this.client) return; // idempotent
    await this.client.disconnect();
    this.client = undefined;
  }

  async delete() {
    // No durable resources in this example; idempotent.
  }
}
```

### Local MCP Server Node

```ts
// apps/server/src/nodes/mcp/local/local-mcp-server.node.ts
type LocalMcpConfig = { socketPath: string; tools: string[] };

export class LocalMcpServer implements Node<LocalMcpConfig> {
  private cfg?: LocalMcpConfig;
  private server?: McpServer; // hypothetical

  async configure(cfg: LocalMcpConfig) {
    this.cfg = { ...cfg };
  }

  async start() {
    if (!this.cfg) throw new Error('not configured');
    if (this.server) return; // idempotent
    this.server = new McpServer({ tools: this.cfg.tools });
    await this.server.listen(this.cfg.socketPath);
  }

  async stop() {
    if (!this.server) return; // idempotent
    await this.server.close();
    this.server = undefined;
  }

  async delete() {
    // Remove durable resources if any (e.g., sockets/files); must be idempotent.
    if (this.cfg?.socketPath) await safeUnlink(this.cfg.socketPath);
  }
}
```

### Pure Template (no lifecycle calls)

```ts
// Constructing nodes should be pure and side-effect free.
import { Agent } from './nodes/agent.node';
import { SlackTrigger } from './nodes/slack-trigger.node';

export function buildGraph() {
  const agent = new Agent(/* injected deps */);
  const slack = new SlackTrigger(/* injected deps */);
  // No calls to configure/start/stop/delete here.
  return { agent, slack };
}
```

## File Move Map (illustrative)

- `apps/server/src/triggers/slack.trigger.ts` → `apps/server/src/nodes/slack-trigger.node.ts`
- `apps/server/src/tools/*` → `apps/server/src/nodes/*-tool.node.ts`
- `apps/server/src/mcp/localMcpServer.ts` → `apps/server/src/nodes/mcp/local/local-mcp-server.node.ts`
- `apps/server/src/agents/simple.agent.ts` + `apps/server/src/agents/base.agent.ts` → `apps/server/src/agents/agent.ts` (and the Agent implements the Node lifecycle in Phase 3)

## Test Guidance

- Focus on `start/stop` idempotency: repeated calls must be no-ops and safe.
- Validate message flow parity pre/post migration for Agents.
- Ensure templates remain pure by convention: no lifecycle calls during construction.

