# Server

Runtime for graph-driven agents, tool adapters, triggers, and memory. See docs for architecture.

Graph persistence
- Configure via env:
  - GRAPH_STORE: `mongo` | `git` (default `mongo`)
  - GRAPH_REPO_PATH: path to local git repo for graphs (default `./data/graph`)
  - GRAPH_BRANCH: branch name to use (default `graph-state`)
  - GRAPH_AUTHOR_NAME / GRAPH_AUTHOR_EMAIL: default git author (can be overridden per request with headers `x-graph-author-name`/`x-graph-author-email`)
- On startup with GRAPH_STORE=git, the server will initialize `GRAPH_REPO_PATH` as a git repo if missing, seed `graphs/main/graph.json` at version 0, and commit an initial state.
- The existing API `/api/graph` supports GET and POST. POST maintains optimistic locking via the `version` field. Each successful write creates one commit with message `chore(graph): <name> v<version> (+/- nodes, +/- edges)` on the configured branch.
 - Error responses:
   - 409 VERSION_CONFLICT with `{ error, current }` body when version mismatch.
   - 409 LOCK_TIMEOUT when advisory lock not acquired within timeout.
   - 500 COMMIT_FAILED when git commit fails; persistence is rolled back to last committed state.

Enabling Memory
- Default connector config: placement=after_system, content=tree, maxChars=4000.
- To wire memory into an agent's CallModel at runtime, add a `memoryNode` and connect its `$self` source port to the agent's `callModel`/`setMemoryConnector` target port (or use template API to create a connector).
- Tool usage: attach `memoryNode.memoryTools` to the `simpleAgent` via the `memory` source port; tools include `memory_read`, `memory_list`, `memory_append`, `memory_update`, `memory_delete`.
- Scope: `global` per node by default; use `perThread` to isolate by thread id. No external Mongo needed in tests; the service works with a real `Db` in prod.
- Environment: requires MongoDB URL for server runtime; tests use in-memory fakes.

Examples
- Set connector defaults programmatically: `mem.createConnector({ placement: 'after_system', content: 'tree', maxChars: 4000 })`.
- The CallModel injects a SystemMessage either after the system prompt or as the last message depending on placement.
