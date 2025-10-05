# Server

Runtime for graph-driven agents, tool adapters, triggers, and memory. See docs for architecture.

Slack Autostart
- On server boot, if a persisted graph contains a `slackTrigger` node, the server will automatically provision it so it reaches ready state without manual UI action.
- Gate via env `AUTO_START_SLACK_TRIGGER` (default `true`). Set to `false` to disable autostart.
- Logs: look for `Autostart[SlackTrigger]` messages around startup.
- Idempotent: repeated boots or applies will not create duplicate connections; provision is skipped when already `ready`/`provisioning`.

Enabling Memory
- Default connector config: placement=after_system, content=tree, maxChars=4000.
- To wire memory into an agent's CallModel at runtime, add a `memoryNode` and connect its `$self` source port to the agent's `callModel`/`setMemoryConnector` target port (or use template API to create a connector).
- Tool usage: attach `memoryNode.memoryTools` to the `simpleAgent` via the `memory` source port; tools include `memory_read`, `memory_list`, `memory_append`, `memory_update`, `memory_delete`.
- Scope: `global` per node by default; use `perThread` to isolate by thread id. No external Mongo needed in tests; the service works with a real `Db` in prod.
- Environment: requires MongoDB URL for server runtime; tests use in-memory fakes.

Examples
- Set connector defaults programmatically: `mem.createConnector({ placement: 'after_system', content: 'tree', maxChars: 4000 })`.
- The CallModel injects a SystemMessage either after the system prompt or as the last message depending on placement.
