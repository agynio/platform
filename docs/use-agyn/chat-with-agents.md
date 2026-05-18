---
title: Chat with Agents
description: Understand chat, threads, participants, and agent availability.
order: 1
---

# Chat with Agents

The built-in chat experience is powered by the Chat and Threads services.

Threads are generic conversations with participants represented by identity IDs.

Agents can be initial participants on a new thread or added later when availability allows it.

Agent `availability` controls who may initiate a thread with the agent:

- `internal` allows organization members and identities with an agent role.
- `private` requires an agent role such as `owner`, `maintainer`, or `participant`.

Existing thread participation is not removed when availability changes.

Chat state, unread counts, and participant activity are separate from agent configuration.

For agent fields, see [Terraform resources](../reference/terraform-resources.md).
