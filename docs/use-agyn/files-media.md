---
title: Files and Media
description: Attach files to threads and let agents read content on demand.
order: 4
---

# Files and Media

Agyn stores file metadata and bytes separately from messages.

Threads store file IDs, Files stores metadata and S3-backed content, and files MCP lets agents read content only when needed.

## Steps

1. Attach a file to a message in chat.
2. The client uploads through Gateway to Files.
3. The message stores file references in the thread.
4. The agent receives `agyn://file/...` references in context.
5. The model can call the files MCP tool to read content.

## Expected outcome

Large files do not need to be copied into every prompt.

Agents fetch file content lazily, and browser access to media remains behind platform-controlled routes.
