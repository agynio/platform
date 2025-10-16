# Server Memory

Enabling Memory
- Connector defaults: placement=after_system, content=tree, maxChars=4000.
- Wiring: add a `memoryNode` and connect its `$self` to the agent's CallModel via `setMemoryConnector`.
- Tool: attach the unified `memory` tool to `agent` and wire `$memory` from Memory node. Commands supported: `read | list | append | update | delete`. Node-level static config supports optional `name`, `description`, and `title` fields for tool metadata/UI; defaults preserve current behavior.
- Scope: `global` per node by default; `perThread` uses the thread id. Data is string-only.
- Environment: server requires MongoDB in prod; integration/E2E tests use mongodb-memory-server (no env gating); FakeDb is reserved for unit tests only.

Unified Memory Tool interface
- Args: `{ path: string, command: 'read'|'list'|'append'|'update'|'delete', content?: string, oldContent?: string }`
- Output: JSON stringified envelope `{ command, path, ok, result?, error? }`
  - read: `result = { content }`
  - list: `result = { entries: Array<{ name, kind: 'file'|'dir' }> }`
  - append: `result = { status: 'ok' }`
  - update: `result = { replaced: number }`
  - delete: `result = { files: number, dirs: number }`

Request/response examples (envelope)
- read (ok): request `{ path: '/notes/today', command: 'read' }` -> response `{ "command":"read","path":"/notes/today","ok":true,"result":{"content":"..."} }`
- read (ENOENT): request `{ path: '/missing', command: 'read' }` -> response `{ "command":"read","path":"/missing","ok":false,"error":{"message":"ENOENT: file not found","code":"ENOENT"} }`
- list root with empty path: request `{ path: '', command: 'list' }` -> response `{ "command":"list","path":"/","ok":true,"result":{"entries":[{"name":"notes","kind":"dir"}]}}`
- append: request `{ path: '/notes/today', command: 'append', content: 'hello' }` -> response `{ "command":"append","path":"/notes/today","ok":true,"result":{"status":"ok"} }`
- update: request `{ path: '/notes/today', command: 'update', oldContent: 'hello', content: 'hi' }` -> response `{ "command":"update","path":"/notes/today","ok":true,"result":{"replaced":1} }`
- delete: request `{ path: '/notes', command: 'delete' }` -> response `{ "command":"delete","path":"/notes","ok":true,"result":{"files":1,"dirs":1} }`
- validation error (EINVAL): request `{ path: '/notes/x', command: 'append' }` -> response `{ "command":"append","path":"/notes/x","ok":false,"error":{"message":"content is required for append","code":"EINVAL"} }`

Migration notes
- Old tools `memory_read|memory_list|memory_append|memory_update|memory_delete` are removed. Use the unified `memory` tool.
- Temporary `memory_dump` diagnostic tool is removed.
- Path normalization is unchanged; empty path treated as `/` for `list`.

Template key
- The builder/templates key is currently `memoryTool`. This matches the unified tool implementation but avoids collision with the existing `memory` service template. We may rename to `memory` after confirming with Rowan. Refer to templates schema and examples accordingly.

Example: Two memory tools with distinct names

```
{
  "nodes": [
    { "id": "M", "data": { "template": "memory", "config": { "scope": "global" } } },
    { "id": "A", "data": { "template": "agent", "config": {} } },
    { "id": "T1", "data": { "template": "memoryTool", "config": { "name": "memory_readonly", "description": "Read-only memory tool", "title": "Mem Read" } } },
    { "id": "T2", "data": { "template": "memoryTool", "config": { "name": "memory_write", "description": "Write memory tool", "title": "Mem Write" } } }
  ],
  "edges": [
    { "source": "A", "sourceHandle": "tools", "target": "T1", "targetHandle": "$self" },
    { "source": "A", "sourceHandle": "tools", "target": "T2", "targetHandle": "$self" },
    { "source": "M", "sourceHandle": "$self", "target": "T1", "targetHandle": "$memory" },
    { "source": "M", "sourceHandle": "$self", "target": "T2", "targetHandle": "$memory" }
  ]
}
```

Refer to ADR 0005 for design details and migration notes: docs/adr/adr-0005-memory-v2.md
