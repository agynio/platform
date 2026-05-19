---
title: Files
description: Attach files to messages and let agents read them.
order: 4
---

# Files

Files attached to a conversation are uploaded to the platform's file storage, referenced by ID, and made available to every participant in the thread. Agents can read them via the [files-mcp](../build-extend/files-mcp.md) tool.

## Attach a file

1. In the composer, click the paperclip.
2. Pick one or more files from your machine, or drag them onto the composer.
3. The Chat app uploads each file with a progress bar. Once uploaded, the file appears as an attachment in your draft message.
4. Send the message.

![Composer with file attachment](../_assets/console/chat/file-attached.png)

Each attachment becomes part of the message. After sending, every participant sees it inline (for [media types](./inline-media.md)) or as a download card.

## Size and content limits

| Limit | Value |
|---|---|
| Per-file size | 20 MB |
| File types | Any — the platform does not restrict by content type. |

Larger files are rejected during upload with an error in the composer.

## How agents read files

Agents do not pull file content automatically. When a message contains an attachment, the platform formats a reference like `agyn://file/<file_id>` in the message body. The agent decides whether to read the file by calling the `read_file` tool exposed by the [files-mcp](../build-extend/files-mcp.md) sidecar — passing the file ID.

This is intentional: it keeps the agent's context light when files are large, and lets the agent pick which files to read based on the conversation.

If an agent does not use files-mcp, it cannot read your attachments — only their metadata (filename, type) appears in the context. Ask your admin to attach files-mcp to the agent. See [Administer → MCP servers](../administer/mcp-servers.md).

## Download a file

Click any attachment card or media element's **Download** link. The platform serves the file through a short-lived pre-signed URL.

## Where files live

Uploaded files are stored in the platform's S3-compatible object storage. Each file has:

- A unique `file_id`.
- Metadata (filename, content type, size, uploader, upload time).
- A storage key in the object store.

Files are scoped to the conversation. Participants in the conversation can read; non-participants cannot. Even if you have an `agyn://file/<id>` URL, the platform checks your authorization on the parent thread before serving content.

## Delete an attachment

Deleting a message that contains an attachment removes the attachment from the message but does not delete the underlying file. The file remains in storage and continues to be referenced by anything else that pointed to the same `file_id`.

The Console does not currently expose file management. To fully purge a file, an operator with cluster access can delete the object directly from the S3 bucket and the matching row in the Files service database.

## Related

- [Chat](./chat.md)
- [Inline media](./inline-media.md)
- [Build & extend → files-mcp](../build-extend/files-mcp.md) — how agents access file content.
