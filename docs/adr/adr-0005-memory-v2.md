# ADR: Memory System v2

Status: Accepted
Date: 2025-09-28

Context
- We need durable, query-free memory scoped to a graph node and optionally per thread, with deterministic local tests and no external services in CI.

Decision
- String-only semantics: files store strings only; all operations treat values as plain text.
- Path rules: normalized absolute paths, collapse duplicate slashes, forbid `..` and `$`, segments allow `[A-Za-z0-9_ -]`.
- Storage layout: one Mongo document per `{ nodeId, scope[, threadId] }`. File paths map to dotted keys in `data` (e.g., `/a/b` -> `data["a.b"]`). Directories are tracked in `dirs` by dotted keys.
- Indexes: idempotent unique indexes `uniq_global(nodeId,scope)` and `uniq_per_thread(nodeId,scope,threadId)` with partial filters.
- Scope: `global` across all threads for a node; `perThread` isolates by `threadId`.
- Connector defaults: `placement=after_system`, `content=tree`, `maxChars=4000`.
- Wiring: MemoryNode exposes `memoryTools` (for agents) and `createConnector()` returning a MemoryConnectorNode; Agent accepts `attachMemoryConnector()`; CallModelNode injects a SystemMessage based on placement.

Consequences
- Deterministic local/unit tests using in-memory FakeDb ensure CI stability.
- No binary/JSON types in memory values; callers must serialize manually if needed.
- Tree fallback prevents overlong context when `full` exceeds `maxChars`.

Migration Notes (v1 -> v2)
- Tools: use a single unified `memory` tool with commands (`read|list|append|update|delete`) wired to the agent; `memory_dump` was removed later (Issue #125). The builder key for the tool is currently `memoryTool` to avoid collision with the `memory` service template.
- `memory_update` returns a number (replacement count) instead of a string; update consumers/tests to expect numeric output.
- Tests: integration/E2E use `mongodb-memory-server` exclusively; FakeDb is restricted to unit tests only.
- Zod import style standardized to `import { z } from 'zod'` across server code.
- `maxChars` behavior: when `content=full` exceeds the limit, connector falls back to `tree` for the same scope; if per-thread is empty, falls back to global scope before rendering.
