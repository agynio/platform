# Server Memory

Enabling Memory
- Connector defaults: placement=after_system, content=tree, maxChars=4000.
- Wiring: add a `memoryNode` and connect its `$self` to the agent's CallModel via `setMemoryConnector`.
- Tools: attach `memoryNode.memoryTools` to `simpleAgent` using the `memory` source port. Tools available: `memory_read`, `memory_list`, `memory_append`, `memory_update`, `memory_delete`.
- Scope: `global` per node by default; `perThread` uses the thread id. Data is string-only.
- Environment: server requires MongoDB in prod; integration/E2E tests use mongodb-memory-server (no env gating); FakeDb is reserved for unit tests only.

Refer to ADR 0005 for design details and migration notes: docs/adr/adr-0005-memory-v2.md

Examples
- Create connector with defaults: `mem.createConnector()`;
- Override: `mem.createConnector({ placement: 'last_message', content: 'tree', maxChars: 2000 })`.
