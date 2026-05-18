---
title: files-mcp
description: The platform's built-in file-access MCP server.
order: 4
---

# files-mcp

`files-mcp` is the platform-provided MCP server that gives agents the ability to read files uploaded into a conversation. It is a reference implementation for [building MCP servers](./mcp-servers.md) and the canonical way to let agents read user-attached files.

Source: [`agynio/files-mcp`](https://github.com/agynio/files-mcp).

## What it exposes

A single tool:

| Tool | Input | Output |
|---|---|---|
| `read_file` | `{ file_id: string }` | The file's content as an MCP content block (text, image, or generic resource depending on the file's content type). |

The agent passes a `file_id` it sees in the conversation (formatted as `agyn://file/<id>` in messages); the tool returns the bytes.

## How it works

When `agynd` boots an agent that has `files-mcp` attached:

1. The `files-mcp` sidecar container starts in the agent pod.
2. `agynd` configures the agent CLI with the sidecar's localhost endpoint.
3. The agent CLI registers `files-mcp/read_file` as an available tool.

When the agent calls `read_file`:

1. `files-mcp` calls Gateway → Files service over OpenZiti (`gateway.ziti`) authenticated as the agent's identity.
2. Files service fetches metadata, downloads from S3, returns bytes.
3. `files-mcp` wraps the bytes in an MCP content block — text for plain text files, image for images, generic resource for binary types — and returns to the agent.

## Attach to an agent

In the Console (Administer → Agents → MCPs tab) or Terraform:

```hcl
resource "agyn_agent_mcp" "files" {
  agent_id = agyn_agent.support.id
  name     = "files"
  image    = "ghcr.io/agynio/files-mcp:latest"
}
```

No environment variables, no secrets — the agent's own OpenZiti identity authorizes the file reads. The agent has access to files in the threads it participates in (the platform checks `member` on the thread before serving the bytes).

## When to use it

- Any agent that should be able to read user-uploaded files (PDFs, images, code, data files).
- Any agent that reads files generated earlier in the conversation by other agents or tools.

If your agent only ever reads files from external systems (e.g. a database or git repo), you do not need `files-mcp` — write an MCP server for that source instead.

## Why files are not auto-included

The platform deliberately does **not** include file content in the agent's LLM context automatically. Two reasons:

- File content is often large — auto-inclusion would blow out token limits.
- The agent should decide which files are relevant for the current task.

`files-mcp` makes file content a tool call the agent makes explicitly. The agent sees a message like "User attached `data.csv` (agyn://file/abc)" and decides whether to call `read_file` based on the question.

## Limits

Inherited from the Files service:

- Single file size up to 20 MB.
- Pre-signed URLs valid for up to one hour (re-fetched if a tool call takes longer).

Larger files require a custom MCP that streams content in chunks.

## Build on it

`files-mcp` is open source and small. Read its source for a clean, working example of:

- A Streamable HTTP MCP server in Go.
- Calling Gateway from inside a pod over OpenZiti.
- Returning typed MCP content blocks based on content type.

You can fork it to build:

- An MCP that reads a remote object store the agent should treat the same way as platform files.
- An MCP that wraps `read_file` with chunked output for very large files.
- An MCP that pre-processes content (PDF → text, image → OCR) before returning.

## Related

- [Administer → MCP servers](../administer/mcp-servers.md) — attaching MCPs.
- [MCP servers](./mcp-servers.md) — writing your own MCP.
- [Use → Files](../use/files.md) — the user-facing view of files.
